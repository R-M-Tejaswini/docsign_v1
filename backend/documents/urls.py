from django.urls import path
from .views import (
    DocumentViewSet,
    SigningTokenViewSet,
    PublicSignViewSet,
    SignatureVerificationViewSet,
    WebhookViewSet,
    WebhookEventViewSet,
    DocumentGroupViewSet
)

app_name = 'documents'

# ============================================================================
# DOCUMENT ROUTES (kept as-is)
# ============================================================================
document_patterns = [
    # Document CRUD
    path('', DocumentViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='document-list'),
    
    path('<int:pk>/', DocumentViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='document-detail'),
    
    # Document versions - ALL versions
    path('versions/', DocumentViewSet.as_view({
        'get': 'all_versions'
    }), name='all-document-versions'),
    
    # Document versions for specific document
    path('<int:pk>/versions/', DocumentViewSet.as_view({
        'get': 'versions'
    }), name='document-versions'),
    
    path('<int:pk>/versions/<int:version_id>/download/', DocumentViewSet.as_view({
        'get': 'download_version'
    }), name='document-version-download'),
    
    path('<int:pk>/versions/<int:version_id>/', DocumentViewSet.as_view({
        'get': 'version_detail'
    }), name='document-version-detail'),
    
    path('<int:pk>/versions/<int:version_id>/lock/', DocumentViewSet.as_view({
        'post': 'lock_version'
    }), name='document-version-lock'),
    
    path('<int:pk>/versions/<int:version_id>/copy/', DocumentViewSet.as_view({
        'post': 'copy_version'
    }), name='document-version-copy'),
    
    path('<int:pk>/versions/<int:version_id>/recipients/', DocumentViewSet.as_view({
        'get': 'available_recipients'
    }), name='document-available-recipients'),
    
    path('<int:pk>/versions/<int:version_id>/fields/', DocumentViewSet.as_view({
        'post': 'create_field'
    }), name='document-field-create'),
    
    path('<int:pk>/versions/<int:version_id>/fields/<int:field_id>/', DocumentViewSet.as_view({
        'patch': 'update_field',
        'delete': 'delete_field'
    }), name='document-field-detail'),
    
    # Signing tokens
    path('<int:document_id>/links/', SigningTokenViewSet.as_view({
        'get': 'list'
    }), name='token-list'),
    
    path('<int:document_id>/versions/<int:version_id>/links/', SigningTokenViewSet.as_view({
        'post': 'create'
    }), name='token-create'),
    
    path('links/revoke/', SigningTokenViewSet.as_view({
        'post': 'revoke'
    }), name='token-revoke'),
    
    # Public signing
    path('public/sign/<str:token>/', PublicSignViewSet.as_view({
        'get': 'get_sign_page',
        'post': 'submit_signature'
    }), name='public-sign'),
    
    path('public/download/<str:token>/', PublicSignViewSet.as_view({
        'get': 'download_public'
    }), name='public-download'),
    
    # Signature verification
    path('documents/<int:doc_id>/versions/<int:version_id>/signatures/',
         SignatureVerificationViewSet.as_view({'get': 'list_signatures'}),
         name='signature-list'),
    
    path('<int:doc_id>/versions/<int:version_id>/signatures/<int:sig_id>/verify/',
         SignatureVerificationViewSet.as_view({'get': 'verify_signature'}),
         name='signature-verify'),
    
    path('<int:doc_id>/versions/<int:version_id>/audit_export/',
         SignatureVerificationViewSet.as_view({'get': 'audit_export'}),
         name='audit-export'),
    
    # Webhooks
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
    
    # Webhook Events
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

# ============================================================================
# ✅ GROUP ROUTES (PREFIXED with 'groups/')
# ============================================================================
group_patterns = [
    # Group CRUD - ✅ NOTE: All prefixed with 'groups/'
    path('groups/', DocumentGroupViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='group-list'),
    
    path('groups/<int:pk>/', DocumentGroupViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='group-detail'),
    
    # Group Items
    path('groups/<int:pk>/items/', DocumentGroupViewSet.as_view({
        'get': 'items',
        'post': 'add_item'
    }), name='group-items'),
    
    path('groups/<int:pk>/items/<int:item_id>/', DocumentGroupViewSet.as_view({
        'delete': 'delete_item'
    }), name='group-item-detail'),
    
    path('groups/<int:pk>/items/<int:item_id>/reorder/', DocumentGroupViewSet.as_view({
        'patch': 'reorder_item'
    }), name='group-item-reorder'),
    
    # Group Sessions
    path('groups/<int:pk>/sessions/', DocumentGroupViewSet.as_view({
        'get': 'sessions',
        'post': 'create_session'
    }), name='group-sessions'),
    
    path('groups/<int:pk>/sessions/<int:session_id>/', DocumentGroupViewSet.as_view({
        'get': 'session_detail'
    }), name='group-session-detail'),
    
    path('groups/<int:pk>/sessions/<int:session_id>/revoke/', DocumentGroupViewSet.as_view({
        'post': 'revoke_session'
    }), name='group-session-revoke'),
    
    # Group Download/Export
    path('groups/<int:pk>/download/', DocumentGroupViewSet.as_view({
        'get': 'download_group'
    }), name='group-download'),
]

# ✅ Combine both pattern lists
urlpatterns = document_patterns + group_patterns
