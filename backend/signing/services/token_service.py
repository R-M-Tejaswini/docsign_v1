"""
Signing token business logic service layer.

"""

import secrets
from django.core.exceptions import ValidationError
from django.utils import timezone


class SigningTokenService:
    """Service for signing token logic."""
    
    @staticmethod
    def generate_token(document, scope='sign', recipient=None, expires_in_days=None):
        """
        Generate a new signing token.
        
        Args:
            document: Document instance
            scope: 'sign' or 'view'
            recipient: str, recipient identifier (required for sign scope)
            expires_in_days: int, days until expiry (optional)
            
        Returns:
            SigningToken: The created token
        """
        from documents.services import get_document_service
        from ..models import SigningToken
        
        if scope == 'sign':
            if not recipient:
                raise ValidationError('Sign tokens must specify a recipient')
            
            doc_service = get_document_service()
            can_generate, error = doc_service.can_generate_sign_link(document, recipient)
            if not can_generate:
                raise ValidationError(error)
        else:
            # View token
            doc_service = get_document_service()
            can_generate, error = doc_service.can_generate_view_link(document)
            if not can_generate:
                raise ValidationError(error)
        
        token_str = secrets.token_urlsafe(32)
        expires_at = SigningTokenService.calculate_expiry(expires_in_days)
        
        return SigningToken.objects.create(
            token=token_str,
            document=document,
            scope=scope,
            recipient=recipient,
            expires_at=expires_at
        )
    
    @staticmethod
    def calculate_expiry(days=None):
        """Calculate expiry datetime from days offset."""
        if days is None or days <= 0:
            return None
        from datetime import timedelta
        return timezone.now() + timedelta(days=days)
    
    @staticmethod
    def is_token_expired(expires_at):
        """Check if a token has expired."""
        if expires_at is None:
            return False
        return timezone.now() > expires_at
    
    @staticmethod
    def is_token_valid(token):
        """Check if token is valid for use. ✅ CONSOLIDATED: All validation in one place."""
        if token.revoked:
            return False, "This link has been revoked"
        
        if SigningTokenService.is_token_expired(token.expires_at):
            return False, "This link has expired"
        
        if token.scope == 'sign' and token.used:
            return False, "This signing link has already been used"
        
        return True, None
    
    @staticmethod
    def convert_to_view_only(token):
        """Convert a sign token to view-only after signing."""
        if token.scope == 'sign':
            token.scope = 'view'
            token.used = True
            token.save(update_fields=['scope', 'used'])


_token_service = None

def get_token_service() -> SigningTokenService:
    """Get singleton instance of token service."""
    global _token_service
    if _token_service is None:
        _token_service = SigningTokenService()
    return _token_service