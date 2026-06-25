# CI Secrets Checklist

The **default** Co-Map pipeline (`test.yml`, `burn-in.yml`) requires **no
secrets** — tests run on in-memory SQLite with a locmem email backend, and the
frontend only lints and builds.

Configure the secrets below **only** when you enable the matching optional
feature. Add them under **GitHub → repo → Settings → Secrets and variables →
Actions**.

## Currently required

| Secret | Needed for | Status |
|---|---|---|
| _(none)_ | Default lint/test/build pipeline | ✅ Nothing to configure |

## Optional — add when the feature is enabled

| Secret | Needed for | Notes |
|---|---|---|
| `SLACK_WEBHOOK` | Slack failure notifications | Incoming-webhook URL; only if you add a notify step |
| `CODECOV_TOKEN` | Coverage upload to Codecov | Only for private repos |
| `DATABASE_URL` | Testing against a real Postgres service | Only if you stop using `test_settings` SQLite |
| `DJANGO_SECRET_KEY` | Running checks that require a non-default key | The suite uses a dev default; set if you add deploy stages |

## Security best practices

- Never commit secrets to the repo or `.env`. Use GitHub Actions secrets.
- Scope secrets to environments (e.g. a `production` environment) when used in deploy jobs.
- Rotate any secret that was ever printed in logs.
- The `GITHUB_TOKEN` is provided automatically; do not create a PAT unless a job needs cross-repo access.

## Reminder for this repo

A real Google OAuth client secret currently lives in `.env`
(`GOOGLE_CLIENT_SECRET`). **Rotate it before production** and move deploy-time
secrets into GitHub Actions secrets rather than the committed `.env`.
