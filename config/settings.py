"""
Django settings for the Community Complaint Map platform.
Built with PostGIS + DRF for scale.
"""

from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

from django.core.exceptions import ImproperlyConfigured

_INSECURE_SECRET = 'django-insecure-change-me-in-production!!'
# 🔑 PRODUCTION: Set DJANGO_SECRET_KEY env var to a unique, long random string.
#   Generate one: python -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', _INSECURE_SECRET)

# 🔧 PRODUCTION: Set DJANGO_DEBUG=False when deploying live.
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

# Refuse to run in production with the throwaway dev secret.
if not DEBUG and SECRET_KEY == _INSECURE_SECRET:
    raise ImproperlyConfigured(
        'DJANGO_SECRET_KEY must be set to a unique secret when DEBUG=False.'
    )

# 🌐 PRODUCTION: Set DJANGO_ALLOWED_HOSTS to your domain(s), comma-separated.
#   Example: DJANGO_ALLOWED_HOSTS=comap.example.com,api.comap.example.com
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# On Vercel, every deployment gets a unique *.vercel.app URL. Vercel injects it
# as VERCEL_URL automatically (no dashboard config). Trust it + all *.vercel.app
# so the host check never fails on a fresh deploy, even before custom env vars.
if os.environ.get('VERCEL'):
    ALLOWED_HOSTS += ['.vercel.app']
    _vercel_url = os.environ.get('VERCEL_URL')
    if _vercel_url:
        ALLOWED_HOSTS.append(_vercel_url)
    _vercel_branch_url = os.environ.get('VERCEL_BRANCH_URL')
    if _vercel_branch_url:
        ALLOWED_HOSTS.append(_vercel_branch_url)
    CSRF_TRUSTED_ORIGINS_VERCEL = [
        f'https://{h}' for h in ALLOWED_HOSTS if h.startswith('.') is False and h not in ('localhost', '127.0.0.1')
    ]

# ── Sentry (error monitoring) ────────────────────────────────────
# 📊 Set SENTRY_DSN env var to enable. Get one from https://sentry.io/signup/
#   Backend: captures Django exceptions + performance traces.
#   Frontend: see frontend/src/main.jsx for the browser SDK init.
if os.environ.get('SENTRY_DSN'):
    import sentry_sdk
    sentry_sdk.init(
        dsn=os.environ['SENTRY_DSN'],
        traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        send_default_pii=False,  # Don't send user personal data
    )

# ── Installed Apps ────────────────────────────────────────────────
INSTALLED_APPS = [
    # Local — must come before admin so our template overrides take precedence
    'complaints',

    # Django built-in
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',

    # Third-party
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
]
SITE_ID = 1

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Must be near the top
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # Serve static files in production
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ── Database ──────────────────────────────────────────────────────
# Uses regular PostgreSQL in dev. Switch to `django.contrib.gis.db.backends.postgis`
# and add the PointField back when PostGIS is available for spatial queries.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        # 🗄️ PRODUCTION: Set all POSTGRES_* env vars (DB, USER, PASSWORD, HOST, PORT).
        #   Never hardcode database credentials in the source.
        #   For managed DBs (Railway, Render, Supabase, RDS), copy the
        #   connection details they provide into env vars.
        'NAME': os.environ.get('POSTGRES_DB', 'complaints_db'),
        'USER': os.environ.get('POSTGRES_USER', 'complaints_user'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'complaints_pass'),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        # Supabase's connection pooler (port 6543) runs in transaction mode,
        # which is incompatible with Django's server-side cursors. Disable them
        # when pointed at the pooler so querysets don't error mid-iteration.
        'DISABLE_SERVER_SIDE_CURSORS': os.environ.get('POSTGRES_PORT', '5432') == '6543',
    }
}

# ── Caching (Redis via Django cache) ──────────────────────────────
REDIS_URL = os.environ.get('REDIS_URL')
if REDIS_URL:
    # Use docker-compose redis when available; survives restarts + works across workers
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
        }
    }
else:
    # Dev fallback — resets on restart, doesn't scale across gunicorn workers
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

# ── DRF Configuration ─────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    # Token first: this is a token-based SPA. If SessionAuthentication runs
    # first and a (valid) admin/allauth session cookie is present, it enforces
    # CSRF on POST/PATCH and 403s the token request before the token is read.
    # TokenAuthentication wins for any request carrying an Authorization header;
    # SessionAuthentication remains as a fallback for the admin/browsable API.
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    # Rates are env-overridable so dev can run loose and prod can stay strict.
    # `anon` covers public read endpoints (map/scores/summary) which are hit
    # frequently and legitimately, so it has the most headroom.
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('THROTTLE_ANON', '2000/hour'),
        'user': os.environ.get('THROTTLE_USER', '8000/hour'),
        'submission': os.environ.get('THROTTLE_SUBMISSION', '10/hour'),
        'comment': os.environ.get('THROTTLE_COMMENT', '30/hour'),   # thread-flood protection
        'vote': os.environ.get('THROTTLE_VOTE', '60/hour'),         # vote-toggle spam protection
        'auth': os.environ.get('THROTTLE_AUTH', '10/min'),          # brute-force protection
        'resend': os.environ.get('THROTTLE_RESEND', '3/hour'),      # email-bomb protection
    },
    # Number of trusted reverse proxies in front of the app. Default 0 means
    # the client IP is taken from REMOTE_ADDR and a spoofed X-Forwarded-For
    # header is ignored for throttling. Set to the real proxy depth (e.g. 1
    # behind nginx) in production so throttles can't be bypassed via XFF.
    'NUM_PROXIES': int(os.environ.get('DJANGO_NUM_PROXIES', '0')),
}

# Terrain validation: when True, fall back to a (blocking) Overpass API call
# for coordinates not covered by static water data. Off by default so the
# submission path never makes a synchronous external request.
TERRAIN_OVERPASS_ENABLED = os.environ.get(
    'TERRAIN_OVERPASS_ENABLED', 'False'
).lower() in ('true', '1', 'yes')

# ── CORS ──────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://localhost:5500'
).split(',')

# 🌐 PRODUCTION: Add your frontend domain to CSRF_TRUSTED_ORIGINS.
#   Example: 'https://comap.example.com'
CORS_ALLOW_CREDENTIALS = True

# 🌐 PRODUCTION: set CSRF_TRUSTED_ORIGINS to your deployed origin(s),
#   comma-separated, e.g. https://your-app.vercel.app
CSRF_TRUSTED_ORIGINS = os.environ.get(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://localhost:5174,http://localhost:5500',
).split(',')

# On Vercel, also trust the auto-detected deployment URL(s) for CSRF + always
# emit https links — derived above from VERCEL_URL so this works with no config.
if os.environ.get('VERCEL'):
    CSRF_TRUSTED_ORIGINS += globals().get('CSRF_TRUSTED_ORIGINS_VERCEL', [])
    CSRF_TRUSTED_ORIGINS.append('https://*.vercel.app')
    ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'https'

# ── Auth ──────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

# ── django-allauth configuration ─────────────────────────────────
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_SIGNUP_FIELDS = ['email*', 'password1*', 'password2*']
# Master switch for the custom email-verification gate (RegisterView/LoginView).
# Default OFF: users sign in immediately without confirming their email (no SMTP
# needed). Set REQUIRE_EMAIL_VERIFICATION=true to re-enable once a real email
# provider is wired up.
REQUIRE_EMAIL_VERIFICATION = os.environ.get('REQUIRE_EMAIL_VERIFICATION', 'false').lower() in ('true', '1', 'yes')
# 🚧 PRODUCTION: Set ACCOUNT_EMAIL_VERIFICATION to 'mandatory' to require
ACCOUNT_EMAIL_VERIFICATION = 'mandatory' if REQUIRE_EMAIL_VERIFICATION else 'none'
ACCOUNT_SESSION_REMEMBER = True
# 🔒 PRODUCTION: Set ACCOUNT_DEFAULT_HTTP_PROTOCOL=https so allauth
#   generates HTTPS links for redirects and emails.
ACCOUNT_DEFAULT_HTTP_PROTOCOL = os.environ.get('ACCOUNT_DEFAULT_HTTP_PROTOCOL', 'http')

# After a social login completes, allauth lands here. This view mints a DRF
# token and bounces the user back to the SPA with ?token=… (see auth.py).
LOGIN_REDIRECT_URL = '/api/auth/social-complete/'
# Where the SPA lives (dev: Vite on :5173). The social-complete view redirects
# here with the token appended. Override in prod to the deployed front-end URL.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
# Let allauth start the provider flow on GET (so a plain <a href> works) and
# skip its own intermediate confirmation pages.
SOCIALACCOUNT_LOGIN_ON_GET = True
# Bypass email verification for social logins — Google emails are already
# verified by the provider.
SOCIALACCOUNT_EMAIL_VERIFICATION = 'none'
# Auto-create the account straight from the Google profile. Without this (and
# because ACCOUNT_SIGNUP_FIELDS marks password1/2 required, which OAuth users
# don't have), allauth shows its intermediate /accounts/3rdparty/signup/ form
# and bounces to the bare /accounts/login/ page instead of the SPA.
SOCIALACCOUNT_AUTO_SIGNUP = True

# 🔑 PRODUCTION — Google OAuth setup:
#   1. Go to https://console.cloud.google.com/apis/credentials
#   2. Create OAuth 2.0 Client ID (Web application)
#   3. Add redirect URI: https://yourdomain.com/accounts/google/login/callback/
#   4. Save → copy Client ID and Client Secret
#   5. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars on your server
#   6. Go to OAuth consent screen → Publish (External) so tokens don't expire in 7 days
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
            'secret': os.environ.get('GOOGLE_CLIENT_SECRET', ''),
            'key': '',
        },
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
        # 🔑 Google's emails are already verified (user logged into Google).
        #   Without this, ACCOUNT_EMAIL_VERIFICATION='mandatory' forces all
        #   Google users to verify again—and since no SMTP is configured on
        #   Vercel, the verification email is silently dropped.
        'VERIFIED_EMAIL': True,
    },
}

# ── Email (account verification) ──────────────────────────────────
# Dev: print emails to the console (the verify link shows in the terminal).
# Prod: set EMAIL_HOST/USER/PASSWORD env vars → real SMTP is used automatically.
# 📧 PRODUCTION email setup options (pick one):
#   A. Gmail SMTP — https://myaccount.google.com/apppasswords (generate app password)
#      EMAIL_HOST=smtp.gmail.com  EMAIL_HOST_USER=you@gmail.com
#   B. SendGrid/Mailgun — create API key in their dashboard, use as password
#   C. Transactional service (Resend, Postmark) — follow their SMTP/docs
if os.environ.get('EMAIL_HOST'):
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.environ['EMAIL_HOST']
    EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
    EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
    EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
# 📧 PRODUCTION: Set to a real address like "Co-Map <noreply@yourdomain.com>"
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Co-Map <no-reply@comap.local>')
# How long an email-verification link stays valid (seconds). Default 3 days.
EMAIL_VERIFICATION_MAX_AGE = int(os.environ.get('EMAIL_VERIFICATION_MAX_AGE', str(60 * 60 * 24 * 3)))

# ── Internationalization ──────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ── Static & Media ────────────────────────────────────────────────
# Namespaced under /django-static/ in production so Django admin/DRF assets
# never collide with the Vite SPA's own /assets/ files on Vercel. The rewrite
# in vercel.json routes /django-static/* to the Python function (WhiteNoise).
STATIC_URL = os.environ.get('DJANGO_STATIC_URL', 'static/')
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media: Supabase Storage (S3-compatible) in production, local disk in dev.
# 📦 PRODUCTION: create a public bucket in Supabase → Storage, then set:
#   SUPABASE_S3_ENDPOINT  = https://<project-ref>.storage.supabase.co/storage/v1/s3
#   SUPABASE_S3_REGION    = your project region (e.g. ap-southeast-1)
#   SUPABASE_S3_BUCKET    = the bucket name (e.g. complaint-media)
#   SUPABASE_S3_KEY_ID    = Storage access key id  (Project Settings → Storage → S3 keys)
#   SUPABASE_S3_SECRET    = Storage secret access key
USE_SUPABASE_STORAGE = bool(os.environ.get('SUPABASE_S3_ENDPOINT'))

if USE_SUPABASE_STORAGE:
    _bucket = os.environ['SUPABASE_S3_BUCKET']
    # Supabase serves public objects from /storage/v1/object/public/<bucket>/,
    # NOT the S3 API path. We point django-storages' custom_domain at that public
    # base so file.url builds clean, viewable URLs (without it, S3Storage.url()
    # derives from endpoint_url and returns the private S3 path → 403).
    _supabase_host = (
        os.environ['SUPABASE_S3_ENDPOINT']
        .split('://', 1)[-1]              # strip scheme
        .replace('/storage/v1/s3', '')    # → <ref>.storage.supabase.co
    )
    _public_domain = f"{_supabase_host}/storage/v1/object/public/{_bucket}"

    _media_storage = {
        'BACKEND': 'storages.backends.s3.S3Storage',
        'OPTIONS': {
            'bucket_name': _bucket,
            'endpoint_url': os.environ['SUPABASE_S3_ENDPOINT'],
            'region_name': os.environ.get('SUPABASE_S3_REGION', ''),
            'access_key': os.environ['SUPABASE_S3_KEY_ID'],
            'secret_key': os.environ['SUPABASE_S3_SECRET'],
            'addressing_style': 'path',          # Supabase requires path-style
            'signature_version': 's3v4',
            'file_overwrite': False,
            'default_acl': None,                 # bucket-level public access
            'querystring_auth': False,           # serve clean public URLs
            'custom_domain': _public_domain,     # build public object URLs
            'url_protocol': 'https:',
        },
    }
    MEDIA_URL = f"https://{_public_domain}/"
elif os.environ.get('VERCEL'):
    # Vercel's filesystem is read-only except /tmp. Store uploaded media in
    # /tmp so submissions don't error. ⚠️ Files are lost on cold start — set up
    # Supabase S3 env vars for persistent storage.
    _media_storage = {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
        'OPTIONS': {
            'location': '/tmp/mediafiles',
        },
    }
    MEDIA_URL = '/media/'
    MEDIA_ROOT = '/tmp/mediafiles'
else:
    _media_storage = {'BACKEND': 'django.core.files.storage.FileSystemStorage'}
    MEDIA_URL = 'media/'
    MEDIA_ROOT = BASE_DIR / 'mediafiles'

STORAGES = {
    'default': _media_storage,
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Cap non-file request bodies to blunt memory-exhaustion DoS via giant JSON /
# form payloads. File uploads have their own per-type size limits in api.py.
DATA_UPLOAD_MAX_MEMORY_SIZE = 3 * 1024 * 1024      # 3 MB of non-file fields
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000               # cap field count (default 1000)

# ── Production security ───────────────────────────────────────────
# Applied only when DEBUG is off so local development stays on plain HTTP.
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # Trust the X-Forwarded-Proto header from the reverse proxy (e.g. nginx).
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
