"""
backend/signing/views.py

Signing tokens, signatures, public signing, and audit endpoints.
"""

import logging
from datetime import datetime
from io import BytesIO
import zipfile

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError

from documents.models import Document, DocumentField
from documents.serializers import DocumentDetailSerializer, DocumentFieldSerializer  # ✅ ADD THIS
from .models import SigningToken, SignatureEvent
from .serializers import (
    SigningTokenSerializer, SignatureEventSerializer,
    PublicSignPayloadSerializer, PublicSignResponseSerializer
)
from .services import (
    get_token_service, get_signature_service,
    get_signing_process_service
)
from documents.services import get_document_service

logger = logging.getLogger(__name__)


class StandardResultsSetPagination(PageNumberPagination):
    """Pagination policy."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class SigningTokenViewSet(viewsets.ViewSet):
    """ViewSet for managing signing tokens."""
    pagination_class = StandardResultsSetPagination
    
    def list(self, request, pk=None):
        """✅ OPTIMIZED: Pre-compute recipient status for all tokens at once."""
        document = get_object_or_404(Document, id=pk)
        tokens = SigningToken.objects.filter(
            document=document
        ).select_related('document').prefetch_related('signature_events')
        
        # ✅ Compute status once for the document
        from documents.services import get_document_service
        service = get_document_service()
        recipient_status = service.get_recipient_status(document)
        
        serializer = SigningTokenSerializer(
            tokens,
            many=True,
            context={
                'request': request,
                '_recipient_status_cache': {document.id: recipient_status}
            }
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
                {'error': 'token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            token = SigningToken.objects.get(token=token_str)
            token.revoked = True
            token.save(update_fields=['revoked'])
            return Response({'status': 'revoked'})
        except SigningToken.DoesNotExist:
            return Response(
                {'error': 'Token not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class PublicSignViewSet(viewsets.ViewSet):
    """ViewSet for public signing endpoints (no authentication required)."""
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
        logger.info(f"🔵 get_sign_page called with token: {token}")
        
        try:
            # ✅ OPTIMIZED: Use consistent prefetch policy
            signing_token = SigningToken.objects.select_related(
                'document'
            ).prefetch_related(
                'document__fields',
                'signature_events'
            ).get(token=token)
            logger.info(f"✅ Token found: {signing_token}")
        except SigningToken.DoesNotExist:
            logger.error(f"❌ Token not found: {token}")
            return Response(
                {'error': 'Invalid or expired token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            token_service = get_token_service()
            is_valid, error_message = token_service.is_token_valid(signing_token)
            
            logger.info(f"📋 Token validity: {is_valid}, message: {error_message}")
            
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
            
            logger.info(f"📄 Document: {document.id}, status: {document.status}")
            
            # ✅ CRITICAL FIX: Build editable_field_ids CORRECTLY
            editable_field_ids = []
            is_editable = False
            
            if signing_token.scope == 'sign' and not signing_token.used:
                # Get ALL fields for this recipient (regardless of lock status)
                recipient_fields = document.fields.filter(
                    recipient=signing_token.recipient
                ).values_list('id', flat=True)
                
                editable_field_ids = list(recipient_fields)
                is_editable = len(editable_field_ids) > 0
                
                logger.info(f"✅ Editable field IDs: {editable_field_ids}")
                logger.info(f"✅ Is editable: {is_editable}")
            
            # ✅ CRITICAL: Get signatures only if document completed
            if document.status == 'completed':
                signatures = document.signatures.all()
            else:
                signatures = []
            
            signatures_data = SignatureEventSerializer(signatures, many=True).data
            logger.info(f"✍️ Signatures: {len(signatures_data)} signatures")
            
            # ✅ NEW: Serialize fields for response
            fields_data = DocumentFieldSerializer(
                document.fields.all(),
                many=True
            ).data
            logger.info(f"📋 Fields serialized: {len(fields_data)} fields")
            
            # ✅ Compute status once
            recipient_status = None
            if signing_token.recipient:
                recipient_status = doc_service.get_recipient_status(document)
                logger.info(f"👥 Recipient status: {recipient_status}")
            
            # ✅ Build document data with proper context
            document_data = DocumentDetailSerializer(
                document,
                context={
                    'request': request,
                    '_recipient_status_cache': {document.id: recipient_status} if recipient_status else {}
                }
            ).data
            logger.info(f"✅ Document data built successfully")
            
            response_data = {
                'token': token,
                'scope': signing_token.scope,
                'recipient': signing_token.recipient,
                'is_editable': is_editable,
                'editable_field_ids': editable_field_ids,
                'document': document_data,
                'fields': fields_data,  # ✅ NOW DEFINED
                'signatures': signatures_data,
                'expires_at': signing_token.expires_at.isoformat() if signing_token.expires_at else None,
                'recipient_status': recipient_status
            }
            
            logger.info(f"✅ Response prepared successfully")
            return Response(response_data)
        
        except Exception as e:
            logger.exception(f"❌ Error in get_sign_page: {str(e)}")
            return Response(
                {'error': f'Internal server error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'], url_path='sign/(?P<token>[^/.]+)')
    def submit_signature(self, request, token=None):
        """Submit signature data for a recipient using a sign token."""
        logger.info(f"✍️ submit_signature called with token: {token}")
        
        try:
            # ✅ OPTIMIZED: Consistent prefetch
            signing_token = SigningToken.objects.select_related(
                'document'
            ).prefetch_related(
                'document__fields'
            ).get(token=token)
        except SigningToken.DoesNotExist:
            logger.error(f"❌ Token not found: {token}")
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = PublicSignPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        signer_name = serializer.validated_data['signer_name']
        field_values = serializer.validated_data['field_values']
        
        logger.info(f"📝 Signing submission: {signer_name} for {signing_token.recipient}")
        
        try:
            signing_process = get_signing_process_service()
            result = signing_process.process_signature_submission(
                signing_token,
                signer_name,
                field_values,
                self.get_client_ip(request),
                request.META.get('HTTP_USER_AGENT', '')
            )
            
            logger.info(f"✅ Signature processed successfully")
            response_serializer = PublicSignResponseSerializer(result['response_data'])
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        
        except DjangoValidationError as e:
            logger.error(f"❌ Validation error: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.exception(f"❌ Error signing: {str(e)}")
            return Response(
                {'error': f'Signing failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'], url_path='public/download/(?P<token>[^/.]+)')
    def download_public(self, request, token=None):
        """Download PDF for a public token (works for both sign and view scopes)."""
        logger.info(f"📥 download_public called with token: {token}")
        
        try:
            signing_token = SigningToken.objects.select_related('document').get(token=token)
        except SigningToken.DoesNotExist:
            logger.error(f"❌ Token not found: {token}")
            return Response(
                {'error': 'Invalid token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if signing_token.revoked:
            logger.warning(f"⚠️ Token revoked: {token}")
            return Response(
                {'error': 'This link has been revoked'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if signing_token.expires_at and timezone.now() > signing_token.expires_at:
            logger.warning(f"⚠️ Token expired: {token}")
            return Response(
                {'error': 'This link has expired'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        document = signing_token.document
        
        if signing_token.scope == 'sign' and document.status != 'completed':
            logger.warning(f"⚠️ Document not completed: {document.id}")
            return Response(
                {'error': 'Document is not yet completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not document.file:
            logger.error(f"❌ Document file not found: {document.id}")
            return Response(
                {'error': 'Document file not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            response = FileResponse(
                document.file.open('rb'),
                content_type='application/pdf'
            )
            response['Content-Disposition'] = f'attachment; filename="{document.title}.pdf"'
            logger.info(f"✅ PDF download started: {document.title}")
            return response
        
        except Exception as e:
            logger.exception(f"❌ Error downloading PDF: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SignatureVerificationViewSet(viewsets.ViewSet):
    """ViewSet for signature verification and audit exports."""
    pagination_class = StandardResultsSetPagination
    
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
                        'document_sha256_at_time': sig.document_sha256,
                        'is_valid': is_valid,
                    }
                    manifest['signatures'].append(sig_data)
                
                import json
                manifest_json = json.dumps(manifest, indent=2)
                zipf.writestr('MANIFEST.json', manifest_json)
            
            zip_buffer.seek(0)
            response = FileResponse(zip_buffer, content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{document.title}_audit_export.zip"'
            return response
        
        except Exception as e:
            logger.exception(f"❌ Audit export error: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
