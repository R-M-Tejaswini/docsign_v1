from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.core.exceptions import ValidationError
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentCreateSerializer, DocumentVersionSerializer,
    DocumentFieldSerializer, DocumentFieldUpdateSerializer,
    SigningTokenSerializer, SigningTokenCreateSerializer,
    SignatureEventSerializer, PublicSignPayloadSerializer,
    PublicSignResponseSerializer
)
from .services import compute_file_sha256


class DocumentViewSet(viewsets.ModelViewSet):
    """ViewSet for Document CRUD operations."""
    queryset = Document.objects.all()
    parser_classes = (MultiPartParser, FormParser)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'create':
            return DocumentCreateSerializer
        elif self.action == 'retrieve':
            return DocumentDetailSerializer
        else:
            return DocumentListSerializer
    
    def create(self, request, *args, **kwargs):
        """Create a new document with initial version."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        
        return Response(
            DocumentDetailSerializer(document, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class DocumentVersionViewSet(viewsets.ModelViewSet):
    """ViewSet for managing document versions."""
    serializer_class = DocumentVersionSerializer
    
    def get_queryset(self):
        """Filter versions by document ID."""
        doc_id = self.kwargs.get('document_pk')
        return DocumentVersion.objects.filter(document_id=doc_id)
    
    def retrieve(self, request, *args, **kwargs):
        """Retrieve a specific version with fields."""
        instance = self.get_object()
        serializer = self.get_serializer(instance, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def lock(self, request, *args, **kwargs):
        """Lock a version (prevent further field edits)."""
        version = self.get_object()
        
        if version.status != 'draft':
            return Response(
                {'detail': 'Only draft versions can be locked'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        version.status = 'locked'
        version.save(update_fields=['status'])
        
        return Response(
            DocumentVersionSerializer(version, context={'request': request}).data,
            status=status.HTTP_200_OK
        )


class DocumentFieldViewSet(viewsets.ModelViewSet):
    """ViewSet for managing document fields within a version."""
    serializer_class = DocumentFieldSerializer
    
    def get_queryset(self):
        """Filter fields by version ID."""
        version_id = self.kwargs.get('version_pk')
        return DocumentField.objects.filter(version_id=version_id)
    
    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action in ['update', 'partial_update']:
            return DocumentFieldUpdateSerializer
        return DocumentFieldSerializer
    
    def update(self, request, *args, **kwargs):
        """Update a document field (draft versions only)."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        serializer = self.get_serializer(
            instance, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(DocumentFieldSerializer(instance).data)


class SigningTokenViewSet(viewsets.ViewSet):
    """ViewSet for managing signing tokens."""
    permission_classes = [AllowAny]
    @action(detail=False, methods=['post'])
    def create_token(self, request, document_pk=None, version_pk=None):
        """Create a new signing token for a document version."""
        try:
            version = DocumentVersion.objects.get(
                document_id=document_pk,
                id=version_pk
            )
        except DocumentVersion.DoesNotExist:
            return Response(
                {'detail': 'Version not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Parse the requested scope first
        serializer = SigningTokenCreateSerializer(
            data=request.data,
            context={'version': version}
        )
        serializer.is_valid(raise_exception=True)

        requested_scope = serializer.validated_data.get('scope', 'sign')

        # Check if version can generate links with this scope
        if not version.can_generate_link(scope=requested_scope):
            if requested_scope == 'sign':
                # More detailed error messages based on status
                if version.status == 'completed':
                    return Response(
                        {'detail': 'All fields have been signed. You can only generate view-only links now.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                elif version.status == 'draft':
                    return Response(
                        {'detail': 'Document is still in draft mode. Please lock it first before generating signing links.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                else:
                    return Response(
                        {'detail': 'Cannot generate signing links for this document in its current state.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                # View-only links only for non-draft
                if version.status == 'draft':
                    return Response(
                        {'detail': 'Document is still in draft mode. Please lock it first before generating view-only links.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                else:
                    return Response(
                        {'detail': 'Cannot generate view-only links for this document.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        try:
            token = serializer.save()
        except ValidationError as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
        return Response(
            SigningTokenSerializer(token).data,
            status=status.HTTP_201_CREATED
        )


    @action(detail=False, methods=['get'])
    def list_tokens(self, request, document_pk=None):
        """List all tokens for all versions of a document."""
        try:
            document = Document.objects.get(id=document_pk)
        except Document.DoesNotExist:
            return Response(
                {'detail': 'Document not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        versions = document.versions.all()
        tokens = SigningToken.objects.filter(version__in=versions)
        serializer = SigningTokenSerializer(tokens, many=True)
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def revoke_token(self, request):
        """Revoke a signing token."""
        token_str = request.data.get('token')
        
        try:
            token = SigningToken.objects.get(token=token_str)
        except SigningToken.DoesNotExist:
            return Response(
                {'detail': 'Token not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        token.revoked = True
        token.save(update_fields=['revoked'])
        
        return Response(
            SigningTokenSerializer(token).data,
            status=status.HTTP_200_OK
        )


class PublicSignViewSet(viewsets.ViewSet):
    """ViewSet for public signing endpoint (no auth required)."""
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['get'], url_path='sign/(?P<token>[^/.]+)')
    def get_sign_page(self, request, token=None):
        """Retrieve signing page data for a token."""
        try:
            signing_token = SigningToken.objects.get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'detail': 'Invalid or expired token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate token
        is_valid, error = signing_token.is_valid()
        if not is_valid:
            return Response(
                {'detail': error},
                status=status.HTTP_403_FORBIDDEN
            )
        
        version = signing_token.version
        fields = version.fields.all()
        signatures = version.signatures.all()
        
        # Prepare response based on scope
        response_data = {
            'token': token,
            'scope': signing_token.scope,
            'is_single_use': signing_token.single_use,
            'version': DocumentVersionSerializer(version, context={'request': request}).data,
            'fields': DocumentFieldSerializer(fields, many=True).data,
            'signatures': SignatureEventSerializer(signatures, many=True).data,
        }
        
        # Determine editability
        if signing_token.scope == 'view':
            # View-only mode - no fields are editable
            response_data['is_editable'] = False
            response_data['editable_field_ids'] = []
        else:
            # Sign mode - only unlocked, empty fields are editable
            editable_field_ids = [
                f.id for f in fields
                if not f.locked and (not f.value or f.value == '')
            ]
            response_data['editable_field_ids'] = editable_field_ids
            response_data['is_editable'] = len(editable_field_ids) > 0
        
        return Response(response_data, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'], url_path='sign/(?P<token>[^/.]+)')
    def submit_signature(self, request, token=None):
        """Submit signature data."""
        try:
            signing_token = SigningToken.objects.get(token=token)
        except SigningToken.DoesNotExist:
            return Response(
                {'detail': 'Invalid or expired token'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate token for signing
        is_valid, error = signing_token.is_valid()
        if not is_valid:
            return Response(
                {'detail': error},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if signing_token.scope != 'sign':
            return Response(
                {'detail': 'This token is view-only'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Parse payload
        serializer = PublicSignPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        version = signing_token.version
        signer_name = serializer.validated_data['signer_name']
        field_values = serializer.validated_data['field_values']
        
        # DIFFERENT VALIDATION LOGIC FOR SINGLE-USE vs MULTI-USE
        if signing_token.single_use:
            # Single-use: ALL unlocked, empty fields MUST be filled
            editable_fields = version.fields.filter(
                locked=False
            ).exclude(value__isnull=False).exclude(value='')
            
            submitted_field_ids = [int(fv['field_id']) for fv in field_values]
            editable_field_ids = list(editable_fields.values_list('id', flat=True))
            
            missing_fields = set(editable_field_ids) - set(submitted_field_ids)
            if missing_fields:
                return Response(
                    {'detail': f'All fields must be filled for single-use links. Missing field IDs: {list(missing_fields)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            # Multi-use: AT LEAST ONE unlocked field must be filled
            # (Multiple users can sign different fields)
            if not field_values or len(field_values) == 0:
                return Response(
                    {'detail': 'Please fill at least one field'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Validate and update fields
        updated_fields = []
        for fv in field_values:
            field_id = int(fv['field_id'])
            value = fv['value']
            
            try:
                field = DocumentField.objects.get(id=field_id, version=version)
            except DocumentField.DoesNotExist:
                return Response(
                    {'detail': f'Field {field_id} not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if field is editable
            if field.locked:
                return Response(
                    {'detail': f'Field "{field.label}" is already locked and cannot be edited'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if field.value and field.value.strip():
                return Response(
                    {'detail': f'Field "{field.label}" is already filled and cannot be edited'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Update field
            field.value = value
            field.locked = True
            field.save(update_fields=['value', 'locked'])
            updated_fields.append(field)
        
        # Compute document hash
        document_sha256 = version.compute_sha256()
        
        # Create signature event
        signature_event = SignatureEvent.objects.create(
            version=version,
            token=signing_token,
            signer_name=signer_name,
            ip_address=self.get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            document_sha256=document_sha256,
            field_values=[
                {'field_id': fv['field_id'], 'value': fv['value']}
                for fv in field_values
            ]
        )
        
        # Update version status based on field completion
        version.update_status()
        
        # Handle token conversion based on completion
        if signing_token.single_use:
            # Single-use: convert to view-only after signing
            signing_token.convert_to_view_only()
        else:
            # Multi-use: check if all required fields are now filled
            required_fields = version.fields.filter(required=True)
            unfilled_required = required_fields.filter(
                locked=False
            ).exclude(value__isnull=False).exclude(value='')
            
            if unfilled_required.exists():
                # Still more fields to fill, keep as sign token but mark used
                signing_token.mark_used()
            else:
                # All required fields filled, convert to view-only
                signing_token.convert_to_view_only()
        
        response_serializer = PublicSignResponseSerializer({
            'signature_id': signature_event.id,
            'message': 'Document signed successfully',
            'version_status': version.status,
            'is_single_use': signing_token.single_use
        })
        
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )
    
    @staticmethod
    def get_client_ip(request):
        """Extract client IP from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
