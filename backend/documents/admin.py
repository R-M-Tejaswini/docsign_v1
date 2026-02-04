"""
✅ CLEAN: Only Document and DocumentField admin.
"""
from django.contrib import admin
from .models import Document, DocumentField


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'page_count', 'created_at', 'updated_at')
    list_filter = ('status', 'created_at')
    search_fields = ('title', 'description')
    readonly_fields = ('page_count', 'signed_pdf_sha256', 'created_at', 'updated_at')


@admin.register(DocumentField)
class DocumentFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'document', 'field_type', 'recipient', 'locked', 'required')
    list_filter = ('field_type', 'locked', 'required', 'created_at')
    search_fields = ('label', 'document__title', 'recipient')
