"""
Signature event business logic service layer.

✅ CONSOLIDATED: Updated to work with Document instead of DocumentVersion
"""

from django.utils import timezone
from .hashing import HashingService


class SignatureService:
    """Service for signature event logic."""
    
    @staticmethod
    def compute_event_hash(signature_event):
        """Compute tamper-evident hash for a signature event."""
        return HashingService.compute_event_hash(signature_event)
    
    @staticmethod
    def is_signature_valid(signature_event):
        """Check if stored event_hash matches a recomputed hash."""
        if not signature_event.event_hash:
            return False
        current_hash = SignatureService.compute_event_hash(signature_event)
        return current_hash == signature_event.event_hash
    
    @staticmethod
    def verify_signature_integrity(signature_event, document):
        """
        Verify complete integrity of a signature event.
        
        ✅ CONSOLIDATED: Now works with Document directly
        """
        from .document_service import DocumentService
        
        # Recompute event hash
        current_event_hash = SignatureService.compute_event_hash(signature_event)
        stored_event_hash = signature_event.event_hash
        event_hash_valid = current_event_hash == stored_event_hash
        
        # Check document hash
        current_pdf_hash = DocumentService.compute_sha256(document)
        stored_pdf_hash = signature_event.document_sha256
        document_hash_valid = current_pdf_hash == stored_pdf_hash
        
        # Check signed PDF hash
        signed_pdf_valid = True
        if document.signed_file and document.signed_pdf_sha256:
            current_signed_pdf_hash = DocumentService.compute_signed_pdf_hash(document)
            signed_pdf_valid = current_signed_pdf_hash == document.signed_pdf_sha256
        
        is_valid = event_hash_valid and document_hash_valid and signed_pdf_valid
        
        return {
            'valid': is_valid,
            'event_hash_valid': event_hash_valid,
            'document_hash_valid': document_hash_valid,
            'signed_pdf_hash_valid': signed_pdf_valid,
            'details': {
                'event_hash': {
                    'stored': stored_event_hash,
                    'current': current_event_hash,
                },
                'document_hash': {
                    'stored': stored_pdf_hash,
                    'current': current_pdf_hash,
                },
                'signed_pdf_hash': {
                    'stored': document.signed_pdf_sha256,
                    'current': DocumentService.compute_signed_pdf_hash(document) if document.signed_file else None,
                }
            }
        }


_signature_service = None

def get_signature_service() -> SignatureService:
    """Get singleton instance of signature service."""
    global _signature_service
    if _signature_service is None:
        _signature_service = SignatureService()
    return _signature_service