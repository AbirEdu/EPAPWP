from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional, List
import os, jwt, bcrypt

from app.models import (
    MemberRegistration, MemberRegistrationOut,
    FeedbackCreate, FeedbackOut,
    LoginRequest, TokenResponse, UserCreate, UserOut,
)

app = FastAPI(title="Ekalavya Performing Arts API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MONGO_URL  = os.getenv("MONGO_URL",  "mongodb://mongo:27017")
DB_NAME    = os.getenv("DB_NAME",    "ekalavya")
JWT_SECRET = os.getenv("JWT_SECRET", "ekalavya_jwt_secret_change_in_prod")
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
    if not await db.users.find_one({"username": "admin"}):
        hashed = bcrypt.hashpw(b"Ekalavya@2025", bcrypt.gensalt()).decode()
        await db.users.insert_one({
            "username": "admin", "password": hashed,
            "role": "super_admin", "full_name": "Ekalavya Admin",
            "created_at": datetime.utcnow(), "active": True,
        })
        print("Default admin: username=admin  password=Ekalavya@2025")

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
async def register_member(payload: MemberRegistration, user=Depends(get_current_user)):
    if await app.state.db.members.find_one({"email": payload.email}):
        raise HTTPException(400, "A member with this email is already registered.")
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    doc["status"] = "pending"
    doc["registered_by"] = user["sub"]
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
@app.post("/feedback", response_model=FeedbackOut, tags=["feedback"], status_code=201)
async def submit_feedback(payload: FeedbackCreate):
    doc = payload.dict()
    doc["created_at"] = datetime.utcnow()
    result = await app.state.db.feedback.insert_one(doc)
    return _serialize(await app.state.db.feedback.find_one({"_id": result.inserted_id}))

@app.get("/feedback", response_model=List[FeedbackOut], tags=["feedback"])
async def list_feedback(skip:int=0, limit:int=Query(default=20,le=100), admin=Depends(require_admin)):
    cursor = app.state.db.feedback.find().skip(skip).limit(limit).sort("created_at",-1)
    return [_serialize(i) for i in await cursor.to_list(length=limit)]

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
