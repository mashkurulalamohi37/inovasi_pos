from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.services.readiness_service import build_readiness
from fastapi import APIRouter, Response

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
def system_health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "database": "connected" if db_ok else "disconnected",
        "environment": settings.environment,
    }


@router.get("/readiness")
def system_readiness(response: Response):
    payload = build_readiness(engine)
    if not payload["ready"]:
        response.status_code = 503
    return payload


@router.get("/version")
def system_version():
    return {
        "service": settings.app_name,
        "version": "1.0.0-production",
        "api_prefix": settings.api_v1_prefix,
        "build": "phases-1-8-complete",
        "phases": {
            "foundation": True,
            "inventory": True,
            "procurement": True,
            "sales": True,
            "integrations": True,
            "reporting": True,
            "verticals": True,
            "hardening": True,
        },
    }


@router.get("/backup/status")
def backup_status():
    return {
        "status": "configured",
        "message": "Use scripts/backup_postgres.sh for scheduled backups. See docs/BACKUP_RESTORE.md.",
        "last_backup": None,
    }
