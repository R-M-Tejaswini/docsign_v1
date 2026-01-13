from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Template, TemplateField
from .serializers import (
    TemplateListSerializer, TemplateDetailSerializer,
    TemplateCreateSerializer, TemplateFieldSerializer,
    TemplateFieldCreateSerializer
)


class TemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for Template CRUD operations."""
    queryset = Template.objects.all()
    parser_classes = (MultiPartParser, FormParser)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return TemplateCreateSerializer
        elif self.action == 'retrieve':
            return TemplateDetailSerializer
        else:
            return TemplateListSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new template with file upload."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        
        return Response(
            TemplateDetailSerializer(template).data,
            status=status.HTTP_201_CREATED
        )


class TemplateFieldViewSet(viewsets.ModelViewSet):
    """ViewSet for TemplateField CRUD operations."""
    serializer_class = TemplateFieldSerializer
    
    def get_queryset(self):
        """Filter fields by template ID."""
        template_id = self.kwargs.get('template_pk')
        return TemplateField.objects.filter(template_id=template_id)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action in ['create', 'update', 'partial_update']:
            return TemplateFieldCreateSerializer
        return TemplateFieldSerializer
    
    def get_serializer_context(self):
        """Add template to serializer context."""
        context = super().get_serializer_context()
        template_id = self.kwargs.get('template_pk')
        try:
            context['template'] = Template.objects.get(id=template_id)
        except Template.DoesNotExist:
            pass
        return context
    
    def create(self, request, *args, **kwargs):
        """Create a new template field."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        template_id = self.kwargs.get('template_pk')
        try:
            template = Template.objects.get(id=template_id)
        except Template.DoesNotExist:
            return Response(
                {'detail': 'Template not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        field = serializer.save(template=template)
        return Response(
            TemplateFieldSerializer(field).data,
            status=status.HTTP_201_CREATED
        )
    
    def destroy(self, request, *args, **kwargs):
        """Delete a template field."""
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)
