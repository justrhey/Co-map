# Co-Map — Codebase Audit & Sprint Plan

_Generated 2026-06-24. Audit of loopholes, bugs, and missing features, with a prioritized sprint._

---

## Executive summary

The codebase is **more mature than a typical pre-launch app**: 47 passing backend tests, env-driven settings with a production security block (HSTS, secure cookies, SSL redirect), throttling, email verification, profanity filtering, and a Docker/gunicorn deploy path already scaffolded. The gaps are now **specific and finite**, not foundational.

Biggest themes: (1) a few real **security/abuse loopholes**, (2) **production media + static serving** not wired, (3) **no observability or frontend tests**, (4) a handful of **missing product features** (severity, resolve-loop notifications, share).

---

## 🔴 Loopholes & bugs (ranked by severity)

### Security / abuse
1. **Comment endpoint has no rate limit** — `POST /complaints/{id}/comments/` falls under the default `user` throttle (6000/hr). A logged-in user can flood any discussion thread. **Fix:** a dedicated `CommentThrottle` (e.g. 30/hour).
2. **Vote endpoint has no dedicated throttle** — toggle-spam is possible (vote/unvote loops). Lower impact (idempotent count) but still abusable. **Fix:** light throttle.
3. **Resend-verification can be an email bomb** — `POST /auth/resend-verification/` has no throttle; an attacker can spam a victim's inbox with verification mails. **Fix:** throttle by IP + email (e.g. 3/hour).
4. **Login/Register not brute-force throttled beyond the global `anon` 600/hr** — 600 password attempts/hour against a known email is generous. **Fix:** a stricter `auth` scope (e.g. 10/min).
5. **`NUM_PROXIES` defaults to 0** — correct for now, but MUST be set to the real proxy depth at deploy or throttles can be bypassed via `X-Forwarded-For`. **Action item for deploy, not code.**

### Performance
6. **`CommentSerializer.get_is_reporter` N+1** — `obj.complaint.user_id` triggers a query per comment (the FK isn't selected). On a busy thread that's dozens of extra queries. **Fix:** `select_related('complaint')` in the queryset, or pass the complaint's owner via serializer context.
7. **Marker rendering is viewport-filtered but unclustered** — fine at current data volume; if one spot gets very dense, overlapping pins degrade UX and DOM count climbs. **Fix (later):** zoom-based de-overlap or optional spiderfy.

### Production-readiness gaps
8. **Media files served by Django `static()` + stored on local disk** — `urls.py` serves `/media/` via the dev helper, and `MEDIA_ROOT` is a local folder. In prod: (a) a container restart **loses uploaded photos**, (b) Django shouldn't serve media. **Fix:** object storage (S3/GCS via `django-storages`) or at minimum a persistent volume + reverse-proxy media serving.
9. **Static files have no prod server** — `STATIC_ROOT` is set and `collectstatic` runs, but nothing serves it (no WhiteNoise, no nginx rule). **Fix:** add WhiteNoise (cheapest) or nginx.
10. **No error monitoring** — if anything 500s for a real user, nobody knows. **Fix:** Sentry (backend + frontend).

### Quality
11. **Zero frontend tests** — every React regression this project hit (the map crash, the auth redirect) shipped silently. **Fix:** Vitest + a Playwright smoke test of the golden path.
12. **No CI** — tests exist but run manually. **Fix:** GitHub Actions running backend tests on push.

---

## 🟡 Missing features (product)

- **Severity / "how dangerous"** — flagged repeatedly; the genuinely missing dimension. Low/Moderate/Dangerous + dangerous pins ringed on the map.
- **Resolve-loop notifications** — when a report's status changes (Acknowledged/Resolved), the reporter is never told. This is the feature that makes Co-Map *not Facebook*. Needs the email backend (already built) + optional in-app notifications.
- **Share to a report** — deep-link + "Share" (Facebook/copy-link) to attack the "nobody knows it exists" growth problem.
- **8888 / government bridge** — longer-term; structured export or submission to the Presidential Complaint Center.
- **My Reports management** — a user can view but not edit/withdraw their own reports from the UI.

---

## 🗓️ Sprint plan

Two-week sprint, **goal: production-launchable + abuse-hardened.** Ordered so each story unblocks the next.

### Sprint 1 — "Hardened & Shippable" (Week 1)

| # | Story | Est | Why |
|---|-------|-----|-----|
| S1-1 | **Throttle the abuse vectors** — `CommentThrottle` (30/hr), `auth` scope on login/register/resend (10/min, 3/hr) | S | Closes loopholes #1–4 |
| S1-2 | **Fix the `is_reporter` N+1** + add a regression/query-count test | S | Loophole #6 |
| S1-3 | **Static serving via WhiteNoise** | S | Loophole #9 |
| S1-4 | **Persistent media** — env-switchable: local volume in dev, S3/GCS (`django-storages`) in prod | M | Loophole #8 — data-loss risk |
| S1-5 | **Sentry** (backend + frontend) wired behind env DSN | S | Loophole #10 |
| S1-6 | **Deploy doc + `.env.production` template** — gunicorn workers, `NUM_PROXIES`, HTTPS callback URLs, SMTP | S | Ties #5, #8, #9 together |

### Sprint 2 — "Closing the Loop & Growth" (Week 2)

| # | Story | Est | Why |
|---|-------|-----|-----|
| S2-1 | **Severity field** — model + migration, pill picker in form, dangerous pins ringed on map | M | Top product gap |
| S2-2 | **Resolve-loop notifications** — email the reporter on status change; in-app "what changed" | M | The differentiating feature |
| S2-3 | **Frontend test setup** — Vitest + 1 Playwright golden-path smoke test | M | Loophole #11 |
| S2-4 | **CI pipeline** — GitHub Actions: backend tests + frontend build on push | S | Loophole #12 |
| S2-5 | **Share a report** — deep-link route + Share/copy-link button | S | Growth |

_Estimates: S ≈ ½ day, M ≈ 1–2 days._

### Stretch / backlog
- Marker de-overlap at dense zoom (loophole #7)
- My-Reports edit/withdraw
- 8888 government export
- Push notifications (web push)

---

## Recommended first move
**S1-1 (throttles)** — smallest effort, closes the most loopholes, and is pure backend with test coverage. Then **S1-4 (media)** since it's the one true data-loss risk before launch.
