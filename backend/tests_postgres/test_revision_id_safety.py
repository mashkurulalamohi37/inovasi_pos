"""Alembic revision-id safety guard (Phase 6B-16)."""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.postgres

_BACKEND = Path(__file__).resolve().parents[1]


def test_all_revision_ids_fit_varchar_128():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(_BACKEND / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    revs = list(script.walk_revisions())
    assert revs, "expected alembic revisions"
    max_len = max(len(r.revision) for r in revs)
    assert max_len <= 128, f"revision id length {max_len} exceeds VARCHAR(128)"
    long = [(r.revision, len(r.revision)) for r in revs if len(r.revision) > 32]
    # Historical ids may exceed 32; column must be widened (env.py + migrations).
    assert all(len(r) <= 128 for r, _ in long)


def test_env_ensures_alembic_version_width():
    env = (_BACKEND / "alembic" / "env.py").read_text(encoding="utf-8")
    assert "VARCHAR(128)" in env
    assert "_ensure_alembic_version_width" in env


def test_single_alembic_head():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(_BACKEND / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert heads == ["025_cosmetics_hardening"] or len(heads) == 1
    assert script.get_current_head() is not None
