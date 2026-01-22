from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0007_document_groups'),
    ]

    operations = [
        migrations.AddField(
            model_name='signatureevent',
            name='group_session_token',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),
    ]