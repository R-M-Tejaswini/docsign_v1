"""
backend/templates/views.py

Purpose:
- Defines API endpoints for managing document templates.
- Templates act as reusable blueprints containing a base PDF and predefined fields
  that can later be copied into Document versions.

Design principles:
- Uses a ModelViewSet for consistency with other modules.
- Explicitly controls parsers and serializers based on action to support
  file uploads and JSON-based field management.
"""

# ----------------------------
# Django imports
# ----------------------------
from django.shortcuts import get_object_or_404

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
    """
    ViewSet for Template CRUD operations.

    What:
    - Handles creation, retrieval, update, deletion of templates.
    - Manages template fields and recipient introspection via custom actions.

    Why:
    - Centralizes all template-related behavior in one place, mirroring
      the structure used for documents and ensuring predictable API behavior.
    """
    queryset = Template.objects.all()
    
    def get_parsers(self):
        """
        Dynamically select request parsers based on endpoint behavior.

        What:
        - Uses multipart parsing when uploading template files.
        - Uses JSON parsing when creating/updating template fields.
        - Defaults to JSON for all other requests.

        Why:
        - Template creation often involves file uploads (PDFs).
        - Template fields are pure metadata and should not require multipart encoding.
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
        """
        Select serializer based on the current action.

        Why:
        - Different serializers serve different concerns:
          - Creation needs file handling and validation.
          - Retrieval needs full nested representation.
          - Listing needs a lightweight summary.
          - Field actions need field-specific validation.
        """
        if self.action == 'create':
            return TemplateCreateSerializer
        elif self.action == 'retrieve':
            return TemplateSerializer
        elif self.action in ['fields', 'field_detail']:
            return TemplateFieldSerializer
        else:
            return TemplateListSerializer
    
    def retrieve(self, request, *args, **kwargs):
        """
        Retrieve a single template with all nested data.

        What:
        - Returns template metadata, file URL, and all associated fields.

        Why:
        - Used by template editors and preview screens where full template
          structure must be visible.
        """
        instance = self.get_object()
        serializer = TemplateSerializer(instance, context={'request': request})
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """
        Partially update template metadata.

        What:
        - Updates only editable template attributes such as title or description.

        Why:
        - Allows lightweight edits without affecting template fields or file data.
        - Uses a simpler serializer for validation, then returns the full template
          for client-side consistency.
        """
        instance = self.get_object()

        # Use TemplateListSerializer for validation and save
        serializer = TemplateListSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        # Refresh instance from DB to ensure updated values
        instance.refresh_from_db()
        
        # Return full template with nested fields
        output_serializer = TemplateSerializer(instance, context={'request': request})
        return Response(output_serializer.data)
    
    @action(detail=True, methods=['get'])
    def recipients(self, request, pk=None):
        """
        Return unique recipients defined in this template.

        What:
        - Aggregates recipients from all template fields.

        Why:
        - Allows UIs to preview who will be required to sign when this template
          is used to create a document.
        """
        template = self.get_object()
        recipients = template.get_recipients()
        return Response({'recipients': recipients})
    
    @action(detail=True, methods=['post'])
    def fields(self, request, pk=None):
        """
        Create a new field on a template.

        What:
        - Adds a field definition (position, type, recipient, etc.) to the template.

        Why:
        - Template fields define the default signing structure that will later
          be copied into document versions.
        """
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
        """
        Update or delete an existing template field.

        PATCH:
        - Updates position, label, recipient, or field properties.

        DELETE:
        - Removes the field from the template entirely.

        Why:
        - Enables iterative template design before templates are used
          to create live documents.
        """
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
        """
        Create a new template.

        What:
        - Accepts a PDF file and metadata to initialize a reusable template.

        Why:
        - Templates are the foundation for consistent document generation,
          reducing repeated manual setup for common document types.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        
        # Return full template representation including generated ID
        output_serializer = TemplateSerializer(instance, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
