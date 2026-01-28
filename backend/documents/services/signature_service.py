"""
Signature event business logic service layer.

Responsibilities:
- Compute event hashes for tamper detection
- Create and verify signature events
"""

from django.utils import timezone
from .hashing import HashingService


class SignatureService:
    """Service for signature event logic."""
    
    @staticmethod
    def compute_event_hash(signature_event):
        """
        Compute tamper-evident hash for a signature event.
        
        Uses HashingService for stable JSON hashing to ensure consistency.
        
        Args:
            signature_event: SignatureEvent instance
            
        Returns:
            str: Hexadecimal SHA256 hash
        """
        # ✅ UPDATED: Delegate to HashingService instead of inline implementation
        return HashingService.compute_event_hash(signature_event)
    
    @staticmethod
    def is_signature_valid(signature_event):
        """
        Check if stored event_hash matches a recomputed hash.
        
        Args:
            signature_event: SignatureEvent instance
            
        Returns:
            bool: True if valid, False if tampered or no hash exists
        """
        if not signature_event.event_hash:
            return False
        current_hash = SignatureService.compute_event_hash(signature_event)
        return current_hash == signature_event.event_hash
    
    @staticmethod
    def verify_signature_integrity(signature_event, version):
        """
        Verify complete integrity of a signature event.
        
        Checks:
        - Event hash matches (event not tampered)
        - Document hash at sign time matches PDF (PDF not tampered)
        - Signed PDF hash matches (flattened PDF not tampered)
        
        Args:
            signature_event: SignatureEvent instance
            version: DocumentVersion instance
            
        Returns:
            dict: {
                'valid': bool,
                'event_hash_valid': bool,
                'document_hash_valid': bool,
                'signed_pdf_hash_valid': bool,
                'details': dict
            }
        """
        from .document_service import DocumentService
        
        # Recompute event hash
        current_event_hash = SignatureService.compute_event_hash(signature_event)
        stored_event_hash = signature_event.event_hash
        event_hash_valid = current_event_hash == stored_event_hash
        
        # Check document hash
        current_pdf_hash = DocumentService.compute_sha256(version)
        stored_pdf_hash = signature_event.document_sha256
        document_hash_valid = current_pdf_hash == stored_pdf_hash
        
        # Check signed PDF hash
        signed_pdf_valid = True
        if version.signed_file and version.signed_pdf_sha256:
            current_signed_pdf_hash = DocumentService.compute_signed_pdf_hash(version)
            signed_pdf_valid = current_signed_pdf_hash == version.signed_pdf_sha256
        
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
                    'stored': version.signed_pdf_sha256,
                    'current': DocumentService.compute_signed_pdf_hash(version) if version.signed_file else None,
                }
            }
        }


# Singleton instance
_signature_service = None


def get_signature_service() -> SignatureService:
    """Get singleton instance of signature service."""
    global _signature_service
    if _signature_service is None:
        _signature_service = SignatureService()
    return _signature_service