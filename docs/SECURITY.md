# Security Feature Notes — Community Complaint Map

> Audit + hardening guide. Each item explains **How** it works, **Why** it
> matters, and gives **Code** you can apply. Findings are grounded in the actual
> source (`config/settings.py`, `complaints/api.py`, `complaints/views.py`,
> `frontend/src/api.js`).
>
> Status legend: ✅ already implemented · ⚠️ partial / has a gap · ❌ missing

| # | Area | Status |
|---|------|--------|
| 1 | Legal & privacy (GDPR / CCPA) | ✅ **fixed** — consent + policy + export/erasure |
| 2 | Row-Level Security (RLS) | ⚠️ app-layer solid; DB RLS still recommended (needs non-owner DB role — left as a guided migration) |
| 3 | OWASP Top-10 review | ✅ **fixed** — `DEBUG` default, exception handler, audit log (deps scan still TODO) |
| 4 | Client-side validation | ✅ present + **server now verifies image bytes** |
| 5 | `.env` files | ✅ **fixed** — scattered files removed (⚠️ still rotate the leaked OAuth secrets) |
| 6 | API keys in frontend | ✅ clean + CI guard added |
| 7 | Rate limiting | ✅ excellent (set `REDIS_URL`+`DJANGO_NUM_PROXIES` in prod) |
| 8 | Don't leak DB/error logs | ✅ **fixed** — `DEBUG` safe-default + sanitizing handler |

### Applied in this pass
- `config/settings.py` — `DEBUG` defaults to `False`; added `LOGGING` + DRF `EXCEPTION_HANDLER`.
- `config/exception_handler.py` — new: logs full error, returns generic 500.
- `complaints/api.py` — `assert_real_image()` magic-byte check on all image uploads.
- `complaints/views.py` — audit log on `update_status` moderation.
- `complaints/auth.py` + `config/urls.py` — `GET /api/auth/export/` (data export); IP scrub on account delete.
- `frontend/src/components/LoginSheet.jsx` + `frontend/public/privacy.html` — consent gate + privacy policy.
- `scripts/check-frontend-secrets.sh` — CI secret-scan guard.
- Removed `.env.local`, `.env.pulled`, `.env.prod.pulled`, `.env.vercel`.

### Still requires you (can't be done in code)
1. **Rotate the leaked Google + GitHub OAuth secrets** (they sat in a dev `.env`).
2. Set `REDIS_URL` and `DJANGO_NUM_PROXIES=1` in the production environment.
3. Optionally apply the Postgres **RLS** migration in §2 (needs a non-owner DB role).
4. Add `pip-audit` / `npm audit` to CI (§3).

---

## 1. Legal & Privacy Terms — GDPR & CCPA  ❌

**How it works.** GDPR (EU) and CCPA/CPRA (California) require, for any service
that processes personal data: (a) a public privacy policy describing what you
collect and why, (b) a lawful basis / opt-out, (c) the right to access, export,
and erase personal data. This app stores personal data today:

- `Complaint.ip_address` (`complaints/models.py`) — an IP is **personal data**
  under GDPR Recital 30.
- `User.email`, display name, and precise **geolocation** of each report
  (lat/lng is personal data when tied to a user).
- The admin endpoint (`admin_summary`, `views.py:686`) deliberately joins the
  real email onto every report.

**Why it matters.** Collecting IPs + precise location + email without a policy or
a delete path is a direct GDPR/CCPA violation (fines up to 4% of turnover / $7.5k
per CCPA violation). It is also a trust issue for a civic platform.

**Code.**

(a) Add a consent checkbox to the submit + register forms
(`frontend/src/components/SubmitSheet.jsx`, `LoginSheet.jsx`):

```jsx
// LoginSheet.jsx — block register until consent is given
const [agreed, setAgreed] = useState(false);
// ...
{mode === 'register' && (
  <label className="consent-row">
    <input type="checkbox" checked={agreed}
           onChange={(e) => setAgreed(e.target.checked)} />
    I agree to the <a href="/privacy" target="_blank">Privacy Policy</a> and
    consent to my report location being shown publicly.
  </label>
)}
<button type="submit"
        disabled={loading || !email || !password || (mode === 'register' && !agreed)}>
  {mode === 'register' ? 'Create account' : 'Sign in'}
</button>
```

(b) The **right to erasure** is already half-built — `deleteAccount()` exists in
`api.js:195`. Make the backend delete (not just orphan) personal data, and add a
**data-export** endpoint so users can exercise the right of access:

```python
# complaints/auth.py  (or wherever account views live)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_my_data(request):
    """GDPR Art. 15 / CCPA right-to-know: return everything we hold on the user."""
    u = request.user
    reports = u.complaints.values(
        'id', 'category', 'description', 'latitude', 'longitude',
        'ip_address', 'created_at',
    )
    return Response({
        'account': {'email': u.email, 'name': u.first_name, 'joined': u.date_joined},
        'reports': list(reports),
        'comments': list(u.comment_set.values('id', 'body', 'created_at')),
    })

# On account delete: scrub PII instead of leaving orphaned IP + location.
def anonymize_user_reports(user):
    user.complaints.update(ip_address=None)   # drop the IP (personal data)
    # keep the civic report, detach identity (SET_NULL already on the FK)
```

(c) Ship a real policy page. Create `frontend/public/privacy.html` (or a route)
covering: data collected (email, IP, location, media), purpose (civic
reporting), retention, third parties (Supabase storage, Sentry, Google OAuth),
and how to request deletion. Link it from the footer and the consent checkbox.

(d) Minimize IP retention — it is only needed for abuse throttling. Add a purge
job (see §8 cron example) that nulls `ip_address` on reports older than 90 days.

---

## 2. Row-Level Security (RLS)  ⚠️

**How it works today.** Authorization is enforced in the **application layer**,
which is actually well done:

- `IsOwnerOrStaffOrReadOnly` (`views.py:82`) — only the owner or staff may
  edit/delete a report.
- `update_status` is `IsAdminUser` only (`views.py:534`).
- Serializers hide PII (`get_user` returns a display name, never email —
  `api.py:109`).

The gap: there is **no database-level** Row-Level Security. If a query is ever
written without the right `.filter(user=request.user)` (e.g. a future endpoint,
a raw SQL report, or a leaked DB credential), the database itself will not stop
cross-tenant reads. The app already runs on Postgres/Supabase, which supports
native RLS — this is free defense-in-depth.

**Why it matters.** Application-layer checks are a single point of failure
(OWASP A01: Broken Access Control — the #1 risk). DB-level RLS means even a SQL
injection or a misused service key can't read other users' rows.

**Code.** Enable Postgres RLS on the sensitive tables. Run as a migration:

```python
# complaints/migrations/00XX_enable_rls.py
from django.db import migrations

SQL = """
ALTER TABLE complaints_complaint ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints_comment   ENABLE ROW LEVEL SECURITY;

-- App connects as a non-superuser role; set the current user id per request:
--   SET app.current_user_id = '<id>';   (0 = anonymous)
CREATE POLICY complaint_read  ON complaints_complaint
    FOR SELECT USING (true);                       -- map pins are public
CREATE POLICY complaint_write ON complaints_complaint
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::int)
    WITH CHECK   (user_id = current_setting('app.current_user_id', true)::int);
"""
REVERSE = """
DROP POLICY IF EXISTS complaint_write ON complaints_complaint;
DROP POLICY IF EXISTS complaint_read  ON complaints_complaint;
ALTER TABLE complaints_complaint DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints_comment   DISABLE ROW LEVEL SECURITY;
"""

class Migration(migrations.Migration):
    dependencies = [('complaints', '0001_initial')]  # set to latest
    operations = [migrations.RunSQL(SQL, REVERSE)]
```

Then set the GUC per request so policies have an identity to match:

```python
# complaints/middleware.py
from django.db import connection

class RLSContextMiddleware:
    def __init__(self, get_response): self.get_response = get_response
    def __call__(self, request):
        uid = request.user.id if request.user.is_authenticated else 0
        with connection.cursor() as cur:
            cur.execute("SET app.current_user_id = %s", [str(uid)])
        return self.get_response(request)
```

> Note: the Django app role must **not** be a Postgres superuser or table owner,
> or RLS is bypassed. If you use Supabase's PostgREST/JS client directly anywhere,
> RLS is *mandatory* — the anon key exposes every table without it.

---

## 3. OWASP Top-10 Review  ⚠️

A pass against the 2021 Top 10. The app is in good shape; two real gaps.

| OWASP | Finding | Where |
|-------|---------|-------|
| A01 Broken Access Control | ✅ Object perms + admin-only status; ⚠️ no DB RLS (§2) | `views.py:82,534` |
| A02 Cryptographic Failures | ⚠️ `SECRET_KEY` defaults to a known insecure string; HSTS/secure cookies are correctly gated on `DEBUG=False` | `settings.py:13,413` |
| A03 Injection | ✅ ORM everywhere (no raw SQL with user input); profanity + field validators; ✅ React auto-escapes output | `api.py`, `views.py` |
| A04 Insecure Design | ✅ Throttles, ban system, terrain/profanity validation | `views.py:39-79` |
| A05 Security Misconfiguration | ⚠️ `DEBUG` defaults `True`; CORS/CSRF are env-driven (good) | `settings.py:19,203` |
| A06 Vulnerable Components | ⚠️ deps are floor-pinned (`>=`), not locked — add a lockfile + `pip-audit` | `requirements.txt` |
| A07 Auth Failures | ✅ allauth, password validators, `auth` throttle 10/min brute-force cap | `settings.py:185,227` |
| A08 Integrity Failures | ✅ media type/size validated server-side; ⚠️ no `npm audit`/SRI on build | `api.py:32` |
| A09 Logging Failures | ⚠️ no audit log of admin moderation actions | `views.py:534` |
| A10 SSRF | ✅ Overpass terrain call is off by default and not user-URL-driven | `settings.py:198` |

**Key fixes (code):**

```python
# A02/A05 — fail loudly instead of shipping the insecure default, and force
# DEBUG off unless explicitly enabled. (settings.py)
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')
#                                       ^^^^^ flip the default to safe-by-default
```

```bash
# A06/A08 — add dependency scanning to CI (.github/workflows)
pip install pip-audit && pip-audit -r requirements.txt --strict
cd frontend && npm audit --audit-level=high
```

```python
# A09 — audit-log every moderation action in update_status (views.py)
import logging
audit = logging.getLogger('audit')
# inside update_status(), after complaint.save():
audit.info("status_change complaint=%s by=%s %s->%s",
           complaint.id, request.user.id, old_status, new_status)
```

---

## 4. Client-Side Validation  ✅ (with the right caveat)

**How it works.** The submit form already validates in the browser:
`maxLength` caps (`SubmitSheet.jsx:161,233,242,251`), `.trim()` on every text
field (`:91-94`), `accept="image/*"` on file pickers (`:199,224`), live
character counters, and a `disabled` submit button until required fields are
filled (`:118`). Login enforces "at least 8 characters" hinting (`LoginSheet.jsx:56`).

**Why it matters / the caveat.** Client validation is **UX only** — an attacker
calls the API directly with `curl` and skips it entirely. The real security
boundary is the **server**, and that is already strong here:

- `ComplaintCreateSerializer` re-validates lat/lng bounds, file type/size,
  profanity, and field length on the backend (`api.py:193-234`).
- `DATA_UPLOAD_MAX_MEMORY_SIZE = 3 MB` blunts payload-DoS (`settings.py:408`).

So this item is **done** — just never *remove* the server-side checks on the
assumption the client guards them. One hardening add: validate the file's real
bytes (magic number), not just the browser-reported `content_type`, which is
spoofable:

```python
# api.py — verify the image actually decodes, don't trust content_type alone
from PIL import Image
def validate_photo(self, file):
    # ...existing size/type checks...
    try:
        Image.open(file).verify()   # raises if not a real image
        file.seek(0)
    except Exception:
        raise serializers.ValidationError('File is not a valid image.')
    return file
```

---

## 5. `.env` Files  ⚠️

**What I found.**

- ✅ `.gitignore` covers `.env*` and `.env.example` is the only env file tracked
  by git — **no secrets are committed.** Good.
- ✅ `.env.example` contains only placeholders (`change-me`, `your-…`, `xxx`).
- ⚠️ Local `.env` has `DJANGO_SECRET_KEY=change-me-to…` (the **insecure default**,
  33 chars) **and a real `GOOGLE_CLIENT_SECRET` (`GOCSPX-…`)** plus a real
  `GITHUB_CLIENT_SECRET`. A real OAuth secret sitting next to a throwaway Django
  key is a mismatch — if this file is ever copied/shared, the OAuth app is
  compromised.
- ⚠️ **Five** env files are scattered in the repo root: `.env`, `.env.local`,
  `.env.pulled`, `.env.prod.pulled`, `.env.vercel`. The `*.pulled` ones came from
  `vercel env pull`; even though gitignored, scattered prod-pulled secrets on
  disk are an exfiltration risk and easy to leak in a backup/tarball.

**Why it matters.** A leaked `GOOGLE_CLIENT_SECRET` lets an attacker impersonate
your OAuth app. The insecure `SECRET_KEY` (if it ever reaches prod) lets anyone
forge session cookies and password-reset tokens.

**Code / actions.**

```bash
# 1. Generate a real secret for any non-dev environment:
python -c "import secrets; print(secrets.token_urlsafe(50))"

# 2. Collapse the scattered files. Keep ONE local .env, delete pulled copies
#    once consumed (they live in Vercel's dashboard anyway):
rm .env.pulled .env.prod.pulled .env.vercel   # after confirming they're in Vercel

# 3. Verify nothing sensitive is tracked, now and forever:
git ls-files | grep -E '\.env'      # should print ONLY .env.example
git log --all --full-history -- '.env' '.env.*'   # confirm none were ever committed
```

> The app already does the most important thing right (`settings.py:22`): it
> **refuses to boot** with the insecure key when `DEBUG=False`. Keep that guard.
> Action item: **rotate the real Google/GitHub OAuth secrets** since they've sat
> in a dev file, and store prod secrets only in the Vercel dashboard.

---

## 6. API Keys in the Frontend  ✅

**How it works.** I grepped the entire `frontend/src` for `api_key`, `secret`,
`token`, `sk.`, `pk.`, `mapbox`, `AIza`, `GOCSPX`, etc. The only "key" in the
bundle is `import.meta.env.VITE_SENTRY_DSN` (`main.jsx:10`).

**Why it's fine.** Anything Vite exposes must be prefixed `VITE_` and **is baked
into the public JS bundle** — so it must never hold a secret. A Sentry DSN is
*designed* to be public (it's a write-only ingest URL), so this is correct. The
DRF auth token is per-user and stored in `localStorage` after login, not a shared
app secret. No Google/Supabase/DB secret reaches the browser — those stay in the
Django backend (`settings.py`).

**Code (guardrail to keep it that way).** Add a CI check that fails the build if a
real secret pattern ever lands in the frontend:

```bash
# scripts/check-frontend-secrets.sh  (wire into CI before `npm run build`)
if grep -rEn 'GOCSPX-|AIza[0-9A-Za-z_-]{20,}|sk_live_|-----BEGIN' frontend/src; then
  echo "❌ Possible secret committed to frontend bundle"; exit 1
fi
```

> Rule of thumb: if it's `VITE_*`, assume the whole world can read it. Only
> publishable/DSN-style values belong there.

---

## 7. Rate Limiting  ✅ (already excellent — keep as reference)

**How it works.** This is the strongest part of the app. DRF throttling is
configured per-action with sensible scopes (`settings.py:179`, `views.py:39-79`):

| Scope | Limit | Protects against |
|-------|-------|------------------|
| `anon` | 2000/h | public read flooding |
| `user` | 8000/h | authed abuse |
| `submission` | 10/h | spam reports (applied to **both** anon-by-IP and user, so login doesn't bypass it — `views.py:45`) |
| `comment` | 30/h | thread flooding |
| `vote` | 60/h | vote-count spam |
| `auth` | 10/min | **brute-force login** |
| `resend` | 3/h | email-bomb |

**Why the IP handling is notable.** `get_client_ip` + `NUM_PROXIES`
(`views.py:22`, `settings.py:192`) correctly defends against a **spoofed
`X-Forwarded-For`** header: with `NUM_PROXIES=0` it trusts only `REMOTE_ADDR`, so
an attacker can't rotate fake IPs to dodge the per-IP submission cap. Just
remember to set `DJANGO_NUM_PROXIES=1` in prod (behind Vercel/nginx) so the real
client IP is read.

**One gap to close.** The throttle backend uses Django's cache, which in dev is
`LocMemCache` (per-process, resets on restart, not shared across gunicorn
workers — `settings.py:147`). **In production set `REDIS_URL`** so limits are
enforced globally, otherwise each worker counts separately and the effective
limit is `N_workers × rate`.

```bash
# Production env — make throttle counters shared + durable:
REDIS_URL=redis://default:<pw>@<host>:6379/0
DJANGO_NUM_PROXIES=1            # real proxy depth in front of Django
THROTTLE_AUTH=5/min            # optional: tighten brute-force cap further
```

---

## 8. Don't Leak Database / Error Logs  ⚠️

**How it works today (mostly good).**

- The frontend never surfaces raw server errors: `apiFetch` maps any `5xx` to a
  fixed *"Something went wrong on our end."* and parses JSON only when the body
  really is JSON, so a stack-trace HTML page is never shown
  (`api.js:35,94`).
- Sentry runs with `send_default_pii=False` (`settings.py:55`) — user PII isn't
  shipped to the error tracker.
- `health_check` catches DB errors and returns a generic `degraded` without the
  exception text (`views.py:1065`).

**The gap.** `DEBUG` **defaults to `True`** (`settings.py:19`). If
`DJANGO_DEBUG` is ever unset in production, Django serves its full yellow debug
page — **SQL, env vars, settings, and tracebacks exposed to the public**. This is
OWASP A05 and the single highest-impact misconfig here. The local `.env` even has
`DJANGO_DEBUG=True`.

**Why it matters.** A debug page leaks the database schema, the `SECRET_KEY`
fragment, installed apps, and file paths — a complete map for an attacker. Raw DB
errors also leak table/column names that aid SQL injection probing.

**Code.**

```python
# settings.py — default to safe; you must opt IN to debug, never out of it.
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')
```

```python
# settings.py — add explicit logging that records errors server-side but never
# returns them to the client. Pair with a generic DRF exception handler.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'ERROR'},
        'audit':          {'handlers': ['console'], 'level': 'INFO'},
    },
}
```

```python
# config/exception_handler.py — log full detail, return a sanitized message.
from rest_framework.views import exception_handler
import logging
log = logging.getLogger('django.request')

def safe_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:                       # an unhandled 500
        log.exception("Unhandled API error", exc_info=exc)
        from rest_framework.response import Response
        return Response({'detail': 'Internal server error.'}, status=500)
    return response
# settings.py: REST_FRAMEWORK['EXCEPTION_HANDLER'] = 'config.exception_handler.safe_exception_handler'
```

> Also: `backend.log` (~100 KB) sits in the repo root. It's gitignored (`*.log`),
> but rotate/clear it and confirm it never contains plaintext credentials or full
> request bodies.

---

## Priority Summary

Fix in this order — biggest risk reduction first:

1. **Flip `DEBUG` default to `False`** (§3, §8) — one line, removes the worst misconfig.
2. **Rotate the leaked Google/GitHub OAuth secrets** and collapse the scattered `.env*` files (§5).
3. **Set `REDIS_URL` + `DJANGO_NUM_PROXIES=1` in prod** so rate limits actually hold (§7).
4. **Add the GDPR/CCPA privacy policy, consent, export + erasure** (§1) before public launch.
5. **Enable Postgres RLS** as defense-in-depth (§2).
6. **Add `pip-audit` / `npm audit` + the frontend-secret CI guard** (§3, §6).
</content>
</invoke>
