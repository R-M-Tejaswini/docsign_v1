"""
Celery tasks for async webhook delivery and retry.

✅ Non-blocking: All delivery happens in background workers
✅ Retry logic: Exponential backoff via RETRY_DELAYS
✅ Logging: Full audit trail of all attempts
"""

import requests
import logging
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from celery import shared_task
from .models import WebhookEvent, WebhookDeliveryLog
from .services import WebhookService

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=getattr(settings, 'WEBHOOK_MAX_RETRIES', 3),
    default_retry_delay=60
)
def deliver_webhook_event(self, event_id: int):
    """
    ✅ Async Celery task to deliver a webhook event.
    
    Called by:
    - WebhookService.trigger_event() (initial delivery)
    - retry_webhook_event() (retry attempts)
    
    Behavior:
    - Attempts HTTP POST to webhook URL with payload + signature
    - Creates WebhookDeliveryLog record for each attempt
    - Updates WebhookEvent status (pending → delivered/failed/retrying)
    - Automatically retries on failure using exponential backoff
    
    Retry Delays (configurable via WEBHOOK_RETRY_DELAYS):
    - Attempt 1: Retry after 60 seconds (1 min)
    - Attempt 2: Retry after 300 seconds (5 min)
    - Attempt 3: Retry after 900 seconds (15 min)
    - After 3 failed attempts: Give up and mark as failed
    
    Args:
        event_id: WebhookEvent.id to deliver
    
    Raises:
        Celery retry on transient failures (network, timeouts)
        Does not raise on permanent failures (webhook endpoint returned error)
    """
    try:
        event = WebhookEvent.objects.select_related('webhook').get(id=event_id)
    except WebhookEvent.DoesNotExist:
        logger.error(f"WebhookEvent {event_id} not found")
        return
    
    webhook = event.webhook
    
    # Prepare payload with signature
    payload = event.payload.copy()
    signature = WebhookService.generate_signature(webhook, payload)
    
    headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.event_type,
        'X-Webhook-Delivery': event.delivery_id,  # ✅ For idempotency
        'X-Webhook-Signature-Version': WebhookService.SIGNATURE_VERSION,
    }
    
    try:
        import time
        start_time = time.time()
        
        logger.info(
            f"Delivering webhook event {event.id} (type={event.event_type}, "
            f"webhook={webhook.url}, attempt={event.attempt_count + 1})"
        )
        
        # Make HTTP request with timeout
        response = requests.post(
            webhook.url,
            json=payload,
            headers=headers,
            timeout=WebhookService.REQUEST_TIMEOUT,
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Log delivery attempt
        delivery_log = WebhookDeliveryLog.objects.create(
            event=event,
            status_code=response.status_code,
            response_body=response.text[:1000],
            duration_ms=duration_ms,
        )
        
        # Check if successful (2xx status code)
        if 200 <= response.status_code < 300:
            # ✅ SUCCESS
            event.status = 'delivered'
            event.delivered_at = timezone.now()
            event.save(update_fields=['status', 'delivered_at'])
            
            WebhookService.increment_delivery_attempt(webhook, success=True)
            logger.info(
                f"✅ Webhook event {event.id} delivered successfully "
                f"(HTTP {response.status_code}, duration={duration_ms}ms)"
            )
            return
        
        else:
            # Non-2xx response is a transient error (server returned error)
            raise Exception(
                f"HTTP {response.status_code}: {response.text[:200]}"
            )
    
    except requests.exceptions.Timeout:
        error_msg = f"Request timeout ({WebhookService.REQUEST_TIMEOUT}s exceeded)"
        logger.warning(f"❌ Webhook {webhook.id} timeout: {error_msg}")
    
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error: {str(e)}"
        logger.warning(f"❌ Webhook {webhook.id} connection error: {error_msg}")
    
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.warning(f"❌ Webhook {webhook.id} delivery failed: {error_msg}")
    
    # Handle failure: Update event and retry
    event.last_error = error_msg
    event.attempt_count += 1
    
    if event.attempt_count < WebhookService.MAX_RETRIES:
        # ✅ RETRY: Queue another attempt
        retry_delay = WebhookService.RETRY_DELAYS[event.attempt_count - 1]
        event.status = 'retrying'
        event.next_retry_at = timezone.now() + timedelta(seconds=retry_delay)
        event.save(update_fields=[
            'status', 'attempt_count', 'last_error', 'next_retry_at'
        ])
        
        logger.info(
            f"⏳ Webhook event {event.id} will retry in {retry_delay}s "
            f"(attempt {event.attempt_count}/{WebhookService.MAX_RETRIES})"
        )
        
        # Retry using Celery's exponential backoff
        raise self.retry(
            exc=Exception(error_msg),
            countdown=retry_delay
        )
    
    else:
        # ✅ FAILED: All retries exhausted
        event.status = 'failed'
        event.save(update_fields=['status', 'attempt_count', 'last_error'])
        
        WebhookService.increment_delivery_attempt(webhook, success=False)
        logger.error(
            f"❌ Webhook event {event.id} failed after {WebhookService.MAX_RETRIES} attempts"
        )


@shared_task
def retry_failed_webhooks():
    """
    ✅ Periodic task to retry all failed webhook events.
    
    Scheduled via Celery Beat every 5 minutes (see celery.py)
    
    Finds all WebhookEvent records with status='failed' and requeues them
    for retry with a fresh attempt count.
    
    This provides a fallback mechanism if manual retry via API fails.
    """
    from .models import WebhookEvent
    
    failed_events = WebhookEvent.objects.filter(status='failed')
    retried_count = 0
    
    for event in failed_events:
        try:
            # Reset for retry
            event.status = 'retrying'
            event.attempt_count = 0
            event.last_error = ''
            event.save(update_fields=['status', 'attempt_count', 'last_error'])
            
            # Queue delivery task
            deliver_webhook_event.delay(event.id)
            retried_count += 1
            
            logger.info(f"Requeued failed webhook event {event.id} for retry")
        
        except Exception as e:
            logger.error(f"Failed to retry webhook event {event.id}: {e}")
            continue
    
    if retried_count > 0:
        logger.info(f"Requeued {retried_count} failed webhook events")