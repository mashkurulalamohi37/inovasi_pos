from logging.config import fileConfig
import os

from alembic import context
from sqlmodel import SQLModel

from app.config import settings
from app.db_driver import resolve_postgres_url
import app.models  # noqa: F401

config = context.config

# alembic.ini ships a sample URL (often the wrong host/port). Prefer:
# 1) ALEMBIC_DATABASE_URL / DATABASE_URL via settings (.env)
# 2) programmatic override from manage.py / upgrade-matrix (non-sample ini URL)
_SAMPLE_INI_URL = "postgresql+psycopg2://pulse:pulse@localhost:5432/pulse_pos"
_configured = (config.get_main_option("sqlalchemy.url") or "").strip()
_env_override = (os.environ.get("ALEMBIC_DATABASE_URL") or "").strip()
if _env_override:
    url = _env_override
elif (
    _configured
    and "://" in _configured
    and not _configured.startswith("%")
    and "driver://" not in _configured
    and _configured.replace("+pg8000", "+psycopg2") != _SAMPLE_INI_URL
    and _configured != settings.database_url
):
    # Explicit one-off target (e.g. ephemeral CI DB) set on Config before upgrade
    url = _configured
else:
    url = settings.database_url
config.set_main_option("sqlalchemy.url", resolve_postgres_url(url))
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def _ensure_alembic_version_width(connection) -> None:
    """Revision ids like 013_pharmacy_prescription_hardening exceed VARCHAR(32)."""
    from sqlalchemy import text, inspect as sa_inspect

    if connection.dialect.name != "postgresql":
        return
    inspector = sa_inspect(connection)
    if "alembic_version" not in inspector.get_table_names():
        return
    connection.execute(text("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128)"))


def run_migrations_online() -> None:
    from sqlalchemy import engine_from_config, pool

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        def on_version_apply(ctx, step, heads, **kw):
            _ensure_alembic_version_width(ctx.connection)

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            on_version_apply=on_version_apply,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
