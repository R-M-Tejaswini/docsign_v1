import json
import requests
import logging
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from celery import shared_task
from ..models import Webhook, WebhookEvent, WebhookDeliveryLog

logger = logging.getLogger(__name__)


class WebhookService:
    """Service for managing webhook events and deliveries."""
    
    # Maximum retry attempts
    MAX_RETRIES = 3
    
    # Retry delays (in seconds)
    RETRY_DELAYS = [60, 300, 900]  # 1 min, 5 min, 15 min
    
    # Request timeout
    REQUEST_TIMEOUT = 10
    
    @staticmethod
    def trigger_event(event_type: str, payload: dict):
        """
        Trigger a webhook event for all registered webhooks.
        """
        # Get all active webhooks
        all_webhooks = Webhook.objects.filter(is_active=True)
        
        # Filter in Python (compatible with SQLite)
        matching_webhooks = [
            webhook for webhook in all_webhooks
            if event_type in webhook.subscribed_events
        ]
        
        logger.info(f"Triggering event '{event_type}' for {len(matching_webhooks)} webhook(s)")
        
        for webhook in matching_webhooks:
            event = WebhookEvent.objects.create(
                webhook=webhook,
                event_type=event_type,
                payload=payload,
                status='pending'
            )
            
            # ✅ FOR DEVELOPMENT: Call synchronously instead of .delay()
            try:
                WebhookService.deliver_event(event, retry_attempt=0)
            except Exception as e:
                logger.error(f"Failed to deliver webhook: {e}")
    
    @staticmethod
    def deliver_event(event: WebhookEvent, retry_attempt: int = 0):
        """
        Attempt to deliver a webhook event to external URL.
        
        Args:
            event: WebhookEvent instance
            retry_attempt: Current retry attempt number
        """
        import time
        
        webhook = event.webhook
        
        # Add webhook signature to payload for verification
        payload = {
            **event.payload,
            '_webhook_id': webhook.id,
            '_event_type': event.event_type,
            '_timestamp': timezone.now().isoformat(),
        }
        
        # Generate signature
        signature = WebhookService.generate_signature(webhook, payload)
        
        headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event.event_type,
            'X-Webhook-Delivery': str(event.id),
        }
        
        try:
            start_time = time.time()
            
            # Make HTTP request
            response = requests.post(
                webhook.url,
                json=payload,
                headers=headers,
                timeout=WebhookService.REQUEST_TIMEOUT
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Log delivery attempt
            delivery_log = WebhookDeliveryLog.objects.create(
                event=event,
                status_code=response.status_code,
                response_body=response.text[:1000],  # Truncate to 1000 chars
                duration_ms=duration_ms
            )
            
            # Check if successful (2xx status code)
            if 200 <= response.status_code < 300:
                event.status = 'delivered'
                event.delivered_at = timezone.now()
                event.save()
                
                WebhookService.increment_delivery_attempt(webhook, success=True)
                logger.info(f"✅ Webhook {webhook.id} delivered successfully (HTTP {response.status_code})")
                return
            else:
                raise Exception(f"HTTP {response.status_code}: {response.text[:200]}")
        
        except requests.exceptions.Timeout:
            error_msg = "Request timeout"
        except requests.exceptions.ConnectionError:
            error_msg = "Connection error"
        except Exception as e:
            error_msg = str(e)
        
        logger.warning(f"❌ Webhook delivery failed: {error_msg}")
        
        # Handle retry
        event.last_error = error_msg
        event.attempt_count = retry_attempt + 1
        
        if retry_attempt < WebhookService.MAX_RETRIES:
            # Schedule retry
            retry_delay = WebhookService.RETRY_DELAYS[retry_attempt]
            event.status = 'retrying'
            event.next_retry_at = timezone.now() + timedelta(seconds=retry_delay)
            event.save()
            
            # Schedule async retry
            retry_webhook_event.apply_async(
                args=[event.id, retry_attempt + 1],
                countdown=retry_delay
            )
            
            logger.info(f"⏳ Retrying webhook {webhook.id} in {retry_delay}s")
        else:
            # All retries exhausted
            event.status = 'failed'
            event.save()
            
            WebhookService.increment_delivery_attempt(webhook, success=False)
            logger.error(f"❌ Webhook {webhook.id} failed after {WebhookService.MAX_RETRIES} retries")
    
    @staticmethod
    def generate_signature(webhook, payload: dict) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.
        
        Args:
            webhook: Webhook instance
            payload: dict, event payload
            
        Returns:
            str: Hexadecimal signature
        """
        import hmac
        import hashlib
        
        payload_str = json.dumps(payload, sort_keys=True)
        signature = hmac.new(
            webhook.secret.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature
    
    @staticmethod
    def increment_delivery_attempt(webhook, success: bool):
        """
        Track delivery statistics.
        
        Args:
            webhook: Webhook instance
            success: bool, whether delivery was successful
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


# Celery tasks for async webhook delivery
@shared_task
def deliver_webhook_event(event_id: int):
    """Celery task to deliver webhook event."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
        WebhookService.deliver_event(event, retry_attempt=0)
    except WebhookEvent.DoesNotExist:
        logger.error(f"WebhookEvent {event_id} not found")


@shared_task
def retry_webhook_event(event_id: int, retry_attempt: int):
    """Celery task to retry failed webhook delivery."""
    try:
        event = WebhookEvent.objects.get(id=event_id)
        WebhookService.deliver_event(event, retry_attempt=retry_attempt)
    except WebhookEvent.DoesNotExist:
        logger.error(f"WebhookEvent {event_id} not found")