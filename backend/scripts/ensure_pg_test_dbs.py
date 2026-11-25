"""Create isolated PostgreSQL databases for Phase 8A / 6B-16 verification."""
from sqlalchemy import create_engine, text

ADMIN = "postgresql+pg8000://postgres:postgres@localhost:5432/postgres"
NAMES = ("pulse_pos_test", "pulse_ci_upg_scratch")


def main() -> None:
    engine = create_engine(ADMIN, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        for name in NAMES:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"),
                {"n": name},
            ).scalar()
            if exists:
                print(f"exists: {name}")
            else:
                conn.execute(text(f'CREATE DATABASE "{name}"'))
                print(f"created: {name}")


if __name__ == "__main__":
    main()
