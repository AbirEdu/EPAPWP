from pydantic import BaseModel, Field, EmailStr, validator
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
    parent_name: str = Field(..., min_length=2, max_length=120)
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
