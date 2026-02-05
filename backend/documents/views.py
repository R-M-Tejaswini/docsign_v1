"""
backend/documents/views.py


✅ CLEAN: Document CRUD endpoints ONLY.
"""

# ----------------------------
# Standard library imports
# ----------------------------
import os
from datetime import datetime
from io import BytesIO
import json
import zipfile

# ----------------------------
# Third-party / external libs
# ----------------------------
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404

# ----------------------------
# Local app imports
# ----------------------------
from .models import Document, DocumentField  # ← ONLY these
from .serializers import (
    DocumentListSerializer,
    DocumentDetailSerializer,
    DocumentCreateSerializer,
    DocumentFieldSerializer, 
    DocumentFieldUpdateSerializer,
    DocumentMinimalListSerializer  # ✅ ADDED: Import minimal serializer
)
from .services import get_document_service


# ----------------------------
# Pagination classes
# ----------------------------
class StandardResultsSetPagination(PageNumberPagination):
    """Pagination for document lists."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


# ----------------------------
# Document viewset
# ----------------------------
class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for document CRUD operations only."""
    queryset = Document.objects.all().prefetch_related('fields')
    pagination_class = StandardResultsSetPagination
    permission_classes = [AllowAny]
    
    def get_parsers(self):
        """Parser selection based on HTTP method."""
        if self.request.method == 'POST':
            if not self.request.path.endswith('/fields/'):
                self.parser_classes = (MultiPartParser, FormParser)
            else:
                self.parser_classes = (JSONParser,)
        else:
            self.parser_classes = (JSONParser,)
        return super().get_parsers()
    
    def get_serializer_class(self):
        """Choose serializer based on action."""
        if self.action == 'create':
            return DocumentCreateSerializer
        elif self.action == 'retrieve':
            return DocumentDetailSerializer
        elif self.action in ['update_field']:
            return DocumentFieldUpdateSerializer
        elif self.action in ['create_field']:
            return DocumentFieldSerializer
        elif self.action == 'list':
            # ✅ OPTIMIZED: Use minimal serializer for lists
            return DocumentMinimalListSerializer
        else:
            return DocumentListSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new Document."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        with transaction.atomic():
            document = serializer.save()
        
        output_serializer = DocumentDetailSerializer(document, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Create a new independent Document by duplicating this one."""
        document = self.get_object()
        
        try:
            new_doc = document.duplicate()
            serializer = DocumentDetailSerializer(new_doc, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """✅ FIXED: Lock document for signing."""
        document = self.get_object()
        
        if document.status != 'draft':
            return Response(
                {'error': f'Document is already {document.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        doc_service = get_document_service()
        
        # ✅ FIXED: Call the validation method
        is_valid, error_message = doc_service.validate_document_for_locking(document)
        
        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # ✅ Mark fields as locked and lock document
        document.fields.all().update(locked=True)
        document.status = 'locked'
        document.save(update_fields=['status'])
        
        print(f"✅ Document {document.id} locked for signing")
        
        output_serializer = DocumentDetailSerializer(
            document,
            context={'request': request}
        )
        return Response(
            output_serializer.data,
            status=status.HTTP_200_OK
        )
    
    @action(detail=True, methods=['get'])
    def available_recipients(self, request, pk=None):
        """Return recipient availability and per-recipient status."""
        document = self.get_queryset().prefetch_related('fields').get(pk=pk)
        
        if document.status == 'draft':
            return Response(
                {'error': 'Document must be locked before recipients are available'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        doc_service = get_document_service()
        recipient_status = doc_service.get_recipient_status(document)
        recipients = doc_service.get_recipients(document)
        
        available = []
        seen_recipients = set()
        
        for recipient in recipients:
            if recipient not in seen_recipients:
                can_generate, error = doc_service.can_generate_sign_link(document, recipient)
                available.append({
                    'recipient': recipient,
                    'can_generate_sign_link': can_generate,
                    'status': recipient_status.get(recipient, {}),
                    'error': error
                })
                seen_recipients.add(recipient)
        
        return Response({
            'recipients': available,
            'document_status': document.status
        })
    
    @action(detail=True, methods=['post'])
    def create_field(self, request, pk=None):
        """Create a new field on a draft document."""
        document = self.get_object()
        
        if document.status != 'draft':
            return Response(
                {'error': 'Cannot add fields to locked documents'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = DocumentFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(document=document)
        
        return Response(
            DocumentFieldSerializer(field).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['patch'], url_path='fields/(?P<field_id>[0-9]+)')
    def update_field(self, request, pk=None, field_id=None):
        """✅ FIXED: Update a field on this document."""
        document = self.get_object()
        field = get_object_or_404(DocumentField, id=field_id, document=document)
        
        # ✅ CRITICAL: Use PATCH serializer for updates
        serializer = DocumentFieldUpdateSerializer(
            field,
            data=request.data,
            partial=True  # ✅ Allow partial updates
        )
        
        if not serializer.is_valid():
            print(f"❌ Field update validation error: {serializer.errors}")
            return Response(
                {'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            updated_field = serializer.save()
            print(f"✅ Field {field_id} updated successfully")
            return Response(
                DocumentFieldSerializer(updated_field).data,
                status=status.HTTP_200_OK
            )
        except Exception as e:
            print(f"❌ Field update error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['delete'], url_path='fields/(?P<field_id>[0-9]+)')
    def delete_field(self, request, pk=None, field_id=None):
        """✅ FIXED: Delete a field from this document."""
        document = self.get_object()
        field = get_object_or_404(DocumentField, id=field_id, document=document)
        
        try:
            field_label = field.label
            field.delete()
            print(f"✅ Field {field_id} ({field_label}) deleted")
            return Response(
                {'message': 'Field deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        except Exception as e:
            print(f"❌ Field deletion error: {e}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download completed document PDF with flattened signatures."""
        document = self.get_object()
        
        if document.status != 'completed':
            return Response(
                {'error': 'Document must be completed before download'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not document.signed_file:
            return Response(
                {'error': 'Signed PDF not available'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            response = FileResponse(
                document.signed_file.open('rb'),
                content_type='application/pdf'
            )
            response['Content-Disposition'] = f'attachment; filename="{document.title}_signed.pdf"'
            return response
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def list(self, request, *args, **kwargs):
        """✅ OPTIMIZED: List without expensive computed fields."""
        queryset = self.filter_queryset(self.get_queryset())
        
        page = self.paginate_queryset(queryset)
        if page is not None:
            documents = page
        else:
            documents = queryset
        
        serializer = self.get_serializer(documents, many=True)
        
        if page is not None:
            return self.get_paginated_response(serializer.data)
        
        return Response(serializer.data)
    
    def retrieve(self, request, *args, **kwargs):
        """✅ OPTIMIZED: Pre-compute recipient status for single document."""
        instance = self.get_object()
        
        # ✅ Compute status once
        from documents.services import get_document_service
        service = get_document_service()
        recipient_status = service.get_recipient_status(instance)
        
        serializer = self.get_serializer(
            instance,
            context={
                'request': request,
                '_recipient_status_cache': {instance.id: recipient_status}
            }
        )
        return Response(serializer.data)
    
    @action(detail=True, methods=['delete'])
    def destroy(self, request, pk=None):
        """Delete a document."""
        document = self.get_object()
        
        if document.status not in ['draft', 'locked']:
            return Response(
                {'error': 'Can only delete draft or locked documents'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # ✅ Delete associated files
        if document.file:
            document.file.delete()
        if document.signed_file:
            document.signed_file.delete()
        
        document_id = document.id
        document.delete()
        
        return Response(
            {'success': f'Document {document_id} deleted'},
            status=status.HTTP_204_NO_CONTENT
        )