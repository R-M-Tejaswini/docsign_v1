"""
Document business logic service layer.

Responsibilities:
- Compute hashes and signatures
- Manage document and version status
- Generate recipient information
- Handle version copying
"""

from django.db import models as django_models
from django.utils import timezone
from django.core.exceptions import ValidationError
from .hashing import HashingService


class DocumentService:
    """Service for document and version business logic."""
    
    @staticmethod
    def get_recipients(version):
        """
        Get list of unique recipients assigned to fields in a version.
        
        Args:
            version: DocumentVersion instance
            
        Returns:
            list: Sorted list of unique recipient identifiers
        """
        recipients = version.fields.values_list('recipient', flat=True).distinct()
        return sorted([r for r in recipients if r and r.strip()])
    
    @staticmethod
    def get_recipient_status(version):
        """
        Get signing status per recipient.
        
        Args:
            version: DocumentVersion instance
            
        Returns:
            dict: Maps recipient -> {total, signed, completed}
        """
        all_fields = list(version.fields.all())
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
    def can_generate_sign_link(version, recipient):
        """
        Check if a sign link can be generated for a specific recipient.
        
        Rules:
        - Document must be locked (not draft)
        - Recipient must have fields assigned
        - Recipient must not have already signed
        - No active sign token for this recipient
        
        Args:
            version: DocumentVersion instance
            recipient: str, recipient identifier
            
        Returns:
            tuple: (bool, error_message_or_None)
        """
        if version.status == 'draft':
            return False, "Document must be locked before generating sign links"
        
        recipient_fields = version.fields.filter(recipient=recipient)
        if not recipient_fields.exists():
            return False, f"No fields assigned to {recipient}"
        
        recipient_status = DocumentService.get_recipient_status(version)
        if recipient in recipient_status and recipient_status[recipient]['completed']:
            return False, f"{recipient} has already completed signing"
        
        # Check if active sign token exists
        active_token = version.tokens.filter(
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
    def can_generate_view_link(version):
        """
        Check if a view link can be generated for the version.
        
        Rules:
        - Document must not be in draft status
        
        Args:
            version: DocumentVersion instance
            
        Returns:
            tuple: (bool, error_message_or_None)
        """
        if version.status == 'draft':
            return False, "Document must be locked before generating view links"
        return True, None
    
    @staticmethod
    def compute_sha256(version):
        """
        Compute SHA256 hash of the PDF file.
        
        Args:
            version: DocumentVersion instance
            
        Returns:
            str: Hexadecimal SHA256 hash
        """
        # ✅ UPDATED: Use HashingService instead of inline implementation
        return HashingService.compute_file_sha256(version.file)
    
    @staticmethod
    def compute_signed_pdf_hash(version):
        """
        Compute SHA256 hash of the signed/flattened PDF file.
        
        Args:
            version: DocumentVersion instance
            
        Returns:
            str: Hexadecimal hash or None on error/missing file
        """
        if not version.signed_file:
            return None
        
        try:
            # ✅ UPDATED: Use HashingService instead of inline implementation
            return HashingService.compute_file_sha256(version.signed_file)
        except Exception as e:
            print(f"❌ Error computing signed PDF hash: {e}")
            return None
    
    @staticmethod
    def update_signed_pdf_hash(version):
        """
        Update signed_pdf_sha256 field after flattening.
        
        Args:
            version: DocumentVersion instance
        """
        version.signed_pdf_sha256 = DocumentService.compute_signed_pdf_hash(version)
        version.save(update_fields=['signed_pdf_sha256'])
    
    @staticmethod
    def update_version_status(version):
        """
        Update document status based on recipient completion.
        
        Behavior:
        - draft: stays draft until manually locked
        - locked: marked locked when no signatures present
        - partially_signed: some recipients signed, others haven't
        - completed: all recipients completed their required fields
        
        Auto-generates signed PDF when moved to 'completed'.
        
        Args:
            version: DocumentVersion instance
        """
        if version.status == 'draft':
            return
        
        recipient_status = DocumentService.get_recipient_status(version)
        
        if not recipient_status:
            version.status = 'completed'
        else:
            all_completed = all(rs['completed'] for rs in recipient_status.values())
            any_signed = any(rs['signed'] > 0 for rs in recipient_status.values())
            
            if all_completed:
                version.status = 'completed'
            elif any_signed:
                version.status = 'partially_signed'
            else:
                version.status = 'locked'
        
        version.save(update_fields=['status'])
        
        # Auto-generate signed PDF when completed
        if version.status == 'completed' and not version.signed_file:
            try:
                from . import get_pdf_flattening_service
                service = get_pdf_flattening_service()
                service.flatten_and_save(version)
            except Exception as e:
                print(f"⚠️  Failed to auto-generate signed PDF: {e}")


# Singleton instance
_document_service = None


def get_document_service() -> DocumentService:
    """Get singleton instance of document service."""
    global _document_service
    if _document_service is None:
        _document_service = DocumentService()
    return _document_service