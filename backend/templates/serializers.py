"""
backend/templates/serializers.py

Purpose:
- Define serializers for Template and TemplateField models.
- These serializers control how template data is validated, created,
  and represented in API responses.

Design notes:
- Separate serializers are used for creation, listing, and detailed views
  to keep payloads efficient and intent-specific.
- Field-level validation is applied where business rules require it
  (e.g., recipients must always be defined).
"""

# ----------------------------
# DRF imports
# ----------------------------
from rest_framework import serializers

# ----------------------------
# Django imports
# ----------------------------
from django.conf import settings

# ----------------------------
# Local app imports
# ----------------------------
from .models import Template, TemplateField


class TemplateFieldSerializer(serializers.ModelSerializer):
    """Serializer for TemplateField."""
    
    class Meta:
        model = TemplateField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct', 'required'
        ]
        read_only_fields = ['id']
    
    def validate_recipient(self, value):
        """Ensure recipient is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError('Recipient must be specified')
        return value.strip()


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
        if obj.file:
            return obj.file.url
        return None
    
    def get_recipients(self, obj):
        return sorted(list(set(obj.get_recipients())))


class TemplateListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for template lists."""
    field_count = serializers.SerializerMethodField()
    recipient_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'title', 'description', 'page_count',
            'field_count', 'recipient_count', 'created_at'
        ]
        read_only_fields = ['id', 'page_count', 'created_at']
    
    def get_field_count(self, obj):
        return getattr(obj, 'field_count', obj.fields.count())
    
    def get_recipient_count(self, obj):
        return len(obj.get_recipients())


class TemplateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating templates."""
    
    class Meta:
        model = Template
        fields = ['title', 'description', 'file']
