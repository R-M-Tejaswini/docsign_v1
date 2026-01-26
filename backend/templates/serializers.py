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
    """
    Serializer for TemplateField.

    What:
    - Serializes individual field definitions belonging to a template
      (position, type, recipient, required flag).

    Why:
    - Template fields define the default structure that will later be copied
      into document versions. Strict validation here prevents invalid templates
      from propagating errors downstream.
    """
    
    class Meta:
        model = TemplateField
        fields = [
            'id',
            'field_type',
            'label',
            'recipient',
            'page_number',
            'x_pct',
            'y_pct',
            'width_pct',
            'height_pct',
            'required'
        ]
        read_only_fields = ['id']
    
    def validate_recipient(self, value):
        """
        Ensure recipient is not empty or whitespace.

        Why:
        - Every field must belong to a recipient so that signing responsibility
          is always explicit when a template is converted into a document.
        """
        if not value or not value.strip():
            raise serializers.ValidationError('Recipient must be specified')
        return value.strip()


class TemplateSerializer(serializers.ModelSerializer):
    """
    Full serializer for Template.

    What:
    - Returns template metadata along with all nested fields and recipients.

    Why:
    - Used when viewing or editing a template in detail, where the client
      needs the complete structure to render previews and editors.
    """
    fields = TemplateFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id',
            'title',
            'description',
            'file',
            'file_url',
            'page_count',
            'created_at',
            'updated_at',
            'fields',
            'recipients'
        ]
        read_only_fields = ['id', 'page_count', 'created_at', 'updated_at']
    
    def get_file_url(self, obj):
        """
        Generate file URL for the template PDF.

        What:
        - Returns the relative media URL for the uploaded template file.

        Why:
        - Keeps the API response lightweight and frontend-agnostic,
          allowing the client to decide how to resolve or proxy media URLs.
        """
        if obj.file:
            # Returns something like: /media/templates/3/file.pdf
            return obj.file.url
        return None
    
    def get_recipients(self, obj):
        """
        Get list of unique recipients defined in the template.

        Why:
        - Templates often need to display or validate involved recipients
          before being used to generate documents.
        """
        recipients = obj.get_recipients()
        return sorted(list(set(recipients)))  # Ensure deduplication


class TemplateListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for template list views.

    What:
    - Returns summary-level information about templates without nested fields.

    Why:
    - Optimizes list endpoints by avoiding large payloads while still providing
      enough information for dashboards and selection UIs.
    """
    field_count = serializers.SerializerMethodField()
    recipient_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id',
            'title',
            'description',
            'page_count',
            'field_count',
            'recipient_count',
            'created_at'
        ]
        read_only_fields = ['id', 'page_count', 'created_at']
    
    def get_field_count(self, obj):
        """
        Return number of fields defined in the template.

        Why:
        - Useful for quick overview and complexity estimation in template lists.
        - Optimization: Uses 'field_count' annotation if present to avoid N+1 queries.
        """
        return getattr(obj, 'field_count', obj.fields.count())
    
    def get_recipient_count(self, obj):
        """
        Return number of unique recipients in the template.

        Why:
        - Helps users quickly understand how many signers a template involves.
        """
        return len(obj.get_recipients())


class TemplateCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new template.

    What:
    - Accepts minimal required input (title, description, file).

    Why:
    - Keeps template creation focused and simple; fields and recipients
      are added incrementally after creation.
    """
    
    class Meta:
        model = Template
        fields = ['title', 'description', 'file']
