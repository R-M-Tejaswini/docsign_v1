from django.contrib import admin
from .models import Template, TemplateField


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'page_count', 'created_at')
    search_fields = ('name',)
    readonly_fields = ('page_count', 'created_at')
    fieldsets = (
        ('Basic Info', {
            'fields': ('name', 'file')
        }),
        ('Metadata', {
            'fields': ('page_count', 'created_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TemplateField)
class TemplateFieldAdmin(admin.ModelAdmin):
    list_display = ('label', 'template', 'field_type', 'page_number')
    list_filter = ('field_type', 'template', 'page_number')
    search_fields = ('label', 'template__name')
    fieldsets = (
        ('Field Info', {
            'fields': ('template', 'field_type', 'label', 'required')
        }),
        ('Position & Size', {
            'fields': ('page_number', 'x_pct', 'y_pct', 'width_pct', 'height_pct')
        }),
    )
