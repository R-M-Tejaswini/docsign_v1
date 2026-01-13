from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentViewSet, DocumentVersionViewSet,
    DocumentFieldViewSet, SigningTokenViewSet,
    PublicSignViewSet
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')

app_name = 'documents'

urlpatterns = [
    path('', include(router.urls)),
    
    # Nested document versions
    path(
        'documents/<int:document_pk>/versions/',
        DocumentVersionViewSet.as_view({'get': 'list'}),
        name='document-versions-list'
    ),
    path(
        'documents/<int:document_pk>/versions/<int:pk>/',
        DocumentVersionViewSet.as_view({'get': 'retrieve'}),
        name='document-version-detail'
    ),
    path(
        'documents/<int:document_pk>/versions/<int:pk>/lock/',
        DocumentVersionViewSet.as_view({'post': 'lock'}),
        name='document-version-lock'
    ),
    
    # Nested document fields
    path(
        'documents/<int:document_pk>/versions/<int:version_pk>/fields/',
        DocumentFieldViewSet.as_view({'get': 'list'}),
        name='document-fields-list'
    ),
    path(
        'documents/<int:document_pk>/versions/<int:version_pk>/fields/<int:pk>/',
        DocumentFieldViewSet.as_view({
            'get': 'retrieve',
            'put': 'update',
            'patch': 'partial_update'
        }),
        name='document-field-detail'
    ),
    
    # Signing tokens
    path(
        'documents/<int:document_pk>/versions/<int:version_pk>/links/',
        SigningTokenViewSet.as_view({'post': 'create_token'}),
        name='create-token'
    ),
    path(
        'documents/<int:document_pk>/links/',
        SigningTokenViewSet.as_view({'get': 'list_tokens'}),
        name='list-tokens'
    ),
    path(
        'links/revoke/',
        SigningTokenViewSet.as_view({'post': 'revoke_token'}),
        name='revoke-token'
    ),
    
    # Public signing (no auth)
    path(
        'public/sign/<str:token>/',
        PublicSignViewSet.as_view({'get': 'get_sign_page', 'post': 'submit_signature'}),
        name='public-sign'
    ),
]