from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import TimeoutError as SQLTimeoutError

from app.api.v1.router import api_router
from app.config import settings
from app.database import engine, init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.seed import (
    seed_demo_data,
    seed_outfit_company,
    seed_eimama_company,
    seed_talico_company,
    seed_aura_jewelry_company,
    seed_volt_electronics_company,
    seed_siddiky_surgical_company,
)

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is applied via Alembic in Docker/CLI; init_db remains a dev fallback.
    try:
        init_db()
    except Exception as e:
        logging.warning(f"init_db non-fatal warning: {e}")

    from sqlmodel import Session
    from app.services.platform_iam_service import ensure_platform_super_admin
    from app.services.subscription_service import ensure_plans

    try:
        with Session(engine) as session:
            if settings.seed_on_startup:
                seed_demo_data(session=session)
            seed_outfit_company(session)          # idempotent — creates/repairs OUTFIT company
            seed_eimama_company(session)          # idempotent — creates/repairs EIMAMA company
            seed_talico_company(session)          # idempotent — creates/repairs TALICO company
            seed_aura_jewelry_company(session)    # idempotent — creates/repairs AURA-JEWELRY company
            seed_volt_electronics_company(session)# idempotent — creates/repairs VOLT-ELECTRONICS company
            seed_siddiky_surgical_company(session)# idempotent — creates/repairs SIDDIKY-SURGICAL company
            ensure_plans(session)
            ensure_platform_super_admin(session)
            session.commit()
    except Exception as e:
        logging.error(f"Startup seed non-fatal warning: {e}")

    yield


from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.environment in ("production", "staging"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Report/export downloads carry their filename here. Without an explicit
    # expose list the browser hides it from JS on cross-origin deployments
    # (Docker/prod serve the SPA and the API from different origins), and every
    # export lands under a generic fallback name.
    expose_headers=["Content-Disposition"],
)
app.include_router(api_router, prefix=settings.api_v1_prefix)
from app.api.v1.referrals import router as referrals_direct_router
app.include_router(referrals_direct_router, prefix="/api/referrals")

# Ensure uploads directory structure exists and mount static serving
os.makedirs("uploads/profile_pics", exist_ok=True)
os.makedirs("uploads/products", exist_ok=True)
os.makedirs("uploads/food-images", exist_ok=True)


def _publish_bundled_images() -> None:
    """Copy menu photos shipped in the image into the served uploads tree.

    uploads/ is runtime state — a fresh container or a new Docker volume starts
    empty, so every product photo 404s and the POS renders placeholder tiles.
    The catalogue photos are baked into the image instead, and republished on
    every boot. This must not be gated behind seeding: a production server runs
    with SEED_ON_STARTUP=false, which is exactly when the images went missing.

    Existing files are never overwritten, so a photo replaced through the admin
    UI survives restarts.
    """
    import shutil

    src_dir = os.path.join(os.path.dirname(__file__), "static_food_images")
    if not os.path.isdir(src_dir):
        return
    # Legacy catalogue rows point at /uploads/products/<file>, current ones at
    # /food-images/<file>; both are satisfied from the same bundle.
    targets = (os.path.join("uploads", "products"), os.path.join("uploads", "food-images"))
    published = 0
    for fname in os.listdir(src_dir):
        if not fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        src = os.path.join(src_dir, fname)
        for target in targets:
            dest = os.path.join(target, fname)
            if not os.path.exists(dest):
                shutil.copyfile(src, dest)
                published += 1
    if published:
        logging.info("Published %d bundled menu images into uploads/", published)


try:
    _publish_bundled_images()
except Exception as e:  # never block startup over cosmetic assets
    logging.error(f"Could not publish bundled menu images: {e}")

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/food-images", StaticFiles(directory="uploads/food-images"), name="food_images")


def _json_safe(value):
    """Replace non-finite floats so an error payload can always be serialised."""
    import math

    if isinstance(value, float):
        return repr(value) if not math.isfinite(value) else value
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """422 for rejected input, even when the input itself is inf or nan.

    FastAPI's default handler echoes the offending value back inside the error
    detail. Python's json.loads accepts `Infinity`/`NaN`, so such a value reaches
    the validator, is correctly rejected — and then json.dumps blows up encoding
    the error response, turning a clean 422 into a 500.
    """
    from fastapi.encoders import jsonable_encoder

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": _json_safe(jsonable_encoder(exc.errors()))},
    )


@app.exception_handler(SQLTimeoutError)
async def db_pool_timeout_handler(request: Request, exc: SQLTimeoutError):
    """503 + Retry-After when every DB connection is checked out.

    Pool exhaustion previously surfaced as a raw 500 after the caller had
    already blocked for the full pool timeout, so a busy till just appeared to
    freeze. This is a retryable, transient condition and should say so.
    """
    logging.warning("db pool exhausted: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Server busy, please retry."},
        headers={"Retry-After": "2"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled server exception: %s", exc)
    if settings.environment == "development":
        raise exc
    headers = {}
    origin = request.headers.get("origin")
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=headers)


@app.get("/")
def root_info():
    return {
        "status": "ok",
        "service": settings.app_name,
        "message": "Pulse POS API is running.",
        "docs": "/docs",
        "health": "/health",
        "api_v1": "/api/v1",
        "frontend": "http://localhost:3005",
    }


@app.get("/health")
def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False
    from app.cache import redis_status

    cache = redis_status()
    return {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "database": "connected" if db_ok else "disconnected",
        "cache": cache,
        "redis": "connected" if cache.get("connected") else ("disabled" if not cache.get("enabled") else "disconnected"),
    }


@app.get("/health/live")
def health_live():
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@app.get("/health/ready")
def health_ready(request: Request):
    from app.services.readiness_service import build_readiness
    from fastapi.responses import JSONResponse

    payload = build_readiness(engine)
    payload["version"] = settings.app_version
    payload["request_id"] = getattr(request.state, "request_id", None)
    if settings.rate_limit_backend == "redis" and settings.rate_limit_require_redis:
        from app.middleware.rate_limit import _get_redis

        redis_ok = _get_redis() is not None
        payload["redis"] = "connected" if redis_ok else "disconnected"
        if not redis_ok:
            payload["ready"] = False
            existing = payload.get("checks")
            if isinstance(existing, dict):
                payload["checks"] = {**existing, "redis": False}
            elif isinstance(existing, list):
                payload["checks"] = [*existing, {"name": "redis", "ok": False}]
            else:
                payload["checks"] = {"redis": False}
    status_code = 200 if payload["ready"] else 503
    return JSONResponse(status_code=status_code, content=payload)


@app.get("/metrics")
def metrics_endpoint():
    from fastapi.responses import PlainTextResponse
    from app import metrics

    if not settings.metrics_enabled:
        return JSONResponse(status_code=404, content={"detail": "Metrics disabled"})
    return PlainTextResponse(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")
