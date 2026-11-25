from __future__ import annotations

"""Core tenant, org, user, and RBAC models."""

from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.base import TimestampMixin, new_uuid, utcnow


class Company(TimestampMixin, table=True):
    __tablename__ = "company"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    currency: Optional[str] = "BDT"
    timezone: Optional[str] = "Asia/Dhaka"
    is_active: bool = True
    is_suspended: bool = False
    suspended_at: Optional[datetime] = None
    # pending | approved | rejected — public signup starts as pending
    approval_status: str = "approved"
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class Brand(TimestampMixin, table=True):
    __tablename__ = "brand"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str = Field(index=True)
    name: str
    is_active: bool = True


class Region(TimestampMixin, table=True):
    __tablename__ = "region"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str


class Store(TimestampMixin, table=True):
    __tablename__ = "store"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    brand_id: Optional[str] = Field(default=None, foreign_key="brand.id")
    region_id: Optional[str] = Field(default=None, foreign_key="region.id")
    code: str = Field(index=True)
    name: str
    address: Optional[str] = None
    is_active: bool = True


class Warehouse(TimestampMixin, table=True):
    __tablename__ = "warehouse"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    code: str
    name: str
    is_active: bool = True


class Counter(TimestampMixin, table=True):
    __tablename__ = "counter"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: str = Field(foreign_key="store.id", index=True)
    code: str
    name: str
    is_active: bool = True


class Role(TimestampMixin, table=True):
    __tablename__ = "role"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    code: str
    name: str
    is_system: bool = False


class Permission(SQLModel, table=True):
    __tablename__ = "permission"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str
    module: str = "core"


class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permission"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    role_id: str = Field(foreign_key="role.id", index=True)
    permission_id: str = Field(foreign_key="permission.id", index=True)
    allowed: bool = True


class UserAccount(TimestampMixin, table=True):
    __tablename__ = "user_account"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    company_id: str = Field(foreign_key="company.id", index=True)
    store_id: Optional[str] = Field(default=None, foreign_key="store.id")
    email: str = Field(index=True)
    username: str = Field(index=True)
    full_name: str
    password_hash: str
    is_active: bool = True
    last_login_at: Optional[datetime] = None
    is_platform_admin: bool = False
    must_change_password: bool = False


class UserRole(SQLModel, table=True):
    __tablename__ = "user_role"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    user_id: str = Field(foreign_key="user_account.id", index=True)
    role_id: str = Field(foreign_key="role.id", index=True)


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_token"
    id: str = Field(default_factory=new_uuid, primary_key=True)
    user_id: str = Field(foreign_key="user_account.id", index=True)
    token_hash: str = Field(index=True)
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=utcnow)
