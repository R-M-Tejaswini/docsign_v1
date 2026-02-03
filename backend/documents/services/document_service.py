"""
Document business logic service layer.

✅ CONSOLIDATED: Updated to work directly with Document (no DocumentVersion)
"""

from django.db import models as django_models
from django.utils import timezone
from django.core.exceptions import ValidationError
from .hashing import HashingService
from common.services import get_recipient_service, get_webhook_trigger_service


class DocumentService:
    """Service for document business logic."""
    
    @staticmethod
    def get_recipients(document):
        """
        ✅ REFACTORED: Now delegates to RecipientService
        
        DEPRECATED: Use document.recipients property instead
        """
        service = get_recipient_service()
        return service.get_unique_recipients(document.fields.all())
    
    @staticmethod
    def get_recipient_status(document):
        """
        ✅ REFACTORED: Now delegates to RecipientService
        
        DEPRECATED: Use document.recipient_status property instead
        """
        service = get_recipient_service()
        return service.get_recipient_signing_status(document)
    
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
        
        # ✅ FIXED: Calculate 'completed' from signed_fields and total_fields
        if recipient in recipient_status:
            status_info = recipient_status[recipient]
            is_completed = status_info['signed_fields'] == status_info['total_fields']
            
            if is_completed:
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
            return False, f"An active sign link already exists for {recipient}"
        
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
    def lock_document(document, locked_by=None):
        """
        ✅ UPDATED: Lock document and trigger webhook
        """
        if document.status != 'draft':
            raise ValidationError('Only draft documents can be locked')
        
        document.status = 'locked'
        document.save(update_fields=['status'])
        
        # Trigger webhook
        trigger_service = get_webhook_trigger_service()
        trigger_service.trigger_document_locked(
            document=document,
            locked_by=locked_by
        )
        
        return document
    
    @staticmethod
    def update_document_status(document):
        """
        ✅ UPDATED: Update status and trigger webhooks
        
        Automatic status updates based on recipient completion.
        """
        if document.status == 'draft':
            return
        
        from common.services import get_recipient_service
        recipient_service = get_recipient_service()
        trigger_service = get_webhook_trigger_service()
        
        recipient_status = recipient_service.get_recipient_signing_status(document)
        old_status = document.status
        
        if not recipient_status:
            document.status = 'completed'
        else:
            all_completed = all(
                rs['signed_fields'] == rs['total_fields']
                for rs in recipient_status.values()
            )
            any_signed = any(rs['signed_fields'] > 0 for rs in recipient_status.values())
            
            if all_completed:
                document.status = 'completed'
                # Trigger completion webhook
                all_signatures = [
                    {
                        'id': sig.id,
                        'signer_name': sig.signer_name,
                        'recipient': sig.recipient,
                        'signed_at': sig.signed_at.isoformat(),
                    }
                    for sig in document.signatures.all()
                ]
                trigger_service.trigger_document_completed(
                    document=document,
                    all_signatures=all_signatures
                )
            elif any_signed:
                document.status = 'partially_signed'
                # Trigger partial signing webhook
                summary = recipient_service.get_recipient_summary(document)
                trigger_service.trigger_partially_signed(
                    document=document,
                    signed_recipients=summary['signed'],
                    pending_recipients=summary['pending']
                )
            else:
                document.status = 'locked'
        
        # Save if status changed
        if old_status != document.status:
            document.save(update_fields=['status'])
        
        return document
    
    @staticmethod
    def compute_pdf_hashes(document):
        """
        Compute and update SHA256 hashes for document and signed PDF.
        
        ✅ REFACTORED: Now also updates document.signed_pdf_hash
        """
        document.pdf_sha256 = DocumentService.compute_sha256(document)
        document.signed_pdf_sha256 = DocumentService.compute_signed_pdf_hash(document)
        document.save(update_fields=['pdf_sha256', 'signed_pdf_sha256'])
    
    @staticmethod
    def get_document_fields(document):
        """
        Get all fields for the document, including metadata.
        
        ✅ REFACTORED: Now includes document-level fields
        """
        from .models import DocumentField
        
        # Get document-level fields
        fields = list(document.fields.all())
        
        # Add metadata fields
        metadata_fields = [
            DocumentField(
                document=document,
                field_type='metadata',
                field_name='document_id',
                field_value=str(document.id)
            ),
            DocumentField(
                document=document,
                field_type='metadata',
                field_name='created_at',
                field_value=document.created_at.isoformat()
            ),
            DocumentField(
                document=document,
                field_type='metadata',
                field_name='updated_at',
                field_value=document.updated_at.isoformat()
            ),
        ]
        fields.extend(metadata_fields)
        
        return fields
    
    @staticmethod
    def regenerate_signatures(document):
        """
        Regenerate signatures for the document.
        
        ✅ REFACTORED: Now also updates document status
        """
        from .models import DocumentSignature
        
        # Delete existing signatures
        DocumentSignature.objects.filter(document=document).delete()
        
        # Recreate signatures
        for recipient in document.get_recipients():
            DocumentSignature.objects.create(
                document=document,
                recipient=recipient,
                signer_name=recipient.name if recipient else '',
                # other fields...
            )
        
        # Update document status
        DocumentService.update_document_status(document)
    
    @staticmethod
    def flatten_document(document):
        """
        Flatten the document to a single PDF file.
        
        ✅ REFACTORED: Now also updates document status and triggers webhooks
        """
        try:
            from . import get_pdf_flattening_service
            service = get_pdf_flattening_service()
            service.flatten_and_save(document)
            
            # Update status to completed if all recipients have signed
            DocumentService.update_document_status(document)
        except Exception as e:
            print(f"⚠️  Flattening error: {e}")
            raise ValidationError("Failed to flatten document") from e


_document_service = None

def get_document_service() -> DocumentService:
    """Get singleton instance of document service."""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service