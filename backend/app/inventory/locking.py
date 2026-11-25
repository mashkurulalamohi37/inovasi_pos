"""Dialect-aware row locking helpers."""

from __future__ import annotations

from sqlmodel import Session


def supports_row_lock(session: Session) -> bool:
    bind = session.get_bind()
    return bool(bind is not None and bind.dialect.name == "postgresql")


def for_update(session: Session, stmt):
    if supports_row_lock(session):
        return stmt.with_for_update()
    return stmt
