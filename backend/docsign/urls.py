"""
URL configuration for docsign project.

✅ REORGANIZED: New app structure with separate signing and webhooks apps.

URL Structure:
- /api/templates/          → templates.urls
- /api/documents/          → documents.urls (CRUD only)
- /api/documents/{id}/links/          → signing token management
- /api/documents/public/sign/{token}/ → public signing endpoints
- /api/webhooks/           → webhooks.urls
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Admin interface
    path('admin/', admin.site.urls),
    
    # ===== API ENDPOINTS =====
    # Templates app
    path('api/templates/', include('templates.urls')),
    
    # Documents app (CRUD + fields only)
    path('api/documents/', include('documents.urls')),
    
    # Signing app (tokens, signatures, public signing, verification)
    path('api/', include('signing.urls')),
    
    # Webhooks app (webhook management)
    path('api/', include('webhooks.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
