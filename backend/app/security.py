from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import re

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,  # explicitly enforce minimum work factor — prevents downgrade
)
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def validate_password_strength(password: str) -> None:
    """Raise ValueError if password doesn't meet production complexity requirements.

    Rules:
      - At least 8 characters
      - At least one uppercase letter (A-Z)
      - At least one digit (0-9)
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit.")


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.jwt_refresh_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    keys = [settings.secret_key]
    if settings.jwt_refresh_secret != settings.secret_key:
        keys.append(settings.jwt_refresh_secret)
    last_exc: JWTError | None = None
    for key in keys:
        try:
            return jwt.decode(token, key, algorithms=[ALGORITHM])
        except JWTError as exc:
            last_exc = exc
    raise ValueError("Invalid token") from last_exc
