# Ekalavya Performing Arts & Picture Wicture Productions
## Full-Stack Web Application

---

## Project Structure

```
ekalavya/
├── frontend/
│   ├── index.html          # Main website (Bootstrap 5, responsive)
│   ├── css/
│   │   └── styles.css      # Custom styles
│   ├── js/
│   │   └── script.js       # Frontend logic + API calls
│   └── images/             # 👉 Drop your images here
│       ├── logo.png         # Ekalavya logo
│       ├── pw_logo.png      # Picture Wicture logo
│       ├── founder1.jpg    # Biplab Kundu
│       ├── founder2.jpg    # Bodhisatta Sarkar
│       ├── founder3.jpg    # Subarna Kundu
│       ├── event1.jpg      # Carousel slide 1
│       ├── event2.jpg      # Carousel slide 2
│       ├── event3.jpg      # Carousel slide 3
│       ├── performance1.jpg
│       ├── performance2.jpg
│       └── performance3.jpg
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py         # FastAPI routes
│       └── models.py       # Pydantic + MongoDB schemas
├── docker-compose.yml      # Full stack orchestration
├── nginx.conf              # Nginx reverse proxy config
└── .env.example            # Copy to .env and fill in Atlas connection string + JWT secret
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose installed

### Run everything
```bash
git clone <your-repo>
cd ekalavya
cp .env.example .env    # fill in your MongoDB Atlas connection string + JWT_SECRET
docker compose up --build
```

| Service       | URL                          |
|---------------|------------------------------|
| Website       | http://localhost             |
| API docs      | http://localhost:8000/docs   |

Database is MongoDB Atlas (cloud-hosted) — there's no local Mongo container or Mongo Express admin UI anymore. Use the Atlas dashboard to browse/manage data instead.

---

## API Endpoints

### Members (Registrations)
| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| POST   | `/register`                   | Register a new member    |
| GET    | `/members`                    | List all members         |
| GET    | `/members/{id}`               | Get member by ID         |
| PATCH  | `/members/{id}/status`        | Update member status     |

### Feedback
| Method | Endpoint     | Description          |
|--------|--------------|----------------------|
| POST   | `/feedback`  | Submit feedback      |
| GET    | `/feedback`  | List all feedback    |

### Stats
| Method | Endpoint  | Description          |
|--------|-----------|----------------------|
| GET    | `/stats`  | Dashboard statistics |

---

## MongoDB Schema

### `members` collection
```json
{
  "_id": "ObjectId",
  "name": "ABIR BOSE",
  "parent_name": "ANIT KUMAR BOSE",
  "phone": "9686706007",
  "email": "bose.abir@gmail.com",
  "age": 40,
  "dob": "1981-02-25",
  "aadhar": "294528219473",
  "occupation": "Working Professional",
  "organization": "VTU",
  "current_address": "B404, Skylark Esta...",
  "permanent_address": "Lata Niwas, Dumka...",
  "interests": ["Music", "Cinematography"],
  "ratings": {
    "acting": 5, "dance": 3, "music": 8,
    "song": 7, "recitation": 4, "anchoring": 5
  },
  "motivation": "Want to contribute...",
  "status": "pending",
  "created_at": "ISODate"
}
```

### `feedback` collection
```json
{
  "_id": "ObjectId",
  "name": "Priya Sharma",
  "email": "priya@example.com",
  "event": "Dhanni Nobel Chor",
  "message": "Outstanding performance!",
  "created_at": "ISODate"
}
```

---

## Adding Your Logo & Images

1. Copy your `logo.png` to `frontend/images/logo.png`
2. Copy Picture Wicture logo to `frontend/images/pw_logo.png`
3. Add event/founder/performance photos to `frontend/images/`

If images are missing, the site uses tasteful fallbacks (placeholder colors + initials).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in real values (`MONGO_URL`/`JWT_SECRET` are required — the app won't start without them):
```env
MONGO_URL=mongodb+srv://<db-username>:<db-password>@<cluster-name>.mongodb.net/ekalavya?retryWrites=true&w=majority
DB_NAME=ekalavya
JWT_SECRET=<generate with: openssl rand -hex 32>

# Only used once, to create the first admin login if none exists yet:
ADMIN_USERNAME=<pick a real username>
ADMIN_PASSWORD=<pick a strong password>
```
Get the connection string from your MongoDB Atlas dashboard: **Database → Connect → Drivers**. After the first admin account is created, manage additional admin/volunteer accounts from the admin panel's Users tab instead of editing these env vars again.

---

## Development (without Docker)

```bash
# Backend
cd backend
pip install -r requirements.txt
export MONGO_URL=... JWT_SECRET=...   # same values as your .env
uvicorn app.main:app --reload --port 8000

# Frontend - just open frontend/index.html in browser
# Update API_BASE in js/script.js to http://localhost:8000
```

---

## Tech Stack
- **Frontend**: HTML5, Bootstrap 5, Vanilla JS
- **Backend**: Python 3.11, FastAPI, Motor (async MongoDB driver)
- **Database**: MongoDB Atlas (cloud-hosted)
- **Proxy**: Nginx Alpine
- **Containers**: Docker + Docker Compose

---

*Built for Ekalavya Performing Arts & Picture Wicture Productions, Bengaluru*
