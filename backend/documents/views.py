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
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent, Webhook, WebhookEvent
)
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentCreateSerializer, DocumentVersionSerializer,
    DocumentFieldSerializer, DocumentFieldUpdateSerializer,
    SigningTokenSerializer, SigningTokenCreateSerializer,
    SignatureEventSerializer, PublicSignPayloadSerializer,
    PublicSignResponseSerializer, WebhookSerializer, WebhookEventSerializer, WebhookDeliveryLogSerializer
)

from .services import (
    get_document_service, 
    get_signature_service,
    get_token_service,
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
    ViewSet for Document CRUD operations.

    Responsibilities:
    - Provide list/retrieve/create/update/delete for Document model.
    - Offer document-version management endpoints (list versions, lock, copy, download).
    - Provide endpoints to manage fields within versions (create/update/delete).
    - Ensure correct parser selection for multipart vs JSON requests.
    - Ensure only allowed operations are performed depending on version status
      (draft vs locked vs completed).

    Important constraints (kept as-is):
    - Serializer create() is expected to create the initial DocumentVersion.
      create() method does not create a second version; comment in code preserves that behavior.
    """
    queryset = Document.objects.all()
    pagination_class = StandardResultsSetPagination
    
    def get_parsers(self):
        """
        Return parser classes depending on the HTTP method and URL.

        What:
        - For POST document creation (multipart file upload) we use MultiPartParser/FormParser.
        - For field creation endpoint we keep JSONParser (fields endpoints expect JSON).
        - For all other methods we use JSONParser.

        Why:
        - Different endpoints accept different content types; selecting parsers
          early ensures DRF will properly parse request.data and file uploads.
        """
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
        """
        Choose serializer based on current action.

        What:
        - create -> DocumentCreateSerializer (handles document + initial version creation)
        - retrieve -> DocumentDetailSerializer (detailed view)
        - otherwise -> DocumentListSerializer (compact list)
        """
        if self.action == 'create':
            return DocumentCreateSerializer
        elif self.action == 'retrieve':
            return DocumentDetailSerializer
        else:
            return DocumentListSerializer
    
    def create(self, request, *args, **kwargs):
        """
        Create a new Document (and its initial version via serializer).

        What:
        - Validate incoming data using the DocumentCreateSerializer.
        - Use a transaction to ensure a consistent create operation.
        - Return the detailed representation after creation.

        Why:
        - The serializer's create() is expected to fully handle creating the
          related initial DocumentVersion. The view should not duplicate that logic.
        """
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
        """
        List versions for a specific document.

        What:
        - Retrieves all versions belonging to the document instance.
        - Serializes them with DocumentVersionSerializer.

        Why:
        - Consumers need an endpoint to enumerate past versions for audit, downloads,
          or to choose a version to copy/lock/download.

        ✅ OPTIMIZATION: Prefetch related fields to avoid N+1 queries.
        """
        document = self.get_object()
        # ✅ PREFETCH: fields and signatures to avoid N+1
        versions = document.versions.prefetch_related('fields', 'signatures').all()
        serializer = DocumentVersionSerializer(
            versions, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def all_versions(self, request):
        """
        Endpoint to list all document versions across all documents (global view).

        What:
        - Uses select_related for efficiency and orders by created_at desc.
        - Supports pagination via pagination_class.

        Why:
        - Useful for administrative views or audit endpoints that need a global stream
          of versions rather than versions scoped to a single document.

        ✅ OPTIMIZATION: Prefetch related data to avoid N+1 queries.
        """
        versions = DocumentVersion.objects.select_related('document').prefetch_related(
            'fields', 'signatures', 'tokens'
        ).order_by('-created_at')
        
        page = self.paginate_queryset(versions)
        if page is not None:
            # ✅ PRE-COMPUTE: Attach cached data to avoid serializer queries
            for version in page:
                from .services import get_document_service
                service = get_document_service()
                version._recipients_cache = service.get_recipients(version)
                version._recipient_status_cache = service.get_recipient_status(version)
            
            serializer = DocumentVersionSerializer(
                page, many=True, context={'request': request}
            )
            return self.get_paginated_response(serializer.data)
        
        # ✅ PRE-COMPUTE: Attach cached data for non-paginated case
        for version in versions:
            from .services import get_document_service
            service = get_document_service()
            version._recipients_cache = service.get_recipients(version)
            version._recipient_status_cache = service.get_recipient_status(version)
        
        serializer = DocumentVersionSerializer(
            versions, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'], url_path='versions/(?P<version_id>[0-9]+)')
    def version_detail(self, request, pk=None, version_id=None):
        """
        Retrieve a single version by ID for a document.

        What:
        - Fetches the version from document.versions and returns its serialized data.

        Why:
        - Clients often need to inspect a specific version's metadata and fields.

        ✅ OPTIMIZATION: Prefetch related data.
        """
        document = self.get_object()
        version = get_object_or_404(
            document.versions.prefetch_related('fields', 'signatures'),
            id=version_id
        )
        
        # ✅ PRE-COMPUTE: Attach cached data
        from .services import get_document_service
        service = get_document_service()
        version._recipients_cache = service.get_recipients(version)
        version._recipient_status_cache = service.get_recipient_status(version)
        
        serializer = DocumentVersionSerializer(version, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/lock')
    def lock_version(self, request, pk=None, version_id=None):
        """
        Lock a draft version to prevent further edits.

        What:
        - Ensures only draft versions can be locked.
        - Validates every field has an assigned recipient before locking.
        - Changes status to 'locked' and saves.

        Why:
        - Locking prevents accidental changes and is a precondition for generating
          sign links and starting the signing process.
        """
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
        """
        Return recipient availability and per-recipient status.

        What:
        - Only allowed for locked versions (drafts are not ready).
        - Builds a deduplicated list of recipients and reports if they can get sign links,
          how many fields they have, how many they've signed, and completion status.

        Why:
        - UI components and automation need to show which recipients still need to sign,
          whether links can be generated, and reasons for failure when applicable.

        ✅ OPTIMIZATION: Prefetch fields to avoid N+1.
        """
        document = self.get_object()
        version = get_object_or_404(
            document.versions.prefetch_related('fields', 'tokens'),
            id=version_id
        )
        
        if version.status == 'draft':
            return Response(
                {'error': 'Document must be locked before generating links'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        doc_service = get_document_service()
        recipient_status = doc_service.get_recipient_status(version)
        recipients = doc_service.get_recipients(version)
        
        available = []
        seen_recipients = set()
        
        for recipient in recipients:
            if recipient in seen_recipients:
                continue
            
            seen_recipients.add(recipient)
            status_info = recipient_status.get(recipient, {})
            
            can_generate, error = doc_service.can_generate_sign_link(version, recipient)
            
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
    
    @action(detail=True, methods=['post'], url_path='versions/(?P<version_id>[0-9]+)/fields')
    def create_field(self, request, pk=None, version_id=None):
        """
        Create a new field on a draft version.

        What:
        - Only allowed when version.status == 'draft'.
        - Uses DocumentFieldSerializer to validate and then saves with version relationship.

        Why:
        - Field creation is part of authoring the signature locations and metadata
          before locking and sending sign links.
        """
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
        """
        Delete a field from a draft version.

        What:
        - Only allowed for draft versions and for fields that are not locked (not signed).
        - Returns HTTP 204 on success.

        Why:
        - During drafting, authors should be able to remove fields; once signed (locked)
          they must be preserved for auditability.
        """
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
        """
        Create a new draft version by copying an existing version.

        What:
        - Copies the file reference and metadata, creates fields duplicated for the new draft.
        - Leaves the original version unchanged.

        Why:
        - Provides a quick way to branch a version for edits without mutating historical versions.
        - Useful for preparing a new signing cycle while keeping the signed copy intact.
        - Optimized with bulk_create to avoid N+1 queries.
        """
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        # Create new version (version_number will auto-increment via save())
        new_version = DocumentVersion.objects.create(
            document=document,
            file=version.file,
            status='draft',
            page_count=version.page_count
        )
        
        # Optimization: Use bulk_create for fields (O(1) query instead of O(N))
        new_fields = []
        for field in version.fields.all():
            new_fields.append(
                DocumentField(
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
            )
        
        if new_fields:
            DocumentField.objects.bulk_create(new_fields)
        
        serializer = DocumentVersionSerializer(new_version, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['get'], url_path='versions/(?P<version_id>[0-9]+)/download')
    def download_version(self, request, pk=None, version_id=None):
        """
        Download completed version PDF with flattened signatures.

        What:
        - Only allows downloads for versions with status 'completed'.
        - If a signed_file already exists, streams it directly using FileResponse.
        - Otherwise invokes the configured PDFFlatteningService to flatten and save a signed PDF,
          then streams the newly created file.

        Why:
        - Users must be able to download a tamper-evident, flattened PDF once the document is completed.
        - FileResponse is used to stream the file instead of loading it into RAM (preventing memory crashes).
        """
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        
        # Only allow download if completed
        if version.status != 'completed':
            return Response(
                {'error': 'Document must be completed before downloading'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            if version.signed_file:
                file_path = version.signed_file.path
                if os.path.exists(file_path):
                    return FileResponse(
                        open(file_path, 'rb'), 
                        as_attachment=True, 
                        filename=f"Document_{document.title}_v{version.version_number}_signed.pdf"
                    )
        
            service = get_pdf_flattening_service()
            service.flatten_and_save(version)
            
            if not version.signed_file or not os.path.exists(version.signed_file.path):
                return Response(
                    {'error': 'Failed to generate signed PDF'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return FileResponse(
                open(version.signed_file.path, 'rb'), 
                as_attachment=True, 
                filename=f"Document_{document.title}_v{version.version_number}_signed.pdf"
            )
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'Failed to generate PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def flatten_signatures_on_pdf(self, pdf_path, version):
        """
        DEPRECATED helper kept for compatibility.

        What:
        - Delegates to PDFFlatteningService.flatten_version, returns the result.

        Why:
        - Historically used to flatten PDFs directly in the view; retained for backward
          compatibility while encouraging use of the service layer.
        """
        service = get_pdf_flattening_service()
        return service.flatten_version(version)

    @action(detail=True, methods=['patch'], url_path='versions/(?P<version_id>[0-9]+)/fields/(?P<field_id>[0-9]+)')
    def update_field(self, request, pk=None, version_id=None, field_id=None):
        """
        Update a field on a draft version.

        What:
        - Only allowed when version.status == 'draft'.
        - Uses DocumentFieldUpdateSerializer to validate updates.
        - Prevents editing field properties (recipient, label, required, positioning) on locked versions.
        - Only allows value updates on signed (locked) fields.

        Why:
        - During drafting, authors should be able to modify field properties.
        - Once locked/signed, only the value can be changed (and locked fields are immutable anyway).
        """
        document = self.get_object()
        version = get_object_or_404(document.versions, id=version_id)
        field = get_object_or_404(version.fields, id=field_id)
        
        if version.status == 'draft':
            # Draft mode: allow full updates using DocumentFieldSerializer
            serializer = DocumentFieldSerializer(field, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            
            return Response(
                DocumentFieldSerializer(field).data,
                status=status.HTTP_200_OK
            )
        else:
            # Locked mode: only allow value updates on unlocked fields
            serializer = DocumentFieldUpdateSerializer(field, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            
            return Response(
                DocumentFieldSerializer(field).data,
                status=status.HTTP_200_OK
            )
    
# ----------------------------
# Signing Token viewset
# ----------------------------
class SigningTokenViewSet(viewsets.ViewSet):
    """
    ViewSet for managing signing tokens.

    Responsibilities:
    - List tokens for a document.
    - Create tokens bound to document versions.
    - Revoke tokens.

    Why:
    - Signing tokens are the mechanism to grant a recipient either signing or view-only access
      to a specific document version without requiring authentication.
    """
    
    def list(self, request, document_id=None):
        """
        List all signing tokens for a given document.

        What:
        - Uses select_related and prefetch_related to efficiently fetch related version and events.
        - Returns tokens serialized for client consumption.

        Why:
        - Administrators or audit UIs need a list of tokens to track distribution and revocation.
        """
        document = get_object_or_404(Document, id=document_id)
        tokens = SigningToken.objects.filter(
            version__document=document
        ).select_related('version').prefetch_related('signature_events')
        
        serializer = SigningTokenSerializer(
            tokens, many=True, context={'request': request}
        )
        return Response(serializer.data)
    
    def create(self, request, document_id=None, version_id=None):
        """
        Create a new signing token for a specific document version.

        What:
        - Validates input using SigningTokenCreateSerializer which expects context={'version': version}.
        - Handles known validation errors and returns clear 400 messages for invalid input.

        Why:
        - Token creation is the entry point for generating links for recipients; validation ensures
          tokens are created only for supported recipients/scopes.
        """
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
        """
        Revoke a signing token.

        What:
        - Accepts token string in request.data['token'] and marks the token as revoked.

        Why:
        - Revocation invalidates previously issued links so they can no longer be used to sign.
        """
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


# ----------------------------
# Public signing (no auth) viewset
# ----------------------------
class PublicSignViewSet(viewsets.ViewSet):
    """
    ViewSet for public signing endpoints.

    Responsibilities:
    - Provide GET to fetch signing page data for a token (sign or view-only).
    - Provide POST to submit signatures via a token (only sign scope).
    - Provide download endpoint for public tokens.

    Why:
    - Enables external recipients (without an account) to sign documents using a secure token.
    - This ViewSet is intentionally AllowAny because recipients are unauthenticated users.
    """
    permission_classes = [AllowAny]
    
    def get_client_ip(self, request):
        """
        Extract client IP address from request.
        
        Handles X-Forwarded-For header (for proxied requests) and falls back to
        REMOTE_ADDR if no proxy header is present.
        
        Args:
            request: DRF Request object
            
        Returns:
            str: IP address or None if unable to determine
        """
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
            # We want the first one (the original client)
            ip = x_forwarded_for.split(',')[0].strip()
            return ip
        
        return request.META.get('REMOTE_ADDR')
    
    @action(detail=False, methods=['get'], url_path='sign/(?P<token>[^/.]+)')
    def get_sign_page(self, request, token=None):
        """
        Retrieve signing page data for the provided token.

        What:
        - Validates token existence and validity.
        - Determines which fields are editable for the token's recipient and returns
          version/fields/signature state necessary for a signing UI.

        Why:
        - Signing UI needs to know which fields the current token holder can edit,
          what the version metadata is, and what signatures already exist.
        """
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
        
        version = signing_token.version
        doc_service = get_document_service()
        
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
                'recipient_status': doc_service.get_recipient_status(version) if signing_token.recipient else None
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
        Submit signature data for a recipient using a sign token.

        What:
        - Validates token and scope (must be sign).
        - Validates input payload via PublicSignPayloadSerializer.
        - Ensures fields being signed belong to the recipient and required fields are filled.
        - Creates SignatureEvent, locks fields (using bulk_update), converts token to view-only,
          updates version status, and triggers webhooks.

        Why:
        - Central point ensuring data integrity when anonymous signers submit values.
        - Transactional: all updates succeed or roll back together.
        - Optimized to use bulk_update for fields to prevent N+1 database queries.
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
        
        token_service = get_token_service()
        is_valid, error_message = token_service.is_token_valid(signing_token)
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
            doc_service = get_document_service()
            sig_service = get_signature_service()
            
            fields_to_update = []
            fields_map = {f.id: f for f in recipient_fields}
            
            for fv in field_values:
                field = fields_map.get(int(fv['field_id']))
                if field:
                    field.value = fv['value']
                    field.locked = True
                    fields_to_update.append(field)
            
            if fields_to_update:
                DocumentField.objects.bulk_update(fields_to_update, ['value', 'locked'])
            
            document_sha256 = doc_service.compute_sha256(version)
            
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
            
            token_service.convert_to_view_only(signing_token)
            
            doc_service.update_version_status(version)
            
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
            
            # ✅ TRIGGER WEBHOOK: Document Completed
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
            
            response_serializer = PublicSignResponseSerializer({
                'signature_id': signature_event.id,
                'message': 'Document signed successfully',
                'version_status': version.status,
                'recipient': recipient,
                'link_converted_to_view': True
            })
        
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'], url_path='download/(?P<token>[^/.]+)')
    def download_public(self, request, token=None):
        """
        Download the completed signed PDF using a public token.

        What:
        - Validates the token exists and is valid (not revoked, not expired).
        - Only allows downloads if the document version is 'completed'.
        - Streams the signed PDF file using FileResponse to avoid memory issues.

        Why:
        - Recipients need to be able to download the final signed document after all
          parties have completed signing, using their original token link.
        - FileResponse streams the file instead of loading it into RAM.
        """
        try:
            signing_token = SigningToken.objects.select_related(
                'version__document'
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
                {'error': error_message},
                status=status.HTTP_403_FORBIDDEN
            )
        
        version = signing_token.version
        document = version.document
        
        # Only allow download if completed
        if version.status != 'completed':
            return Response(
                {
                    'error': 'Document must be completed before downloading',
                    'current_status': version.status
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            if version.signed_file:
                file_path = version.signed_file.path
                if os.path.exists(file_path):
                    return FileResponse(
                        open(file_path, 'rb'),
                        as_attachment=True,
                        filename=f"Document_{document.title}_v{version.version_number}_signed.pdf"
                    )
            
            # If no signed file exists yet, generate it
            service = get_pdf_flattening_service()
            service.flatten_and_save(version)
            
            if not version.signed_file or not os.path.exists(version.signed_file.path):
                return Response(
                    {'error': 'Failed to generate signed PDF'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return FileResponse(
                open(version.signed_file.path, 'rb'),
                as_attachment=True,
                filename=f"Document_{document.title}_v{version.version_number}_signed.pdf"
            )
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {'error': f'Failed to download PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ----------------------------
# Signature verification / audit exports
# ----------------------------
class SignatureVerificationViewSet(viewsets.ViewSet):
    """
    ViewSet for signature verification and audit exports.

    Responsibilities:
    - Provide endpoints to list and verify signature events for a given document version.
    - Produce a ZIP audit export containing signed PDF, MANIFEST.json, and VERIFICATION_REPORT.json.

    Why:
    - Supports tamper-evidence verification, forensic inspection, and external audits.
    """
    
    @action(detail=False, methods=['get'], 
            url_path='documents/(?P<doc_id>[0-9]+)/versions/(?P<version_id>[0-9]+)/signatures')
    def list_signatures(self, request, doc_id=None, version_id=None):
        """List all signature events for a version."""
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
        
        sig_service = get_signature_service()
        verification_result = sig_service.verify_signature_integrity(signature, version)
        
        return Response({
            'signature_id': signature.id,
            'valid': verification_result['valid'],
            'verification_details': verification_result['details'],
            'signature': SignatureEventSerializer(signature).data
        })
    
    @action(detail=False, methods=['get'], 
            url_path='documents/(?P<doc_id>[0-9]+)/versions/(?P<version_id>[0-9]+)/audit_export')
    def audit_export(self, request, doc_id=None, version_id=None):
        """
        Export a complete audit package as a ZIP.
        
        ✅ OPTIMIZATION: Use is_signature_valid() consistently instead of recomputing.
        """
        document = get_object_or_404(Document, id=doc_id)
        version = get_object_or_404(DocumentVersion, id=version_id, document=document)
        
        if not version.signed_file:
            return Response(
                {'error': 'Signed PDF not yet generated'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            doc_service = get_document_service()
            sig_service = get_signature_service()
            
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                if version.signed_file:
                    pdf_filename = f"{document.title}_v{version.version_number}_signed.pdf"
                    with version.signed_file.open('rb') as f:
                        zipf.writestr(pdf_filename, f.read())
                
                original_file_sha256 = doc_service.compute_sha256(version)
                
                manifest = {
                    'document_id': document.id,
                    'document_title': document.title,
                    'version_number': version.version_number,
                    'status': version.status,
                    'exported_at': datetime.now().isoformat(),
                    'signed_pdf_sha256': version.signed_pdf_sha256,
                    'original_file_sha256': original_file_sha256,
                    'signatures': []
                }
                
                # Add all signature events
                for sig in version.signatures.all():
                    # ✅ OPTIMIZATION: Use service method consistently
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
                    # ✅ OPTIMIZATION: Use service method consistently
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
            response['Content-Disposition'] = f'attachment; filename="audit_export_{document.title}_v{version.version_number}.zip"'
            return response
        
        except Exception as e:
            import traceback
            traceback.print_exc()
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