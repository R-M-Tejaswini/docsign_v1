from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import Template, TemplateField
from .serializers import (
    TemplateSerializer, TemplateListSerializer,
    TemplateCreateSerializer, TemplateFieldSerializer
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
