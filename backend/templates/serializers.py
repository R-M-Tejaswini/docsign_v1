"""
backend/templates/serializers.py
"""

from rest_framework import serializers
from .models import Template, TemplateField


class TemplateFieldSerializer(serializers.ModelSerializer):
    """Serializer for TemplateField."""
    
    class Meta:
        model = TemplateField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct', 'required',
            'prefill_value', 'is_editable_prefill',
            'template',  # ✅ CRITICAL: Must be in fields
            'created_at', 'updated_at'  # ✅ Add timestamps
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']  # ✅ Template is writable on create
    
    def validate(self, data):
        """✅ UPDATED: Validate prefilled_text specific rules."""
        field_type = data.get('field_type')
        recipient = data.get('recipient')
        is_editable = data.get('is_editable_prefill', False)
        prefill_value = data.get('prefill_value', '')  # ✅ Default to empty string
        
        # ✅ Prefilled text validation
        if field_type == 'prefilled_text':
            # Static prefilled: recipient optional, prefill_value optional on create (user can edit)
            if is_editable and not recipient:
                raise serializers.ValidationError(
                    {'recipient': 'Editable prefilled fields must have a recipient'}
                )
            
            # ✅ FIXED: For static prefilled on creation, allow empty prefill_value
            # User will fill it in the editor
        
        # ✅ For non-prefilled types, clear these fields
        if field_type != 'prefilled_text':
            data['prefill_value'] = None
            data['is_editable_prefill'] = False
        
        return data
    
    def validate_recipient(self, value):
        """Ensure recipient is not empty string (allow None)."""
        if value == '':  # Empty string not allowed
            return None
        return value
    
    def validate_page_number(self, value):
        """Ensure page number is reasonable."""
        if value < 1:
            raise serializers.ValidationError('Page number must be >= 1')
        return value


class TemplateCreateSerializer(serializers.ModelSerializer):
    """✅ FIXED: Serializer for creating templates with proper file handling."""
    
    class Meta:
        model = Template
        fields = ['title', 'description', 'file']
    
    def validate_file(self, value):
        """✅ FIXED: Validate file before save"""
        if not value:
            raise serializers.ValidationError('File is required')
        
        # ✅ Ensure file pointer is at the beginning
        if hasattr(value, 'seek'):
            value.seek(0)
        
        return value
    
    def validate_title(self, value):
        """Validate title is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError('Title is required')
        return value.strip()
    
    def create(self, validated_data):
        """✅ FIXED: Don't manipulate file, let Django handle it"""
        # ✅ Django handles file saving automatically
        template = Template.objects.create(**validated_data)
        return template


class TemplateSerializer(serializers.ModelSerializer):
    """Full serializer for Template."""
    fields = TemplateFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'title', 'description', 'file', 'file_url', 'page_count',
            'created_at', 'updated_at', 'fields', 'recipients'
        ]
        read_only_fields = ['id', 'page_count', 'created_at', 'updated_at']
    
    def get_file_url(self, obj):
        """✅ FIXED: Always return absolute URL"""
        if obj.file:
            request = self.context.get('request')
            if request:
                # ✅ Always use build_absolute_uri for full URL
                return request.build_absolute_uri(obj.file.url)
            else:
                # ✅ Fallback if no request in context
                from django.conf import settings
                return f"{settings.BASE_URL}{obj.file.url}"
        return None
    
    def get_recipients(self, obj):
        return sorted(list(set(obj.get_recipients())))


class TemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for template lists."""
    field_count = serializers.SerializerMethodField()
    recipient_count = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'title', 'description', 'page_count',
            'field_count', 'recipient_count', 'file_url', 'created_at'
        ]
        read_only_fields = ['id', 'page_count', 'created_at']
    
    def get_field_count(self, obj):
        return getattr(obj, 'field_count', obj.fields.count())
    
    def get_recipient_count(self, obj):
        return len(obj.get_recipients())
    
    def get_file_url(self, obj):
        """✅ FIXED: Always return absolute URL"""
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            else:
                from django.conf import settings
                return f"{settings.BASE_URL}{obj.file.url}"
        return None
