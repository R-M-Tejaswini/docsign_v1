"""
✅ NEW: Add prefilled_text field type and related columns
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0003_documentfield_updated_at_and_more'),  # Adjust to your latest
    ]

    operations = [
        # Add to DocumentField
        migrations.AddField(
            model_name='documentfield',
            name='prefill_value',
            field=models.TextField(blank=True, null=True, help_text="Pre-filled text content"),
        ),
        migrations.AddField(
            model_name='documentfield',
            name='is_editable_prefill',
            field=models.BooleanField(default=False, help_text="If True, prefilled text can be edited"),
        ),
        # Update field_type choices (Django doesn't migrate choice changes, but document the new option)
        migrations.AlterField(
            model_name='documentfield',
            name='field_type',
            field=models.CharField(
                choices=[
                    ('text', 'Text Input'),
                    ('signature', 'Signature'),
                    ('date', 'Date'),
                    ('checkbox', 'Checkbox'),
                    ('initials', 'Initials'),
                    ('prefilled_text', 'Prefilled Text'),
                ],
                max_length=50
            ),
        ),
    ]