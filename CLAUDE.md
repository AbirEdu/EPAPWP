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
  - Neither `admin.js` nor `script.js` has a demo/offline fallback anymore — both used to have hardcoded credentials (`admin`/`Ekalavya@2025`) or "always show success" behavior baked into client-side JS, which is both a security hole (visible in page source) and what silently masked the `/register` 401 bug below. Removed 2026-07-15; both files now show the real server response, success or failure.
  - `frontend/js/script.js` calls `${API_BASE}/feedback/video` (lines ~382, ~537) but no matching route exists in `backend/app/main.py` — that endpoint is not implemented yet.
- `backend/app/main.py` — all FastAPI routes live here (health, `/auth/*`, `/users/*`, `/register`, `/members/*`, `/feedback`, `/stats`). `backend/app/models.py` holds every Pydantic request/response model. There's no router-splitting; if you add endpoints, follow the existing single-file convention unless the file grows unwieldy.
- Auth: custom JWT (PyJWT + bcrypt), not FastAPI's OAuth2 helpers. `create_token`/`decode_token`/`get_current_user`/`require_admin` in `main.py` are the whole auth stack. Roles: `volunteer`, `admin`, `super_admin` (`require_admin` accepts `admin` and `super_admin`). If the `users` collection is empty on startup, a super_admin user is created from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars (only used once, on that first run — no hardcoded credentials anywhere in source). If those env vars aren't set and no users exist, the app logs a warning and starts with zero admin users until you set them and restart.
- `/register` is genuinely public (no auth) — matches the frontend's no-login "Join Us" form. It used to require `get_current_user`, which caused every public registration to silently fail with 401 while the frontend showed a fake success message; fixed 2026-07-12.
- MongoDB via Motor (async), hosted on **MongoDB Atlas** (not a local container — there is no `mongo` service in `docker-compose.yml`). Collections: `members`, `feedback`, `users`. Indexes and the default admin user are created idempotently in `main.py`'s `startup` event via Motor; there's no separate init script. `MONGO_URL` (an `mongodb+srv://` Atlas connection string) and `JWT_SECRET` are required env vars — `docker-compose.yml` fails fast with a clear error if either is missing from `.env`. Copy `.env.example` to `.env` and fill in real values (`.env` is gitignored).
- Docs (uploaded PDFs etc.) live under `frontend/docs/`.

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
- `GET /stats` (admin-only) — dashboard counts + interest breakdown.

`/docs` (Swagger UI) is available at `http://localhost:8000/docs` when the API is running.
