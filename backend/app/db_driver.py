"""Resolve a working PostgreSQL SQLAlchemy driver for the current platform."""

from __future__ import annotations


def _can_import(module: str) -> bool:
    try:
        __import__(module)
        return True
    except ImportError:
        return False


def resolve_postgres_url(url: str) -> str:
    """Use psycopg2 when available; fall back to pure-Python pg8000 on Windows/Python 3.14."""
    if not url.startswith("postgresql"):
        return url

    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgresql://")

    scheme = url.split("://", 1)[0]

    if scheme == "postgresql+psycopg2":
        if _can_import("psycopg2"):
            return url
        if not _can_import("pg8000"):
            raise ImportError(
                "No PostgreSQL driver available. Install pg8000: pip install pg8000"
            )
        return url.replace("postgresql+psycopg2://", "postgresql+pg8000://", 1)

    if scheme == "postgresql+pg8000":
        if not _can_import("pg8000"):
            raise ImportError("pg8000 is not installed. Run: pip install pg8000")
        return url

    return url
