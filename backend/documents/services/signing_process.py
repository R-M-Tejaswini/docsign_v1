"""
Signing process service layer.

✅ CONSOLIDATED: Updated to work with Document instead of DocumentVersion
"""

from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from .document_service import DocumentService
from .signature_service import SignatureService
from .token_service import SigningTokenService
from ..models import DocumentField, SignatureEvent, SigningToken, Document
from common.services import get_webhook_trigger_service


class SigningProcessService:
    """Service for processing signature submissions."""
    
    # ========================================
    # VALIDATION METHODS
    # ========================================
    
    @staticmethod
    def validate_token(signing_token):
        """Validate a signing token."""
        token_service = SigningTokenService()
        is_valid, error_message = token_service.is_token_valid(signing_token)
        
        if not is_valid:
            raise ValidationError(error_message)
        
        if signing_token.scope != 'sign':
            raise ValidationError('This is a view-only link')
        
        return True, None
    
    @staticmethod
    def validate_payload(signer_name, field_values):
        """Validate signature payload."""
        if not signer_name or not signer_name.strip():
            raise ValidationError({'signer_name': 'Signer name is required'})
        
        if not field_values or not isinstance(field_values, list):
            raise ValidationError({'field_values': 'Field values must be a non-empty list'})
        
        for fv in field_values:
            if 'field_id' not in fv or 'value' not in fv:
                raise ValidationError({
                    'field_values': 'Each field value must have field_id and value'
                })
    
    @staticmethod
    def validate_fields_ownership(document, recipient, field_values):
        """
        Validate that all fields being signed belong to the recipient.
        
        ✅ CONSOLIDATED: Now works with Document directly
        """
        field_ids = [fv['field_id'] for fv in field_values]
        
        # Get fields that belong to this recipient and are not yet signed
        recipient_fields = document.fields.filter(
            id__in=field_ids,
            recipient=recipient,
            locked=False
        )
        
        if recipient_fields.count() != len(field_ids):
            raise ValidationError(
                'Some fields do not belong to this recipient or are already signed'
            )
        
        return recipient_fields
    
    @staticmethod
    def validate_required_fields(document, recipient, field_values):
        """
        Validate that all required fields for the recipient are being filled.
        
        ✅ CONSOLIDATED: Now works with Document directly
        """
        field_ids = set(fv['field_id'] for fv in field_values)
        
        # Get all required fields for this recipient that aren't signed yet
        required_recipient_fields = document.fields.filter(
            recipient=recipient,
            required=True,
            locked=False
        )
        
        # Check if all required fields are being filled
        missing_required = required_recipient_fields.exclude(id__in=field_ids)
        
        if missing_required.exists():
            raise ValidationError({
                'error': 'All required fields must be filled',
                'missing_fields': list(missing_required.values('id', 'label'))
            })
    
    # ========================================
    # MAIN SIGNING PROCESS (ATOMIC)
    # ========================================
    
    @staticmethod
    @transaction.atomic
    def process_signature_submission(
        signing_token,
        signer_name,
        field_values,
        ip_address,
        user_agent
    ):
        """
        ✅ UNIFIED: Process a signature submission with all validations.
        
        This is the ONLY entry point for signature processing.
        Uses atomic transaction to ensure all-or-nothing execution.
        
        Args:
            signing_token: SigningToken instance
            signer_name: Name of person signing
            field_values: List of {field_id, value} dicts
            ip_address: Client IP address
            user_agent: Client user agent string
            
        Returns:
            Dict with signature_event and document
            
        Raises:
            ValidationError: If any validation fails
        """
        # ========== PHASE 1: VALIDATE TOKEN & PAYLOAD ==========
        SigningProcessService.validate_token(signing_token)
        SigningProcessService.validate_payload(signer_name, field_values)
        
        # ========== PHASE 2: LOCK RESOURCES & CHECK STATUS ==========
        # Lock the token to prevent double-use
        try:
            token = SigningToken.objects.select_for_update().get(
                pk=signing_token.pk
            )
        except SigningToken.DoesNotExist:
            raise ValidationError("Token not found")
        
        # Validate token state
        if token.used or token.revoked:
            raise ValidationError("This signing link has already been used or revoked")
        
        # Check expiration
        if token.expires_at and timezone.now() > token.expires_at:
            raise ValidationError("This signing link has expired")
        
        # Lock the document to prevent concurrent status updates
        document = Document.objects.select_for_update().get(
            pk=token.document_id
        )
        recipient = token.recipient
        
        # ========== PHASE 3: VALIDATE FIELDS ==========
        SigningProcessService.validate_fields_ownership(
            document, recipient, field_values
        )
        SigningProcessService.validate_required_fields(
            document, recipient, field_values
        )
        
        # ========== PHASE 4: CREATE SIGNATURE EVENT ==========
        document_sha256 = DocumentService.compute_sha256(document)
        signature_service = SignatureService()
        
        signature_event = SignatureEvent.objects.create(
            document=document,
            token=token,
            recipient=recipient,
            signer_name=signer_name,
            ip_address=ip_address,
            user_agent=user_agent,
            document_sha256=document_sha256,
            field_values=[
                {'field_id': fv['field_id'], 'value': fv['value']}
                for fv in field_values
            ],
            metadata={
                'recipient': recipient,
                'fields_signed': len(field_values)
            }
        )
        
        # ========== PHASE 5: UPDATE FIELD VALUES & LOCK ==========
        for fv in field_values:
            DocumentField.objects.filter(pk=fv['field_id']).update(
                value=fv['value'],
                locked=True
                # ✅ REMOVED: updated_at (not on DocumentField? Check if TimestampMixin includes it)
            )
        
        # ========== PHASE 6: MARK TOKEN AS USED ==========
        SigningToken.objects.filter(pk=token.pk).update(
            used=True
            # ✅ REMOVED: updated_at=timezone.now() (SigningToken has no updated_at field)
        )
        
        # ========== PHASE 7: UPDATE DOCUMENT STATUS ==========
        doc_service = DocumentService()
        doc_service.update_document_status(document)
        
        # ========== PHASE 8: TRIGGER WEBHOOKS ==========
        document.refresh_from_db()
        trigger_service = get_webhook_trigger_service()
        trigger_service.trigger_signature_created(
            document=document,
            signature_event=signature_event,
            signer_name=signer_name,
            recipient=recipient,
            field_values=[
                {'field_id': fv['field_id'], 'value': fv['value']}
                for fv in field_values
            ]
        )
        
        # ========== PHASE 9: RETURN RESULT ==========
        return {
            'signature_event': signature_event,
            'document': document,
            'response_data': {
                'success': True,
                'message': 'Signature submitted successfully',
                'signature_id': signature_event.id,
                'document_status': document.status,
                'recipient': recipient,  # ✅ ADD THIS
                'link_converted_to_view': True,  # ✅ ADD THIS
            }
        }


# ========================================
# SINGLETON PATTERN
# ========================================

_signing_process_service = None


def get_signing_process_service() -> SigningProcessService:
    """Get singleton instance of signing process service."""
    global _signing_process_service
    if _signing_process_service is None:
        _signing_process_service = SigningProcessService()
    return _signing_process_service