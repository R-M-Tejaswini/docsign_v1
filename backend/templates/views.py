"""
backend/templates/views.py

Template CRUD endpoints.
"""

# ----------------------------
# Django imports
# ----------------------------
from django.shortcuts import get_object_or_404
from django.db import transaction

# ----------------------------
# DRF imports
# ----------------------------
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

# ----------------------------
# Local app imports
# ----------------------------
from .models import Template, TemplateField
from .serializers import (
    TemplateSerializer,
    TemplateListSerializer,
    TemplateCreateSerializer,
    TemplateFieldSerializer
)


class TemplateViewSet(viewsets.ModelViewSet):
    """ViewSet for Template CRUD operations."""
    queryset = Template.objects.all().prefetch_related('fields')
    
    def get_parsers(self):
        """✅ FIXED: Proper parser selection"""
        if self.request.method == 'POST':
            if self.request.path.endswith('/fields/'):
                # Field creation uses JSON
                self.parser_classes = (JSONParser,)
            else:
                # Template creation uses multipart for file upload
                self.parser_classes = (MultiPartParser, FormParser)
        else:
            self.parser_classes = (JSONParser,)
        return super().get_parsers()
    
    def get_serializer_class(self):
        """✅ FIXED: Correct serializer selection"""
        if self.action == 'create':
            return TemplateCreateSerializer
        elif self.action == 'retrieve':
            return TemplateSerializer
        elif self.action in ['fields', 'field_detail']:
            return TemplateFieldSerializer
        else:
            return TemplateListSerializer
    
    def create(self, request, *args, **kwargs):
        """✅ FIXED: Proper multipart file handling"""
        try:
            # ✅ Validate and create with TemplateCreateSerializer
            serializer = self.get_serializer(data=request.data)
            
            if not serializer.is_valid():
                print(f"❌ Validation errors: {serializer.errors}")
                return Response(
                    serializer.errors,
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # ✅ Save immediately
            with transaction.atomic():
                template = serializer.save()
            
            print(f"✅ Template created: {template.id} - {template.title}")
            
            # Return full template data
            output_serializer = TemplateSerializer(
                template,
                context={'request': request}
            )
            return Response(
                output_serializer.data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            import traceback
            print(f"❌ Template creation error: {e}")
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single template with all nested data."""
        instance = self.get_object()
        serializer = TemplateSerializer(instance, context={'request': request})
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """Partially update template metadata (title, description only)."""
        instance = self.get_object()
        serializer = TemplateListSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        instance.refresh_from_db()
        output_serializer = TemplateSerializer(instance, context={'request': request})
        return Response(output_serializer.data)
    
    @action(detail=True, methods=['get'])
    def recipients(self, request, pk=None):
        """Get list of unique recipients for this template."""
        template = self.get_object()
        recipients = template.get_recipients()
        return Response({'recipients': recipients})
    
    @action(detail=True, methods=['post'])
    def fields(self, request, pk=None):
        """✅ FIXED: Create a new field on this template."""
        template = self.get_object()
        
        # ✅ FIXED: Don't manipulate data, let serializer handle it
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['template'] = template.id
        
        serializer = TemplateFieldSerializer(data=data)
        
        if not serializer.is_valid():
            print(f"❌ Field validation errors: {serializer.errors}")
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            field = serializer.save()
            print(f"✅ Field created: {field.id} on template {template.id}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            import traceback
            print(f"❌ Field creation error: {e}")
            traceback.print_exc()
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['patch', 'delete'], url_path='fields/(?P<field_id>[0-9]+)')
    def field_detail(self, request, pk=None, field_id=None):
        """Update or delete a specific template field."""
        template = self.get_object()
        field = get_object_or_404(TemplateField, id=field_id, template=template)
        
        if request.method == 'PATCH':
            serializer = TemplateFieldSerializer(field, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        
        elif request.method == 'DELETE':
            field.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
