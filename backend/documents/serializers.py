"""
backend/documents/serializers.py

✅ UPDATED: Fixed field update serializer
"""

from rest_framework import serializers
from .models import Document, DocumentField


class DocumentFieldSerializer(serializers.ModelSerializer):
    """Serializer for DocumentField."""
    
    class Meta:
        model = DocumentField
        fields = [
            'id', 'field_type', 'label', 'recipient', 'page_number',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'required', 'value', 'locked',
            'prefill_value', 'is_editable_prefill',  # ✅ NEW
        ]
        read_only_fields = ['id', 'locked']
    
    def validate(self, data):
        """✅ NEW: Validate prefilled_text specific rules."""
        field_type = data.get('field_type')
        recipient = data.get('recipient')
        is_editable = data.get('is_editable_prefill', False)
        prefill_value = data.get('prefill_value')
        
        # ✅ Prefilled text validation
        if field_type == 'prefilled_text':
            # Static prefilled: recipient optional, prefill_value required
            if not is_editable and not prefill_value:
                raise serializers.ValidationError(
                    {'prefill_value': 'Static prefilled fields must have a prefill_value'}
                )
            
            # Editable prefilled: recipient required
            if is_editable and not recipient:
                raise serializers.ValidationError(
                    {'recipient': 'Editable prefilled fields must have a recipient'}
                )
            
            # Non-prefilled field types should not have these fields set
            # (but allow them to be null/blank for flexibility)
        
        # ✅ For non-prefilled types, prefill_value should be empty
        if field_type != 'prefilled_text':
            data['prefill_value'] = None
            data['is_editable_prefill'] = False
        
        return data


class DocumentFieldUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating DocumentField properties."""
    
    class Meta:
        model = DocumentField
        fields = [
            'value', 'recipient', 'label', 'required',
            'x_pct', 'y_pct', 'width_pct', 'height_pct',
            'prefill_value', 'is_editable_prefill',
        ]
    
    def validate(self, data):
        """✅ FIXED: Validate on update with proper instance access."""
        instance = self.instance
        
        # ✅ CRITICAL: instance might be None if called wrong
        if not instance:
            return data
        
        field_type = instance.field_type  # ✅ Use instance, not data
        is_editable = data.get('is_editable_prefill', instance.is_editable_prefill)
        recipient = data.get('recipient', instance.recipient)
        prefill_value = data.get('prefill_value', instance.prefill_value)
        
        # ✅ Only validate prefilled_text fields
        if field_type == 'prefilled_text':
            # Editable prefilled fields must have recipient
            if is_editable and not recipient:
                raise serializers.ValidationError({
                    'recipient': 'Editable prefilled fields must have a recipient'
                })
        
        return data


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Detailed view for single document."""
    file_url = serializers.SerializerMethodField()
    signed_file_url = serializers.SerializerMethodField()
    recipients = serializers.SerializerMethodField()
    recipient_status = serializers.SerializerMethodField()
    fields = DocumentFieldSerializer(many=True, read_only=True)
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count', 'created_at', 'updated_at',
            'file_url', 'signed_file_url', 'fields', 'recipients', 'recipient_status',
            'signed_pdf_sha256'
        ]
        read_only_fields = fields
    
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
    
    def get_signed_file_url(self, obj):
        """✅ FIXED: Always return absolute URL"""
        if obj.signed_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signed_file.url)
            else:
                from django.conf import settings
                return f"{settings.BASE_URL}{obj.signed_file.url}"
        return None
    
    def get_recipients(self, obj):
        # ✅ OPTIMIZED: Use cached recipient status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return sorted(list(context_cache[obj.id].keys()))
        
        from documents.services import get_document_service
        service = get_document_service()
        recipients = service.get_recipients(obj)
        return recipients
    
    def get_recipient_status(self, obj):
        # ✅ OPTIMIZED: Use cached status from context
        context_cache = self.context.get('_recipient_status_cache', {})
        if obj.id in context_cache:
            return context_cache[obj.id]
        
        from documents.services import get_document_service
        service = get_document_service()
        status = service.get_recipient_status(obj)
        return status


class DocumentListSerializer(serializers.ModelSerializer):
    """Serializer for document lists with basic computed fields."""
    file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count',
            'created_at', 'updated_at', 'file_url'
        ]
        read_only_fields = fields
    
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


class DocumentMinimalListSerializer(serializers.ModelSerializer):
    """Minimal serializer for document lists - no nested data or computed fields."""
    
    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description', 'status', 'page_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields


class DocumentCreateSerializer(serializers.Serializer):
    """Create document from file or template."""
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    template_id = serializers.IntegerField(required=False, allow_null=True)
    file = serializers.FileField(required=False, allow_null=True)
    
    def validate(self, data):
        if not data.get('template_id') and not data.get('file'):
            raise serializers.ValidationError('Either template_id or file must be provided')
        return data
    
    def create(self, validated_data):
        from templates.models import Template
        from django.core.files.base import ContentFile
        import os
        
        template_id = validated_data.pop('template_id', None)
        file = validated_data.pop('file', None)
        
        print(f"📝 Creating document: {validated_data.get('title')}")
        print(f"📋 Template ID: {template_id}, File: {file}")
        
        # ✅ Step 1: Create document WITHOUT file first
        document = Document.objects.create(**validated_data)
        print(f"✅ Document created with ID: {document.id}")
        
        # ✅ Step 2: Copy file from template or use uploaded file
        if template_id:
            print(f"📁 Copying file from template {template_id}")
            try:
                template = Template.objects.get(id=template_id)
                
                # ✅ FIXED: Read template file
                with template.file.open('rb') as f:
                    file_content = f.read()
                
                # ✅ Get filename from template
                filename = os.path.basename(template.file.name)
                print(f"📄 Template filename: {filename}")
                
                # ✅ Save to document (will trigger migration from temp/)
                document.file.save(filename, ContentFile(file_content), save=True)
                print(f"✅ File saved to document: {document.file.name}")
                
            except Template.DoesNotExist:
                raise serializers.ValidationError(f'Template {template_id} not found')
            except Exception as e:
                print(f"❌ Error copying template file: {e}")
                # Delete document if file copy fails
                document.delete()
                raise serializers.ValidationError(f'Failed to copy template file: {str(e)}')
        
        elif file:
            print(f"📁 Using uploaded file: {file.name}")
            try:
                # ✅ Read uploaded file
                file_content = file.read()
                
                # ✅ Save to document (will trigger migration from temp/)
                document.file.save(file.name, ContentFile(file_content), save=True)
                print(f"✅ File saved to document: {document.file.name}")
                
            except Exception as e:
                print(f"❌ Error saving uploaded file: {e}")
                document.delete()
                raise serializers.ValidationError(f'Failed to save file: {str(e)}')
        
        # ✅ Step 3: Copy fields from template
        if template_id:
            print(f"📋 Copying fields from template")
            try:
                template = Template.objects.get(id=template_id)
                fields_to_create = []
                
                for tfield in template.fields.all():
                    fields_to_create.append(
                        DocumentField(
                            document=document,
                            field_type=tfield.field_type,
                            label=tfield.label,
                            recipient=tfield.recipient,
                            page_number=tfield.page_number,
                            x_pct=tfield.x_pct,
                            y_pct=tfield.y_pct,
                            width_pct=tfield.width_pct,
                            height_pct=tfield.height_pct,
                            required=tfield.required
                        )
                    )
                
                if fields_to_create:
                    DocumentField.objects.bulk_create(fields_to_create)
                    print(f"✅ Created {len(fields_to_create)} fields")
                
            except Exception as e:
                print(f"❌ Error copying fields: {e}")
                raise serializers.ValidationError(f'Failed to copy template fields: {str(e)}')
        
        print(f"✅ Document creation complete: {document.id}")
        print(f"📄 Document file: {document.file.name if document.file else 'NONE'}")
        return document