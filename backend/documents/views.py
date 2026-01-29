"""
backend/documents/views.py
"""

# ----------------------------
# Standard library imports
# ----------------------------
import io
import json
import os
import traceback
import zipfile
from datetime import datetime
from io import BytesIO

# ----------------------------
# Third-party / external libs
# ----------------------------
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.exceptions import ValidationError  # ✅ NEW: Import ValidationError

# ----------------------------
# Django imports
# ----------------------------
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpResponse, FileResponse  # ✅ Added FileResponse for streaming
from django.shortcuts import render, get_object_or_404
from django.utils import timezone

# ----------------------------
# Local app imports
# ----------------------------
from templates.models import Template
from .models import (
    Document, DocumentField,
    SigningToken, SignatureEvent, Webhook, WebhookEvent
)
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentCreateSerializer,
    DocumentFieldSerializer, DocumentFieldUpdateSerializer,
    SigningTokenSerializer, DocumentSerializer,
    SignatureEventSerializer, PublicSignPayloadSerializer,
    PublicSignResponseSerializer, WebhookSerializer, WebhookEventSerializer, WebhookDeliveryLogSerializer
)

from .services import (
    get_document_service, 
    get_signature_service,
    get_token_service,
    get_signing_process_service,  # ✅ NEW: Add this import
    get_pdf_flattening_service
)
from .services.webhook_service import WebhookService

# ----------------------------
# Pagination classes
# ----------------------------
class StandardResultsSetPagination(PageNumberPagination):
    """
    Pagination policy used across document-related list endpoints.

    Why:
    - Provides a sane default page_size (50) and allows clients to request
      a larger page up to max_page_size to balance performance vs convenience.
    - Keeps behavior consistent across endpoints that reuse pagination_class.
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


# ----------------------------
# Document viewset
# ----------------------------
class DocumentViewSet(viewsets.ModelViewSet):
    """
    ✅ CONSOLIDATED: Simplified to work with Document directly (no versions)
    """
    queryset = Document.objects.all()
    pagination_class = StandardResultsSetPagination
    
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
        else:
            return DocumentListSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new Document (no more versions)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        with transaction.atomic():
            document = serializer.save()
        
        output_serializer = DocumentDetailSerializer(document, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)
    
    # ✅ NEW: Duplicate endpoint (replaces copy_version)
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Create a new independent Document by duplicating this one.
        
        ✅ CONSOLIDATED: Replaces copy_version concept
        """
        document = self.get_object()
        
        try:
            new_document = document.duplicate()
            serializer = DocumentDetailSerializer(new_document, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': f'Failed to duplicate document: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    # ✅ SIMPLIFIED: Lock (no version_id)
    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """Lock a draft document to prevent further edits."""
        document = self.get_object()
        
        if document.status != 'draft':
            return Response(
                {'error': 'Only draft documents can be locked'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate all fields have recipients
        fields_without_recipient = document.fields.filter(recipient__isnull=True) | \
                                   document.fields.filter(recipient='')
        
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
        
        document.status = 'locked'
        document.save(update_fields=['status'])
        
        serializer = DocumentDetailSerializer(document, context={'request': request})
        return Response(serializer.data)
    
    # ✅ SIMPLIFIED: Available recipients (no version_id)
    @action(detail=True, methods=['get'])
    def available_recipients(self, request, pk=None):
        """Return recipient availability and per-recipient status."""
        # ✅ FIXED: Prefetch on queryset BEFORE calling get_object()
        document = self.get_queryset().prefetch_related(
            'fields', 'tokens'
        ).get(pk=pk)
        
        if document.status == 'draft':
            return Response(
                {'error': 'Document must be locked before generating links'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        doc_service = get_document_service()
        recipient_status = doc_service.get_recipient_status(document)
        recipients = doc_service.get_recipients(document)
        
        available = []
        seen_recipients = set()
        
        for recipient in recipients:
            if recipient in seen_recipients:
                continue
            
            seen_recipients.add(recipient)
            status_info = recipient_status.get(recipient, {})
            
            can_generate, error = doc_service.can_generate_sign_link(document, recipient)
            
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
            'document_status': document.status
        })
    
    # ✅ SIMPLIFIED: Create field (no version_id)
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
        field = serializer.save(document=document)  # ✅ CONSOLIDATED
        
        return Response(
            DocumentFieldSerializer(field).data,
            status=status.HTTP_201_CREATED
        )
    
    # ✅ SIMPLIFIED: Update field (no version_id)
    @action(detail=True, methods=['patch'])
    def update_field(self, request, pk=None, field_id=None):
        """Update a field on a draft document."""
        document = self.get_object()
        field_id = request.parser_context['kwargs'].get('field_id') or request.data.get('field_id')
        
        if not field_id:
            return Response(
                {'error': 'field_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        field = get_object_or_404(document.fields, id=field_id)
        
        if document.status == 'draft':
            serializer = DocumentFieldSerializer(field, data=request.data, partial=True)
        else:
            serializer = DocumentFieldUpdateSerializer(field, data=request.data, partial=True)
        
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(DocumentFieldSerializer(field).data, status=status.HTTP_200_OK)
    
    # ✅ SIMPLIFIED: Delete field (no version_id)
    @action(detail=True, methods=['delete'])
    def delete_field(self, request, pk=None, field_id=None):
        """Delete a field from a draft document."""
        document = self.get_object()
        field_id = request.parser_context['kwargs'].get('field_id') or request.data.get('field_id')
        
        if not field_id:
            return Response(
                {'error': 'field_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        field = get_object_or_404(document.fields, id=field_id)
        
        if document.status != 'draft':
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
    
    # ✅ SIMPLIFIED: Download (no version_id)
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Download completed document PDF with flattened signatures."""
        document = self.get_object()
        
        if document.status != 'completed':
            return Response(
                {'error': 'Document must be completed before downloading'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            if document.signed_file:
                file_path = document.signed_file.path
                if os.path.exists(file_path):
                    return FileResponse(
                        open(file_path, 'rb'), 
                        as_attachment=True, 
                        filename=f"Document_{document.title}_signed.pdf"
                    )
            
            service = get_pdf_flattening_service()
            service.flatten_and_save(document)
            
            if not document.signed_file or not os.path.exists(document.signed_file.path):
                return Response(
                    {'error': 'Failed to generate signed PDF'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return FileResponse(
                open(document.signed_file.path, 'rb'), 
                as_attachment=True, 
                filename=f"Document_{document.title}_signed.pdf"
            )
        
        except Exception as e:
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ✅ SIMPLIFIED: SigningTokenViewSet (no version_id)
class SigningTokenViewSet(viewsets.ViewSet):
    """ViewSet for managing signing tokens."""
    
    def list(self, request, pk=None):
        """List all signing tokens for a given document."""
        document = get_object_or_404(Document, id=pk)
        tokens = SigningToken.objects.filter(
            document=document
        ).select_related('document').prefetch_related('signature_events')
        
        serializer = SigningTokenSerializer(
            tokens, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    def create(self, request, pk=None):
        """Create a new signing token for a document."""
        document = get_object_or_404(Document, id=pk)
        
        serializer = SigningTokenSerializer(
            data=request.data,
            context={'document': document, 'request': request}
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


# ✅ SIMPLIFIED: PublicSignViewSet (updated for Document model)
class PublicSignViewSet(viewsets.ViewSet):
    """ViewSet for public signing endpoints."""
    permission_classes = [AllowAny]
    
    def get_client_ip(self, request):
        """Extract client IP address from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
            return ip
        return request.META.get('REMOTE_ADDR')
    
    @action(detail=False, methods=['get'], url_path='sign/(?P<token>[^/.]+)')
    def get_sign_page(self, request, token=None):
        """Retrieve signing page data for the provided token."""
        try:
            signing_token = SigningToken.objects.select_related(
                'document'
            ).prefetch_related(
                'document__fields',
                'signature_events'
            ).get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Invalid or expired token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        token_service = get_token_service()
        is_valid, error_message = token_service.is_token_valid(signing_token)
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
        
        document = signing_token.document
        doc_service = get_document_service()
        
        try:
            editable_field_ids = []
            is_editable = False
            
            if signing_token.scope == 'sign' and not signing_token.used:
                is_editable = True
                editable_field_ids = list(
                    document.fields.filter(
                        recipient=signing_token.recipient,
                        locked=False
                    ).values_list('id', flat=True)
                )
            
            fields = document.fields.all()
            fields_data = DocumentFieldSerializer(fields, many=True).data
            
            signatures = signing_token.signature_events.all() if signing_token.scope == 'sign' else \
                        document.signatures.all()
            signatures_data = SignatureEventSerializer(signatures, many=True).data
            
            return Response({
                'token': token,
                'scope': signing_token.scope,
                'recipient': signing_token.recipient,
                'is_editable': is_editable,
                'editable_field_ids': editable_field_ids,
                'document': DocumentSerializer(document).data,  # ✅ CONSOLIDATED
                'fields': fields_data,
                'signatures': signatures_data,
                'expires_at': signing_token.expires_at,
                'recipient_status': doc_service.get_recipient_status(document) if signing_token.recipient else None
            })
        except Exception as e:
            return Response(
                {'error': f'Internal server error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='sign/(?P<token>[^/.]+)')
    def submit_signature(self, request, token=None):
        """Submit signature data for a recipient using a sign token."""
        try:
            signing_token = SigningToken.objects.select_related(
                'document'
            ).get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = PublicSignPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        signer_name = serializer.validated_data['signer_name']
        field_values = serializer.validated_data['field_values']
        
        try:
            signing_service = get_signing_process_service()
            result = signing_service.process_signature_submission(
                signing_token=signing_token,
                signer_name=signer_name,
                field_values=field_values,
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')
            )
            
            response_serializer = PublicSignResponseSerializer(result['response_data'])
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        
        except ValidationError as e:
            if isinstance(e.message_dict, dict):
                return Response(e.message_dict, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response(
                    {'error': str(e.message)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            # ✅ IMPROVED: Log full traceback
            import traceback
            print("=" * 80)
            print("ERROR IN SUBMIT_SIGNATURE:")
            print("=" * 80)
            traceback.print_exc()
            print("=" * 80)
            print(f"Exception type: {type(e).__name__}")
            print(f"Exception message: {str(e)}")
            print("=" * 80)
            
            return Response(
                {'error': f'Failed to process signature: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='public/download/(?P<token>[^/.]+)')
    def download_public(self, request, token=None):
        """Download PDF for a public token (works for both sign and view scopes)."""
        print(f"\n{'='*80}")
        print(f"DOWNLOAD_PUBLIC CALLED WITH TOKEN: {token}")
        print(f"{'='*80}\n")
        
        try:
            signing_token = SigningToken.objects.select_related(
                'document'
            ).get(token=token)
            print(f"✅ Token found: {signing_token.token}")
            print(f"✅ Document: {signing_token.document.title}")
        except SigningToken.DoesNotExist:
            print(f"❌ Token not found: {token}")
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # ✅ Check if token is revoked (applies to ALL scopes)
        if signing_token.revoked:
            print(f"❌ Token revoked")
            return Response(
                {'error': 'This link has been revoked'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # ✅ Check if token is expired (applies to ALL scopes)
        if signing_token.expires_at and timezone.now() > signing_token.expires_at:
            print(f"❌ Token expired: {signing_token.expires_at}")
            return Response(
                {'error': 'This link has expired'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # ✅ FIXED: Access document directly
        document = signing_token.document
        print(f"✅ Document status: {document.status}")
        print(f"✅ Document file: {document.file}")
        
        # For sign links: can download if completed
        # For view links: can always download
        if signing_token.scope == 'sign' and document.status != 'completed':
            print(f"❌ Sign link but document not completed: {document.status}")
            return Response(
                {'error': 'Document must be completed before downloading with sign links'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check file exists
        if not document.file:
            print(f"❌ No file on document")
            return Response(
                {'error': 'Document file not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            file_path = document.file.path
            print(f"✅ File path: {file_path}")
            print(f"✅ File exists: {os.path.exists(file_path)}")
            
            if not os.path.exists(file_path):
                print(f"❌ File not found at path: {file_path}")
                return Response(
                    {'error': 'File not found on server'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # ✅ Return the file
            print(f"✅ Reading file...")
            with open(file_path, 'rb') as f:
                file_content = f.read()
                print(f"✅ File size: {len(file_content)} bytes")
                
                response = HttpResponse(
                    file_content,
                    content_type='application/pdf'
                )
                response['Content-Disposition'] = f'attachment; filename="{document.title}.pdf"'
                print(f"✅ Response created successfully")
                print(f"{'='*80}\n")
                return response
    
        except Exception as e:
            print(f"❌ Exception: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            print(f"{'='*80}\n")
            return Response(
                {'error': f'Failed to download file: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ✅ SIMPLIFIED: SignatureVerificationViewSet (updated for Document model)
class SignatureVerificationViewSet(viewsets.ViewSet):
    """ViewSet for signature verification and audit exports."""
    
    @action(detail=False, methods=['get'], url_path='documents/(?P<doc_id>[0-9]+)/signatures')
    def list_signatures(self, request, doc_id=None):
        """List all signature events for a document."""
        document = get_object_or_404(Document, id=doc_id)
        signatures = document.signatures.all()
        serializer = SignatureEventSerializer(signatures, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='documents/(?P<doc_id>[0-9]+)/signatures/(?P<sig_id>[0-9]+)/verify')
    def verify_signature(self, request, doc_id=None, sig_id=None):
        """Verify integrity of a specific signature event."""
        document = get_object_or_404(Document, id=doc_id)
        signature = get_object_or_404(SignatureEvent, id=sig_id, document=document)
        
        sig_service = get_signature_service()
        verification_result = sig_service.verify_signature_integrity(signature, document)
        
        return Response({
            'signature_id': signature.id,
            'valid': verification_result['valid'],
            'verification_details': verification_result['details'],
            'signature': SignatureEventSerializer(signature).data
        })
    
    @action(detail=False, methods=['get'], url_path='documents/(?P<doc_id>[0-9]+)/audit_export')
    def audit_export(self, request, doc_id=None):
        """Export a complete audit package as a ZIP."""
        document = get_object_or_404(Document, id=doc_id)
        
        if not document.signed_file:
            return Response(
                {'error': 'Signed PDF not yet generated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            doc_service = get_document_service()
            sig_service = get_signature_service()
            
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                if document.signed_file:
                    pdf_filename = f"{document.title}_signed.pdf"
                    with document.signed_file.open('rb') as f:
                        zipf.writestr(pdf_filename, f.read())
                
                original_file_sha256 = doc_service.compute_sha256(document)
                
                manifest = {
                    'document_id': document.id,
                    'document_title': document.title,
                    'status': document.status,
                    'exported_at': datetime.now().isoformat(),
                    'signed_pdf_sha256': document.signed_pdf_sha256,
                    'original_file_sha256': original_file_sha256,
                    'signatures': []
                }
                
                for sig in document.signatures.all():
                    is_valid = sig_service.is_signature_valid(sig)
                    
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
                        'is_valid': is_valid
                    }
                    manifest['signatures'].append(sig_data)
                
                zipf.writestr('MANIFEST.json', json.dumps(manifest, indent=2))
                
                verification_report = {
                    'verification_timestamp': datetime.now().isoformat(),
                    'document_id': document.id,
                    'overall_status': 'VALID' if all(
                        s['is_valid'] for s in manifest['signatures']
                    ) else 'INVALID',
                    'signatures_verified': len(manifest['signatures']),
                    'audit_details': []
                }
                
                for sig in document.signatures.all():
                    is_valid = sig_service.is_signature_valid(sig)
                    
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
            response['Content-Disposition'] = f'attachment; filename="audit_export_{document.title}.zip"'
            return response
        
        except Exception as e:
            return Response(
                {'error': f'Failed to generate audit export: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ----------------------------
# Webhooks management
# ----------------------------
class WebhookViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing webhooks (CRUD + events + test + retry).

    Endpoints documented in the class-level docstring remain unchanged.
    Permission: AllowAny (intentionally set in your provided code).

    Why:
    - Webhooks allow external systems to be notified about document events like completions
      and signatures. This ViewSet centralizes creation, listing, testing and retry logic.
    """
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer
    permission_classes = [AllowAny]  # ✅ CHANGED from [IsAuthenticated]
    pagination_class = PageNumberPagination
    
    def get_queryset(self):
        """
        Return only active webhooks.

        Why:
        - Prevents showing inactive/disabled webhooks in default listing operations.
        """
        return Webhook.objects.filter(is_active=True)
    
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """
        List events for a given webhook.

        What:
        - Returns WebhookEvent objects ordered by created_at desc.
        - Supports pagination.

        Why:
        - Useful for an admin UI to inspect the delivery history of a particular webhook.
        """
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
        """
        Send a test webhook event.

        What:
        - Creates a WebhookEvent with 'document.test' and enqueues delivery via WebhookService.deliver_event.

        Why:
        - Allows webhook consumers to validate endpoint configuration without real document activity.
        """
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
        # Optimization: Ideally this should use .delay() with Celery for async processing
        WebhookService.deliver_event(event)
        
        return Response({
            'status': 'Test webhook sent',
            'event_id': event.id,
            'delivery_status': event.status,
        })
    
    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """
        Retry a failed webhook delivery.

        What:
        - Accepts event_id in request.data and re-enqueues delivery if event.status == 'failed'.

        Why:
        - Provides administrators a manual retry mechanism for transient delivery failures.
        """
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


# ----------------------------
# Webhook Event viewing (read-only)
# ----------------------------
class WebhookEventViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only endpoints for webhook events and their delivery logs.

    Why:
    - Provides an audit trail of webhook deliveries and logged attempts; intentionally read-only.
    """
    queryset = WebhookEvent.objects.all()
    serializer_class = WebhookEventSerializer
    permission_classes = [AllowAny]  # ✅ CHANGED from [IsAuthenticated]
    pagination_class = PageNumberPagination
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """
        Get delivery logs for a webhook event.

        What:
        - Returns associated delivery logs ordered by created_at desc.
        - Supports pagination.

        Why:
        - Critical for troubleshooting delivery issues and debugging external integrations.
        """
        event = self.get_object()
        logs = event.delivery_logs.all().order_by('-created_at')
        
        page = self.paginate_queryset(logs)
        logs = event.delivery_logs.all().order_by('-created_at')
        
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = WebhookDeliveryLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = WebhookDeliveryLogSerializer(logs, many=True)
        return Response(serializer.data)