from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated  # ✅ ADD IsAuthenticated
from django.db import transaction, models
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from io import BytesIO
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io
import traceback
import os
import zipfile
import json
from datetime import datetime
from django.conf import settings  # ✅ ADD THIS if not present


from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent, Webhook, WebhookEvent, DocumentGroup, GroupSession
)
from templates.models import Template
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentCreateSerializer, DocumentVersionSerializer,
    DocumentFieldSerializer, DocumentFieldUpdateSerializer,
    SigningTokenSerializer, SigningTokenCreateSerializer,
    SignatureEventSerializer, PublicSignPayloadSerializer,
    PublicSignResponseSerializer, WebhookSerializer,
    WebhookEventSerializer, WebhookDeliveryLogSerializer,
    DocumentGroupSerializer, GroupSessionSerializer,  # ← ADD THESE
    DocumentGroupListSerializer, GroupSessionCreateSerializer,
    GroupItemSerializer, GroupItemCreateSerializer,
    GroupItemReorderSerializer  # ← ADD THESE
)
from .services import get_pdf_flattening_service
from .services.webhook_service import WebhookService

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
        
        try:
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
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"❌ Error in get_sign_page: {e}")
            return Response(
                {'error': f'Internal server error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='sign/(?P<token>[^/.]+)')
    def submit_signature(self, request, token=None):
        """
        PUBLIC ENDPOINT: Submit signatures for a document.
        Handles both single documents and group sequences.
        """
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
        
        # ✅ NEW: Check if this is a group token
        if signing_token.group_session:
            session = signing_token.group_session
            from .services.group_signing_service import GroupSigningService
            
            # Validate token matches current session state
            is_valid, error = GroupSigningService.validate_group_token(signing_token, session)
            if not is_valid:
                return Response({'error': error}, status=status.HTTP_403_FORBIDDEN)
        
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
            
            # Create signature event (event_hash computed in save())
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
            
            # ✅ TRIGGER WEBHOOK: Signature Created
            WebhookService.trigger_event(
                event_type='document.signature_created',
                payload={
                    'document_id': version.document.id,
                    'document_title': version.document.title,
                    'version_id': version.id,
                    'version_number': version.version_number,
                    'signature_id': signature_event.id,
                    'signer_name': signer_name,
                    'recipient': recipient,
                    'signed_at': signature_event.signed_at.isoformat(),
                    'field_values': signature_event.field_values,
                    'ip_address': signature_event.ip_address,
                }
            )
            
            # Prepare response data
            response_data = {
                'signature_id': signature_event.id,
                'message': 'Document signed successfully',
                'version_status': version.status,
                'recipient': recipient,
                'link_converted_to_view': True,
            }
            
            # ✅ NEW: Handle group session advancement
            if signing_token.group_session:
                session = signing_token.group_session
                from .services.group_signing_service import GroupSigningService
                
                success, msg, next_token = GroupSigningService.advance_session(session)
                
                response_data['group_session_id'] = session.id
                response_data['group_progress'] = session.get_progress()
                
                if success:
                    response_data['message'] = msg
                    if next_token:
                        # Generate public URL for next token
                        response_data['next_signing_url'] = f"{settings.FRONTEND_BASE_URL}/sign/{next_token.token}"
                    
                    # ✅ TRIGGER WEBHOOK: Group Completed (if last item)
                    if session.status == 'completed':
                        WebhookService.trigger_event(
                            event_type='group.completed',
                            payload={
                                'group_id': session.group.id,
                                'group_title': session.group.title,
                                'recipient': session.recipient,
                                'session_id': session.id,
                                'timestamp': timezone.now().isoformat(),
                                'total_items': session.group.get_item_count(),
                            }
                        )
                else:
                    return Response(
                        {'detail': msg},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # ✅ TRIGGER WEBHOOK: Document Completed (if all signed)
            if version.status == 'completed':
                WebhookService.trigger_event(
                    event_type='document.completed',
                    payload={
                        'document_id': version.document.id,
                        'document_title': version.document.title,
                        'version_id': version.id,
                        'version_number': version.version_number,
                        'status': version.status,
                        'completed_at': timezone.now().isoformat(),
                        'signatures_count': version.signatures.count(),
                        'all_signatures': [
                            {
                                'id': sig.id,
                                'signer_name': sig.signer_name,
                                'recipient': sig.recipient,
                                'signed_at': sig.signed_at.isoformat(),
                            }
                            for sig in version.signatures.all()
                        ],
                        'download_url': f'{settings.BASE_URL}/api/documents/{version.document.id}/versions/{version.id}/download/',
                        'audit_export_url': f'{settings.BASE_URL}/api/documents/{version.document.id}/versions/{version.id}/audit_export/',
                    }
                )
        
        return Response(response_data, status=status.HTTP_200_OK)
    

class SignatureVerificationViewSet(viewsets.ViewSet):
    """ViewSet for signature verification and audit exports."""
    
    @action(detail=False, methods=['get'], 
            url_path='documents/(?P<doc_id>[0-9]+)/versions/(?P<version_id>[0-9]+)/signatures')
    def list_signatures(self, request, doc_id=None, version_id=None):
        """List all signatures for a document version."""
        version = get_object_or_404(DocumentVersion, id=version_id, document_id=doc_id)
        signatures = version.signatures.all()
        serializer = SignatureEventSerializer(signatures, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], 
            url_path='documents/(?P<doc_id>[0-9]+)/versions/(?P<version_id>[0-9]+)/signatures/(?P<sig_id>[0-9]+)/verify')
    def verify_signature(self, request, doc_id=None, version_id=None, sig_id=None):
        """Verify integrity of a specific signature event."""
        version = get_object_or_404(DocumentVersion, id=version_id, document_id=doc_id)
        signature = get_object_or_404(SignatureEvent, id=sig_id, version=version)
        
        # Recompute event hash
        current_event_hash = signature.compute_event_hash()
        stored_event_hash = signature.event_hash
        
        # Check if PDF hash matches
        current_pdf_hash = version.compute_sha256()
        stored_pdf_hash = signature.document_sha256
        
        # Check if signed PDF hash matches (if available)
        signed_pdf_valid = True
        if version.signed_file and version.signed_pdf_sha256:
            current_signed_pdf_hash = version.compute_signed_pdf_hash()
            signed_pdf_valid = current_signed_pdf_hash == version.signed_pdf_sha256
        
        is_valid = (
            current_event_hash == stored_event_hash and
            current_pdf_hash == stored_pdf_hash and
            signed_pdf_valid
        )
        
        return Response({
            'signature_id': signature.id,
            'valid': is_valid,
            'verification_details': {
                'event_hash_match': current_event_hash == stored_event_hash,
                'stored_event_hash': stored_event_hash,
                'current_event_hash': current_event_hash,
                'pdf_hash_match': current_pdf_hash == stored_pdf_hash,
                'stored_pdf_hash': stored_pdf_hash,
                'current_pdf_hash': current_pdf_hash,
                'signed_pdf_hash_match': signed_pdf_valid,
                'stored_signed_pdf_hash': version.signed_pdf_sha256,
                'current_signed_pdf_hash': version.compute_signed_pdf_hash() if version.signed_file else None,
            },
            'signature': SignatureEventSerializer(signature).data
        })
    
    @action(detail=False, methods=['get'], 
            url_path='documents/(?P<doc_id>[0-9]+)/versions/(?P<version_id>[0-9]+)/audit_export')
    def audit_export(self, request, doc_id=None, version_id=None):
        """Export complete audit package as ZIP."""
        document = get_object_or_404(Document, id=doc_id)
        version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        
        if not version.signed_file:
            return Response(
                {'error': 'Signed PDF not yet generated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Create ZIP in memory
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add signed PDF
                if version.signed_file:
                    pdf_filename = f"{document.title}_v{version.version_number}_signed.pdf"
                    with version.signed_file.open('rb') as f:
                        zipf.writestr(pdf_filename, f.read())
                
                # Build verification manifest
                manifest = {
                    'document_id': document.id,
                    'document_title': document.title,
                    'version_number': version.version_number,
                    'status': version.status,
                    'exported_at': datetime.now().isoformat(),
                    'signed_pdf_sha256': version.signed_pdf_sha256,
                    'original_file_sha256': version.compute_sha256(),
                    'signatures': []
                }
                
                # Add all signature events
                for sig in version.signatures.all():
                    sig_data = {
                        'id': sig.id,
                        'signer_name': sig.signer_name,
                        'recipient': sig.recipient,
                        'signed_at': sig.signed_at.isoformat(),
                        'ip_address': sig.ip_address,
                        'user_agent': sig.user_agent,
                        'event_hash': sig.event_hash,
                        'document_sha256': sig.document_sha256,
                        'field_values': sig.field_values,
                        'is_valid': sig.compute_event_hash() == sig.event_hash
                    }
                    manifest['signatures'].append(sig_data)
                
                # Write manifest
                zipf.writestr('MANIFEST.json', json.dumps(manifest, indent=2))
                
                # Add detailed verification report
                verification_report = {
                    'verification_timestamp': datetime.now().isoformat(),
                    'document_id': document.id,
                    'version_id': version.id,
                    'overall_status': 'VALID' if all(
                        s['is_valid'] for s in manifest['signatures']
                    ) else 'INVALID',
                    'signatures_verified': len(manifest['signatures']),
                    'audit_details': []
                }
                
                for sig in version.signatures.all():
                    is_valid = sig.compute_event_hash() == sig.event_hash
                    verification_report['audit_details'].append({
                        'signature_id': sig.id,
                        'signer': sig.signer_name,
                        'recipient': sig.recipient,
                        'timestamp': sig.signed_at.isoformat(),
                        'event_integrity': 'VALID' if is_valid else 'TAMPERED',
                        'event_hash': sig.event_hash,
                        'document_hash': sig.document_sha256,
                    })
                
                zipf.writestr('VERIFICATION_REPORT.json', json.dumps(verification_report, indent=2))
            
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="audit_export_{document.title}_v{version.version_number}.zip"'
            return response
        
        except Exception as e:
            return Response(
                {'error': f'Failed to generate audit export: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class WebhookViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing webhooks.
    
    Endpoints:
    - POST /webhooks/               → Create webhook
    - GET /webhooks/                → List webhooks
    - GET /webhooks/{id}/           → Retrieve webhook
    - PATCH /webhooks/{id}/         → Update webhook
    - DELETE /webhooks/{id}/        → Delete webhook
    - GET /webhooks/{id}/events/    → List events for webhook
    - POST /webhooks/{id}/test/     → Send test event
    """
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer
    permission_classes = [AllowAny]  # ✅ CHANGED from [IsAuthenticated]
    pagination_class = PageNumberPagination
    
    def get_queryset(self):
        """Only show active webhooks."""
        return Webhook.objects.filter(is_active=True)
    
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """List all events for a webhook."""
        webhook = self.get_object()
        events = webhook.webhook_events.all().order_by('-created_at')
        
        page = self.paginate_queryset(events)
        if page is not None:
            serializer = WebhookEventSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = WebhookEventSerializer(events, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Send a test webhook event."""
        webhook = self.get_object()
        
        test_payload = {
            'event_type': 'document.test',
            'message': 'This is a test webhook',
            'timestamp': timezone.now().isoformat(),
        }
        
        event = WebhookEvent.objects.create(
            webhook=webhook,
            event_type='document.test',
            payload=test_payload,
            status='pending'
        )
        
        from .services.webhook_service import WebhookService
        WebhookService.deliver_event(event)
        
        return Response({
            'status': 'Test webhook sent',
            'event_id': event.id,
            'delivery_status': event.status,
        })
    
    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Retry a failed webhook event."""
        webhook = self.get_object()
        event_id = request.data.get('event_id')
        
        try:
            event = WebhookEvent.objects.get(id=event_id, webhook=webhook)
            
            if event.status != 'failed':
                return Response(
                    {'error': f'Can only retry failed events (current: {event.status})'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            event.status = 'pending'
            event.attempt_count = 0
            event.save()
            
            from .services.webhook_service import WebhookService
            WebhookService.deliver_event(event)
            
            return Response({
                'status': 'Webhook retry initiated',
                'event_id': event.id,
            })
        except WebhookEvent.DoesNotExist:
            return Response(
                {'error': 'Event not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class WebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoints for webhook events.
    """
    queryset = WebhookEvent.objects.all()
    serializer_class = WebhookEventSerializer
    permission_classes = [AllowAny]  # ✅ CHANGED from [IsAuthenticated]
    pagination_class = PageNumberPagination
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Get delivery logs for a webhook event."""
        event = self.get_object()
        logs = event.delivery_logs.all().order_by('-created_at')
        
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = WebhookDeliveryLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = WebhookDeliveryLogSerializer(logs, many=True)
        return Response(serializer.data)
    
class DocumentGroupViewSet(viewsets.ModelViewSet):
    """ViewSet for DocumentGroup CRUD and session management."""
    queryset = DocumentGroup.objects.all()
    serializer_class = DocumentGroupSerializer
    
    def get_serializer_class(self):
        """Use list serializer for list action."""
        if self.action == 'list':
            return DocumentGroupListSerializer
        return DocumentGroupSerializer
    
    @action(detail=True, methods=['get'])
    def items(self, request, pk=None):
        """Get ordered items in the group."""
        group = self.get_object()
        items = group.items.all()
        serializer = GroupItemSerializer(items, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='items')
    def add_item(self, request, pk=None):
        """Add an item to the group."""
        group = self.get_object()
        
        serializer = GroupItemCreateSerializer(
            data=request.data,
            context={'group': group}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save()
        
        return Response(
            GroupItemSerializer(item).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['patch'], url_path='items/(?P<item_id>[0-9]+)/reorder')
    def reorder_item(self, request, pk=None, item_id=None):
        """Reorder an item in the group."""
        group = self.get_object()
        item = get_object_or_404(group.items, id=item_id)
        
        serializer = GroupItemReorderSerializer(
            item,
            data=request.data,
            context={'group': group}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(GroupItemSerializer(item).data)
    
    @action(detail=True, methods=['delete'], url_path='items/(?P<item_id>[0-9]+)')
    def delete_item(self, request, pk=None, item_id=None):
        """Delete an item from the group."""
        from django.db import models
    
        group = self.get_object()
        item = get_object_or_404(group.items, id=item_id)
        
        # Prevent deletion if active sessions exist
        if group.sessions.filter(status__in=['pending', 'in_progress']).exists():
            return Response(
                {'detail': 'Cannot delete item while active sessions exist'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # ✅ FIX: Use a transaction to ensure order consistency
        from django.db import transaction
    
        try:
            with transaction.atomic():
                deleted_order = item.order
            
                # 1. Delete the item first
                item.delete()
            
                # 2. Then shift all items AFTER the deleted one down by 1
                group.items.filter(
                    order__gt=deleted_order
                ).update(order=models.F('order') - 1)
        
            return Response(status=status.HTTP_204_NO_CONTENT)
    
        except Exception as e:
            return Response(
                {'detail': f'Failed to delete item: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    # ✅ ADD THESE MISSING ACTIONS
    @action(detail=True, methods=['get'])
    def sessions(self, request, pk=None):
        """Get all sessions for a group."""
        group = self.get_object()
        sessions = group.sessions.all().order_by('-created_at')
        
        page = self.paginate_queryset(sessions)
        if page is not None:
            serializer = GroupSessionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = GroupSessionSerializer(sessions, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='sessions')
    def create_session(self, request, pk=None):
        """Create a new signing session for the group."""
        group = self.get_object()
        
        # Validate group has items
        if group.items.count() == 0:
            return Response(
                {'detail': 'Group must have at least one item before creating a session'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = GroupSessionCreateSerializer(
            data=request.data,
            context={'group': group}
        )
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        
        return Response(
            GroupSessionSerializer(session).data,
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'], url_path='sessions/(?P<session_id>[0-9]+)')
    def session_detail(self, request, pk=None, session_id=None):
        """Get details of a specific session."""
        group = self.get_object()
        session = get_object_or_404(group.sessions, id=session_id)
        
        serializer = GroupSessionSerializer(session)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='sessions/(?P<session_id>[0-9]+)/revoke')
    def revoke_session(self, request, pk=None, session_id=None):
        """Revoke a signing session."""
        group = self.get_object()
        session = get_object_or_404(group.sessions, id=session_id)
        
        if session.status == 'completed':
            return Response(
                {'detail': 'Cannot revoke a completed session'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        session.status = 'cancelled'
        session.save(update_fields=['status'])
        
        # Revoke all tokens for this session
        from .models import SigningToken
        SigningToken.objects.filter(group_session=session).update(revoked=True)
        
        return Response({
            'detail': 'Session revoked successfully',
            'session_id': session.id,
            'status': session.status
        })
    
    @action(detail=True, methods=['get'], url_path='download')
    def download_group(self, request, pk=None):
        """Download all signed documents in a group as ZIP."""
        group = self.get_object()
        
        # Check if group has any completed sessions
        completed_sessions = group.sessions.filter(status='completed')
        if not completed_sessions.exists():
            return Response(
                {'detail': 'No completed sessions to download'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for item in group.items.all():
                    version = item.version
                    
                    # Only include completed versions
                    if version.status == 'completed' and version.signed_file:
                        file_path = version.signed_file.path
                        if os.path.exists(file_path):
                            # Create folder structure: Group Title / Document Title
                            archive_name = f"{group.title}/{item.title}_v{version.version_number}.pdf"
                            with open(file_path, 'rb') as f:
                                zipf.writestr(archive_name, f.read())
                
                # Add manifest
                manifest = {
                    'group_id': group.id,
                    'group_title': group.title,
                    'downloaded_at': timezone.now().isoformat(),
                    'total_items': group.items.count(),
                    'items': []
                }
                
                for item in group.items.all():
                    manifest['items'].append({
                        'order': item.order,
                        'title': item.title,
                        'version': item.version.version_number,
                        'status': item.version.status,
                        'recipients': item.version.get_recipients(),
                        'signatures_count': item.version.signatures.count(),
                    })
                
                zipf.writestr('MANIFEST.json', json.dumps(manifest, indent=2))
            
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="group_{group.title}.zip"'
            return response
        
        except Exception as e:
            return Response(
                {'detail': f'Failed to generate download: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def get_client_ip(self, request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '')
