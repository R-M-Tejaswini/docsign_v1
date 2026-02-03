"""
Centralized webhook trigger service for all apps.

This service standardizes how webhook events are triggered across:
- Documents (created, locked, signed, completed, duplicated, etc.)
- Templates (created, updated, deleted, etc.)
- Future features (forms, contracts, etc.)

Why centralized:
- Single source of truth for event definitions
- Consistent payload format across all events
- Easy to add new event types
- Decoupled from business logic
- Enables comprehensive audit trails
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class WebhookEventType:
    """
    Centralized event type definitions.
    
    Organized by resource type and lifecycle stage.
    """
    
    # ====================================
    # DOCUMENT EVENTS
    # ====================================
    DOCUMENT_CREATED = 'document.created'
    DOCUMENT_LOCKED = 'document.locked'
    DOCUMENT_UNLOCKED = 'document.unlocked'
    DOCUMENT_DUPLICATED = 'document.duplicated'
    DOCUMENT_DELETED = 'document.deleted'
    DOCUMENT_STATUS_CHANGED = 'document.status_changed'
    
    # Document signing events
    DOCUMENT_SIGNATURE_CREATED = 'document.signature_created'
    DOCUMENT_SIGNATURE_VERIFIED = 'document.signature_verified'
    DOCUMENT_SIGNATURE_INVALIDATED = 'document.signature_invalidated'
    DOCUMENT_PARTIALLY_SIGNED = 'document.partially_signed'
    DOCUMENT_COMPLETED = 'document.completed'
    
    # Document field events
    DOCUMENT_FIELD_ADDED = 'document.field_added'
    DOCUMENT_FIELD_UPDATED = 'document.field_updated'
    DOCUMENT_FIELD_DELETED = 'document.field_deleted'
    
    # ====================================
    # TEMPLATE EVENTS
    # ====================================
    TEMPLATE_CREATED = 'template.created'
    TEMPLATE_UPDATED = 'template.updated'
    TEMPLATE_DELETED = 'template.deleted'
    TEMPLATE_PUBLISHED = 'template.published'
    
    # Template field events
    TEMPLATE_FIELD_ADDED = 'template.field_added'
    TEMPLATE_FIELD_UPDATED = 'template.field_updated'
    TEMPLATE_FIELD_DELETED = 'template.field_deleted'
    
    # ====================================
    # SIGNING TOKEN EVENTS
    # ====================================
    TOKEN_CREATED = 'token.created'
    TOKEN_REVOKED = 'token.revoked'
    TOKEN_EXPIRED = 'token.expired'
    TOKEN_USED = 'token.used'
    
    # Get all event types
    @classmethod
    def get_all_events(cls) -> List[str]:
        """Return list of all supported event types."""
        return [
            value for key, value in cls.__dict__.items()
            if not key.startswith('_') and isinstance(value, str)
        ]


class WebhookTriggerService:
    """
    Centralized service for triggering webhook events.
    
    All webhook triggers should go through this service to ensure:
    - Consistent event format
    - Proper logging and auditing
    - Easy testing and debugging
    """
    
    # ====================================
    # DOCUMENT CREATION & LIFECYCLE
    # ====================================
    
    @staticmethod
    def trigger_document_created(
        document,
        created_by: Optional[str] = None,
        source: str = 'api'
    ) -> None:
        """
        Trigger when a document is created.
        
        Args:
            document: Document instance
            created_by: User/system that created the document
            source: 'api', 'template', 'duplicate', etc.
        
        Example:
            >>> WebhookTriggerService.trigger_document_created(
            ...     document=doc,
            ...     created_by='user@example.com',
            ...     source='api'
            ... )
        """
        from documents.models import Document
        
        if not isinstance(document, Document):
            logger.warning(f"Invalid document type: {type(document)}")
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_CREATED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
                'description': document.description,
                'status': document.status,
                'page_count': document.page_count,
                'created_at': document.created_at.isoformat(),
            },
            'metadata': {
                'created_by': created_by,
                'source': source,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_CREATED,
            payload
        )
    
    @staticmethod
    def trigger_document_locked(
        document,
        locked_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a document transitions from draft to locked.
        
        Args:
            document: Document instance
            locked_by: User/system that locked the document
        """
        from documents.models import Document
        
        if not isinstance(document, Document):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_LOCKED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
                'status': document.status,
            },
            'metadata': {
                'locked_by': locked_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_LOCKED,
            payload
        )
    
    @staticmethod
    def trigger_document_duplicated(
        original_document,
        duplicate_document,
        duplicated_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a document is duplicated.
        
        Args:
            original_document: Original Document instance
            duplicate_document: Newly created duplicate
            duplicated_by: User/system that triggered duplication
        """
        from documents.models import Document
        
        if not isinstance(original_document, Document) or not isinstance(duplicate_document, Document):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_DUPLICATED,
            'timestamp': timezone.now().isoformat(),
            'original_document': {
                'id': original_document.id,
                'title': original_document.title,
            },
            'duplicate_document': {
                'id': duplicate_document.id,
                'title': duplicate_document.title,
                'status': duplicate_document.status,
            },
            'metadata': {
                'duplicated_by': duplicated_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_DUPLICATED,
            payload
        )
    
    @staticmethod
    def trigger_document_status_changed(
        document,
        old_status: str,
        new_status: str,
        reason: Optional[str] = None
    ) -> None:
        """
        Trigger when document status changes.
        
        Args:
            document: Document instance
            old_status: Previous status
            new_status: New status
            reason: Why the status changed
        """
        from documents.models import Document
        
        if not isinstance(document, Document):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_STATUS_CHANGED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
            },
            'status_change': {
                'from': old_status,
                'to': new_status,
                'reason': reason,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_STATUS_CHANGED,
            payload
        )
    
    @staticmethod
    def trigger_document_completed(
        document,
        all_signatures: List[Dict[str, Any]]
    ) -> None:
        """
        Trigger when document is fully signed and completed.
        
        Args:
            document: Document instance
            all_signatures: List of signature dictionaries
        """
        from documents.models import Document
        
        if not isinstance(document, Document):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_COMPLETED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
                'status': document.status,
                'completed_at': timezone.now().isoformat(),
                'page_count': document.page_count,
            },
            'signatures': all_signatures,
            'summary': {
                'total_signatures': len(all_signatures),
                'unique_recipients': len(set(sig['recipient'] for sig in all_signatures)),
            },
            'urls': {
                'download': document.get_download_url(),
                'audit_export': document.get_audit_url(),
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_COMPLETED,
            payload
        )
    
    # ====================================
    # DOCUMENT SIGNATURE EVENTS
    # ====================================
    
    @staticmethod
    def trigger_signature_created(
        document,
        signature_event,
        signer_name: str,
        recipient: str,
        field_values: List[Dict[str, Any]]
    ) -> None:
        """
        Trigger when a signature is created.
        
        Args:
            document: Document instance
            signature_event: SignatureEvent instance
            signer_name: Name of the person who signed
            recipient: Recipient identifier
            field_values: List of field values signed
        """
        from documents.models import Document, SignatureEvent
        
        if not isinstance(document, Document) or not isinstance(signature_event, SignatureEvent):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_SIGNATURE_CREATED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
                'status': document.status,
            },
            'signature': {
                'id': signature_event.id,
                'signer_name': signer_name,
                'recipient': recipient,
                'signed_at': signature_event.signed_at.isoformat(),
                'ip_address': signature_event.ip_address,
                'user_agent': signature_event.user_agent[:100] if signature_event.user_agent else None,
            },
            'fields_signed': field_values,
            'summary': {
                'fields_signed': len(field_values),
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_SIGNATURE_CREATED,
            payload
        )
    
    @staticmethod
    def trigger_partially_signed(
        document,
        signed_recipients: List[str],
        pending_recipients: List[str]
    ) -> None:
        """
        Trigger when document moves to partially_signed status.
        
        Args:
            document: Document instance
            signed_recipients: List of recipients who have signed
            pending_recipients: List of recipients still pending
        """
        from documents.models import Document
        
        if not isinstance(document, Document):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_PARTIALLY_SIGNED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
                'status': document.status,
            },
            'progress': {
                'signed_recipients': signed_recipients,
                'pending_recipients': pending_recipients,
                'total_recipients': len(signed_recipients) + len(pending_recipients),
                'completion_percentage': int(
                    (len(signed_recipients) / (len(signed_recipients) + len(pending_recipients))) * 100
                ) if (len(signed_recipients) + len(pending_recipients)) > 0 else 0,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_PARTIALLY_SIGNED,
            payload
        )
    
    # ====================================
    # DOCUMENT FIELD EVENTS
    # ====================================
    
    @staticmethod
    def trigger_field_added(
        document,
        field,
        added_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a field is added to a document.
        
        Args:
            document: Document instance
            field: DocumentField instance
            added_by: User/system that added the field
        """
        from documents.models import Document, DocumentField
        
        if not isinstance(document, Document) or not isinstance(field, DocumentField):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_FIELD_ADDED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
            },
            'field': {
                'id': field.id,
                'label': field.label,
                'type': field.field_type,
                'recipient': field.recipient,
                'page': field.page_number,
                'required': field.required,
            },
            'metadata': {
                'added_by': added_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_FIELD_ADDED,
            payload
        )
    
    @staticmethod
    def trigger_field_updated(
        document,
        field,
        changes: Dict[str, Any],
        updated_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a field is updated.
        
        Args:
            document: Document instance
            field: DocumentField instance
            changes: Dictionary of {field_name: (old_value, new_value)}
            updated_by: User/system that updated the field
        """
        from documents.models import Document, DocumentField
        
        if not isinstance(document, Document) or not isinstance(field, DocumentField):
            return
        
        payload = {
            'event_type': WebhookEventType.DOCUMENT_FIELD_UPDATED,
            'timestamp': timezone.now().isoformat(),
            'document': {
                'id': document.id,
                'title': document.title,
            },
            'field': {
                'id': field.id,
                'label': field.label,
                'type': field.field_type,
            },
            'changes': {
                field_name: {
                    'old': old_val,
                    'new': new_val,
                }
                for field_name, (old_val, new_val) in changes.items()
            },
            'metadata': {
                'updated_by': updated_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.DOCUMENT_FIELD_UPDATED,
            payload
        )
    
    # ====================================
    # TEMPLATE EVENTS
    # ====================================
    
    @staticmethod
    def trigger_template_created(
        template,
        created_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a template is created.
        
        Args:
            template: Template instance
            created_by: User/system that created the template
        """
        from templates.models import Template
        
        if not isinstance(template, Template):
            return
        
        payload = {
            'event_type': WebhookEventType.TEMPLATE_CREATED,
            'timestamp': timezone.now().isoformat(),
            'template': {
                'id': template.id,
                'title': template.title,
                'description': template.description,
                'page_count': template.page_count,
                'created_at': template.created_at.isoformat(),
            },
            'recipients': template.recipients,
            'field_count': template.fields.count(),
            'metadata': {
                'created_by': created_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.TEMPLATE_CREATED,
            payload
        )
    
    @staticmethod
    def trigger_template_updated(
        template,
        changes: Dict[str, Any],
        updated_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a template is updated.
        
        Args:
            template: Template instance
            changes: Dictionary of what changed
            updated_by: User/system that updated the template
        """
        from templates.models import Template
        
        if not isinstance(template, Template):
            return
        
        payload = {
            'event_type': WebhookEventType.TEMPLATE_UPDATED,
            'timestamp': timezone.now().isoformat(),
            'template': {
                'id': template.id,
                'title': template.title,
                'description': template.description,
            },
            'changes': changes,
            'metadata': {
                'updated_by': updated_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.TEMPLATE_UPDATED,
            payload
        )
    
    @staticmethod
    def trigger_template_field_added(
        template,
        field,
        added_by: Optional[str] = None
    ) -> None:
        """
        Trigger when a field is added to a template.
        
        Args:
            template: Template instance
            field: TemplateField instance
            added_by: User/system that added the field
        """
        from templates.models import Template, TemplateField
        
        if not isinstance(template, Template) or not isinstance(field, TemplateField):
            return
        
        payload = {
            'event_type': WebhookEventType.TEMPLATE_FIELD_ADDED,
            'timestamp': timezone.now().isoformat(),
            'template': {
                'id': template.id,
                'title': template.title,
            },
            'field': {
                'id': field.id,
                'label': field.label,
                'type': field.field_type,
                'recipient': field.recipient,
                'page': field.page_number,
                'required': field.required,
            },
            'metadata': {
                'added_by': added_by,
            }
        }
        
        WebhookTriggerService._dispatch_event(
            WebhookEventType.TEMPLATE_FIELD_ADDED,
            payload
        )
    
    # ====================================
    # INTERNAL DISPATCH METHOD
    # ====================================
    
    @staticmethod
    def _dispatch_event(
        event_type: str,
        payload: Dict[str, Any]
    ) -> None:
        """
        Internal method to dispatch an event to the webhook service.
        
        This is the central point where events are sent to WebhookService
        for delivery to registered webhooks.
        
        Args:
            event_type: Event type constant from WebhookEventType
            payload: Event payload
        """
        try:
            from documents.services.webhook_service import WebhookService
            
            logger.info(
                f"Triggering webhook event: {event_type}",
                extra={'event_type': event_type, 'payload': payload}
            )
            
            WebhookService.trigger_event(event_type, payload)
            
        except Exception as e:
            logger.error(
                f"Failed to trigger webhook event: {event_type}",
                exc_info=True,
                extra={'event_type': event_type, 'error': str(e)}
            )


# ====================================
# SINGLETON PATTERN
# ====================================

_webhook_trigger_service = None


def get_webhook_trigger_service() -> WebhookTriggerService:
    """
    Get singleton instance of WebhookTriggerService.
    
    Returns:
        WebhookTriggerService: Singleton instance
    """
    global _webhook_trigger_service
    if _webhook_trigger_service is None:
        _webhook_trigger_service = WebhookTriggerService()
    return _webhook_trigger_service