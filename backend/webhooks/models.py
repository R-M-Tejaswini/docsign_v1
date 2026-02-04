"""
backend/webhooks/models.py


Professional webhook implementation with async delivery and audit trail.
"""

import secrets
from django.db import models


class Webhook(models.Model):
    """Webhook registration for external systems to listen to events."""
    
    # Only the 3 events we support
    EVENTS = [
        ('document.signature_created', 'Signature Created'),
        ('document.completed', 'Document Completed'),
        ('document.status_changed', 'Status Changed'),
    ]

    url = models.URLField(
        help_text="External endpoint URL to receive webhook events"
    )
    subscribed_events = models.JSONField(
        default=list,
        help_text="List of events to subscribe to (e.g., ['document.completed'])"
    )
    secret = models.CharField(
        max_length=255,
        unique=True,
        blank=True,
        help_text="Secret key for HMAC-SHA256 signature verification. Keep this private!"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this webhook is enabled"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    
    # Statistics
    total_deliveries = models.PositiveIntegerField(default=0)
    successful_deliveries = models.PositiveIntegerField(default=0)
    failed_deliveries = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['is_active', 'created_at']),
        ]
    
    def __str__(self):
        return f"Webhook: {self.url}"

    def save(self, *args, **kwargs):
        """Auto-generate secret if not present."""
        if not self.secret:
            self.secret = secrets.token_urlsafe(50)
        super().save(*args, **kwargs)


class WebhookEvent(models.Model):
    """Record of each webhook event fired."""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('retrying', 'Retrying'),
    ]
    
    webhook = models.ForeignKey(
        Webhook,
        on_delete=models.CASCADE,
        related_name='webhook_events',
        db_index=True
    )
    event_type = models.CharField(
        max_length=50,
        choices=Webhook.EVENTS,
        db_index=True,
        help_text="Type of event (e.g., 'document.completed')"
    )
    payload = models.JSONField(
        help_text="Event data sent to webhook (immutable)"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
        db_index=True
    )
    attempt_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    
    # Timing
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    
    # Idempotency: delivery_id prevents duplicate processing on the consumer side
    delivery_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Unique ID for this delivery attempt (for idempotency)"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['webhook', 'status', 'created_at']),
            models.Index(fields=['event_type', 'created_at']),
        ]
    
    def __str__(self):
        return f"{self.event_type} - {self.status}"


class WebhookDeliveryLog(models.Model):
    """Detailed log of each delivery attempt."""
    
    event = models.ForeignKey(
        WebhookEvent,
        on_delete=models.CASCADE,
        related_name='delivery_logs'
    )
    status_code = models.PositiveIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    
    # Timing
    created_at = models.DateTimeField(auto_now_add=True)
    duration_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="HTTP request duration in milliseconds"
    )
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event', 'created_at']),
        ]
    
    def __str__(self):
        return f"Attempt {self.event.attempt_count} - HTTP {self.status_code}"
