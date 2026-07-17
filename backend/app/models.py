from pydantic import BaseModel, Field, EmailStr, validator, root_validator
from typing import Optional, List
from datetime import datetime

class SkillRatings(BaseModel):
    acting: int = Field(default=5, ge=1, le=10)
    dance: int = Field(default=5, ge=1, le=10)
    music: int = Field(default=5, ge=1, le=10)
    song: int = Field(default=5, ge=1, le=10)
    recitation: int = Field(default=5, ge=1, le=10)
    anchoring: int = Field(default=5, ge=1, le=10)

VALID_INTERESTS = {"Acting","Dance","Music","Song","Recitation","Anchoring","Direction","Creative Writing","Cinematography"}
VALID_OCCUPATIONS = {"Student","Working Professional","Self Employed","Homemaker","Other"}

class MemberRegistration(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    parent_name: Optional[str] = Field(None, min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=15)
    email: EmailStr
    age: int = Field(..., ge=5, le=100)
    dob: str
    aadhar: Optional[str] = Field(None, max_length=14)
    occupation: str
    organization: Optional[str] = None
    current_address: str = Field(..., min_length=10)
    permanent_address: Optional[str] = None
    interests: List[str] = Field(..., min_items=1)
    ratings: SkillRatings = Field(default_factory=SkillRatings)
    motivation: Optional[str] = None

    @validator("occupation")
    def validate_occupation(cls, v):
        if v not in VALID_OCCUPATIONS: raise ValueError(f"Invalid occupation")
        return v

    @validator("interests", each_item=True)
    def validate_interests(cls, v):
        if v not in VALID_INTERESTS: raise ValueError(f"Invalid interest: {v}")
        return v

    @root_validator
    def validate_parent_name(cls, values):
        age = values.get("age")
        parent_name = values.get("parent_name")
        if age is not None and age < 18 and not (parent_name and parent_name.strip()):
            raise ValueError("Parent's/Guardian's Name is required for registrants under 18")
        return values

class MemberRegistrationOut(MemberRegistration):
    id: str
    status: str = "pending"
    created_at: Optional[datetime] = None
    registered_by: Optional[str] = None
    class Config: orm_mode = True

class FeedbackCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    event: Optional[str] = None
    message: str = Field(..., min_length=5, max_length=2000)

class FeedbackOut(FeedbackCreate):
    id: str
    status: str = "pending"
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

class FeedbackPublicOut(BaseModel):
    id: str
    name: str
    event: Optional[str] = None
    message: str
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

class VideoFeedbackOut(BaseModel):
    id: str
    name: str
    youtube_video_id: str
    duration: Optional[int] = None
    status: str = "pending"
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

VALID_CAROUSEL_CATEGORIES = {"EPA", "PWP"}

class CarouselSlideOut(BaseModel):
    id: str
    show_name: str
    event_date: Optional[str] = None
    venue: Optional[str] = None
    category: str
    description: Optional[str] = None
    booking_url: Optional[str] = None
    poster_image: str
    order: int = 0
    active: bool = True
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

class VideoFeedbackPublicOut(BaseModel):
    id: str
    name: str
    youtube_video_id: str
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

VALID_ANNOUNCEMENT_EFFECTS = {"balloons", "sparkle", "rain", "confetti", "snow", "crackers", "hearts", "none"}

class AnnouncementSettings(BaseModel):
    message: str = Field(..., min_length=1, max_length=200)
    effect: str = Field(default="balloons")
    active: bool = Field(default=True)

    @validator("effect")
    def validate_effect(cls, v):
        if v not in VALID_ANNOUNCEMENT_EFFECTS: raise ValueError(f"Effect must be one of {VALID_ANNOUNCEMENT_EFFECTS}")
        return v

class AnnouncementOut(AnnouncementSettings):
    message: str = Field(default="", max_length=200)  # unlike the input model, "" is valid here — it's the no-announcement-configured-yet state
    updated_at: Optional[datetime] = None
    class Config: orm_mode = True

VALID_PERFORMANCE_CATEGORIES = {"EPA", "PWP"}

class PerformanceCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = None
    youtube_url: str = Field(..., min_length=1)
    category: str

    @validator("category")
    def validate_category(cls, v):
        if v not in VALID_PERFORMANCE_CATEGORIES: raise ValueError("Category must be EPA or PWP")
        return v

class PerformanceOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    youtube_video_id: str
    category: str
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

# Auth models
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    full_name: str
    role: str

VALID_ROLES = {"admin", "super_admin", "volunteer"}

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=120)
    role: str = Field(default="admin")

    @validator("role")
    def validate_role(cls, v):
        if v not in VALID_ROLES: raise ValueError(f"Role must be one of {VALID_ROLES}")
        return v

class UserOut(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    active: bool
    created_at: Optional[datetime] = None
    class Config: orm_mode = True

PyObjectId = str
