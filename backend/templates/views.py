from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from .models import Template, TemplateField, TemplateGroup, TemplateGroupItem
from .serializers import (
    TemplateSerializer, TemplateListSerializer,
    TemplateCreateSerializer, TemplateFieldSerializer,  TemplateGroupSerializer, TemplateGroupItemSerializer
)


class TemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for Template CRUD operations."""
    queryset = Template.objects.all()
    
    def get_parsers(self):
        """
        Override parsers based on request method and path.
        - POST to /templates/: multipart (file upload)
        - POST to /templates/{id}/fields/: JSON (field data)
        - All others: JSON
        """
        if self.request.method == 'POST':
            # Check if this is a file upload (no nested path)
            if not self.request.path.endswith('/fields/'):
                self.parser_classes = (MultiPartParser, FormParser)
            else:
                self.parser_classes = (JSONParser,)
        else:
            self.parser_classes = (JSONParser,)
        return super().get_parsers()
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return TemplateCreateSerializer
        elif self.action == 'retrieve':
            return TemplateSerializer
        elif self.action in ['fields', 'field_detail']:
            return TemplateFieldSerializer
        else:
            return TemplateListSerializer
    
    def retrieve(self, request, *args, **kwargs):
        """Get template with all fields and recipients."""
        instance = self.get_object()
        serializer = TemplateSerializer(instance, context={'request': request})
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """Update template fields (title, description)."""
        instance = self.get_object()
        # Use TemplateListSerializer for validation/save
        serializer = TemplateListSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        # Refresh instance from DB to get updated data
        instance.refresh_from_db()
        
        # Return full TemplateSerializer with all nested data
        output_serializer = TemplateSerializer(instance, context={'request': request})
        return Response(output_serializer.data)
    
    @action(detail=True, methods=['get'])
    def recipients(self, request, pk=None):
        """Get list of unique recipients in this template."""
        template = self.get_object()
        recipients = template.get_recipients()
        return Response({'recipients': recipients})
    
    @action(detail=True, methods=['post'])
    def fields(self, request, pk=None):
        """Create a new field on this template."""
        template = self.get_object()
        serializer = TemplateFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(template=template)
        return Response(
            TemplateFieldSerializer(field).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['patch', 'delete'], url_path='fields/(?P<field_id>[0-9]+)')
    def field_detail(self, request, pk=None, field_id=None):
        """Update or delete a template field."""
        template = self.get_object()
        field = get_object_or_404(TemplateField, id=field_id, template=template)
        
        if request.method == 'PATCH':
            serializer = TemplateFieldSerializer(field, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        
        # DELETE
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    def create(self, request, *args, **kwargs):
        """Create a new template."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        
        # Return full template data with ID
        output_serializer = TemplateSerializer(instance, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)



class TemplateGroupViewSet(viewsets.ModelViewSet):
    """Manage template groups and their ordering."""
    queryset = TemplateGroup.objects.prefetch_related('items__template')
    serializer_class = TemplateGroupSerializer
    
    @action(detail=True, methods=['post'])
    def add_template(self, request, pk=None):
        """Add a template to the group."""
        group = self.get_object()
        template_id = request.data.get('template_id')
        
        if not template_id:
            return Response({'error': 'template_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Find max order
        max_order = group.items.aggregate(models.Max('order'))['order__max'] or 0
        
        try:
            item = TemplateGroupItem.objects.create(
                group=group,
                template_id=template_id,
                order=max_order + 1
            )
            return Response(
                TemplateGroupItemSerializer(item).data,
                status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['patch'])
    def reorder_items(self, request, pk=None):
        """Reorder template items in group."""
        group = self.get_object()
        new_order = request.data.get('items', [])  # [{id, order}, ...]
        
        try:
            with transaction.atomic():
                for item_data in new_order:
                    item = group.items.get(id=item_data['id'])
                    item.order = item_data['order']
                    item.save()
            
            serializer = self.get_serializer(group)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
