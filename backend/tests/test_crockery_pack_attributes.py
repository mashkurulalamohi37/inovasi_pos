import pytest
from sqlmodel import Session, SQLModel, create_engine
from app.services.pack_attribute_service import (
    list_pack_attributes,
    create_pack_attribute,
    update_pack_attribute,
    delete_pack_attribute,
)
from app.dependencies import AuthContext


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_crockery_pack_attributes_seed_and_crud(session: Session):
    company_id = "test-comp-1"
    auth = AuthContext(
        user_id="user-1",
        company_id=company_id,
        store_id=None,
        role_id="role-1",
        role_code="Admin",
        email="admin@test.com",
        permissions={"inventory.edit"},
        is_platform_admin=True,
    )

    # 1. Listing crockery attributes triggers auto-seeding
    rows = list_pack_attributes(session, company_id, "crockery")
    types = {r["attr_type"] for r in rows}
    assert "category" in types
    assert "material" in types
    assert "heat_compatibility" in types

    materials = [r["name"] for r in rows if r["attr_type"] == "material"]
    assert "Opal Glass" in materials
    assert "Fine Bone China" in materials

    # 2. Create custom material
    custom = create_pack_attribute(session, auth, {
        "pack_code": "crockery",
        "attr_type": "material",
        "code": "WOOD",
        "name": "Acacia Wood",
        "is_active": True,
    })
    session.commit()
    assert custom["name"] == "Acacia Wood"

    # 3. Update material
    updated = update_pack_attribute(session, auth, custom["id"], {
        "name": "Premium Acacia Wood",
    })
    session.commit()
    assert updated["name"] == "Premium Acacia Wood"

    # 4. Delete material
    deleted = delete_pack_attribute(session, auth, custom["id"])
    session.commit()
    assert deleted["ok"] is True
