from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_connect_args: dict = {}
_engine_kwargs: dict = {
    "echo": False,
    "pool_pre_ping": True,
}

if settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
    # File-backed SQLite also uses a QueuePool, and it was running on
    # SQLAlchemy's 5 + 10 defaults with a 30s wait — the same saturation stall
    # as Postgres. Only the timeout is worth tuning here; SQLite serialises
    # writes regardless of how many connections are pooled.
    if ":memory:" not in settings.database_url and settings.database_url != "sqlite://":
        _engine_kwargs["pool_timeout"] = settings.db_pool_timeout
else:
    _engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=settings.db_pool_recycle,
        pool_timeout=settings.db_pool_timeout,
    )

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)


def init_db() -> None:
    import app.models  # noqa: F401 — register all tables
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
