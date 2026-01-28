"""
Signing process service layer.

Responsibilities:
- Process and validate signature submissions from recipients
- Manage the complete signing workflow (validation → field updates → event creation → webhooks)
- Provide a single point for signature processing that can be tested, reused, and extended

Why:
- Extracts complex business logic from views into a testable, reusable service
- Enables reuse from multiple contexts (views, admin actions, async tasks)
- Maintains transaction boundaries and webhook triggering
- Makes the view layer thin and focused on HTTP concerns only
"""

from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from .document_service import DocumentService
from .signature_service import SignatureService
from .token_service import SigningTokenService
from .webhook_service import WebhookService
from ..models import DocumentField, SignatureEvent, SigningToken, DocumentVersion


class SigningProcessService:
    """Service for processing signature submissions."""
    
    @staticmethod
    def validate_token(signing_token):
        """
        Validate a signing token.
        
        Args:
            signing_token: SigningToken instance
            
        Returns:
            tuple: (bool, error_message_or_None)
            
        Raises:
            ValidationError if token is invalid
        """
        token_service = SigningTokenService()
        is_valid, error_message = token_service.is_token_valid(signing_token)
        
        if not is_valid:
            raise ValidationError(error_message)
        
        if signing_token.scope != 'sign':
            raise ValidationError('This is a view-only link')
        
        return True, None
    
    @staticmethod
    def validate_payload(signer_name, field_values):
        """
        Validate signature payload.
        
        Args:
            signer_name: str, name of the signer
            field_values: list of dicts with field_id and value
            
        Raises:
            ValidationError if validation fails
        """
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
    def validate_fields_ownership(version, recipient, field_values):
        """
        Validate that all fields being signed belong to the recipient.
        
        Args:
            version: DocumentVersion instance
            recipient: str, recipient identifier
            field_values: list of dicts with field_id and value
            
        Returns:
            QuerySet of validated fields
            
        Raises:
            ValidationError if validation fails
        """
        field_ids = [fv['field_id'] for fv in field_values]
        
        # Get fields that belong to this recipient and are not yet signed
        recipient_fields = version.fields.filter(
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
    def validate_required_fields(version, recipient, field_values):
        """
        Validate that all required fields for the recipient are being filled.
        
        Args:
            version: DocumentVersion instance
            recipient: str, recipient identifier
            field_values: list of dicts with field_id and value
            
        Raises:
            ValidationError if required fields are missing
        """
        field_ids = set(fv['field_id'] for fv in field_values)
        
        # Get all required fields for this recipient that aren't signed yet
        required_recipient_fields = version.fields.filter(
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
    
    @staticmethod
    def process_signature_submission(
        signing_token,
        signer_name,
        field_values,
        ip_address,
        user_agent
    ):
        """
        Process a complete signature submission (all validation + persistence + webhooks).
        
        ✅ CONSOLIDATED: This is the single entry point for signature processing.
        
        Args:
            signing_token: SigningToken instance
            signer_name: str, name of the signer
            field_values: list of dicts with {field_id, value}
            ip_address: str, client IP address
            user_agent: str, client user agent
            
        Returns:
            dict: {
                'signature_event': SignatureEvent instance,
                'version': DocumentVersion instance (refreshed),
                'response_data': dict for API response
            }
            
        Raises:
            ValidationError: If any validation fails
        """
        # Phase 1: Validate everything upfront (before any mutations)
        SigningProcessService.validate_token(signing_token)
        SigningProcessService.validate_payload(signer_name, field_values)
        
        version = signing_token.version
        recipient = signing_token.recipient
        
        # Validate field ownership
        recipient_fields = SigningProcessService.validate_fields_ownership(
            version, recipient, field_values
        )
        
        # Validate required fields are filled
        SigningProcessService.validate_required_fields(
            version, recipient, field_values
        )
        
        # Phase 2: Process signature with transaction
        with transaction.atomic():
            doc_service = DocumentService()
            sig_service = SignatureService()
            token_service = SigningTokenService()
            
            # Update fields with values and lock them
            fields_to_update = []
            fields_map = {f.id: f for f in recipient_fields}
            
            for fv in field_values:
                field = fields_map.get(int(fv['field_id']))
                if field:
                    field.value = fv['value']
                    field.locked = True
                    fields_to_update.append(field)
            
            # Bulk update fields (efficient, avoids N+1)
            if fields_to_update:
                DocumentField.objects.bulk_update(fields_to_update, ['value', 'locked'])
            
            # Compute document hash at signing time
            document_sha256 = doc_service.compute_sha256(version)
            
            # Create signature event
            signature_event = SignatureEvent.objects.create(
                version=version,
                token=signing_token,
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
            # Note: event_hash is computed via post_save signal in models.py
            
            # Convert token to view-only
            token_service.convert_to_view_only(signing_token)
            
            # Update version status based on completion
            doc_service.update_version_status(version)
            
            # Refresh version to get updated status
            version.refresh_from_db()
            
            # Phase 3: Trigger webhooks (outside transaction conceptually, but within for atomicity)
            SigningProcessService._trigger_webhooks(version, signature_event, signer_name, recipient)
            
            # Prepare response
            response_data = {
                'signature_id': signature_event.id,
                'message': 'Document signed successfully',
                'version_status': version.status,
                'recipient': recipient,
                'link_converted_to_view': True
            }
            
            return {
                'signature_event': signature_event,
                'version': version,
                'response_data': response_data
            }
    
    @staticmethod
    def _trigger_webhooks(version, signature_event, signer_name, recipient):
        """
        Trigger webhooks for signature and completion events.
        
        Args:
            version: DocumentVersion instance
            signature_event: SignatureEvent instance
            signer_name: str
            recipient: str
        """
        # Trigger signature created event
        WebhookService.trigger_event(
            event_type='document.signature_created',
            payload={
                'document_id': version.document.id,
                'document_title': version.document.title,
                'version_id': version.id,
                'version_number': version.version_number,
                'signature_id': signature_event.id,
                'signer_name': signer_name,
                'recipient': recipient,
                'signed_at': signature_event.signed_at.isoformat(),
                'field_values': signature_event.field_values,
                'ip_address': signature_event.ip_address,
            }
        )
        
        # Trigger completion event if document is now complete
        if version.status == 'completed':
            WebhookService.trigger_event(
                event_type='document.completed',
                payload={
                    'document_id': version.document.id,
                    'document_title': version.document.title,
                    'version_id': version.id,
                    'version_number': version.version_number,
                    'status': version.status,
                    'completed_at': timezone.now().isoformat(),
                    'signatures_count': version.signatures.count(),
                    'all_signatures': [
                        {
                            'id': sig.id,
                            'signer_name': sig.signer_name,
                            'recipient': sig.recipient,
                            'signed_at': sig.signed_at.isoformat(),
                        }
                        for sig in version.signatures.all()
                    ],
                    'download_url': f'{version.document.get_download_url(version)}',
                    'audit_export_url': f'{version.document.get_audit_url(version)}',
                }
            )


# Singleton instance
_signing_process_service = None


def get_signing_process_service() -> SigningProcessService:
    """Get singleton instance of signing process service."""
    global _signing_process_service
    if _signing_process_service is None:
        _signing_process_service = SigningProcessService()
    return _signing_process_service