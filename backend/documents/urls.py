from django.urls import path
from .views import (
    DocumentViewSet,
    SigningTokenViewSet,
    PublicSignViewSet
)

app_name = 'documents'

urlpatterns = [
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
    
    # Document versions - ALL versions (must come before specific document routes)
    path('versions/', DocumentViewSet.as_view({
        'get': 'all_versions'
    }), name='all-document-versions'),
    
    # Document versions for specific document
    path('<int:pk>/versions/', DocumentViewSet.as_view({
        'get': 'versions'
    }), name='document-versions'),
    
    # ⚠️ CRITICAL: Download MUST come BEFORE version_detail
    path('<int:pk>/versions/<int:version_id>/download/', DocumentViewSet.as_view({
        'get': 'download_version'
    }), name='document-version-download'),
    
    # Generic version detail (catches all <int:version_id>/ patterns)
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
    
    # Document fields
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
    
    # Public signing endpoints (no auth)
    path('public/sign/<str:token>/', PublicSignViewSet.as_view({
        'get': 'get_sign_page',
        'post': 'submit_signature'
    }), name='public-sign'),
    
    path('public/download/<str:token>/', PublicSignViewSet.as_view({
        'get': 'download_public'
    }), name='public-download'),
]