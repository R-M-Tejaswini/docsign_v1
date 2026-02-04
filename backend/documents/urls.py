"""
backend/documents/urls.py

✅ CONSOLIDATED: Document CRUD endpoints only (no signing logic).

Routes:
- GET /api/documents/                          → List documents
- POST /api/documents/                         → Create document
- GET /api/documents/{id}/                     → Retrieve document
- PATCH /api/documents/{id}/                   → Update document
- DELETE /api/documents/{id}/                  → Delete document
- POST /api/documents/{id}/duplicate/          → Duplicate document
- POST /api/documents/{id}/lock/               → Lock for signing
- GET /api/documents/{id}/recipients/          → Available recipients
- POST /api/documents/{id}/fields/             → Create field
- PATCH /api/documents/{id}/fields/{field_id}/ → Update field
- DELETE /api/documents/{id}/fields/{field_id}/ → Delete field
- GET /api/documents/{id}/download/            → Download signed PDF
"""

# ----------------------------
# Django imports
# ----------------------------
from django.urls import path

# ----------------------------
# Local view imports
# ----------------------------
from .views import DocumentViewSet

# App namespace for reverse() lookups
app_name = 'documents'

# ----------------------------
# Primary document routes
# ----------------------------
urlpatterns = [
    # ===== DOCUMENT CRUD =====
    path(
        '',
        DocumentViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='document-list'
    ),
    path(
        '<int:pk>/',
        DocumentViewSet.as_view({
            'get': 'retrieve',
            'patch': 'partial_update',
            'delete': 'destroy'
        }),
        name='document-detail'
    ),
    
    # ===== DOCUMENT ACTIONS =====
    path(
        '<int:pk>/duplicate/',
        DocumentViewSet.as_view({'post': 'duplicate'}),
        name='document-duplicate'
    ),
    path(
        '<int:pk>/lock/',
        DocumentViewSet.as_view({'post': 'lock'}),
        name='document-lock'
    ),
    path(
        '<int:pk>/recipients/',
        DocumentViewSet.as_view({'get': 'available_recipients'}),
        name='document-recipients'
    ),
    path(
        '<int:pk>/download/',
        DocumentViewSet.as_view({'get': 'download'}),
        name='document-download'
    ),
    
    # ===== FIELD MANAGEMENT =====
    path(
        '<int:pk>/fields/',
        DocumentViewSet.as_view({'post': 'create_field'}),
        name='document-field-create'
    ),
    path(
        '<int:pk>/fields/<int:field_id>/',
        DocumentViewSet.as_view({
            'patch': 'update_field',
            'delete': 'delete_field'
        }),
        name='document-field-detail'
    ),
]
