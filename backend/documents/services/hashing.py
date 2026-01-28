"""
Unified hashing service for all hash computations.

Consolidates hash logic into a single, reusable service to avoid duplication
and provide a single source of truth for hash algorithms.
"""

import hashlib
import json


class HashingService:
    """Service for all file and data hashing operations."""
    
    @staticmethod
    def compute_file_sha256(file_obj):
        """
        Compute SHA256 hash of a file object.
        
        Args:
            file_obj: Django FieldFile or file-like object
        
        Returns:
            str: Hexadecimal SHA256 hash
        """
        sha256_hash = hashlib.sha256()
        
        # Save current position and seek to start
        current_pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
        file_obj.seek(0)
        
        # Read and hash in chunks
        for byte_block in iter(lambda: file_obj.read(4096), b""):
            sha256_hash.update(byte_block)
        
        # Restore position
        file_obj.seek(current_pos)
        
        return sha256_hash.hexdigest()
    
    @staticmethod
    def compute_json_sha256(data_dict):
        """
        Compute SHA256 hash of a dictionary (stable JSON serialization).
        
        Uses stable JSON serialization (sorted keys) to ensure the same
        data always produces the same hash.
        
        Args:
            data_dict: dict to hash
        
        Returns:
            str: Hexadecimal SHA256 hash
        """
        json_str = json.dumps(data_dict, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()
    
    @staticmethod
    def compute_event_hash(signature_event):
        """
        Compute tamper-evident hash for a signature event.
        
        Uses stable JSON serialization of event metadata:
        - document_sha256
        - field_values (sorted)
        - signer_name
        - recipient
        - signed_at
        - token id
        - version id
        
        Args:
            signature_event: SignatureEvent instance
            
        Returns:
            str: Hexadecimal SHA256 hash
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
            'version_id': signature_event.version.id,
        }
        
        return HashingService.compute_json_sha256(hash_input)


# Singleton instance
_hashing_service = None


def get_hashing_service() -> HashingService:
    """Get singleton instance of hashing service."""
    global _hashing_service
    if _hashing_service is None:
        _hashing_service = HashingService()
    return _hashing_service


# Backwards compatibility exports (keeping old function names)
def compute_file_sha256(file_obj):
    """Deprecated: Use HashingService.compute_file_sha256() instead."""
    return HashingService.compute_file_sha256(file_obj)