"""
Unified hashing service for all hash computations.

✅ CONSOLIDATED: Updated to work with Document instead of DocumentVersion
"""

import hashlib
import json


class HashingService:
    """Service for all file and data hashing operations."""
    
    @staticmethod
    def compute_file_sha256(file_obj):
        """Compute SHA256 hash of a file object."""
        sha256_hash = hashlib.sha256()
        
        current_pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
        file_obj.seek(0)
        
        for byte_block in iter(lambda: file_obj.read(4096), b""):
            sha256_hash.update(byte_block)
        
        file_obj.seek(current_pos)
        return sha256_hash.hexdigest()
    
    @staticmethod
    def compute_json_sha256(data_dict):
        """Compute SHA256 hash of a dictionary (stable JSON serialization)."""
        json_str = json.dumps(data_dict, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    @staticmethod
    def compute_event_hash(signature_event):
        """
        Compute tamper-evident hash for a signature event.
        
        ✅ CONSOLIDATED: Removed version_id, now uses document_id
        """
        hash_input = {
            'document_sha256': signature_event.document_sha256,
            'field_values': sorted(
                signature_event.field_values,
                key=lambda x: x['field_id']
            ),
            'signer_name': signature_event.signer_name,
            'recipient': signature_event.recipient,
            'signed_at': signature_event.signed_at.isoformat() if signature_event.signed_at else None,
            'token_id': signature_event.token.id if signature_event.token else None,
            'document_id': signature_event.document.id,  # ✅ CONSOLIDATED: Use document_id
        }
        
        return HashingService.compute_json_sha256(hash_input)


_hashing_service = None

def get_hashing_service() -> HashingService:
    """Get singleton instance of hashing service."""
    global _hashing_service
    if _hashing_service is None:
        _hashing_service = HashingService()
    return _hashing_service


def compute_file_sha256(file_obj):
    """Deprecated: Use HashingService.compute_file_sha256() instead."""
    return HashingService.compute_file_sha256(file_obj)