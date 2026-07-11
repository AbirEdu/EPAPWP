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
  - Both `script.js` and `admin.js` have a **demo/offline fallback**: if the login API call fails, hardcoded credentials `admin` / `Ekalavya@2025` still grant access with a fake `demo` token, and dashboard/API errors are swallowed so the UI shows a fabricated success state (see `submitRegistration` handler in `script.js`). Be deliberate about preserving or removing this when touching auth/form code — it's intentional graceful-degradation behavior, not dead code.
  - `frontend/js/script.js` calls `${API_BASE}/feedback/video` (lines ~382, ~537) but no matching route exists in `backend/app/main.py` — that endpoint is not implemented yet.
- `backend/app/main.py` — all FastAPI routes live here (health, `/auth/*`, `/users/*`, `/register`, `/members/*`, `/feedback`, `/stats`). `backend/app/models.py` holds every Pydantic request/response model. There's no router-splitting; if you add endpoints, follow the existing single-file convention unless the file grows unwieldy.
- Auth: custom JWT (PyJWT + bcrypt), not FastAPI's OAuth2 helpers. `create_token`/`decode_token`/`get_current_user`/`require_admin` in `main.py` are the whole auth stack. Roles: `volunteer`, `admin`, `super_admin` (`require_admin` accepts `admin` and `super_admin`). A default `admin` / `Ekalavya@2025` super_admin user is auto-created on startup if the `users` collection has none — this is also the demo fallback password used by the frontend.
- `/register` requires `get_current_user` (any authenticated user, not just admin) despite the frontend UI presenting it as a public, no-login form — the frontend sends whatever token it has (real, `demo`, or the literal string `public`) and relies on failures being swallowed.
- MongoDB via Motor (async). Collections: `members`, `feedback`, `users`. Indexes and schema validation are set up in two places that must stay consistent: `mongo-init.js` (runs once via Mongo's docker-entrypoint-initdb, creates the `ekalavya_app` DB user + collection validators) and `main.py`'s `startup` event (creates indexes idempotently via Motor, also seeds the default admin user). `mongo-init.js` only runs on a fresh volume — changes to it don't apply to an existing `mongo_data` volume.
- Docs (uploaded PDFs etc.) live under `frontend/docs/`.

## Running the stack

Full stack (recommended — matches production topology through nginx on port 80):
```bash
docker compose up --build
```
This starts `mongo` (27017), `api` (FastAPI, 8000, bind-mounted from `./backend` with `--reload`), `frontend` (nginx serving `./frontend` + proxying `/api/` → `api:8000/`, port 80), and `mongo-express` (8081, admin/admin123).

Backend only, without Docker:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Requires a reachable MongoDB (set `MONGO_URL`/`DB_NAME` env vars; defaults to `mongodb://mongo:27017` / `ekalavya`, which only resolves inside the compose network — set `MONGO_URL=mongodb://localhost:27017` or similar for standalone local dev).

Frontend only: open `frontend/index.html` directly in a browser, or serve the `frontend/` directory with any static file server. If not on port 80, `API_BASE` falls back to `http://localhost:8000`, so the backend must be reachable there directly (no nginx proxy) — CORS is wide open (`allow_origins=["*"]`) to support this.

There is no test suite, linter, or build/typecheck command configured in this repo currently.

## Key endpoints (see `backend/app/main.py` for full list)

- `POST /auth/login`, `GET /auth/me` — JWT auth.
- `POST /users`, `GET /users`, `PATCH /users/{username}/active`, `PATCH /users/{username}/password` — admin-only user management.
- `POST /register` (auth required), `GET /members`, `GET /members/{id}`, `PATCH /members/{id}/status` (admin-only) — member registrations.
- `POST /feedback` (public), `GET /feedback` (admin-only).
- `GET /stats` (admin-only) — dashboard counts + interest breakdown.

`/docs` (Swagger UI) is available at `http://localhost:8000/docs` when the API is running.
