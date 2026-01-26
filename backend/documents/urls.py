"""
backend/documents/urls.py

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
    # Document CRUD
    path('', DocumentViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='document-list'),
    # List and create documents. Used by admin and user-facing UIs to create
    # new documents (from file upload or template) and to browse existing documents.

    path('<int:pk>/', DocumentViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='document-detail'),
    # Retrieve, update (partial), or delete a single Document by primary key.
    # Partial update is used to modify top-level document metadata such as title/description.

    # Document versions - ALL versions (must come before specific document routes)
    path('versions/', DocumentViewSet.as_view({
        'get': 'all_versions'
    }), name='all-document-versions'),
    # Global administrative feed of all versions across documents (paginated).
    # Useful for audits and admin consoles that need a full stream of versions.

    # Document versions for specific document
    path('<int:pk>/versions/', DocumentViewSet.as_view({
        'get': 'versions'
    }), name='document-versions'),
    # List all versions for a single document (useful for version history UI).

    # ⚠️ CRITICAL: Download MUST come BEFORE version_detail
    path('<int:pk>/versions/<int:version_id>/download/', DocumentViewSet.as_view({
        'get': 'download_version'
    }), name='document-version-download'),
    # Download endpoint for a specific version's flattened/signed PDF.
    # This route is intentionally placed before the generic version_detail route
    # because its pattern would otherwise be captured by the version_detail route.

    # Generic version detail (catches all <int:version_id>/ patterns)
    path('<int:pk>/versions/<int:version_id>/', DocumentViewSet.as_view({
        'get': 'version_detail'
    }), name='document-version-detail'),
    # Retrieve metadata for a particular document version (fields, status, page_count, etc).

    path('<int:pk>/versions/<int:version_id>/lock/', DocumentViewSet.as_view({
        'post': 'lock_version'
    }), name='document-version-lock'),
    # Lock a draft version to prevent further edits and prepare for signing.

    path('<int:pk>/versions/<int:version_id>/copy/', DocumentViewSet.as_view({
        'post': 'copy_version'
    }), name='document-version-copy'),
    # Create a new draft by copying an existing version — useful for branching edits.

    path('<int:pk>/versions/<int:version_id>/recipients/', DocumentViewSet.as_view({
        'get': 'available_recipients'
    }), name='document-available-recipients'),
    # Return deduplicated recipients for a version along with per-recipient status
    # indicating whether sign links can be generated.

    # Document fields
    path('<int:pk>/versions/<int:version_id>/fields/', DocumentViewSet.as_view({
        'post': 'create_field'
    }), name='document-field-create'),
    # Create a new field on a draft version (position, label, recipient, required, etc).

    path('<int:pk>/versions/<int:version_id>/fields/<int:field_id>/', DocumentViewSet.as_view({
        'patch': 'update_field',
        'delete': 'delete_field'
    }), name='document-field-detail'),
    # Update (partial) or delete a field on a draft version. Deletion and certain edits
    # are blocked when the version is locked or the field has been signed.

    # Signing tokens
    path('<int:document_id>/links/', SigningTokenViewSet.as_view({
        'get': 'list'
    }), name='token-list'),
    # List signing/view tokens related to a document (for admin/audit).

    path('<int:document_id>/versions/<int:version_id>/links/', SigningTokenViewSet.as_view({
        'post': 'create'
    }), name='token-create'),
    # Create a new signing or view token for a specific version (generates a unique URL).

    path('links/revoke/', SigningTokenViewSet.as_view({
        'post': 'revoke'
    }), name='token-revoke'),
    # Revoke a token by token string; used when a link must be invalidated.

    # Public signing endpoints (no auth)
    path('public/sign/<str:token>/', PublicSignViewSet.as_view({
        'get': 'get_sign_page',
        'post': 'submit_signature'
    }), name='public-sign'),
    # GET returns the signing page payload (editable fields, version info).
    # POST accepts the signature payload and processes the signature event.
    # These endpoints are intentionally unauthenticated and guarded by token semantics.

    path('public/download/<str:token>/', PublicSignViewSet.as_view({
        'get': 'download_public'
    }), name='public-download'),
    # Allows a token holder to download the completed signed PDF (if available).

    # Verification & audit endpoints
    path('documents/<int:doc_id>/versions/<int:version_id>/signatures/',
         SignatureVerificationViewSet.as_view({'get': 'list_signatures'}),
         name='signature-list'),
    # List all signature events for a given document version (audit trail).

    path('<int:doc_id>/versions/<int:version_id>/signatures/<int:sig_id>/verify/',
         SignatureVerificationViewSet.as_view({'get': 'verify_signature'}),
         name='signature-verify'),
    # Verify integrity of a specific signature event by recomputing hashes.

    path('<int:doc_id>/versions/<int:version_id>/audit_export/',
         SignatureVerificationViewSet.as_view({'get': 'audit_export'}),
         name='audit-export'),
    # Produce a ZIP audit export containing the signed PDF, MANIFEST.json and VERIFICATION_REPORT.json.
]

# ----------------------------
# Webhook-related routes (grouped separately for clarity)
# ----------------------------
webhook_urls = [
    # Webhooks (CRUD + events + test + retry)
    path('webhooks/', WebhookViewSet.as_view({'get': 'list', 'post': 'create'}), name='webhook-list'),
    # Create or list webhooks. Webhooks allow external services to receive event notifications.

    path('webhooks/<int:pk>/', WebhookViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}), name='webhook-detail'),
    # Retrieve, update or delete a webhook configuration.

    path('webhooks/<int:pk>/events/', WebhookViewSet.as_view({'get': 'events'}), name='webhook-events'),
    # List events associated with a webhook (delivery history and payloads).

    path('webhooks/<int:pk>/test/', WebhookViewSet.as_view({'post': 'test'}), name='webhook-test'),
    # Trigger a test event to validate webhook configuration and delivery.

    path('webhooks/<int:pk>/retry/', WebhookViewSet.as_view({'post': 'retry'}), name='webhook-retry'),
    # Manually retry a previously failed webhook event (admin action).

    # Webhook Events (read-only views for events and logs)
    path('webhook-events/', WebhookEventViewSet.as_view({'get': 'list'}), name='webhook-event-list'),
    path('webhook-events/<int:pk>/', WebhookEventViewSet.as_view({'get': 'retrieve'}), name='webhook-event-detail'),
    path('webhook-events/<int:pk>/logs/', WebhookEventViewSet.as_view({'get': 'logs'}), name='webhook-event-logs'),
    # These endpoints provide an audit trail of fired events and detailed delivery logs for debugging.
]

# Combine primary urlpatterns with webhook routes
urlpatterns += webhook_urls
