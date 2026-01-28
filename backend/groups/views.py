from django.shortcuts import render

"""
backend/groups/views.py

Purpose:
- API endpoints for managing Document Groups.
- Public endpoints for the sequential group signing flow.

Design:
- Reuses the Service layer for complex logic.
- Follows the patterns established in documents/views.py.
"""

from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

# Imports
from .models import DocumentGroup, DocumentGroupItem, DocumentGroupToken
from .serializers import (
    DocumentGroupSerializer, 
    DocumentGroupCreateSerializer, 
    DocumentGroupItemSerializer,
    DocumentGroupSignLinkSerializer
)
from .services import DocumentGroupService
from documents.serializers import SigningTokenSerializer # Reusing existing serializer
from rest_framework.pagination import PageNumberPagination

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000

class DocumentGroupViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Document Group CRUD and management.
    """
    pagination_class = StandardResultsSetPagination
    # Optimization: Prefetch items and the underlying document to avoid N+1 queries
    queryset = DocumentGroup.objects.all().prefetch_related('items__document', 'items__version')
    
    def get_serializer_class(self):
        if self.action == 'create':
            return DocumentGroupCreateSerializer
        return DocumentGroupSerializer

    @action(detail=True, methods=['post'])
    def items(self, request, pk=None):
        """
        Add a document (existing or template) to the group.
        DELEGATES entirely to the Service layer via Serializer.create().
        """
        group = self.get_object()
        
        if group.is_locked:
            return Response(
                {'error': 'Cannot add items to a locked group'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Pass group in context so serializer can use it
        serializer = DocumentGroupItemSerializer(
            data=request.data, 
            context={'group': group}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save() # Calls Service inside serializer.create()
        
        # Return the created item using the standard read serializer
        return Response(
            DocumentGroupItemSerializer(item).data, 
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['patch'], url_path='reorder')
    def reorder_items(self, request, pk=None):
        """
        Reorder items in the group.
        Expected payload: { "item_ids": [3, 1, 2] } (List of IDs in new order)
        """
        group = self.get_object()
        if group.is_locked:
            return Response({'error': 'Cannot reorder locked group'}, status=400)

        item_ids = request.data.get('item_ids', [])
        if not item_ids:
            return Response({'error': 'item_ids list required'}, status=400)

        # Verify all items belong to this group
        current_ids = set(group.items.values_list('id', flat=True))
        if set(item_ids) != current_ids:
            return Response({'error': 'Invalid item list provided'}, status=400)

        with transaction.atomic():
            for index, item_id in enumerate(item_ids):
                DocumentGroupItem.objects.filter(id=item_id).update(order=index)

        return Response({'status': 'reordered'})

    @action(detail=True, methods=['delete'], url_path='items/(?P<item_id>[0-9]+)')
    def delete_item(self, request, pk=None, item_id=None):
        """Remove an item from the group."""
        group = self.get_object()
        if group.is_locked:
            return Response({'error': 'Cannot delete items from locked group'}, status=400)
            
        item = get_object_or_404(DocumentGroupItem, id=item_id, group=group)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='items/(?P<item_id>[0-9]+)/lock')
    def lock_item(self, request, pk=None, item_id=None):
        """
        Lock a specific item within the group.
        Wrapper around existing version locking logic.
        """
        group = self.get_object()
        item = get_object_or_404(DocumentGroupItem, id=item_id, group=group)
        
        # Reuse the existing validation logic via the version model
        # We assume the user wants to lock the *version* attached to this item
        version = item.version
        
        # Check standard lock prerequisites (recipients assigned etc)
        # We manually perform checks here similar to DocumentViewSet.lock_version
        if version.status != 'draft':
             return Response({'error': 'Item is already locked'}, status=400)

        fields_missing = version.fields.filter(recipient__isnull=True) | version.fields.filter(recipient='')
        if fields_missing.exists():
            return Response({'error': 'All fields must have recipients assigned'}, status=400)

        # Lock the version AND the item
        with transaction.atomic():
            version.status = 'locked'
            version.save(update_fields=['status'])
            item.is_locked = True
            item.save(update_fields=['is_locked'])

        return Response(DocumentGroupItemSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='lock')
    def lock_group(self, request, pk=None):
        """Lock the entire group (Master Switch)."""
        group = self.get_object()
        try:
            group.lock() # Calls model method which validates all items are locked
            return Response(DocumentGroupSerializer(group).data)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'], url_path='links')
    def generate_links(self, request, pk=None):
        """Generate public signing links for recipients."""
        group = self.get_object()
        serializer = DocumentGroupSignLinkSerializer(data=request.data, context={'group': group})
        serializer.is_valid(raise_exception=True)
        results = serializer.save()
        return Response(results, status=201)


class PublicGroupSignViewSet(viewsets.ViewSet):
    """
    Public endpoints for the sequential group signing flow.
    No authentication required (Token protected).
    """
    permission_classes = [AllowAny]

    @action(detail=False, methods=['get'], url_path='(?P<token>[^/.]+)/next')
    def get_next_item(self, request, token=None):
        """
        The 'Router' for the public UI.
        
        Returns:
        - status: PENDING | COMPLETED
        - signing_token: (If PENDING) The token for the *current* document to sign.
        
        Frontend Logic:
        1. Call this endpoint.
        2. If PENDING, render the existing <DocumentSign /> component using `signing_token`.
        3. When <DocumentSign /> succeeds, call this endpoint again.
        """
        try:
            group_token = DocumentGroupToken.objects.select_related('group').get(token=token)
        except DocumentGroupToken.DoesNotExist:
            return Response({'error': 'Invalid token'}, status=404)

        # Use Service to find the next step
        result = DocumentGroupService.get_next_item_for_recipient(group_token)
        
        response_data = {
            'status': result['status'],
            'group_title': group_token.group.title,
            'recipient': group_token.recipient
        }

        if result['status'] == 'PENDING':
            # We found a document to sign
            # Serialize the underlying SigningToken so the frontend can use it
            # with the existing API.
            token_serializer = SigningTokenSerializer(result['signing_token'], context={'request': request})
            
            response_data.update({
                'next_step': {
                    'item_id': result['item'].id,
                    'document_title': result['item'].document.title,
                    'order': result['item'].order,
                    'signing_token': token_serializer.data # Full token object
                }
            })
            
        return Response(response_data)