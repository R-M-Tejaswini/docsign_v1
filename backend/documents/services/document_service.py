"""
Document business logic service layer.

✅ CONSOLIDATED: Updated to work directly with Document (no DocumentVersion)
"""

from django.db import models as django_models
from django.utils import timezone
from django.core.exceptions import ValidationError
from .hashing import HashingService


class DocumentService:
    """Service for document business logic."""
    
    @staticmethod
    def get_recipients(document):
        """
        Get list of unique recipients assigned to fields in a document.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        recipients = document.fields.values_list('recipient', flat=True).distinct()
        return sorted([r for r in recipients if r and r.strip()])
    
    @staticmethod
    def get_recipient_status(document):
        """
        Get signing status per recipient.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        all_fields = list(document.fields.all())
        recipients = set(f.recipient for f in all_fields if f.recipient and f.recipient.strip())
        status = {}
        
        for recipient in sorted(recipients):
            recipient_fields = [f for f in all_fields if f.recipient == recipient]
            required_fields = [f for f in recipient_fields if f.required]
            
            total = len(required_fields)
            signed = len([f for f in required_fields if f.locked and f.value])
            
            status[recipient] = {
                'total': total,
                'signed': signed,
                'completed': (signed == total) if total > 0 else True
            }
        
        return status
    
    @staticmethod
    def can_generate_sign_link(document, recipient):
        """
        Check if a sign link can be generated for a specific recipient.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        if document.status == 'draft':
            return False, "Document must be locked before generating sign links"
        
        recipient_fields = document.fields.filter(recipient=recipient)
        if not recipient_fields.exists():
            return False, f"No fields assigned to {recipient}"
        
        recipient_status = DocumentService.get_recipient_status(document)
        if recipient in recipient_status and recipient_status[recipient]['completed']:
            return False, f"{recipient} has already completed signing"
        
        # Check if active sign token exists
        active_token = document.tokens.filter(
            recipient=recipient,
            scope='sign',
            revoked=False
        ).filter(
            django_models.Q(expires_at__isnull=True) | django_models.Q(expires_at__gt=timezone.now())
        ).first()
        
        if active_token and not active_token.used:
            return False, f"Active sign link already exists for {recipient}"
        
        return True, None
    
    @staticmethod
    def can_generate_view_link(document):
        """
        Check if a view link can be generated for the document.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        if document.status == 'draft':
            return False, "Document must be locked before generating view links"
        return True, None
    
    @staticmethod
    def compute_sha256(document):
        """
        Compute SHA256 hash of the PDF file.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        return HashingService.compute_file_sha256(document.file)
    
    @staticmethod
    def compute_signed_pdf_hash(document):
        """
        Compute SHA256 hash of the signed/flattened PDF file.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        if not document.signed_file:
            return None
        
        try:
            return HashingService.compute_file_sha256(document.signed_file)
        except Exception as e:
            print(f"❌ Error computing signed PDF hash: {e}")
            return None
    
    @staticmethod
    def update_signed_pdf_hash(document):
        """
        Update signed_pdf_sha256 field after flattening.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        """
        document.signed_pdf_sha256 = DocumentService.compute_signed_pdf_hash(document)
        document.save(update_fields=['signed_pdf_sha256'])
    
    @staticmethod
    def update_document_status(document):
        """
        Update document status based on recipient completion.
        
        ✅ CONSOLIDATED: Now operates on Document directly
        - Removed version concept
        - Auto-generates signed PDF when moved to 'completed'
        """
        if document.status == 'draft':
            return
        
        recipient_status = DocumentService.get_recipient_status(document)
        
        if not recipient_status:
            document.status = 'completed'
        else:
            all_completed = all(rs['completed'] for rs in recipient_status.values())
            any_signed = any(rs['signed'] > 0 for rs in recipient_status.values())
            
            if all_completed:
                document.status = 'completed'
            elif any_signed:
                document.status = 'partially_signed'
            else:
                document.status = 'locked'
        
        document.save(update_fields=['status'])
        
        # Auto-generate signed PDF when completed
        if document.status == 'completed' and not document.signed_file:
            try:
                from . import get_pdf_flattening_service
                service = get_pdf_flattening_service()
                service.flatten_and_save(document)
            except Exception as e:
                print(f"⚠️  Failed to auto-generate signed PDF: {e}")


_document_service = None

def get_document_service() -> DocumentService:
    """Get singleton instance of document service."""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service