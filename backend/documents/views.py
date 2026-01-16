from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from django.http import HttpResponse
from io import BytesIO
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io
import traceback
import os


from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)
from templates.models import Template  # ← Add this line
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentCreateSerializer, DocumentVersionSerializer,
    DocumentFieldSerializer, DocumentFieldUpdateSerializer,
    SigningTokenSerializer, SigningTokenCreateSerializer,
    SignatureEventSerializer, PublicSignPayloadSerializer,
    PublicSignResponseSerializer
)
from .services import get_pdf_flattening_service

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for Document CRUD operations."""
    queryset = Document.objects.all()
    pagination_class = StandardResultsSetPagination
    
    def get_parsers(self):
        """Override parsers based on request method."""
        if self.request.method == 'POST':
            # Check if this is document creation (no nested path) vs field creation
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
            return DocumentCreateSerializer
        elif self.action == 'retrieve':
            return DocumentDetailSerializer
        else:
            return DocumentListSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new document, optionally from a template."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        with transaction.atomic():
            document = serializer.save()  # ← This should create ONE version via the serializer
            
            # Don't create another version here!
            # The serializer's create() method handles it
    
        output_serializer = DocumentDetailSerializer(document, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """List all versions of a specific document."""
        document = self.get_object()
        versions = document.versions.all()
        serializer = DocumentVersionSerializer(
            versions, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def all_versions(self, request):
        """List all versions across all documents."""
        versions = DocumentVersion.objects.select_related('document').order_by('-created_at')
        page = self.paginate_queryset(versions)
        if page is not None:
            serializer = DocumentVersionSerializer(
                page, many=True, context={'request': request}
            )
            return self.get_paginated_response(serializer.data)
        
        serializer = DocumentVersionSerializer(
            versions, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], url_path='versions/(?P<version_id>[0-9]+)')
    def version_detail(self, request, pk=None, version_id=None):
        """Get a specific version of a document."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        serializer = DocumentVersionSerializer(version, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/lock')
    def lock_version(self, request, pk=None, version_id=None):
        """Lock a version to prevent further editing."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        if version.status != 'draft':
            return Response(
                {'error': 'Only draft versions can be locked'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate that all fields have recipients assigned
        fields_without_recipient = version.fields.filter(recipient__isnull=True) | \
                                   version.fields.filter(recipient='')
        
        if fields_without_recipient.exists():
            return Response(
                {
                    'error': 'All fields must have recipients assigned before locking',
                    'fields_without_recipient': list(
                        fields_without_recipient.values_list('id', flat=True)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        version.status = 'locked'
        version.save(update_fields=['status'])
        
        serializer = DocumentVersionSerializer(version, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], url_path='versions/(?P<version_id>[0-9]+)/recipients')
    def available_recipients(self, request, pk=None, version_id=None):
        """Get list of recipients who can still receive sign links."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        if version.status == 'draft':
            return Response(
                {'error': 'Document must be locked before generating links'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        recipient_status = version.get_recipient_status()
        recipients = version.get_recipients()
        
        # Build response with recipient availability - DEDUPLICATED
        available = []
        seen_recipients = set()
        
        for recipient in recipients:
            if recipient in seen_recipients:
                continue
            
            seen_recipients.add(recipient)
            status_info = recipient_status.get(recipient, {})
            
            # Check if recipient can receive a sign link
            can_generate, error = version.can_generate_sign_link(recipient)
            
            available.append({
                'recipient': recipient,
                'can_generate_sign_link': can_generate,
                'reason': error,
                'total_fields': status_info.get('total', 0),
                'signed_fields': status_info.get('signed', 0),
                'completed': status_info.get('completed', False)
            })
        
        return Response({
            'recipients': available,
            'document_status': version.status
        })
    
    @action(detail=True, methods=['patch'], url_path='versions/(?P<version_id>[0-9]+)/fields/(?P<field_id>[0-9]+)')
    def update_field(self, request, pk=None, version_id=None, field_id=None):
        """Update a document field (draft mode or value-only in locked mode)."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        field = get_object_or_404(version.fields, id=field_id)
        
        serializer = DocumentFieldUpdateSerializer(
            field, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(DocumentFieldSerializer(field).data)
    
    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/fields')
    def create_field(self, request, pk=None, version_id=None):
        """Create a new field on a document version (draft mode only)."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        if version.status != 'draft':
            return Response(
                {'error': 'Cannot add fields to locked documents'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = DocumentFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(version=version)
        
        return Response(
            DocumentFieldSerializer(field).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['delete'], url_path='versions/(?P<version_id>[0-9]+)/fields/(?P<field_id>[0-9]+)')
    def delete_field(self, request, pk=None, version_id=None, field_id=None):
        """Delete a field from a document version (draft mode only)."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        field = get_object_or_404(version.fields, id=field_id)
        
        if version.status != 'draft':
            return Response(
                {'error': 'Cannot delete fields from locked documents'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if field.locked:
            return Response(
                {'error': 'Cannot delete signed fields'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/copy')
    def copy_version(self, request, pk=None, version_id=None):
        """Create a new draft version by copying an existing version."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        # Create new version (version_number will auto-increment via save())
        new_version = DocumentVersion.objects.create(
            document=document,
            file=version.file,
            status='draft',
            page_count=version.page_count
        )
        
        # Copy all fields from the original version
        for field in version.fields.all():
            DocumentField.objects.create(
                version=new_version,
                field_type=field.field_type,
                label=field.label,
                recipient=field.recipient,
                page_number=field.page_number,
                x_pct=field.x_pct,
                y_pct=field.y_pct,
                width_pct=field.width_pct,
                height_pct=field.height_pct,
                required=field.required
            )
        
        serializer = DocumentVersionSerializer(new_version, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'], url_path='versions/(?P<version_id>[0-9]+)/download')
    def download_version(self, request, pk=None, version_id=None):
        """Download version PDF with flattened signatures."""
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        # Only allow download if completed
        if version.status != 'completed':
            return Response(
                {'error': 'Document must be completed before downloading'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Check if signed_file exists
            if version.signed_file:
                file_path = version.signed_file.path
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as pdf_file:
                        response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                        response['Content-Disposition'] = f'attachment; filename="Document_{document.title}_v{version.version_number}_signed.pdf"'
                        return response
        
            # If no signed_file or it doesn't exist, generate it
            service = get_pdf_flattening_service()
            service.flatten_and_save(version)
            
            # Verify the file was created
            if not version.signed_file or not os.path.exists(version.signed_file.path):
                return Response(
                    {'error': 'Failed to generate signed PDF'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Stream the newly created file
            with open(version.signed_file.path, 'rb') as pdf_file:
                response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="Document_{document.title}_v{version.version_number}_signed.pdf"'
                return response
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def flatten_signatures_on_pdf(self, pdf_path, version):
        """DEPRECATED: Use PDFFlatteningService instead."""
        service = get_pdf_flattening_service()
        return service.flatten_version(version)


class SigningTokenViewSet(viewsets.ViewSet):
    """ViewSet for managing signing tokens."""
    
    def list(self, request, document_id=None):
        """List all tokens for a document."""
        document = get_object_or_404(Document, id=document_id)
        tokens = SigningToken.objects.filter(
            version__document=document
        ).select_related('version').prefetch_related('signature_events')
        
        serializer = SigningTokenSerializer(
            tokens, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    def create(self, request, document_id=None, version_id=None):
        """Create a new signing token for a document version."""
        document = get_object_or_404(Document, id=document_id)
        version = get_object_or_404(document.versions, id=version_id)
        
        serializer = SigningTokenCreateSerializer(
            data=request.data,
            context={'version': version}
        )
        serializer.is_valid(raise_exception=True)
        
        try:
            token = serializer.save()
            return Response(
                SigningTokenSerializer(token, context={'request': request}).data,
                status=status.HTTP_201_CREATED
            )
        except (DjangoValidationError, ValueError) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def revoke(self, request):
        """Revoke a signing token."""
        token_str = request.data.get('token')
        if not token_str:
            return Response(
                {'error': 'Token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            token = SigningToken.objects.get(token=token_str)
            token.revoked = True
            token.save(update_fields=['revoked'])
            
            return Response({
                'message': 'Token revoked successfully',
                'token': token_str
            })
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Token not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class PublicSignViewSet(viewsets.ViewSet):
    """ViewSet for public signing endpoint (no auth required)."""
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'], url_path='sign/(?P<token>[^/.]+)')
    def get_sign_page(self, request, token=None):
        """Retrieve signing page data for a token."""
        try:
            signing_token = SigningToken.objects.select_related(
                'version__document'
            ).prefetch_related(
                'version__fields',
                'signature_events'
            ).get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Invalid or expired token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check token validity
        is_valid, error_message = signing_token.is_valid()
        if not is_valid:
            return Response(
                {
                    'error': error_message,
                    'token_status': 'invalid',
                    'revoked': signing_token.revoked,
                    'expired': signing_token.expires_at and signing_token.expires_at < timezone.now() if signing_token.expires_at else False,
                    'used': signing_token.used
                },
                status=status.HTTP_403_FORBIDDEN
            )
        
        version = signing_token.version
        
        # Determine editable fields based on token scope and recipient
        editable_field_ids = []
        is_editable = False
        
        if signing_token.scope == 'sign' and not signing_token.used:
            # Sign token - only editable fields for this recipient
            is_editable = True
            editable_field_ids = list(
                version.fields.filter(
                    recipient=signing_token.recipient,
                    locked=False
                ).values_list('id', flat=True)
            )
        
        # Get all fields with their current values
        fields = version.fields.all()
        fields_data = DocumentFieldSerializer(fields, many=True).data
        
        # Get all signature events for this version
        signatures = signing_token.signature_events.all() if signing_token.scope == 'sign' else \
                    version.signatures.all()
        signatures_data = SignatureEventSerializer(signatures, many=True).data
        
        return Response({
            'token': token,
            'scope': signing_token.scope,
            'recipient': signing_token.recipient,
            'is_editable': is_editable,
            'editable_field_ids': editable_field_ids,
            'version': DocumentVersionSerializer(version).data,
            'fields': fields_data,
            'signatures': signatures_data,
            'expires_at': signing_token.expires_at,
            'recipient_status': version.get_recipient_status() if signing_token.recipient else None
        })
    
    @action(detail=False, methods=['post'], url_path='sign/(?P<token>[^/.]+)')
    def submit_signature(self, request, token=None):
        """Submit signature data for a recipient."""
        try:
            signing_token = SigningToken.objects.select_related(
                'version__document'
            ).get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate token
        is_valid, error_message = signing_token.is_valid()
        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Only sign tokens can submit signatures
        if signing_token.scope != 'sign':
            return Response(
                {'error': 'This is a view-only link'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Parse and validate payload
        serializer = PublicSignPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        signer_name = serializer.validated_data['signer_name']
        field_values = serializer.validated_data['field_values']
        
        version = signing_token.version
        recipient = signing_token.recipient
        
        # Validate that all fields being signed belong to this recipient
        field_ids = [fv['field_id'] for fv in field_values]
        recipient_fields = version.fields.filter(
            id__in=field_ids,
            recipient=recipient,
            locked=False
        )
        
        if recipient_fields.count() != len(field_ids):
            return Response(
                {'error': 'Some fields do not belong to this recipient or are already signed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate required fields for this recipient are filled
        required_recipient_fields = version.fields.filter(
            recipient=recipient,
            required=True,
            locked=False
        )
        filled_field_ids = set(field_ids)
        missing_required = required_recipient_fields.exclude(id__in=filled_field_ids)
        
        if missing_required.exists():
            return Response(
                {
                    'error': 'All required fields must be filled',
                    'missing_fields': list(missing_required.values('id', 'label'))
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Process signature with transaction
        with transaction.atomic():
            # Update field values and lock them
            updated_fields = []
            for fv in field_values:
                field = version.fields.get(id=fv['field_id'])
                field.value = fv['value']
                field.locked = True
                field.save(update_fields=['value', 'locked'])
                updated_fields.append(field)
            
            # Compute document hash
            document_sha256 = version.compute_sha256()
            
            # Create signature event
            signature_event = SignatureEvent.objects.create(
                version=version,
                token=signing_token,
                recipient=recipient,
                signer_name=signer_name,
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                document_sha256=document_sha256,
                field_values=[
                    {'field_id': fv['field_id'], 'value': fv['value']}
                    for fv in field_values
                ],
                metadata={
                    'recipient': recipient,
                    'fields_signed': len(field_values)
                }
            )
            
            # Convert sign token to view-only
            signing_token.convert_to_view_only()
            
            # Update version status based on completion
            version.update_status()
        
            response_serializer = PublicSignResponseSerializer({
            'signature_id': signature_event.id,
            'message': 'Document signed successfully',
            'version_status': version.status,
            'recipient': recipient,
            'link_converted_to_view': True
        })
        
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    @staticmethod
    def get_client_ip(request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    def get_recipients(self, obj):
        """Get list of unique recipients from the model method."""
        return obj.get_recipients()  # This should already be deduped in the model
    
    def flatten_signatures_on_pdf(self, pdf_path, version):
        """DEPRECATED: Use PDFFlatteningService instead."""
        service = get_pdf_flattening_service()
        return service.flatten_version(version)
    
    @action(detail=False, methods=['get'], url_path='download/(?P<token>[^/.]+)')
    def download_public(self, request, token=None):
        """Download signed PDF from public link."""
        try:
            signing_token = SigningToken.objects.select_related('version').get(token=token)
        except SigningToken.DoesNotExist:
            return Response({'error': 'Invalid token'}, status=status.HTTP_404_NOT_FOUND)
        
        version = signing_token.version
        
        # Only allow download if completed
        if version.status != 'completed':
            return Response(
                {'error': 'Document is not yet complete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Generate or retrieve signed PDF
            if not version.signed_file:
                service = get_pdf_flattening_service()
                service.flatten_and_save(version)
            
            # Verify file exists
            if not version.signed_file or not os.path.exists(version.signed_file.path):
                return Response(
                    {'error': 'PDF file not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Stream the file
            with open(version.signed_file.path, 'rb') as pdf_file:
                response = HttpResponse(pdf_file.read(), content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{version.document.title}_signed.pdf"'
                return response
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )