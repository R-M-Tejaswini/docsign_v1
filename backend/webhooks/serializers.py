"""
backend/webhooks/serializers.py


Webhook serializers.
"""

from rest_framework import serializers
from .models import Webhook, WebhookEvent, WebhookDeliveryLog


class WebhookDeliveryLogSerializer(serializers.ModelSerializer):
    """Serializer for webhook delivery log entries."""
    
    class Meta:
        model = WebhookDeliveryLog
        fields = [
            'id', 'status_code', 'response_body', 'error_message',
            'duration_ms', 'created_at',
        ]
        read_only_fields = fields


class WebhookEventSerializer(serializers.ModelSerializer):
    """Serializer for webhook events."""
    delivery_logs = WebhookDeliveryLogSerializer(many=True, read_only=True)
    
    class Meta:
        model = WebhookEvent
        fields = [
            'id', 'webhook', 'event_type', 'payload', 'status',
            'attempt_count', 'last_error', 'created_at', 'delivered_at',
            'next_retry_at', 'delivery_logs',
        ]
        read_only_fields = fields


class WebhookSerializer(serializers.ModelSerializer):
    """Serializer for webhook configuration."""
    events_list = serializers.SerializerMethodField()
    success_rate = serializers.SerializerMethodField()
    
    class Meta:
        model = Webhook
        fields = [
            'id', 'url', 'subscribed_events', 'events_list', 'secret', 'is_active',
            'created_at', 'updated_at', 'last_triggered_at', 'total_deliveries',
            'successful_deliveries', 'failed_deliveries', 'success_rate',
        ]
        read_only_fields = [
            'id', 'secret', 'created_at', 'updated_at', 'last_triggered_at',
            'total_deliveries', 'successful_deliveries', 'failed_deliveries',
        ]
    
    def get_events_list(self, obj):
        """Return human-readable event names."""
        return [
            dict(Webhook.EVENTS).get(event, event)
            for event in obj.subscribed_events
        ]
    
    def get_success_rate(self, obj):
        """Compute the percentage success rate."""
        if obj.total_deliveries == 0:
            return None
        return round((obj.successful_deliveries / obj.total_deliveries) * 100, 2)