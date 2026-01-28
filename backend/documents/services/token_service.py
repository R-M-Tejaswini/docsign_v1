"""
Signing token business logic service layer.

Responsibilities:
- Generate and validate signing tokens
- Check token availability and expiry
- Convert tokens between scopes

Uses token_utils for pure utility functions to avoid duplication.
"""

import secrets
from django.core.exceptions import ValidationError
from .token_utils import calculate_expiry, is_token_expired  # ✅ IMPORT utilities


class SigningTokenService:
    """Service for signing token logic."""
    
    @staticmethod
    def generate_token(version, scope='sign', recipient=None, expires_in_days=None):
        """
        Generate a new signing token.
        
        Validates business rules:
        - Sign tokens must have a recipient
        - Version must support the requested scope
        - No duplicate active sign tokens per recipient
        
        Args:
            version: DocumentVersion instance
            scope: 'sign' or 'view'
            recipient: str, recipient identifier (required for sign scope)
            expires_in_days: int, days until expiry (optional)
            
        Returns:
            SigningToken: The created token
            
        Raises:
            ValidationError: If validation fails
        """
        from .document_service import DocumentService
        from ..models import SigningToken
        
        if scope == 'sign':
            if not recipient:
                raise ValidationError('Sign tokens must specify a recipient')
            
            can_generate, error = DocumentService.can_generate_sign_link(version, recipient)
            if not can_generate:
                raise ValidationError(error)
        else:
            # View token
            can_generate, error = DocumentService.can_generate_view_link(version)
            if not can_generate:
                raise ValidationError(error)
        
        # ✅ CONSOLIDATED: Use token_utils for token generation
        token_str = secrets.token_urlsafe(32)
        
        # ✅ CONSOLIDATED: Use token_utils for expiry calculation
        expires_at = calculate_expiry(expires_in_days)
        
        return SigningToken.objects.create(
            token=token_str,
            version=version,
            scope=scope,
            recipient=recipient,
            expires_at=expires_at
        )
    
    @staticmethod
    def is_token_valid(token):
        """
        Check if token is valid for use.
        
        Args:
            token: SigningToken instance
            
        Returns:
            tuple: (bool, error_message_or_None)
        """
        if token.revoked:
            return False, "This link has been revoked"
        
        # ✅ CONSOLIDATED: Use token_utils expiry check
        if is_token_expired(token.expires_at):
            return False, "This link has expired"
        
        if token.scope == 'sign' and token.used:
            return False, "This signing link has already been used"
        
        return True, None
    
    @staticmethod
    def convert_to_view_only(token):
        """
        Convert a sign token to view-only after signing.
        
        Args:
            token: SigningToken instance
        """
        if token.scope == 'sign':
            token.scope = 'view'
            token.used = True
            token.save(update_fields=['scope', 'used'])


# Singleton instance
_token_service = None


def get_token_service() -> SigningTokenService:
    """Get singleton instance of token service."""
    global _token_service
    if _token_service is None:
        _token_service = SigningTokenService()
    return _token_service