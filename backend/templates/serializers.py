from rest_framework import serializers
from django.conf import settings
from .models import Template, TemplateField
from .models import (
    TemplateGroup, TemplateGroupItem
)


class TemplateFieldSerializer(serializers.ModelSerializer):
    """Serializer for TemplateField with recipient."""
    
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
    """Serializer for Template with fields and recipients."""
    fields = TemplateFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = [
            'id', 'title', 'description', 'file', 'file_url',
            'page_count', 'created_at', 'updated_at',
            'fields', 'recipients'
        ]
        read_only_fields = ['id', 'page_count', 'created_at', 'updated_at']
    
    def get_file_url(self, obj):
        """Generate file URL."""
        if obj.file:
            # Return just the relative path
            return obj.file.url  # This returns /media/templates/3/file.pdf
        return None
    
    def get_recipients(self, obj):
        """Get list of unique recipients."""
        recipients = obj.get_recipients()
        return sorted(list(set(recipients)))  # Ensure deduplication


class TemplateListSerializer(serializers.ModelSerializer):
    """Serializer for Template list view."""
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
        """Get number of fields."""
        return obj.fields.count()
    
    def get_recipient_count(self, obj):
        """Get number of unique recipients."""
        return len(obj.get_recipients())


class TemplateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a template."""
    
    class Meta:
        model = Template
        fields = ['title', 'description', 'file']


class TemplateGroupItemSerializer(serializers.ModelSerializer):
    template = TemplateSerializer(read_only=True)
    template_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = TemplateGroupItem
        fields = ['id', 'template', 'template_id', 'order']
    
    def validate_template_id(self, value):
        from templates.models import Template
        try:
            Template.objects.get(id=value)
        except Template.DoesNotExist:
            raise serializers.ValidationError("Template not found.")
        return value


class TemplateGroupSerializer(serializers.ModelSerializer):
    items = TemplateGroupItemSerializer(many=True, read_only=True)
    template_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = TemplateGroup
        fields = ['id', 'name', 'description', 'created_at', 'items', 'template_ids']
        read_only_fields = ['id', 'created_at']
    
    def create(self, validated_data):
        template_ids = validated_data.pop('template_ids', [])
        group = TemplateGroup.objects.create(**validated_data)
        
        for order, template_id in enumerate(template_ids, start=1):
            TemplateGroupItem.objects.create(
                group=group,
                template_id=template_id,
                order=order
            )
        
        return group
