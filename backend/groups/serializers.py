"""
backend/groups/serializers.py

Purpose:
- Serializers for Document Groups, Items, and Group-level public tokens.
- Handles validation for adding documents/templates to groups.

Design:
- Uses DocumentGroupService for complex operations (adding items = cloning versions).
- Keeps the API interface clean while performing heavy logic in the service layer.
"""

"""
backend/groups/serializers.py
"""
from rest_framework import serializers
from django.conf import settings
from .models import DocumentGroup, DocumentGroupItem, DocumentGroupToken
from documents.models import Document
from templates.models import Template
from .services import DocumentGroupService

# ... [DocumentGroupItemSerializer remains the same as before] ...
class DocumentGroupItemSerializer(serializers.ModelSerializer):
    document_title = serializers.CharField(source='document.title', read_only=True)
    version_number = serializers.IntegerField(source='version.version_number', read_only=True)
    status = serializers.CharField(source='version.status', read_only=True)
    recipients = serializers.SerializerMethodField()
    document_id = serializers.IntegerField(write_only=True, required=False)
    template_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = DocumentGroupItem
        fields = [
            'id', 'order', 'document', 'version', 'is_locked', 'created_at',
            'document_title', 'version_number', 'status', 'document_id', 'template_id', 'recipients'
        ]
        read_only_fields = ['id', 'document', 'version', 'created_at', 'is_locked']

    def validate(self, data):
        if not data.get('document_id') and not data.get('template_id'):
            raise serializers.ValidationError("Must provide either document_id or template_id.")
        if data.get('document_id') and data.get('template_id'):
            raise serializers.ValidationError("Cannot provide both document_id and template_id.")
        return data

    def create(self, validated_data):
        group = self.context['group']
        document_id = validated_data.get('document_id')
        template_id = validated_data.get('template_id')

        if document_id:
            return DocumentGroupService.add_existing_document(group, document_id)
        elif template_id:
            return DocumentGroupService.add_template(group, template_id)
        return None
    
    def get_recipients(self, obj):
        # Delegate to the version method
        return obj.version.get_recipients()


class DocumentGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for the Document Group itself.
    """
    items = DocumentGroupItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = DocumentGroup
        fields = [
            'id',
            'title',
            'description',
            'is_locked',
            'locked_at',
            'created_at',
            'updated_at',
            'created_by',
            'created_by_name',
            'items'
        ]
        read_only_fields = ['id', 'is_locked', 'locked_at', 'created_at', 'updated_at', 'created_by']

    def get_created_by_name(self, obj):
        # Safe access to username
        if obj.created_by:
            return obj.created_by.username
        return "Unknown"


class DocumentGroupCreateSerializer(serializers.ModelSerializer):
    """
    Simple serializer for creating a new empty group.
    """
    class Meta:
        model = DocumentGroup
        # ✅ Ensure ID is returned so frontend can redirect
        fields = ['id', 'title', 'description']


class DocumentGroupSignLinkSerializer(serializers.Serializer):
    """
    Serializer to generate and return public signing links for a group.
    """
    recipients = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False
    )
    
    def validate(self, data):
        group = self.context['group']
        if not group.is_locked:
            raise serializers.ValidationError("Group must be locked before generating sign links.")
        return data

    def create(self, validated_data):
        group = self.context['group']
        recipients = validated_data['recipients']
        results = []
        
        for recipient in recipients:
            token_obj = DocumentGroupToken.generate(group, recipient)
            url = f"{settings.FRONTEND_BASE_URL}/group-sign/{token_obj.token}"
            results.append({
                'recipient': recipient,
                'token': token_obj.token,
                'url': url
            })
            
        return results
    """
    Serializer to generate and return public signing links for a group.
    
    Input:
    - recipients: List of email/identifier strings.
    
    Output:
    - List of {recipient, url} objects.
    """
    recipients = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False
    )
    
    def validate(self, data):
        """Ensure group is locked before generating links."""
        group = self.context['group']
        if not group.is_locked:
            raise serializers.ValidationError("Group must be locked before generating sign links.")
        return data

    def create(self, validated_data):
        """
        Generate Group Tokens for each recipient.
        
        Returns: List of result dicts.
        """
        group = self.context['group']
        recipients = validated_data['recipients']
        results = []
        
        for recipient in recipients:
            # Generate the unique group token
            token_obj = DocumentGroupToken.generate(group, recipient)
            
            # Build the full URL
            url = f"{settings.FRONTEND_BASE_URL}/group-sign/{token_obj.token}"
            
            results.append({
                'recipient': recipient,
                'token': token_obj.token,
                'url': url
            })
            
        return results