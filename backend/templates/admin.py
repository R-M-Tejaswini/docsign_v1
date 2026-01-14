from django.contrib import admin
from .models import Template, TemplateField


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ('title', 'page_count', 'created_at')
    search_fields = ('title',)
    readonly_fields = ('page_count', 'created_at', 'updated_at')
    fieldsets = (
        ('Basic Info', {
            'fields': ('title', 'description', 'file')
        }),
        ('Metadata', {
            'fields': ('page_count', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TemplateField)
class TemplateFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'template', 'field_type', 'recipient', 'page_number', 'required')
    list_filter = ('field_type', 'template', 'page_number', 'required')
    search_fields = ('label', 'template__title', 'recipient')
    fieldsets = (
        ('Field Info', {
            'fields': ('template', 'field_type', 'label', 'recipient', 'required')
        }),
        ('Position & Size', {
            'fields': ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        }),
    )
