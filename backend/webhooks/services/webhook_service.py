"""
Professional webhook service with async delivery via Celery.
"""

import json
import logging
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from webhooks.models import Webhook, WebhookEvent, WebhookDeliveryLog

logger = logging.getLogger(__name__)


class WebhookService:
    """
    Professional webhook service for triggering and managing webhook events.
    
    ✅ Key features:
    - Async delivery via Celery (non-blocking)
    - Proper event queueing (WebhookEvent records created first)
    - HMAC-SHA256 signature generation and documentation
    - Idempotency keys for retry safety
    - Structured logging
    - No tight coupling to signing logic
    """
    
    # Configuration from Django settings
    SIGNATURE_ALGORITHM = getattr(settings, 'WEBHOOK_SIGNATURE_ALGORITHM', 'sha256')
    SIGNATURE_VERSION = getattr(settings, 'WEBHOOK_SIGNATURE_VERSION', 'v1')
    REQUEST_TIMEOUT = getattr(settings, 'WEBHOOK_REQUEST_TIMEOUT', 10)
    MAX_RETRIES = getattr(settings, 'WEBHOOK_MAX_RETRIES', 3)
    RETRY_DELAYS = getattr(settings, 'WEBHOOK_RETRY_DELAYS', [60, 300, 900])
    
    @staticmethod
    def trigger_event(event_type: str, payload: dict) -> int:
        """
        Trigger a webhook event for all active, subscribed webhooks.
        
        ✅ Non-blocking: Creates WebhookEvent record and queues Celery task
        
        Args:
            event_type: 'document.completed', 'document.signature_created', 'document.status_changed'
            payload: Event data dict (will be JSON serialized)
        
        Returns:
            Number of webhooks that were triggered
        
        Example:
            >>> from webhooks.services import WebhookService
            >>> WebhookService.trigger_event(
            ...     'document.completed',
            ...     {
            ...         'document_id': 42,
            ...         'document_title': 'Contract.pdf',
            ...         'status': 'completed',
            ...         'completed_at': '2026-02-04T10:30:00Z',
            ...     }
            ... )
        """
        if event_type not in dict(Webhook.EVENTS):
            logger.warning(f"Unknown event type: {event_type}")
            return 0
        
        # Find all active webhooks subscribed to this event
        all_webhooks = Webhook.objects.filter(is_active=True)
        matching_webhooks = [
            webhook for webhook in all_webhooks
            if event_type in webhook.subscribed_events
        ]
        
        if not matching_webhooks:
            logger.debug(f"No webhooks subscribed to {event_type}")
            return 0
        
        logger.info(
            f"Triggering event '{event_type}' for {len(matching_webhooks)} webhook(s)"
        )
        
        # Create WebhookEvent records and queue delivery tasks
        created_count = 0
        for webhook in matching_webhooks:
            try:
                with transaction.atomic():
                    # Create event record
                    delivery_id = WebhookService._generate_delivery_id()
                    event = WebhookEvent.objects.create(
                        webhook=webhook,
                        event_type=event_type,
                        payload=payload,
                        status='pending',
                        delivery_id=delivery_id,
                    )
                    
                    # Queue async delivery task (non-blocking)
                    from webhooks.tasks import deliver_webhook_event
                    
                    # ✅ DEBUG: Log task queueing
                    logger.info(f"📨 Queueing webhook delivery task for event {event.id}")
                    task = deliver_webhook_event.delay(event.id)
                    logger.info(f"✅ Task queued with ID: {task.id}")
                    
                    created_count += 1
                    logger.debug(f"Queued event {event.id} for webhook {webhook.id}")
            
            except Exception as e:
                logger.error(
                    f"Failed to trigger webhook {webhook.id}: {type(e).__name__}: {e}"
                )
                continue
        
        return created_count
    
    @staticmethod
    def generate_signature(webhook: Webhook, payload: dict) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.
        
        ✅ Documented signature algorithm and format
        
        Algorithm:
        - Serialize payload to JSON (sorted keys for deterministic output)
        - Compute HMAC using SHA256 algorithm
        - Webhook secret as key
        - Return hexadecimal digest
        
        Format:
        - Header: X-Webhook-Signature
        - Value: "sha256=<hex_digest>"
        - Example: "sha256=abc123def456..."
        
        Consumer Implementation (Node.js):
        ```javascript
        const crypto = require('crypto');
        
        function verifyWebhookSignature(payload, signature, secret) {
            const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
            const expectedSig = 'sha256=' + crypto
                .createHmac('sha256', secret)
                .update(payloadStr)
                .digest('hex');
            
            return crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSig)
            );
        }
        ```
        
        Consumer Implementation (Python):
        ```python
        import hmac
        import json
        
        def verify_webhook_signature(payload, signature, secret):
            payload_str = json.dumps(payload, sort_keys=True)
            expected_sig = 'sha256=' + hmac.new(
                secret.encode(),
                payload_str.encode(),
                'sha256'
            ).hexdigest()
            
            return hmac.compare_digest(signature, expected_sig)
        ```
        
        Args:
            webhook: Webhook instance
            payload: Event payload dict
        
        Returns:
            Signature string (e.g., "sha256=abc123...")
        """
        import hmac
        import hashlib
        
        # Serialize payload with sorted keys for deterministic output
        payload_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
        
        # Compute HMAC-SHA256
        signature_hex = hmac.new(
            webhook.secret.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).hexdigest()
        
        # Return formatted signature
        return f"{WebhookService.SIGNATURE_ALGORITHM}={signature_hex}"
    
    @staticmethod
    def _generate_delivery_id() -> str:
        """
        Generate a unique delivery ID for idempotency.
        
        ✅ Prevents duplicate processing on consumer side
        
        This ID should be:
        - Unique across all deliveries (UUID-like)
        - Included in the X-Webhook-Delivery header
        - Used by consumers to detect retries
        
        Returns:
            Unique delivery ID string (UUID format)
        """
        import uuid
        return str(uuid.uuid4())
    
    @staticmethod
    def increment_delivery_attempt(webhook: Webhook, success: bool):
        """
        Track delivery statistics on the webhook.
        
        Args:
            webhook: Webhook instance
            success: Whether delivery was successful (bool)
        """
        webhook.total_deliveries += 1
        if success:
            webhook.successful_deliveries += 1
        else:
            webhook.failed_deliveries += 1
        
        webhook.last_triggered_at = timezone.now()
        webhook.save(update_fields=[
            'total_deliveries',
            'successful_deliveries',
            'failed_deliveries',
            'last_triggered_at'
        ])


_webhook_service = None


def get_webhook_service() -> WebhookService:
    """Get singleton instance of webhook service."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService()
    return _webhook_service