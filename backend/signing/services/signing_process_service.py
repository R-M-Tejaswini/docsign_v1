"""
Signing process service layer.

"""

from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from documents.services import get_document_service
from documents.models import DocumentField, Document
from ..models import SignatureEvent, SigningToken


class SigningProcessService:
    """Service for processing signature submissions."""
    
    @staticmethod
    def validate_token(signing_token):
        """Validate a signing token."""
        from .token_service import SigningTokenService
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
        """Validate that all fields being signed belong to the recipient."""
        field_ids = [fv['field_id'] for fv in field_values]
        
        # ✅ FIXED: Don't check locked status here - check later
        # Fields can be locked=True if updating existing signature
        recipient_fields = document.fields.filter(
            id__in=field_ids,
            recipient=recipient
        )
        
        if recipient_fields.count() != len(field_ids):
            raise ValidationError(
                'Some fields do not belong to this recipient'
            )
        
        return recipient_fields
    
    @staticmethod
    def validate_required_fields(document, recipient, field_values):
        """✅ FIXED: Exclude static prefilled from required validation"""
        field_ids = set(fv['field_id'] for fv in field_values)
        
        # ✅ CRITICAL: Exclude static prefilled fields - they're auto-filled
        required_recipient_fields = document.fields.filter(
            recipient=recipient,
            required=True,
            locked=False
        ).exclude(
            # ✅ NEW: Static prefilled fields don't need submission
            field_type='prefilled_text',
            is_editable_prefill=False
        )
        
        missing_required = required_recipient_fields.exclude(id__in=field_ids)
        
        if missing_required.exists():
            raise ValidationError({
                'error': 'All required fields must be filled',
                'missing_fields': list(missing_required.values('id', 'label'))
            })
    
    @staticmethod
    def update_field_values(recipient_fields, field_values):
        """
        ✅ CONSOLIDATED: Update field values and lock them.
        
        Args:
            recipient_fields: QuerySet of DocumentField objects to update
            field_values: List of {'field_id': ..., 'value': ...} dicts
        
        Returns:
            List of updated field objects
        """
        fields_to_update = []
        fields_map = {f.id: f for f in recipient_fields}
        
        for fv in field_values:
            field = fields_map.get(int(fv['field_id']))
            if field:
                field.value = fv['value']
                field.locked = True
                fields_to_update.append(field)
        
        # Bulk update fields
        if fields_to_update:
            DocumentField.objects.bulk_update(fields_to_update, ['value', 'locked'])
        
        return fields_to_update
    
    @staticmethod
    def process_signature_submission(
        signing_token,
        signer_name,
        field_values,
        ip_address,
        user_agent
    ):
        """Process a complete signature submission."""
        # Phase 1: Validate everything upfront
        SigningProcessService.validate_token(signing_token)
        SigningProcessService.validate_payload(signer_name, field_values)
        
        document = signing_token.document
        recipient = signing_token.recipient
        
        # Validate field ownership
        recipient_fields = SigningProcessService.validate_fields_ownership(
            document, recipient, field_values
        )
        
        # Validate required fields are filled
        SigningProcessService.validate_required_fields(
            document, recipient, field_values
        )
        
        # Phase 2: Process signature with transaction
        with transaction.atomic():
            from .token_service import SigningTokenService
            from .signature_service import SignatureService
            
            doc_service = get_document_service()
            sig_service = SignatureService()
            token_service = SigningTokenService()
            
            # ✅ Step 1: Update field values and lock them
            SigningProcessService.update_field_values(recipient_fields, field_values)
            
            # ✅ Step 2: Create signature event
            document_sha256 = doc_service.compute_sha256(document)
            signature_event = SignatureEvent.objects.create(
                document=document,
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
            
            # ✅ Step 3: Convert token to view-only
            token_service.convert_to_view_only(signing_token)
        
        # ✅ CRITICAL FIX: Refresh document and prefetch updated fields AFTER transaction commits
        # This ensures we see the newly locked fields in the database
        document.refresh_from_db()
        document = Document.objects.prefetch_related('fields').get(id=document.id)
        
        # ✅ Step 4: Update document status based on current field state
        doc_service.update_document_status(document)
        
        # ✅ Step 5: Refresh document again to get updated status
        document.refresh_from_db()
        
        # ✅ CRITICAL: If document is NOW completed, flatten it immediately
        if document.status == 'completed' and not document.signed_file:
            print(f"📄 Document completed, flattening PDF...")
            try:
                from documents.services.pdf_flattening import get_pdf_flattening_service
                flattening_service = get_pdf_flattening_service()
                flattening_service.flatten_and_save(document)
                print(f"✅ PDF flattened and saved")
            except Exception as e:
                print(f"❌ Error flattening PDF: {e}")
                import traceback
                traceback.print_exc()
        
        # Phase 3: Trigger webhooks
        SigningProcessService._trigger_webhooks(document, signature_event, signer_name, recipient)
        
        # Prepare response
        response_data = {
            'signature_id': signature_event.id,
            'message': 'Document signed successfully',
            'document_status': document.status,
            'recipient': recipient,
            'link_converted_to_view': True
        }
        
        return {
            'signature_event': signature_event,
            'document': document,
            'response_data': response_data
        }
    
    @staticmethod
    def _trigger_webhooks(document, signature_event, signer_name, recipient):
        """
        ✅ REFACTORED: Properly decoupled webhook triggering
        ✅ CLEAN PAYLOADS: No redundant fields
        ✅ ASYNC: Uses Celery, non-blocking
        
        Triggered from SigningProcessService (not hardcoded in views)
        Payloads contain only necessary data
        """
        from webhooks.services import WebhookService
        
        # Event 1: Signature Created
        WebhookService.trigger_event(
            event_type='document.signature_created',
            payload={
                'document_id': document.id,
                'document_title': document.title,
                'signature_id': signature_event.id,
                'signer_name': signer_name,
                'recipient': recipient,
                'signed_at': signature_event.signed_at.isoformat(),
                'field_values': signature_event.field_values,
            }
        )
        
        # Event 2: Document Status Changed (if status changed)
        WebhookService.trigger_event(
            event_type='document.status_changed',
            payload={
                'document_id': document.id,
                'document_title': document.title,
                'status': document.status,
                'changed_at': timezone.now().isoformat(),
                'changed_by': recipient,
            }
        )
        
        # Event 3: Document Completed (only if document is now complete)
        if document.status == 'completed':
            # ✅ Clean payload: Only include essential info, no redundancy
            WebhookService.trigger_event(
                event_type='document.completed',
                payload={
                    'document_id': document.id,
                    'document_title': document.title,
                    'status': 'completed',
                    'completed_at': timezone.now().isoformat(),
                    'total_signatures': document.signatures.count(),
                    'signatures': [
                        {
                            'id': sig.id,
                            'signer_name': sig.signer_name,
                            'recipient': sig.recipient,
                            'signed_at': sig.signed_at.isoformat(),
                        }
                        for sig in document.signatures.all()
                    ],
                    # ✅ NOT INCLUDED (reduce payload size):
                    # - download_url (consumer can construct from document_id)
                    # - audit_export_url (consumer can construct from document_id)
                    # - all_signatures with document_id again (already included above)
                }
            )


_signing_process_service = None

def get_signing_process_service() -> SigningProcessService:
    """Get singleton instance of signing process service."""
    global _signing_process_service
    if _signing_process_service is None:
        _signing_process_service = SigningProcessService()
    return _signing_process_service