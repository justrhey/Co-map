"""Minimal settings used ONLY for `collectstatic` during the Vercel build.

The full settings module pulls in env-dependent config (SECRET_KEY guard,
database, allauth social providers) that isn't available — and isn't needed —
when all we're doing is gathering static files. This trims the app set down to
exactly what staticfiles discovery requires, so the build can never fail on a
missing env var or a provider import.
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# A throwaway key — this module never serves requests, only collectstatic.
SECRET_KEY = 'build-only-not-a-secret'
DEBUG = False
ALLOWED_HOSTS = ['*']

# Only the apps that contribute static files (admin + DRF browsable API).
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
]

MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_URL = '/django-static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
