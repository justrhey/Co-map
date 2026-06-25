# Deploying Co-Map to Vercel + Supabase

Architecture:

```
        ┌──────────────────────── Vercel ────────────────────────┐
Browser │  React SPA (frontend/dist, static)                      │
   │    │  /api/* /admin/* /accounts/* /django-static/*           │
   └───▶│        └─▶ Django (api/index.py, Python serverless)     │
        └────────────────────────────┬────────────────────────────┘
                                      │ Postgres (pooler :6543)
                                      ▼      + S3 Storage
                                  Supabase
```

Everything is served from one Vercel domain, so the SPA and API are
same-origin — no CORS headaches. Media uploads go to a Supabase Storage bucket.

---

## 1. Supabase setup

1. Create a project at https://supabase.com → note the **project ref** and **region**.
2. **Database** → Project Settings → Database → copy the **Connection pooler**
   credentials (host ends in `pooler.supabase.com`, port `6543`). Use the pooler,
   not the direct `5432` connection — serverless opens many short connections.
3. **Storage** → New bucket → name it `complaint-media` → mark it **Public**.
4. Project Settings → Storage → **S3 access keys** → New access key → copy the
   key id + secret and the S3 endpoint.

## 2. Push the code

The repo already contains everything Vercel needs:

- `vercel.json` — build + routing (SPA static, Django function, rewrites)
- `api/index.py` — the Django WSGI entrypoint for the Python runtime
- `requirements.txt` — includes `django-storages` + `boto3`

Commit and push to GitHub/GitLab.

## 3. Import into Vercel

1. https://vercel.com → New Project → import the repo.
2. **Framework preset: Other** (the `vercel.json` drives the build).
3. Leave build/output settings empty — `vercel.json` overrides them.
4. Add the environment variables below (copy from `.env.example`).

## 4. Required environment variables (Vercel dashboard)

| Variable | Value |
|---|---|
| `DJANGO_SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | `your-app.vercel.app` |
| `DJANGO_NUM_PROXIES` | `1` |
| `DJANGO_STATIC_URL` | `/django-static/` |
| `POSTGRES_DB` | `postgres` |
| `POSTGRES_USER` | `postgres.<project-ref>` |
| `POSTGRES_PASSWORD` | your Supabase DB password |
| `POSTGRES_HOST` | `aws-0-<region>.pooler.supabase.com` |
| `POSTGRES_PORT` | `6543` |
| `SUPABASE_S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `SUPABASE_S3_REGION` | e.g. `ap-southeast-1` |
| `SUPABASE_S3_BUCKET` | `complaint-media` |
| `SUPABASE_S3_KEY_ID` | Storage access key id |
| `SUPABASE_S3_SECRET` | Storage secret key |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
| `CSRF_TRUSTED_ORIGINS` | `https://your-app.vercel.app` |
| `ACCOUNT_DEFAULT_HTTP_PROTOCOL` | `https` |

Email (so verification works — required because email verification is mandatory):

| `EMAIL_HOST` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `EMAIL_PORT` / `EMAIL_USE_TLS` / `DEFAULT_FROM_EMAIL` |

Optional: `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `SENTRY_DSN`.

## 5. Run migrations (one-time, against Supabase)

The serverless function never runs migrations itself. From your machine, point
Django at Supabase and migrate:

```bash
export POSTGRES_DB=postgres POSTGRES_USER=postgres.<ref> \
       POSTGRES_PASSWORD=... POSTGRES_HOST=aws-0-<region>.pooler.supabase.com \
       POSTGRES_PORT=6543
python manage.py migrate
python manage.py createsuperuser   # for the admin
```

(Re-run `migrate` whenever you ship new migrations.)

## 6. Deploy

Push to the connected branch (or click **Redeploy**). Vercel will:
1. `pip install -r requirements.txt`
2. `python manage.py collectstatic` → bundles admin/DRF assets for WhiteNoise
3. `npm run build` in `frontend/` → SPA to `frontend/dist`

Visit `https://your-app.vercel.app` — SPA loads, `/api/...` hits Django,
`/admin/` shows the styled admin, photo uploads land in Supabase Storage.

---

## Notes & limits

- **Cold starts**: the first request after idle takes a few seconds while the
  Python function spins up. Normal for serverless.
- **OAuth callbacks**: if you enable Google/GitHub, set the callback URL to
  `https://your-app.vercel.app/accounts/<provider>/login/callback/` in their
  consoles, and add the same domain to the Supabase/allauth config.
- **Background AI scoring / Overpass**: any long-running synchronous work counts
  against the 30s function `maxDuration`. Keep `TERRAIN_OVERPASS_ENABLED=False`
  (the default) so submissions don't block on an external call.
- **Redis**: omitted on Vercel; each function instance uses in-process
  LocMemCache. Add an external Redis (Upstash) later if you need shared cache.
