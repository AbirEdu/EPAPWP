# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Full-stack web app for Ekalavya Performing Arts & Picture Wicture Productions: a public marketing site with member registration/feedback, plus a JWT-authenticated admin dashboard. No JS/CSS build step anywhere — frontend is hand-authored HTML/CSS/vanilla JS served as static files, and the backend is a single-file-ish FastAPI app.

## Architecture

- `frontend/` — static site, no bundler/npm. Bootstrap 5 and Bootstrap Icons are pulled from CDN in `index.html`/`admin.html`, not installed locally.
  - `index.html` + `js/script.js` + `css/styles.css` — public site (hero, about, registration modal, feedback form).
  - `admin.html` + `js/admin.js` + `css/admin.css` — admin dashboard (separate login screen, member/feedback/user management, stats).
  - Both JS files independently compute an `API_BASE`/`API` constant: `/api` when served on port 80 (i.e. through the nginx container) or `''`, otherwise `http://localhost:8000` for local dev without Docker. Keep these two constants in sync if you change the rule.
  - Admin auth flow spans both files: login on `index.html`'s modal stashes credentials in `sessionStorage` (`eka_pending_admin_user/pass`) and redirects to `admin.html`, which reads them on load and re-authenticates itself. The JWT itself lives in `sessionStorage` as `eka_admin_token`.
  - Neither `admin.js` nor `script.js` has a demo/offline fallback anymore — both used to have hardcoded credentials (`admin`/`Ekalavya@2025`) or "always show success" behavior baked into client-side JS, which is both a security hole (visible in page source) and what silently masked the `/register` 401 bug below (and later, an identical bug in the feedback form — fixed 2026-07-16). Both files now show the real server response, success or failure, on every form.
  - The homepage hero carousel (`#eventCarousel`) is admin-managed: `script.js`'s `loadHeroCarousel()` fetches `GET /carousel/active` and, if it returns ≥1 slide, replaces `#carouselIndicators`/`#carouselInner` and re-inits the Bootstrap `Carousel` instance. If the fetch fails or returns zero slides, the static 3-slide fallback already in `index.html` (Kalakriti 2026 Part 1 / Baraday Shobder Bhid / Kalakriti 2026 Part 2) is left untouched — the homepage never ends up with an empty carousel. Manage slides from the admin panel's **Content** tab.
- `backend/app/main.py` — all FastAPI routes live here (health, `/auth/*`, `/users/*`, `/register`, `/members/*`, `/feedback`, `/carousel*`, `/stats`). `backend/app/models.py` holds every Pydantic request/response model. There's no router-splitting; if you add endpoints, follow the existing single-file convention unless the file grows unwieldy.
- Auth: custom JWT (PyJWT + bcrypt), not FastAPI's OAuth2 helpers. `create_token`/`decode_token`/`get_current_user`/`require_admin` in `main.py` are the whole auth stack. Roles: `volunteer`, `admin`, `super_admin` (`require_admin` accepts `admin` and `super_admin`). If the `users` collection is empty on startup, a super_admin user is created from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars (only used once, on that first run — no hardcoded credentials anywhere in source). If those env vars aren't set and no users exist, the app logs a warning and starts with zero admin users until you set them and restart.
- `/register` is genuinely public (no auth) — matches the frontend's no-login "Join Us" form. It used to require `get_current_user`, which caused every public registration to silently fail with 401 while the frontend showed a fake success message; fixed 2026-07-12.
- MongoDB via Motor (async), hosted on **MongoDB Atlas** (not a local container — there is no `mongo` service in `docker-compose.yml`). Collections: `members`, `feedback`, `video_feedback`, `carousel`, `users`. Indexes and the default admin user are created idempotently in `main.py`'s `startup` event via Motor; there's no separate init script. `MONGO_URL` (an `mongodb+srv://` Atlas connection string) and `JWT_SECRET` are required env vars — `docker-compose.yml` fails fast with a clear error if either is missing from `.env`. Copy `.env.example` to `.env` and fill in real values (`.env` is gitignored).
- Carousel poster images are stored as base64 data URIs directly on the `carousel` document (`poster_image` field), not as files on disk. This was a deliberate choice: `docker-compose.prod.yml`'s `api` service has no volume mount (code is baked into the image at build time), so anything the API writes to its own filesystem would vanish on the next deploy and never reach nginx's `./frontend` bind mount anyway. Base64-in-Mongo sidesteps that entirely at the cost of a larger document (capped at 4MB raw upload via `MAX_POSTER_BYTES` in `main.py`). If this ever needs to change to real file storage, a shared Docker volume between `api` and `frontend` (or S3-style object storage) would be the fix, not a bind mount of `./frontend` into `api`.
- Docs (uploaded PDFs etc.) live under `frontend/docs/`.
- `POST /feedback/video` uploads to the EPA YouTube channel via `backend/app/youtube.py`, which needs `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`/`YOUTUBE_REFRESH_TOKEN` env vars from a one-time OAuth consent flow (`scripts/youtube_oauth_setup.py`, run by the channel owner). `youtube.is_configured()` returns `False` until those are set, and callers degrade gracefully rather than call `upload_video()`.

## Production deployment

`docker-compose.prod.yml` (not `docker-compose.yml`) is what runs on the server — add a `caddy` service in front for automatic HTTPS and stop publishing the `api` container's port 8000 to the internet (nginx already proxies `/api/` to it internally). `Caddyfile` routes `epapwp.in` → `frontend:80` and redirects `www.epapwp.in` → `epapwp.in`. Deploy with `docker compose -f docker-compose.prod.yml up -d --build`.

## Running the stack

Full stack (recommended — matches production topology through nginx on port 80):
```bash
cp .env.example .env   # fill in MONGO_URL (Atlas), JWT_SECRET, and (first run only) ADMIN_USERNAME/ADMIN_PASSWORD
docker compose up --build
```
This starts `api` (FastAPI, 8000, bind-mounted from `./backend` with `--reload`) and `frontend` (nginx serving `./frontend` + proxying `/api/` → `api:8000/`, port 80). Both containers connect out to MongoDB Atlas — there's no local Mongo container to wait on.

Backend only, without Docker:
```bash
cd backend
pip install -r requirements.txt
export MONGO_URL=... JWT_SECRET=...   # same values as .env
uvicorn app.main:app --reload --port 8000
```

Frontend only: open `frontend/index.html` directly in a browser, or serve the `frontend/` directory with any static file server. If not on port 80, `API_BASE` falls back to `http://localhost:8000`, so the backend must be reachable there directly (no nginx proxy) — CORS is wide open (`allow_origins=["*"]`) to support this.

There is no test suite, linter, or build/typecheck command configured in this repo currently.

## Key endpoints (see `backend/app/main.py` for full list)

- `POST /auth/login`, `GET /auth/me` — JWT auth.
- `POST /users`, `GET /users`, `PATCH /users/{username}/active`, `PATCH /users/{username}/password` — admin-only user management.
- `POST /register` (public), `GET /members`, `GET /members/{id}`, `PATCH /members/{id}/status` (admin-only) — member registrations.
- `POST /feedback` (public, always saved as `status: "pending"`), `GET /feedback/approved` (public — only `status: "approved"` items, used by the homepage feedback wall), `GET /feedback` (admin-only, all statuses, optional `?status=` filter), `PATCH /feedback/{id}/status` (admin-only — approve/reject).
- `POST /feedback/video` (public, multipart, uploads to the EPA YouTube channel), `GET /feedback/video/approved` (public), `GET /feedback/video` (admin-only), `PATCH /feedback/video/{id}/status` (admin-only).
- `POST /carousel` (admin-only, multipart — `poster` file + `show_name`/`event_date`/`venue`/`category` [`EPA`|`PWP`]/`description`/`booking_url`/`order`/`active`), `GET /carousel` (admin-only, all slides), `GET /carousel/active` (public, only `active:true`, sorted by `order` — this is what the homepage renders), `PATCH /carousel/{id}` (admin-only, multipart, all fields optional including a replacement `poster`), `DELETE /carousel/{id}` (admin-only). Max 8 active slides enforced server-side (`MAX_ACTIVE_SLIDES`); the admin UI's Content tab warns (but doesn't block) when fewer than 2 are live.
- `GET /stats` (admin-only) — dashboard counts + interest breakdown.

`/docs` (Swagger UI) is available at `http://localhost:8000/docs` when the API is running.
