import secrets
from django.utils import timezone


def generate_secure_token(length=32):
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(length)


def calculate_expiry(days=None):
    """Calculate expiry datetime from days offset."""
    if days is None or days <= 0:
        return None
    return timezone.now() + timezone.timedelta(days=days)