"""
backend/signing/urls.py


✅ NEW APP: Signing tokens, signatures, public signing, and verification.

Routes:
- POST /api/documents/{id}/links/                      → Create sign/view link
- GET /api/documents/{id}/links/                       → List links for document
- POST /api/links/revoke/                              → Revoke a token
- GET /api/public/sign/{token}/                        → Get signing page data
- POST /api/public/sign/{token}/                       → Submit signature
- GET /api/public/download/{token}/                    → Download PDF (public)
- GET /api/documents/{doc_id}/signatures/              → List signatures
- GET /api/documents/{doc_id}/signatures/{sig_id}/verify/ → Verify signature
- GET /api/documents/{doc_id}/audit_export/            → Export audit ZIP
"""

from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import (
    SigningTokenViewSet,
    PublicSignViewSet,
    SignatureVerificationViewSet
)

app_name = 'signing'

# Router for viewsets
router = SimpleRouter()

# Manual paths for custom routing
urlpatterns = [
    # ===== SIGNING TOKENS =====
    path(
        'documents/<int:pk>/links/',
        SigningTokenViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='document-signing-links'
    ),
    path(
        'links/revoke/',
        SigningTokenViewSet.as_view({'post': 'revoke'}),
        name='signing-token-revoke'
    ),
    
    # ===== PUBLIC SIGNING (NO AUTH) =====
    path(
        'public/sign/<str:token>/',
        PublicSignViewSet.as_view({
            'get': 'get_sign_page',
            'post': 'submit_signature'
        }),
        name='public-sign-page'
    ),
    path(
        'public/download/<str:token>/',
        PublicSignViewSet.as_view({'get': 'download_public'}),
        name='public-download'
    ),
    
    # ===== SIGNATURE VERIFICATION & AUDIT =====
    path(
        'documents/<int:doc_id>/signatures/',
        SignatureVerificationViewSet.as_view({'get': 'list_signatures'}),
        name='document-signatures-list'
    ),
    path(
        'documents/<int:doc_id>/signatures/<int:sig_id>/verify/',
        SignatureVerificationViewSet.as_view({'get': 'verify_signature'}),
        name='signature-verify'
    ),
    path(
        'documents/<int:doc_id>/audit_export/',
        SignatureVerificationViewSet.as_view({'get': 'audit_export'}),
        name='audit-export'
    ),
]