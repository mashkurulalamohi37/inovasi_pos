"""Error category constants for structured logging / ops (Phase 8A)."""

from __future__ import annotations


class ErrorCategory:
    VALIDATION = "VALIDATION"
    AUTHENTICATION = "AUTHENTICATION"
    AUTHORIZATION = "AUTHORIZATION"
    NOT_FOUND = "NOT_FOUND"
    BUSINESS_CONFLICT = "BUSINESS_CONFLICT"
    STOCK_CONFLICT = "STOCK_CONFLICT"
    CONCURRENCY_CONFLICT = "CONCURRENCY_CONFLICT"
    DATABASE = "DATABASE"
    EXTERNAL_DEPENDENCY = "EXTERNAL_DEPENDENCY"
    INTERNAL = "INTERNAL"


def category_for_http_status(status_code: int) -> str:
    if status_code == 401:
        return ErrorCategory.AUTHENTICATION
    if status_code == 403:
        return ErrorCategory.AUTHORIZATION
    if status_code == 404:
        return ErrorCategory.NOT_FOUND
    if status_code == 409:
        return ErrorCategory.BUSINESS_CONFLICT
    if status_code == 422:
        return ErrorCategory.VALIDATION
    if status_code >= 500:
        return ErrorCategory.INTERNAL
    return ErrorCategory.VALIDATION
