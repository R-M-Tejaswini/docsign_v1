from django.contrib import admin
from .models import (
    Document, DocumentVersion, DocumentField,
    SigningToken, SignatureEvent
)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'created_from_template', 'created_at')
    search_fields = ('title',)
    list_filter = ('created_at',)
    readonly_fields = ('created_at',)


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = ('document', 'version_number', 'status', 'page_count', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('document__title',)
    readonly_fields = ('version_number', 'page_count', 'created_at')
    fieldsets = (
        ('Version Info', {
            'fields': ('document', 'version_number', 'file')
        }),
        ('Status', {
            'fields': ('status', 'page_count')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(DocumentField)
class DocumentFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'version', 'field_type', 'locked')
    list_filter = ('field_type', 'locked', 'required')
    search_fields = ('label', 'version__document__title')
    fieldsets = (
        ('Field Info', {
            'fields': ('version', 'field_type', 'label', 'required')
        }),
        ('Position & Size', {
            'fields': ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        }),
        ('Value', {
            'fields': ('value', 'locked')
        }),
    )


@admin.register(SigningToken)
class SigningTokenAdmin(admin.ModelAdmin):
    list_display = ('token', 'version', 'scope', 'used', 'revoked', 'created_at')
    list_filter = ('scope', 'single_use', 'used', 'revoked', 'created_at')
    search_fields = ('token', 'version__document__title')
    readonly_fields = ('token', 'created_at')
    fieldsets = (
        ('Token Info', {
            'fields': ('token', 'version', 'scope')
        }),
        ('Settings', {
            'fields': ('single_use', 'expires_at')
        }),
        ('Status', {
            'fields': ('used', 'revoked')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(SignatureEvent)
class SignatureEventAdmin(admin.ModelAdmin):
    list_display = ('signer_name', 'version', 'signed_at', 'ip_address')
    list_filter = ('signed_at',)
    search_fields = ('signer_name', 'version__document__title', 'ip_address')
    readonly_fields = ('document_sha256', 'signed_at')
    fieldsets = (
        ('Signature Info', {
            'fields': ('version', 'token', 'signer_name')
        }),
        ('Audit Data', {
            'fields': ('signed_at', 'ip_address', 'user_agent', 'document_sha256')
        }),
        ('Field Values', {
            'fields': ('field_values',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('metadata',),
            'classes': ('collapse',)
        }),
    )
