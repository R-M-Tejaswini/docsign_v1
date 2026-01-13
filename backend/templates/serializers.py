from rest_framework import serializers
from django.conf import settings
from .models import Template, TemplateField


class TemplateFieldSerializer(serializers.ModelSerializer):
    """Serializer for TemplateField."""
    
    class Meta:
        model = TemplateField
        fields = [
            'id', 'field_type', 'label', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct', 'required'
        ]


class TemplateListSerializer(serializers.ModelSerializer):
    """Serializer for Template list view."""
    
    class Meta:
        model = Template
        fields = ['id', 'name', 'page_count', 'created_at']


class TemplateDetailSerializer(serializers.ModelSerializer):
    """Serializer for Template detail view with nested fields."""
    fields = TemplateFieldSerializer(many=True, read_only=True)
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Template
        fields = ['id', 'name', 'page_count', 'created_at', 'fields', 'file_url']
    
    def get_file_url(self, obj):
        """Get the full URL for the PDF file."""
        request = self.context.get('request')
        if obj.file:
            if request:
                return request.build_absolute_uri(obj.file.url)
            else:
                return f"{settings.BASE_URL}{obj.file.url}"
        return None


class TemplateCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new template."""
    
    class Meta:
        model = Template
        fields = ['name', 'file']
    
    def create(self, validated_data):
        """Create template and compute page count."""
        return Template.objects.create(**validated_data)


class TemplateFieldCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating template fields."""
    
    class Meta:
        model = TemplateField
        fields = [
            'field_type', 'label', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct', 'required'
        ]
    
    def validate_page_number(self, value):
        """Validate page number is within template page count."""
        template = self.context.get('template')
        if template and value > template.page_count:
            raise serializers.ValidationError(
                f'Page number must be between 1 and {template.page_count}'
            )
        return value
    
    def validate(self, data):
        """Validate coordinate bounds."""
        coords = ['x_pct', 'y_pct', 'width_pct', 'height_pct']
        for coord in coords:
            if data.get(coord, 0) < 0 or data.get(coord, 1) > 1:
                raise serializers.ValidationError(
                    f'{coord} must be between 0.0 and 1.0'
                )
        return data