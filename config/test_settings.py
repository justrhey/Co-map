"""Test settings — run the suite on in-memory SQLite.

Used when the Postgres role can't create a test database. The models use no
Postgres-specific fields, so this exercises the same code paths.
Usage: python manage.py test --settings=config.test_settings
"""
from .settings import *  # noqa: F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# In-memory email so tests can assert on mail.outbox.
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
