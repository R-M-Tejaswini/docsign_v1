"""
Document business logic service layer.
"""

from django.db import models as django_models
from django.utils import timezone
from django.core.exceptions import ValidationError
from core.services import HashingService


class DocumentService:
    """Service for document business logic."""
    
    @staticmethod
    def get_recipients(document):
        """Get list of unique recipients assigned to fields."""
        recipients = document.fields.values_list('recipient', flat=True).distinct()
        return sorted([r for r in recipients if r and r.strip()])
    
    @staticmethod
    def get_recipient_status(document):
        """Get signing status per recipient."""
        # ✅ CRITICAL: Always query fresh fields, don't use cached object
        all_fields = list(
            document.fields.select_related('document').all()
        )
        recipients = set(f.recipient for f in all_fields if f.recipient and f.recipient.strip())
        status = {}
        
        for recipient in sorted(recipients):
            recipient_fields = [f for f in all_fields if f.recipient == recipient]
            required_fields = [f for f in recipient_fields if f.required]
            
            total = len(required_fields)
            # ✅ Only count fields that are BOTH locked AND have a value
            signed = len([f for f in required_fields if f.locked and f.value])
            
            status[recipient] = {
                'total': total,
                'signed': signed,
                'completed': (signed == total) if total > 0 else True
            }
        
        return status
    
    # ✅ NEW: Validate document can be locked
    @staticmethod
    def validate_document_for_locking(document):
        """✅ FIXED: Validate prefilled fields have values AT LOCK TIME"""
        all_fields = list(document.fields.all())
        
        if not all_fields:
            return False, "Document must have at least one field before locking"
        
        # ✅ Find interactive fields (non-static-prefilled)
        interactive_fields = [
            f for f in all_fields
            if not (f.field_type == 'prefilled_text' and not f.is_editable_prefill)
        ]
        
        if not interactive_fields:
            return False, (
                "Document must have at least one interactive field. "
                "Static prefilled text alone is insufficient."
            )
        
        # ✅ CRITICAL: Validate static prefilled fields have values BEFORE locking
        static_prefilled = [
            f for f in all_fields
            if f.field_type == 'prefilled_text' and not f.is_editable_prefill
        ]
        
        empty_static = [
            f for f in static_prefilled 
            if not f.prefill_value or f.prefill_value.strip() == ''
        ]
        
        if empty_static:
            labels = ', '.join(f.label for f in empty_static)
            return False, f"Static prefilled fields must have values before locking: {labels}"
        
        # ✅ Check interactive fields have recipients
        interactive_without_recipients = [
            f for f in interactive_fields
            if not f.recipient or not f.recipient.strip()
        ]
        
        if interactive_without_recipients:
            field_labels = ', '.join(f.label for f in interactive_without_recipients)
            return False, f"These fields need recipients: {field_labels}"
        
        return True, None
    
    @staticmethod
    def can_generate_sign_link(document, recipient):
        """Check if a sign link can be generated for a specific recipient."""
        if document.status == 'draft':
            return False, "Document is still in draft mode"
        
        recipient_fields = document.fields.filter(recipient=recipient)
        if not recipient_fields.exists():
            return False, f"No fields assigned to {recipient}"
        
        recipient_status = DocumentService.get_recipient_status(document)
        if recipient in recipient_status and recipient_status[recipient]['completed']:
            return False, f"{recipient} has already signed this document"
        
        # Check if active sign token exists
        from signing.models import SigningToken
        active_token = SigningToken.objects.filter(
            document=document,
            recipient=recipient,
            scope='sign',
            revoked=False
        ).filter(
            django_models.Q(expires_at__isnull=True) | django_models.Q(expires_at__gt=timezone.now())
        ).first()
        
        if active_token and not active_token.used:
            return False, "An active signing link already exists for this recipient"
        
        return True, None
    
    @staticmethod
    def can_generate_view_link(document):
        """Check if a view link can be generated for the document."""
        if document.status == 'draft':
            return False, "Document is still in draft mode"
        return True, None
    
    @staticmethod
    def compute_sha256(document):
        """Compute SHA256 hash of the PDF file."""
        return HashingService.compute_file_sha256(document.file)
    
    @staticmethod
    def compute_signed_pdf_hash(document):
        """Compute SHA256 hash of the signed/flattened PDF file."""
        if not document.signed_file:
            return None
        
        try:
            return HashingService.compute_file_sha256(document.signed_file)
        except Exception as e:
            print(f"❌ Error computing signed PDF hash: {e}")
            return None
    
    @staticmethod
    def update_signed_pdf_hash(document):
        """Update signed_pdf_sha256 field after flattening."""
        document.signed_pdf_sha256 = DocumentService.compute_signed_pdf_hash(document)
        document.save(update_fields=['signed_pdf_sha256'])
    
    @staticmethod
    def update_document_status(document):
        """Update document status based on recipient completion."""
        if document.status == 'draft':
            return
        
        # ✅ CRITICAL: Always query fresh field data, don't use cached object
        recipient_status = DocumentService.get_recipient_status(document)
        
        if not recipient_status:
            # No recipients defined, mark as completed
            document.status = 'completed'
        else:
            all_completed = all(
                status['completed'] for status in recipient_status.values()
            )
            
            if all_completed:
                document.status = 'completed'
            else:
                document.status = 'partially_signed'
        
        # ✅ Save with explicit update_fields to avoid race conditions
        document.save(update_fields=['status'])
        
        # Auto-generate signed PDF when completed
        if document.status == 'completed' and not document.signed_file:
            try:
                from documents.services.pdf_flattening import get_pdf_flattening_service
                flattening_service = get_pdf_flattening_service()
                flattening_service.flatten_and_save(document)
            except Exception as e:
                print(f"⚠️ Failed to auto-generate signed PDF: {e}")


_document_service = None


def get_document_service() -> DocumentService:
    """Get singleton instance of document service."""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service