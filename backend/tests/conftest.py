import os

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["SEED_ON_STARTUP"] = "false"

import app.models  # noqa: F401, E402
from app.main import app  # noqa: E402
from app.database import get_session  # noqa: E402
from app.seed import seed_demo_data  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


@pytest.fixture(name="session", autouse=True)
def session_fixture():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_demo_data(force=True, session=session)
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


DEFAULT_COMPANY_CODE = "PULSE-DEMO"
PLATFORM_COMPANY_CODE = "PULSE-PLATFORM"


def login_payload(
    email: str,
    password: str,
    company_code: str | None = None,
    store_code: str | None = None,
) -> dict:
    code = company_code or (PLATFORM_COMPANY_CODE if email == "super@pulse.pos" else DEFAULT_COMPANY_CODE)
    payload = {"email": email, "password": password, "company_code": code}
    if store_code:
        payload["store_code"] = store_code
    return payload


@pytest.fixture(name="auth_headers")
def auth_headers_fixture(client: TestClient):
    res = client.post("/api/v1/auth/login", json=login_payload("admin@pulse.pos", "admin123"))
    assert res.status_code == 200
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def pytest_collection_modifyitems(config, items):
    """Auto-mark Fashion edition tests for `pytest -m fashion` CI gate."""
    for item in items:
        path = str(getattr(item, "path", "") or getattr(item, "fspath", ""))
        node = getattr(item, "nodeid", "")
        if "test_fashion" in path.replace("\\", "/") or "test_fashion" in node:
            item.add_marker(pytest.mark.fashion)
