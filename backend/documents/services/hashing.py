import hashlib


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