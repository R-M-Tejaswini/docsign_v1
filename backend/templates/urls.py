"""
backend/templates/urls.py

"""

# ----------------------------
# Django imports
# ----------------------------
from django.urls import path

# ----------------------------
# Local view imports
# ----------------------------
from .views import TemplateViewSet

# App namespace for reverse() and URL resolution
app_name = 'templates'

# ----------------------------
# Template routes
# ----------------------------
urlpatterns = [
    # Template CRUD
    path('', TemplateViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='template-list'),
    # List all templates or create a new template.
    # Templates are reusable document blueprints that can later be used
    # to create Document instances with predefined structure.

    path('<int:pk>/', TemplateViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='template-detail'),
    # Retrieve, partially update, or delete a specific template.
    # Partial update is commonly used to rename templates or update metadata
    # without affecting associated fields.

    # Template recipients
    path('<int:pk>/recipients/', TemplateViewSet.as_view({
        'get': 'recipients'
    }), name='template-recipients'),
    # Return the list of unique recipients defined across all fields in the template.
    # This is useful for UI previews and for validating recipient configuration
    # before using the template to create a document.

    # Template fields
    path('<int:pk>/fields/', TemplateViewSet.as_view({
        'post': 'fields'
    }), name='template-field-create'),
    # Create a new field on a template.
    # Template fields define default field positions, types, and recipients
    # that will be copied into document versions created from this template.

    path('<int:pk>/fields/<int:field_id>/', TemplateViewSet.as_view({
        'patch': 'field_detail',
        'delete': 'field_detail'
    }), name='template-field-detail'),
    # Update or delete a specific template field.
    # Allows template designers to refine field layout and recipient assignment
    # before the template is used in active documents.
]
