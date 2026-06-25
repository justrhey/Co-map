# Co-Map

![CI](https://github.com/justrhey/Co-map/actions/workflows/test.yml/badge.svg)

A community-powered platform where residents can **pin complaints on a map** — report potholes, broken streetlights, graffiti, and more. Built for scale from day one.

## Features

- **Pin-drop reporting** — tap the map, describe the issue, submit
- **Interactive map** — Leaflet.js with OpenStreetMap tiles + marker clustering
- **Category system** — 10 complaint categories to classify issues
- **Filter pills** — filter complaints by category on the map
- **Detail popups** — click a pin to see full description and details
- **Rate limiting** — 10 submissions per hour per IP
- **Moderation panel** — Django admin for approve/hide/resolve workflows
- **Mobile-first** — responsive design with bottom sheet UI
- **Built for scale** — paginated API, database indexes, Docker ready

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 15+ (PostGIS optional for MVP)
- Redis (optional, for persistent rate limiting)
- Docker (optional, for production deployment)

### 1. Clone & Setup

```bash
git clone <repo-url> complaint-map
cd complaint-map
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb complaints_db
createuser complaints_user --pwprompt  # password: complaints_pass
psql complaints_db -c "GRANT ALL ON SCHEMA public TO complaints_user;"
```

### 3. Run Migrations & Seed Data

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_data  # optional: load sample data
```

### 4. Start the Backend

```bash
python manage.py runserver 0.0.0.0:8000
```

This serves the **API** at `http://localhost:8000/api/` and the **moderation admin**
at `http://localhost:8000/admin/`.

### 5. Start the Frontend (separate Vite dev server)

The map UI is a standalone React app that talks to the API via CORS:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Visit **http://localhost:5173** for the map UI. (Run `npm run build` to produce a
static bundle in `frontend/dist/` for deployment behind your own web server/CDN.)

### Docker (Production)

```bash
docker compose up -d
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/complaints/` | List complaints (paginated, 50/page) |
| `POST` | `/api/complaints/` | Submit a complaint (10/hour limit) |
| `GET` | `/api/complaints/:id/` | Get complaint details |
| `PATCH`/`DELETE` | `/api/complaints/:id/` | Edit/delete — **owner or staff only** |
| `PATCH` | `/api/complaints/:id/status/` | Update status — **staff only** (moderation) |
| `POST` | `/api/complaints/:id/vote/` | Toggle upvote — authenticated |
| `GET` | `/api/public/summary/` | Public aggregate summary |
| `GET` | `/api/public/scores/` | Per-area resolution scores |
| `GET` | `/api/public/analysis/` | Trend/quality insights |
| `GET` | `/api/user/stats/`, `/api/user/profile/` | Reporter stats, badges, XP |
| `POST` | `/api/auth/register/`, `/api/auth/login/`, `/api/auth/logout/` | Email/password auth |
| `GET` | `/api/auth/me/`, `/api/auth/social-urls/` | Profile + SSO provider links |

**Query params**: `?category=potholes` `?status=pending` `?page=2` `?lat=&lng=&radius=` (km)

**POST body**:
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842,
  "description": "Pothole on Main St near the gas station",
  "category": "potholes"
}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Django 6.0 + Django REST Framework |
| **Frontend** | React 19 + Leaflet.js + MarkerCluster |
| **Map Tiles** | OpenStreetMap (free, no API key) |
| **Database** | PostgreSQL (PostGIS-ready for spatial queries) |
| **Rate Limiting** | DRF throttle classes (Redis-ready) |
| **Deployment** | Docker Compose (Django + PostGIS + Redis) |

## Project Structure

```
complaint-map/
  config/              # Django project settings
    settings.py        # DRF, CORS, throttling, database
    urls.py            # API routes + frontend SPA
  complaints/          # Core app
    models.py          # Complaint, Vote, ReportScore, ReportMedia models
    api.py             # Serializers (list, detail, create)
    views.py           # ViewSet + rate limiting + vote action
    admin.py           # Moderation panel
  frontend/            # React 19 + Vite SPA
    src/
      App.jsx          # Main app with page routing
      App.css          # Dark theme + black & white design
      api.js           # API client + auth
      components/
        HomePage.jsx   # Landing page with stats & features
        LoginPage.jsx  # Full-page login/signup
        GlassIcons.jsx # Category icons with glass effect
  docker-compose.yml   # PostGIS + Redis + Django
  Dockerfile           # Production container
```

## Recent Additions

- **Home page** — hero stats, how it works steps, features grid, category chips
- **Full-page authentication** — login/register with Google and GitHub SSO
- **Upvoting system** — authenticated users can toggle upvotes, vote counts on complaints
- **Scoring & gamification** — auto-scored reports with grade letters, XP, and level progression
- **Black & white theme** — monochrome UI chrome with preserved colorful category icons

## License

MIT
