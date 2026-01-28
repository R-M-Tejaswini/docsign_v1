"""
Token utility functions used across the signing token service layer.

These are pure functions that don't depend on models; they can be imported
and used in multiple places without circular imports.
"""

import secrets
from datetime import timedelta
from django.utils import timezone


def generate_secure_token(length=32):
    """
    Generate a cryptographically secure random token.
    
    Args:
        length: int, URL-safe token length (default 32)
        
    Returns:
        str: URL-safe token string
        
    Example:
        >>> token = generate_secure_token()
        >>> len(token)  # Will be ~43 chars (URL-safe encoding is ~43 chars for 32 bytes)
    """
    return secrets.token_urlsafe(length)


def calculate_expiry(days=None):
    """
    Calculate expiry datetime from days offset.
    
    Args:
        days: int or None
            - None or 0: returns None (no expiry)
            - positive int: returns timezone.now() + timedelta(days=days)
            
    Returns:
        datetime or None: expiry datetime, or None if token never expires
        
    Example:
        >>> expiry = calculate_expiry(7)  # Expires in 7 days
        >>> expiry = calculate_expiry(None)  # Never expires
    """
    if days is None or days <= 0:
        return None
    return timezone.now() + timedelta(days=days)


def is_token_expired(expires_at):
    """
    Check if a token has expired.
    
    ✅ NEW: Centralized expiry check (previously inline in multiple places).
    
    Args:
        expires_at: datetime or None
            - None: token never expires, returns False
            - datetime: compared against timezone.now()
            
    Returns:
        bool: True if token has expired, False otherwise
    """
    if expires_at is None:
        return False
    return timezone.now() > expires_at