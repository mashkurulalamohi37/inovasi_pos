"""Request context, security headers, structured logging."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("pulse.api")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        from app.config import settings
        from app.errors import category_for_http_status

        if settings.environment in ("production", "staging"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        err_cat = category_for_http_status(response.status_code) if response.status_code >= 400 else None
        try:
            from app.config import settings as _settings
            from app import metrics

            if _settings.metrics_enabled:
                metrics.incr("pulse_http_requests_total", method=request.method, status=str(response.status_code))
                metrics.observe("pulse_http_request_duration_ms", duration_ms, path=request.url.path)
                if response.status_code == 409:
                    metrics.incr("pulse_stock_conflicts_total")
                if response.status_code == 401 and request.url.path.endswith("/auth/login"):
                    metrics.incr("pulse_login_failures_total")
        except Exception:
            pass
        logger.info(
            "%s %s %s %.2fms request_id=%s%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
            f" error_category={err_cat}" if err_cat else "",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "error_category": err_cat,
            },
        )
        return response
