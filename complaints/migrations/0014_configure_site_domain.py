"""
Set the django.contrib.sites domain to match the deployed site.
Without this, allauth generates wrong callback URLs in some code paths.
"""
from django.db import migrations


def set_site_domain(apps, schema_editor):
    Site = apps.get_model('sites', 'Site')
    Site.objects.update_or_create(
        id=1,
        defaults={
            'domain': 'co-map.vercel.app',
            'name': 'Co-Map',
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ('complaints', '0013_alter_complaint_category'),
    ]

    operations = [
        migrations.RunPython(set_site_domain, migrations.RunPython.noop),
    ]
