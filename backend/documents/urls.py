"""
backend/documents/urls.py

✅ CONSOLIDATED: Removed all version-specific routes. Documents are now independent.
"""

# ----------------------------
# Django imports
# ----------------------------
from django.urls import path

# ----------------------------
# Local view imports
# ----------------------------
from .views import (
    DocumentViewSet,
    SigningTokenViewSet,
    PublicSignViewSet,
    SignatureVerificationViewSet,
    WebhookViewSet,
    WebhookEventViewSet
)

# App namespace for reverse() lookups
app_name = 'documents'

# ----------------------------
# Primary document routes
# ----------------------------
urlpatterns = [
    # ===== DOCUMENT CRUD (SIMPLIFIED - NO VERSIONS) =====
    path('', DocumentViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='document-list'),
    # List and create documents
    
    path('<int:pk>/', DocumentViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='document-detail'),
    # Retrieve, update, or delete a document
    
    # ✅ CONSOLIDATED: Duplicate document (replaces copy_version)
    path('<int:pk>/duplicate/', DocumentViewSet.as_view({
        'post': 'duplicate'
    }), name='document-duplicate'),
    # Create a new independent document by duplicating this one
    
    # ===== LOCK DOCUMENT =====
    path('<int:pk>/lock/', DocumentViewSet.as_view({
        'post': 'lock'
    }), name='document-lock'),
    # Lock a draft document to prevent further edits
    
    # ===== DOCUMENT FIELDS =====
    path('<int:pk>/fields/', DocumentViewSet.as_view({
        'post': 'create_field'
    }), name='document-field-create'),
    # Create a new field on a draft document
    
    path('<int:pk>/fields/<int:field_id>/', DocumentViewSet.as_view({
        'patch': 'update_field',
        'delete': 'delete_field'
    }), name='document-field-detail'),
    # Update or delete a field on a draft document
    
    # ===== RECIPIENTS & SIGNING LINKS =====
    path('<int:pk>/recipients/', DocumentViewSet.as_view({
        'get': 'available_recipients'
    }), name='document-recipients'),
    # Get recipient list and signing availability
    
    # ===== SIGNING TOKENS =====
    path('<int:pk>/links/', SigningTokenViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='document-links'),
    # List and create signing/view tokens for a document
    
    path('links/revoke/', SigningTokenViewSet.as_view({
        'post': 'revoke'
    }), name='token-revoke'),
    # Revoke a token
    
    # ===== DOCUMENT DOWNLOAD =====
    path('<int:pk>/download/', DocumentViewSet.as_view({
        'get': 'download'
    }), name='document-download'),
    # Download the completed signed PDF
    
    # ===== PUBLIC SIGNING (NO AUTH) =====
    path('public/sign/<str:token>/', PublicSignViewSet.as_view({
        'get': 'get_sign_page',
        'post': 'submit_signature'
    }), name='public-sign'),
    # Public signing endpoints - GET returns signing page, POST submits signature
    
    path('public/download/<str:token>/', PublicSignViewSet.as_view({
        'get': 'download_public'
    }), name='public-download'),
    # Public download with token
    
    # ===== SIGNATURE VERIFICATION & AUDIT =====
    path('<int:pk>/signatures/', SignatureVerificationViewSet.as_view({
        'get': 'list_signatures'
    }), name='document-signatures'),
    # List all signatures for a document
    
    path('<int:pk>/signatures/<int:sig_id>/verify/', SignatureVerificationViewSet.as_view({
        'get': 'verify_signature'
    }), name='signature-verify'),
    # Verify a specific signature
    
    path('<int:pk>/audit_export/', SignatureVerificationViewSet.as_view({
        'get': 'audit_export'
    }), name='audit-export'),
    # Export audit package as ZIP
    
    # ===== WEBHOOKS =====
    path('webhooks/', WebhookViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='webhook-list'),
    
    path('webhooks/<int:pk>/', WebhookViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='webhook-detail'),
    
    path('webhooks/<int:pk>/events/', WebhookViewSet.as_view({
        'get': 'events'
    }), name='webhook-events'),
    
    path('webhooks/<int:pk>/test/', WebhookViewSet.as_view({
        'post': 'test'
    }), name='webhook-test'),
    
    path('webhooks/<int:pk>/retry/', WebhookViewSet.as_view({
        'post': 'retry'
    }), name='webhook-retry'),
    
    # ===== WEBHOOK EVENTS (READ-ONLY) =====
    path('webhook-events/', WebhookEventViewSet.as_view({
        'get': 'list'
    }), name='webhook-event-list'),
    
    path('webhook-events/<int:pk>/', WebhookEventViewSet.as_view({
        'get': 'retrieve'
    }), name='webhook-event-detail'),
    
    path('webhook-events/<int:pk>/logs/', WebhookEventViewSet.as_view({
        'get': 'logs'
    }), name='webhook-event-logs'),
]
