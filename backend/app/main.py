from fastapi import FastAPI, HTTPException, Query, Depends, status, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional, List
import asyncio, os, jwt, bcrypt, base64, re

from app.models import (
    MemberRegistration, MemberRegistrationOut,
    FeedbackCreate, FeedbackOut, FeedbackPublicOut,
    VideoFeedbackOut, VideoFeedbackPublicOut, VideoFeedbackLinkCreate,
    LoginRequest, TokenResponse, UserCreate, UserOut,
    CarouselSlideOut, VALID_CAROUSEL_CATEGORIES,
    AnnouncementSettings, AnnouncementOut,
    PerformanceCreate, PerformanceOut,
)
from app import youtube as yt

app = FastAPI(title="Ekalavya Performing Arts API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MONGO_URL  = os.environ["MONGO_URL"]   # MongoDB Atlas connection string, no local fallback
DB_NAME    = os.getenv("DB_NAME", "ekalavya")
JWT_SECRET = os.environ["JWT_SECRET"]  # no insecure default — must be set explicitly
JWT_ALGO   = "HS256"
JWT_EXPIRE = 60 * 8

bearer_scheme = HTTPBearer(auto_error=False)

def create_token(username: str, role: str) -> str:
    payload = {"sub": username, "role": role,
                "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE),
                "iat": datetime.utcnow()}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try: return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError: raise HTTPException(401, "Token expired")
    except: raise HTTPException(401, "Invalid token")

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not creds: raise HTTPException(401, "Not authenticated")
    return decode_token(creds.credentials)

async def require_admin(user=Depends(get_current_user)):
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(403, "Admin access required")
    return user

@app.on_event("startup")
async def startup():
    app.state.mongo = AsyncIOMotorClient(MONGO_URL)
    app.state.db    = app.state.mongo[DB_NAME]
    db = app.state.db
    await db.members.create_index("email", unique=True)
    await db.members.create_index("phone")
    await db.members.create_index("status")
    await db.users.create_index("username", unique=True)
    await db.feedback.create_index("created_at")
    await db.feedback.create_index("status")
    await db.video_feedback.create_index("created_at")
    await db.video_feedback.create_index("status")
    await db.carousel.create_index("active")
    await db.carousel.create_index("order")
    if not await db.users.find_one({}):
        admin_username = os.getenv("ADMIN_USERNAME")
        admin_password = os.getenv("ADMIN_PASSWORD")
        if not admin_username or not admin_password:
            print("No admin user exists yet, and ADMIN_USERNAME/ADMIN_PASSWORD are not set. "
                  "Set them in .env and restart to create the first admin account.")
        else:
            hashed = bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt()).decode()
            await db.users.insert_one({
                "username": admin_username, "password": hashed,
                "role": "super_admin", "full_name": "Administrator",
                "created_at": datetime.utcnow(), "active": True,
            })
            print(f"Created initial admin user: {admin_username}")

@app.on_event("shutdown")
async def shutdown(): app.state.mongo.close()

@app.get("/", tags=["health"])
async def root(): return {"status": "ok"}

@app.get("/health", tags=["health"])
async def health():
    try:
        await app.state.mongo.admin.command("ping")
        return {"status": "healthy"}
    except Exception as e: raise HTTPException(503, str(e))

# AUTH
@app.post("/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(payload: LoginRequest):
    user = await app.state.db.users.find_one({"username": payload.username})
    if not user: raise HTTPException(401, "Invalid username or password")
    if not user.get("active", True): raise HTTPException(403, "Account disabled")
    if not bcrypt.checkpw(payload.password.encode(), user["password"].encode()):
        raise HTTPException(401, "Invalid username or password")
    token = create_token(user["username"], user["role"])
    return {"access_token": token, "token_type": "bearer",
            "username": user["username"], "full_name": user.get("full_name",""), "role": user["role"]}

@app.get("/auth/me", tags=["auth"])
async def me(user=Depends(get_current_user)):
    u = await app.state.db.users.find_one({"username": user["sub"]})
    if not u: raise HTTPException(404, "User not found")
    return {"username": u["username"], "full_name": u.get("full_name",""), "role": u["role"]}

# USERS
@app.post("/users", response_model=UserOut, tags=["users"], status_code=201)
async def create_user(payload: UserCreate, admin=Depends(require_admin)):
    if await app.state.db.users.find_one({"username": payload.username}):
        raise HTTPException(400, "Username already exists")
    hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    doc = {"username": payload.username, "password": hashed, "role": payload.role,
           "full_name": payload.full_name, "created_at": datetime.utcnow(),
           "active": True, "created_by": admin["sub"]}
    result = await app.state.db.users.insert_one(doc)
    created = await app.state.db.users.find_one({"_id": result.inserted_id})
    return _serialize_user(created)

@app.get("/users", response_model=List[UserOut], tags=["users"])
async def list_users(admin=Depends(require_admin)):
    users = await app.state.db.users.find({}, {"password": 0}).to_list(length=100)
    return [_serialize_user(u) for u in users]

@app.patch("/users/{username}/active", tags=["users"])
async def toggle_user(username: str, active: bool, admin=Depends(require_admin)):
    if username == admin["sub"]: raise HTTPException(400, "Cannot disable your own account")
    await app.state.db.users.update_one({"username": username}, {"$set": {"active": active}})
    return {"message": f"User {username} {'enabled' if active else 'disabled'}"}

@app.patch("/users/{username}/password", tags=["users"])
async def change_password(username: str, new_password: str, admin=Depends(require_admin)):
    if len(new_password) < 8: raise HTTPException(400, "Password must be at least 8 characters")
    hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    await app.state.db.users.update_one({"username": username}, {"$set": {"password": hashed}})
    return {"message": "Password updated"}

# MEMBERS
@app.post("/register", response_model=MemberRegistrationOut, tags=["members"], status_code=201)
async def register_member(payload: MemberRegistration):
    if await app.state.db.members.find_one({"email": payload.email}):
        raise HTTPException(400, "A member with this email is already registered.")
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    doc["status"] = "pending"
    result = await app.state.db.members.insert_one(doc)
    created = await app.state.db.members.find_one({"_id": result.inserted_id})
    return _serialize(created)

@app.get("/members", response_model=List[MemberRegistrationOut], tags=["members"])
async def list_members(skip: int=0, limit: int=Query(default=20,le=100),
                       status: Optional[str]=None, interest: Optional[str]=None,
                       admin=Depends(require_admin)):
    query = {}
    if status:   query["status"]    = status
    if interest: query["interests"] = interest
    cursor = app.state.db.members.find(query).skip(skip).limit(limit).sort("created_at",-1)
    return [_serialize(m) for m in await cursor.to_list(length=limit)]

@app.get("/members/{member_id}", response_model=MemberRegistrationOut, tags=["members"])
async def get_member(member_id: str, admin=Depends(require_admin)):
    try: oid = ObjectId(member_id)
    except: raise HTTPException(400, "Invalid ID")
    m = await app.state.db.members.find_one({"_id": oid})
    if not m: raise HTTPException(404, "Not found")
    return _serialize(m)

@app.patch("/members/{member_id}/status", tags=["members"])
async def update_status(member_id: str, status: str, admin=Depends(require_admin)):
    if status not in {"pending","approved","active","inactive"}:
        raise HTTPException(400, "Invalid status")
    try: oid = ObjectId(member_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.members.update_one(
        {"_id": oid}, {"$set": {"status": status, "updated_at": datetime.utcnow()}})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return {"message": f"Status → {status}"}

# FEEDBACK
VALID_FEEDBACK_STATUSES = {"pending", "approved", "rejected"}

@app.post("/feedback", response_model=FeedbackOut, tags=["feedback"], status_code=201)
async def submit_feedback(payload: FeedbackCreate):
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    doc["status"] = "pending"
    result = await app.state.db.feedback.insert_one(doc)
    return _serialize(await app.state.db.feedback.find_one({"_id": result.inserted_id}))

@app.get("/feedback/approved", response_model=List[FeedbackPublicOut], tags=["feedback"])
async def list_approved_feedback(limit: int = Query(default=10, le=50)):
    cursor = app.state.db.feedback.find({"status": "approved"}).sort("created_at", -1).limit(limit)
    return [_serialize(i) for i in await cursor.to_list(length=limit)]

@app.get("/feedback", response_model=List[FeedbackOut], tags=["feedback"])
async def list_feedback(skip:int=0, limit:int=Query(default=20,le=100), status: Optional[str]=None, admin=Depends(require_admin)):
    query = {}
    if status: query["status"] = status
    cursor = app.state.db.feedback.find(query).skip(skip).limit(limit).sort("created_at",-1)
    return [_serialize(i) for i in await cursor.to_list(length=limit)]

@app.patch("/feedback/{feedback_id}/status", tags=["feedback"])
async def update_feedback_status(feedback_id: str, status: str, admin=Depends(require_admin)):
    if status not in VALID_FEEDBACK_STATUSES:
        raise HTTPException(400, "Invalid status")
    try: oid = ObjectId(feedback_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.feedback.update_one({"_id": oid}, {"$set": {"status": status}})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return {"message": f"Status → {status}"}

@app.delete("/feedback/{feedback_id}", tags=["feedback"])
async def delete_feedback(feedback_id: str, admin=Depends(require_admin)):
    try: oid = ObjectId(feedback_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.feedback.delete_one({"_id": oid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Feedback deleted"}

# VIDEO FEEDBACK
VALID_VIDEO_STATUSES = {"pending", "approved", "rejected"}
MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100MB

@app.post("/feedback/video", response_model=VideoFeedbackOut, tags=["feedback"], status_code=201)
async def submit_video_feedback(
    name: str = Form(..., min_length=2, max_length=120),
    duration: int = Form(0),
    video: UploadFile = File(...),
):
    if not yt.is_configured():
        raise HTTPException(503, "Video feedback isn't available right now. Please try written feedback instead.")
    contents = await video.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(400, "Video file is too large (max 100MB).")

    try:
        video_id = await asyncio.to_thread(
            yt.upload_video, contents,
            f"EPA Feedback — {name}",
            f"Video feedback submitted by {name} via the Ekalavya Performing Arts website.",
        )
    except Exception as e:
        raise HTTPException(502, f"Video upload failed: {e}")

    doc = {
        "name": name,
        "youtube_video_id": video_id,
        "duration": duration,
        "status": "pending",
        "created_at": datetime.utcnow(),
    }
    result = await app.state.db.video_feedback.insert_one(doc)
    created = await app.state.db.video_feedback.find_one({"_id": result.inserted_id})
    return _serialize(created)

@app.post("/feedback/video/link", response_model=VideoFeedbackOut, tags=["feedback"], status_code=201)
async def add_video_feedback_link(payload: VideoFeedbackLinkCreate, admin=Depends(require_admin)):
    # Admin-curated shortcut: paste an existing YouTube link instead of uploading a
    # file. Stored in the same video_feedback collection as uploaded submissions
    # (just the extracted ID, like performances) and pre-approved since the admin
    # is the one adding it — it appears on the Wall of Applause immediately.
    doc = {
        "name": payload.name,
        "youtube_video_id": extract_youtube_video_id(payload.youtube_url),
        "duration": None,
        "status": "approved",
        "created_at": datetime.utcnow(),
    }
    result = await app.state.db.video_feedback.insert_one(doc)
    created = await app.state.db.video_feedback.find_one({"_id": result.inserted_id})
    return _serialize(created)

@app.get("/feedback/video/approved", response_model=List[VideoFeedbackPublicOut], tags=["feedback"])
async def list_approved_video_feedback(limit: int = Query(default=12, le=50)):
    cursor = app.state.db.video_feedback.find({"status": "approved"}).sort("created_at", -1).limit(limit)
    return [_serialize(i) for i in await cursor.to_list(length=limit)]

@app.get("/feedback/video", response_model=List[VideoFeedbackOut], tags=["feedback"])
async def list_video_feedback(skip:int=0, limit:int=Query(default=20,le=100), status: Optional[str]=None, admin=Depends(require_admin)):
    query = {}
    if status: query["status"] = status
    cursor = app.state.db.video_feedback.find(query).skip(skip).limit(limit).sort("created_at",-1)
    return [_serialize(i) for i in await cursor.to_list(length=limit)]

@app.patch("/feedback/video/{video_id}", response_model=VideoFeedbackOut, tags=["feedback"])
async def update_video_feedback(video_id: str, payload: VideoFeedbackLinkCreate, admin=Depends(require_admin)):
    # Lets an admin correct the name or swap the underlying YouTube video for any
    # video_feedback entry — whether it was uploaded via the public form or added
    # by URL — without touching its status.
    try: oid = ObjectId(video_id)
    except: raise HTTPException(400, "Invalid ID")
    existing = await app.state.db.video_feedback.find_one({"_id": oid})
    if not existing: raise HTTPException(404, "Not found")
    update = {
        "name": payload.name,
        "youtube_video_id": extract_youtube_video_id(payload.youtube_url),
    }
    await app.state.db.video_feedback.update_one({"_id": oid}, {"$set": update})
    return _serialize(await app.state.db.video_feedback.find_one({"_id": oid}))

@app.patch("/feedback/video/{video_id}/status", tags=["feedback"])
async def update_video_feedback_status(video_id: str, status: str, admin=Depends(require_admin)):
    if status not in VALID_VIDEO_STATUSES:
        raise HTTPException(400, "Invalid status")
    try: oid = ObjectId(video_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.video_feedback.update_one({"_id": oid}, {"$set": {"status": status}})
    if r.matched_count == 0: raise HTTPException(404, "Not found")
    return {"message": f"Status → {status}"}

@app.delete("/feedback/video/{video_id}", tags=["feedback"])
async def delete_video_feedback(video_id: str, admin=Depends(require_admin)):
    try: oid = ObjectId(video_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.video_feedback.delete_one({"_id": oid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Video feedback deleted"}

# CAROUSEL (homepage hero content management)
MAX_POSTER_BYTES = 4 * 1024 * 1024  # 4MB
VALID_POSTER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_ACTIVE_SLIDES = 8

async def _read_poster(poster: UploadFile) -> str:
    if poster.content_type not in VALID_POSTER_TYPES:
        raise HTTPException(400, "Poster must be a JPEG, PNG, or WEBP image.")
    contents = await poster.read()
    if len(contents) > MAX_POSTER_BYTES:
        raise HTTPException(400, "Poster image is too large (max 4MB).")
    b64 = base64.b64encode(contents).decode()
    return f"data:{poster.content_type};base64,{b64}"

@app.post("/carousel", response_model=CarouselSlideOut, tags=["carousel"], status_code=201)
async def create_carousel_slide(
    show_name: str = Form(..., min_length=2, max_length=120),
    event_date: Optional[str] = Form(None),
    venue: Optional[str] = Form(None),
    category: str = Form(...),
    description: Optional[str] = Form(None, max_length=300),
    booking_url: Optional[str] = Form(None),
    order: int = Form(0),
    active: bool = Form(True),
    poster: UploadFile = File(...),
    admin=Depends(require_admin),
):
    if category not in VALID_CAROUSEL_CATEGORIES:
        raise HTTPException(400, "Category must be EPA or PWP")
    if active:
        active_count = await app.state.db.carousel.count_documents({"active": True})
        if active_count >= MAX_ACTIVE_SLIDES:
            raise HTTPException(400, f"Maximum of {MAX_ACTIVE_SLIDES} active slides reached. Deactivate one first.")
    poster_data = await _read_poster(poster)
    doc = {
        "show_name": show_name, "event_date": event_date or None, "venue": venue or None,
        "category": category, "description": description or None, "booking_url": booking_url or None,
        "poster_image": poster_data, "order": order, "active": active,
        "created_at": datetime.utcnow(),
    }
    result = await app.state.db.carousel.insert_one(doc)
    created = await app.state.db.carousel.find_one({"_id": result.inserted_id})
    return _serialize(created)

@app.get("/carousel/active", response_model=List[CarouselSlideOut], tags=["carousel"])
async def list_active_carousel_slides():
    cursor = app.state.db.carousel.find({"active": True}).sort([("order", 1), ("created_at", 1)]).limit(MAX_ACTIVE_SLIDES)
    return [_serialize(s) for s in await cursor.to_list(length=MAX_ACTIVE_SLIDES)]

@app.get("/carousel", response_model=List[CarouselSlideOut], tags=["carousel"])
async def list_carousel_slides(admin=Depends(require_admin)):
    cursor = app.state.db.carousel.find({}).sort([("order", 1), ("created_at", 1)])
    return [_serialize(s) for s in await cursor.to_list(length=100)]

@app.patch("/carousel/{slide_id}", response_model=CarouselSlideOut, tags=["carousel"])
async def update_carousel_slide(
    slide_id: str,
    show_name: str = Form(..., min_length=2, max_length=120),
    event_date: Optional[str] = Form(None),
    venue: Optional[str] = Form(None),
    category: str = Form(...),
    description: Optional[str] = Form(None, max_length=300),
    booking_url: Optional[str] = Form(None),
    order: int = Form(0),
    active: bool = Form(True),
    poster: Optional[UploadFile] = File(None),
    admin=Depends(require_admin),
):
    # Full replace, not a sparse patch: the admin form always submits every field
    # (see admin.js), and FastAPI's Form(None) collapses an empty string to None
    # indistinguishably from "field not sent" — so a sparse "only update if not
    # None" approach can never actually clear a field like booking_url.
    try: oid = ObjectId(slide_id)
    except: raise HTTPException(400, "Invalid ID")
    existing = await app.state.db.carousel.find_one({"_id": oid})
    if not existing: raise HTTPException(404, "Not found")

    if category not in VALID_CAROUSEL_CATEGORIES:
        raise HTTPException(400, "Category must be EPA or PWP")
    if active and not existing.get("active"):
        active_count = await app.state.db.carousel.count_documents({"active": True})
        if active_count >= MAX_ACTIVE_SLIDES:
            raise HTTPException(400, f"Maximum of {MAX_ACTIVE_SLIDES} active slides reached. Deactivate one first.")

    update = {
        "show_name": show_name,
        "event_date": event_date or None,
        "venue": venue or None,
        "category": category,
        "description": description or None,
        "booking_url": booking_url or None,
        "order": order,
        "active": active,
    }
    if poster is not None and poster.filename: update["poster_image"] = await _read_poster(poster)

    await app.state.db.carousel.update_one({"_id": oid}, {"$set": update})
    updated = await app.state.db.carousel.find_one({"_id": oid})
    return _serialize(updated)

@app.delete("/carousel/{slide_id}", tags=["carousel"])
async def delete_carousel_slide(slide_id: str, admin=Depends(require_admin)):
    try: oid = ObjectId(slide_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.carousel.delete_one({"_id": oid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Slide deleted"}

# ANNOUNCEMENT BANNER — single settings document (not a list like carousel),
# upserted in place. GET is public so the homepage overlay can render it.
DEFAULT_ANNOUNCEMENT = {"message": "", "effect": "none", "active": False, "updated_at": None}

@app.get("/announcement", response_model=AnnouncementOut, tags=["announcement"])
async def get_announcement():
    doc = await app.state.db.announcement.find_one({})
    return doc or DEFAULT_ANNOUNCEMENT

@app.patch("/announcement", response_model=AnnouncementOut, tags=["announcement"])
async def update_announcement(payload: AnnouncementSettings, admin=Depends(require_admin)):
    update = payload.dict()
    update["updated_at"] = datetime.utcnow()
    await app.state.db.announcement.update_one({}, {"$set": update}, upsert=True)
    return await app.state.db.announcement.find_one({})

# PERFORMANCES — admin-curated video list for the homepage "Recent
# Performances" grid. The submitted YouTube URL itself isn't stored — only
# the video ID extracted from it server-side, so the frontend never has to
# parse it. The admin edit form reconstructs a canonical watch URL from that
# ID to prefill the field (see script.js/admin.js).
YOUTUBE_ID_RE = re.compile(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})")

def extract_youtube_video_id(url: str) -> str:
    m = YOUTUBE_ID_RE.search(url)
    if not m:
        raise HTTPException(400, "Couldn't find a YouTube video ID in that URL. Paste a full youtube.com or youtu.be link.")
    return m.group(1)

@app.post("/performances", response_model=PerformanceOut, tags=["performances"], status_code=201)
async def create_performance(payload: PerformanceCreate, admin=Depends(require_admin)):
    doc = {
        "title": payload.title,
        "description": payload.description or None,
        "location": payload.location or None,
        "youtube_video_id": extract_youtube_video_id(payload.youtube_url),
        "category": payload.category,
        "created_at": datetime.utcnow(),
    }
    result = await app.state.db.performances.insert_one(doc)
    created = await app.state.db.performances.find_one({"_id": result.inserted_id})
    return _serialize(created)

@app.get("/performances", response_model=List[PerformanceOut], tags=["performances"])
async def list_performances():
    cursor = app.state.db.performances.find({}).sort([("created_at", -1)])
    return [_serialize(p) for p in await cursor.to_list(length=200)]

@app.patch("/performances/{performance_id}", response_model=PerformanceOut, tags=["performances"])
async def update_performance(performance_id: str, payload: PerformanceCreate, admin=Depends(require_admin)):
    try: oid = ObjectId(performance_id)
    except: raise HTTPException(400, "Invalid ID")
    existing = await app.state.db.performances.find_one({"_id": oid})
    if not existing: raise HTTPException(404, "Not found")
    update = {
        "title": payload.title,
        "description": payload.description or None,
        "location": payload.location or None,
        "youtube_video_id": extract_youtube_video_id(payload.youtube_url),
        "category": payload.category,
    }
    await app.state.db.performances.update_one({"_id": oid}, {"$set": update})
    return _serialize(await app.state.db.performances.find_one({"_id": oid}))

@app.delete("/performances/{performance_id}", tags=["performances"])
async def delete_performance(performance_id: str, admin=Depends(require_admin)):
    try: oid = ObjectId(performance_id)
    except: raise HTTPException(400, "Invalid ID")
    r = await app.state.db.performances.delete_one({"_id": oid})
    if r.deleted_count == 0: raise HTTPException(404, "Not found")
    return {"message": "Performance deleted"}

# STATS
@app.get("/stats", tags=["stats"])
async def stats(admin=Depends(require_admin)):
    db = app.state.db
    total    = await db.members.count_documents({})
    pending  = await db.members.count_documents({"status":"pending"})
    approved = await db.members.count_documents({"status":"approved"})
    active   = await db.members.count_documents({"status":"active"})
    fb_count = await db.feedback.count_documents({})
    pipeline = [{"$unwind":"$interests"},{"$group":{"_id":"$interests","count":{"$sum":1}}},{"$sort":{"count":-1}}]
    interest_stats = await db.members.aggregate(pipeline).to_list(length=20)
    return {"members":{"total":total,"pending":pending,"approved":approved,"active":active},
            "feedback":{"total":fb_count},
            "interests":{i["_id"]:i["count"] for i in interest_stats}}

def _serialize(doc):
    doc["id"] = str(doc.pop("_id"))
    return doc

def _serialize_user(doc):
    doc = {k:v for k,v in doc.items() if k != "password"}
    doc["id"] = str(doc.pop("_id"))
    return doc
