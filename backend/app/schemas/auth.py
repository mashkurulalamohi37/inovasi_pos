from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """`email` accepts email OR username (legacy field name kept for clients)."""
    email: str = Field(min_length=1)
    password: str
    company_code: str = Field(min_length=1)
    store_code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    company_id: str
    company_code: Optional[str] = None
    company_name: Optional[str] = None
    store_id: Optional[str]
    store_code: Optional[str] = None
    store_name: Optional[str] = None
    role_code: str
    role_id: str
    permissions: list[str]
    is_platform_admin: bool = False
    support_mode: bool = False
    impersonation_id: Optional[str] = None
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
