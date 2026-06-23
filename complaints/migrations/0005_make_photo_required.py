from django.db import migrations, models


def delete_complaints_without_photo(apps, schema_editor):
    """Remove complaints that have no photo proof — new policy requires photo."""
    Complaint = apps.get_model('complaints', 'Complaint')
    deleted, _ = Complaint.objects.filter(photo__isnull=True).delete()
    if deleted:
        print(f'  Deleted {deleted} complaint(s) with no photo.')


class Migration(migrations.Migration):

    dependencies = [
        ('complaints', '0004_alter_complaint_status'),
    ]

    operations = [
        migrations.RunPython(delete_complaints_without_photo, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='complaint',
            name='photo',
            field=models.ImageField(
                help_text='Photo of the issue (required)',
                upload_to='complaint_photos/',
            ),
        ),
    ]
