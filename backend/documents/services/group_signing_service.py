"""
Service for managing group signing sessions and token generation.
"""
from django.utils import timezone
from datetime import timedelta
from ..models import SigningToken, GroupSession, DocumentGroupItem


class GroupSigningService:
    """Handles group session creation and token lifecycle."""
    
    @staticmethod
    def generate_session_tokens(session: GroupSession, expires_in_days=None):
        """
        Generate signing tokens for all items in a group session.
        Each token is tied to the session and its group_index.
        
        Args:
            session: GroupSession instance
            expires_in_days: Optional expiration duration
        """
        expires_at = None
        if expires_in_days:
            expires_at = timezone.now() + timedelta(days=expires_in_days)
        
        # Create tokens for each item
        for item in session.group.items.all():
            SigningToken.objects.create(
                token=SigningToken.objects.make_random_password(length=32),
                version=item.version,
                scope='sign',
                recipient=session.recipient,
                group_session=session,
                group_index=item.order,
                expires_at=expires_at
            )
    
    @staticmethod
    def validate_group_token(token_obj: SigningToken, session: GroupSession):
        """
        Validate that a token is valid for the current session state.
        
        Returns:
            (is_valid, error_message)
        """
        # Check basic token validity
        is_valid, error = token_obj.is_valid()
        if not is_valid:
            return False, error
        
        # Check that token's group_index matches session's current_index
        if token_obj.group_index != session.current_index:
            return False, f"This token is for item {token_obj.group_index}, but session is on item {session.current_index}"
        
        # Check that session hasn't been cancelled
        if session.status == 'cancelled':
            return False, "This signing session has been cancelled"
        
        return True, None
    
    @staticmethod
    def advance_session(session: GroupSession):
        """
        After a signature is submitted for the current item,
        advance the session to the next item.
        
        Returns:
            (success, message, next_token_or_none)
        """
        total_items = session.group.get_item_count()
        current_index = session.current_index
        
        # Move to next item
        next_index = current_index + 1
        
        if next_index >= total_items:
            # Session is complete
            session.status = 'completed'
            session.current_index = next_index
            session.save()
            return True, "All documents signed", None
        else:
            # Mark session as in_progress (if pending)
            if session.status == 'pending':
                session.status = 'in_progress'
            
            session.current_index = next_index
            session.save()
            
            # Get the next token for this recipient
            next_token = session.signing_tokens.filter(
                group_index=next_index,
                revoked=False
            ).first()
            
            if not next_token:
                return False, "Next token not found", None
            
            return True, f"Moving to item {next_index + 1}", next_token
