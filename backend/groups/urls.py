"""
backend/groups/urls.py

"""

# ----------------------------
# Django imports
# ----------------------------
from django.urls import path

# ----------------------------
# Local view imports
# ----------------------------
from .views import DocumentGroupViewSet, PublicGroupSignViewSet

# App namespace for reverse() lookups
app_name = 'groups'

# ----------------------------
# Document Group routes
# ----------------------------
urlpatterns = [
    # Group CRUD
    path('', DocumentGroupViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='group-list'),
    # List all document groups or create a new empty group.
    # Groups serve as containers for ordered collections of documents.

    path('<int:pk>/', DocumentGroupViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='group-detail'),
    # Retrieve, update metadata (title/description), or delete a specific group.

    # Group Items Management
    path('<int:pk>/items/', DocumentGroupViewSet.as_view({
        'post': 'items'
    }), name='group-items-add'),
    # Add a document (existing or template) to the group.
    # This creates a cloned version specific to the group context.

    path('<int:pk>/reorder/', DocumentGroupViewSet.as_view({
        'patch': 'reorder_items'
    }), name='group-reorder'),
    # Update the sequence order of items in the group.
    # Accepts an ordered list of item IDs.

    path('<int:pk>/items/<int:item_id>/', DocumentGroupViewSet.as_view({
        'delete': 'delete_item'
    }), name='group-item-delete'),
    # Remove a specific item from the group.
    # Only allowed if the group is not yet locked.

    path('<int:pk>/items/<int:item_id>/lock/', DocumentGroupViewSet.as_view({
        'post': 'lock_item'
    }), name='group-item-lock'),
    # Lock a specific item within the group (equivalent to locking a version).
    # Validates that all fields have recipients and the item is ready.

    # Group Actions
    path('<int:pk>/lock/', DocumentGroupViewSet.as_view({
        'post': 'lock_group'
    }), name='group-lock'),
    # Master lock switch for the group.
    # Only succeeds if ALL items within the group are already locked.

    path('<int:pk>/links/', DocumentGroupViewSet.as_view({
        'post': 'generate_links'
    }), name='group-generate-links'),
    # Generate public signing links for recipients.
    # Returns one unique URL per recipient that covers the whole sequence.

    # Public Signing Flow (No Auth)
    path('public/sign/<str:token>/next/', PublicGroupSignViewSet.as_view({
        'get': 'get_next_item'
    }), name='public-group-next'),
    # The "Router" endpoint for the public UI.
    # It tells the frontend which document (and signing token) to display next
    # or if the sequence is complete.
]