"""
backend/webhooks/views.py


Webhook management endpoints: CRUD, testing, retry, and event logs.
"""

from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny

from .models import Webhook, WebhookEvent
from .serializers import WebhookSerializer, WebhookEventSerializer, WebhookDeliveryLogSerializer
from .services import WebhookService


class StandardResultsSetPagination(PageNumberPagination):
    """Pagination policy for webhook lists."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class WebhookViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing webhooks (CRUD + events + test + retry).
    
    Endpoints:
    - GET /api/webhooks/ → List all active webhooks
    - POST /api/webhooks/ → Create new webhook
    - GET /api/webhooks/{id}/ → Retrieve webhook details
    - PATCH /api/webhooks/{id}/ → Update webhook configuration
    - DELETE /api/webhooks/{id}/ → Soft-delete webhook (mark inactive)
    - GET /api/webhooks/{id}/events/ → List webhook's events
    - POST /api/webhooks/{id}/test/ → Send test webhook
    - POST /api/webhooks/{id}/retry/ → Retry failed deliveries
    """
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer
    permission_classes = [AllowAny]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        """Return only active webhooks by default."""
        return Webhook.objects.filter(is_active=True)
    
    def get_serializer_context(self):
        """Pass request to serializer context."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """
        List all webhook events for a specific webhook.
        
        What:
        - Returns WebhookEvent objects for this webhook ordered by created_at desc
        - Supports pagination
        - Includes delivery status and error information
        
        Why:
        - Allows admins to inspect the delivery history and debug issues
        - Shows which events were delivered, retrying, or failed
        """
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
        Send a test webhook delivery to validate endpoint configuration.
        
        What:
        - Creates a WebhookEvent with event_type='webhook.test'
        - Immediately attempts delivery with proper HMAC signature
        - Returns delivery status and response details
        
        Why:
        - Allows webhook consumers to validate endpoint before going live
        - Tests network connectivity, authentication, and payload format
        - No real document event needed
        
        Request body: {} (empty)
        
        Response:
        {
            'status_code': 200,
            'success': true,
            'response': 'response body...',
            'duration_ms': 45
        }
        """
        webhook = self.get_object()
        
        test_payload = {
            'event_type': 'webhook.test',
            'timestamp': __import__('django.utils.timezone', fromlist=['now']).now().isoformat(),
            'message': 'This is a test webhook delivery'
        }
        
        # Generate HMAC signature for test payload
        signature = WebhookService.generate_signature(webhook, test_payload)
        
        try:
            import requests
            import time
            
            headers = {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': 'webhook.test',
                'X-Webhook-Delivery': 'test-delivery',
            }
            
            start_time = time.time()
            
            response = requests.post(
                webhook.url,
                json=test_payload,
                headers=headers,
                timeout=10
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            return Response({
                'status': 'Test delivery sent',
                'status_code': response.status_code,
                'success': 200 <= response.status_code < 300,
                'response': response.text[:500],
                'duration_ms': duration_ms,
                'headers_sent': dict(headers)
            })
        
        except requests.exceptions.Timeout:
            return Response({
                'status': 'Test delivery failed',
                'success': False,
                'error': 'Request timeout (10s exceeded)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        except requests.exceptions.ConnectionError as e:
            return Response({
                'status': 'Test delivery failed',
                'success': False,
                'error': f'Connection error: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            return Response({
                'status': 'Test delivery failed',
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """
        Retry all failed webhook deliveries for this webhook.
        
        What:
        - Finds all WebhookEvent records with status='failed' for this webhook
        - Resets them to status='retrying' and attempt_count=0
        - Immediately attempts delivery for each
        
        Why:
        - Provides manual recovery mechanism for transient delivery failures
        - Useful when webhook endpoint was temporarily down
        - No need to wait for automatic retry schedule
        
        Request body: {} (empty)
        
        Response:
        {
            'message': 'Retrying 3 failed events',
            'webhook_id': 1,
            'events_retried': [
                {'id': 10, 'event_type': 'document.completed'},
                {'id': 11, 'event_type': 'document.signature_created'},
                {'id': 12, 'event_type': 'document.completed'}
            ]
        }
        """
        webhook = self.get_object()
        failed_events = webhook.webhook_events.filter(status='failed')
        
        retried_events = []
        
        for event in failed_events:
            # Reset event for retry
            event.status = 'retrying'
            event.attempt_count = 0
            event.last_error = ''
            event.save(update_fields=['status', 'attempt_count', 'last_error'])
            
            # Attempt delivery
            try:
                WebhookService.deliver_event(event, retry_attempt=0)
                retried_events.append({
                    'id': event.id,
                    'event_type': event.event_type,
                    'status': event.status
                })
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error retrying webhook event {event.id}: {str(e)}")
        
        return Response({
            'message': f'Retrying {len(retried_events)} failed events',
            'webhook_id': webhook.id,
            'events_retried': retried_events
        })
    
    def destroy(self, request, *args, **kwargs):
        """
        Soft-delete webhook by marking as inactive.
        
        What:
        - Sets is_active=False instead of hard-deleting
        - Preserves audit trail and delivery history
        
        Why:
        - Prevents data loss and allows re-enabling later
        - Maintains webhook event history for compliance
        """
        webhook = self.get_object()
        webhook.is_active = False
        webhook.save(update_fields=['is_active'])
        
        return Response({
            'message': 'Webhook deactivated',
            'webhook_id': webhook.id,
            'is_active': webhook.is_active
        })


class WebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoints for webhook events and their delivery logs.
    
    Endpoints:
    - GET /api/webhook-events/ → List all webhook events
    - GET /api/webhook-events/{id}/ → Retrieve event details
    - GET /api/webhook-events/{id}/logs/ → Get delivery logs for event
    
    Why read-only:
    - Webhook events are immutable audit records
    - Should not be deleted or modified after creation
    - Provides compliance and debugging audit trail
    """
    queryset = WebhookEvent.objects.all()
    serializer_class = WebhookEventSerializer
    permission_classes = [AllowAny]
    pagination_class = StandardResultsSetPagination
    
    def get_queryset(self):
        """Filter events by optional query parameters."""
        queryset = WebhookEvent.objects.all().order_by('-created_at')
        
        # Filter by webhook_id if provided
        webhook_id = self.request.query_params.get('webhook_id')
        if webhook_id:
            queryset = queryset.filter(webhook_id=webhook_id)
        
        # Filter by event_type if provided
        event_type = self.request.query_params.get('event_type')
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        
        # Filter by status if provided
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """
        Retrieve all delivery logs for a specific webhook event.
        
        What:
        - Returns WebhookDeliveryLog records for this event
        - Ordered by created_at descending (most recent first)
        - Includes HTTP status codes, response bodies, and timing info
        
        Why:
        - Helps debug why a webhook delivery failed or succeeded
        - Shows the request/response exchange for each attempt
        - Useful for compliance and troubleshooting
        
        Query parameters:
        - None (supports standard pagination)
        
        Response:
        {
            'count': 3,
            'next': null,
            'previous': null,
            'results': [
                {
                    'id': 1,
                    'status_code': 500,
                    'response_body': 'Internal Server Error',
                    'error_message': '',
                    'duration_ms': 145,
                    'created_at': '2026-01-15T10:30:00Z'
                },
                ...
            ]
        }
        """
        event = self.get_object()
        logs = event.delivery_logs.all().order_by('-created_at')
        
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = WebhookDeliveryLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = WebhookDeliveryLogSerializer(logs, many=True)
        return Response(serializer.data)
