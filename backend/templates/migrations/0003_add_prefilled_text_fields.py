"""
✅ NEW: Add prefilled_text field type to TemplateField
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('templates', '0002_add_timestamps_to_templatefield'),
    ]

    operations = [
        migrations.AddField(
            model_name='templatefield',
            name='prefill_value',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='templatefield',
            name='is_editable_prefill',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='templatefield',
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