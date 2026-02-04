"""Token utility functions."""

import secrets
from datetime import timedelta
from django.utils import timezone


def generate_secure_token(length=32):
    """Generate cryptographically secure random token."""
    return secrets.token_urlsafe(length)


def calculate_expiry(days=None):
    """Calculate expiry datetime from days offset."""
    if days is None or days <= 0:
        return None
    return timezone.now() + timedelta(days=days)


def is_token_expired(expires_at):
    """Check if a token has expired."""
    if expires_at is None:
        return False
    return timezone.now() > expires_at