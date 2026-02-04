"""
backend/webhooks/urls.py

✅ NEW APP: Webhook management and event tracking.

Routes:
- GET /api/webhooks/                                → List webhooks
- POST /api/webhooks/                               → Create webhook
- GET /api/webhooks/{id}/                           → Retrieve webhook
- PATCH /api/webhooks/{id}/                         → Update webhook
- DELETE /api/webhooks/{id}/                        → Deactivate webhook
- GET /api/webhooks/{id}/events/                    → List events for webhook
- POST /api/webhooks/{id}/test/                     → Send test webhook
- POST /api/webhooks/{id}/retry/                    → Retry failed events
- GET /api/webhook-events/                          → List all events
- GET /api/webhook-events/{id}/                     → Retrieve event
- GET /api/webhook-events/{id}/logs/                → Get delivery logs
"""

from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import WebhookViewSet, WebhookEventViewSet

app_name = 'webhooks'

# Create router for viewsets
router = SimpleRouter()
router.register(r'webhooks', WebhookViewSet, basename='webhook')
router.register(r'webhook-events', WebhookEventViewSet, basename='webhook-event')

# Include router URLs
urlpatterns = router.urls

# Add custom action URLs if needed
urlpatterns += [
    # Custom actions are handled by @action decorator in viewsets
    # No additional manual paths needed
]