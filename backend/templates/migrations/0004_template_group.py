from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('templates', '0003_alter_template_page_count'),
    ]

    operations = [
        migrations.CreateModel(
            name='TemplateGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='TemplateGroupItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField()),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='templates.templategroup')),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='templates.template')),
            ],
            options={
                'ordering': ['order'],
                'unique_together': {('group', 'order')},
            },
        ),
    ]