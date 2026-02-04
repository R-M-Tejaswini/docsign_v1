"""
backend/webhooks/views.py


Professional webhook management endpoints with async delivery.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from django.utils import timezone

from .models import Webhook, WebhookEvent
from .serializers import WebhookSerializer, WebhookEventSerializer
from .services import WebhookService
from .tasks import deliver_webhook_event


class StandardResultsSetPagination(PageNumberPagination):
    """Pagination policy."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class WebhookViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing webhooks (CRUD + test + retry).
    
    Endpoints:
    - GET /api/webhooks/                     → List webhooks
    - POST /api/webhooks/                    → Create webhook
    - GET /api/webhooks/{id}/                → Retrieve webhook
    - PATCH /api/webhooks/{id}/              → Update webhook
    - DELETE /api/webhooks/{id}/             → Deactivate webhook
    - POST /api/webhooks/{id}/test/          → Send test webhook
    - POST /api/webhooks/{id}/retry/         → Retry failed events
    - GET /api/webhooks/{id}/events/         → List events for webhook
    """
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer
    permission_classes = [AllowAny]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        """Return only active webhooks."""
        return Webhook.objects.filter(is_active=True)
    
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """List webhook events for this webhook."""
        webhook = self.get_object()
        events = webhook.webhook_events.all().order_by('-created_at')
        
        page = self.paginate_queryset(events)
        if page is not None:
            serializer = WebhookEventSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = WebhookEventSerializer(events, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """
        Send a test webhook delivery.
        
        ✅ Uses async delivery via Celery
        ✅ Includes proper signature and idempotency headers
        
        Returns: Test event details
        """
        webhook = self.get_object()
        
        test_payload = {
            'event_type': 'webhook.test',
            'timestamp': timezone.now().isoformat(),
            'message': 'This is a test webhook delivery. Verify your endpoint can process it.',
            'webhook_id': webhook.id,
        }
        
        try:
            # Create WebhookEvent for test (no async needed for test, happens inline)
            delivery_id = WebhookService._generate_delivery_id()
            event = WebhookEvent.objects.create(
                webhook=webhook,
                event_type='webhook.test',  # Special test event type
                payload=test_payload,
                status='pending',
                delivery_id=delivery_id,
            )
            
            # Queue async delivery
            deliver_webhook_event.delay(event.id)
            
            return Response({
                'status': 'Test webhook queued for delivery',
                'event_id': event.id,
                'delivery_id': event.delivery_id,
                'message': 'Check your webhook endpoint. Delivery is async and may take a few seconds.',
                'signature_header': 'X-Webhook-Signature',
                'signature_example': f"sha256=<hex_digest_of_payload>",
            })
        
        except Exception as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """
        Manually retry all failed webhook events for this webhook.
        
        ✅ Resets attempt count and requeues failed events
        ✅ Uses async delivery
        """
        webhook = self.get_object()
        failed_events = webhook.webhook_events.filter(status='failed')
        
        retried_count = 0
        for event in failed_events:
            event.status = 'retrying'
            event.attempt_count = 0
            event.last_error = ''
            event.save(update_fields=['status', 'attempt_count', 'last_error'])
            
            # Queue async delivery
            deliver_webhook_event.delay(event.id)
            retried_count += 1
        
        return Response({
            'message': f'Requeued {retried_count} failed events for retry',
            'webhook_id': webhook.id,
            'events_retried': retried_count,
        })
    
    def destroy(self, request, *args, **kwargs):
        """Soft-delete webhook by marking inactive."""
        webhook = self.get_object()
        webhook.is_active = False
        webhook.save(update_fields=['is_active'])
        
        return Response({
            'message': 'Webhook deactivated',
            'webhook_id': webhook.id,
        })


class WebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoints for webhook events.
    
    Endpoints:
    - GET /api/webhook-events/           → List all events
    - GET /api/webhook-events/{id}/      → Retrieve event
    - GET /api/webhook-events/{id}/logs/ → Get delivery logs
    """
    queryset = WebhookEvent.objects.all()
    serializer_class = WebhookEventSerializer
    permission_classes = [AllowAny]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        """Filter by optional query parameters."""
        queryset = WebhookEvent.objects.all().order_by('-created_at')
        
        webhook_id = self.request.query_params.get('webhook_id')
        if webhook_id:
            queryset = queryset.filter(webhook_id=webhook_id)
        
        event_type = self.request.query_params.get('event_type')
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        
        event_status = self.request.query_params.get('status')
        if event_status:
            queryset = queryset.filter(status=event_status)
        
        return queryset
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Get delivery logs for a specific event."""
        event = self.get_object()
        logs = event.delivery_logs.all().order_by('-created_at')
        
        page = self.paginate_queryset(logs)
        if page is not None:
            from .serializers import WebhookDeliveryLogSerializer
            serializer = WebhookDeliveryLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        from .serializers import WebhookDeliveryLogSerializer
        serializer = WebhookDeliveryLogSerializer(logs, many=True)
        return Response(serializer.data)
