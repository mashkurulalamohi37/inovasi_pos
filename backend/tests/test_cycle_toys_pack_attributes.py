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


def test_cycle_toys_pack_attributes_seed_and_crud(session: Session):
    company_id = "test-comp-cycle-toys"
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

    # 1. Listing cycle-toys attributes triggers auto-seeding
    rows = list_pack_attributes(session, company_id, "cycle-toys")
    types = {r["attr_type"] for r in rows}
    assert "category" in types
    assert "wheel_size" in types
    assert "age_group" in types
    assert "assembly_status" in types

    wheel_sizes = [r["name"] for r in rows if r["attr_type"] == "wheel_size"]
    assert any('16"' in w for w in wheel_sizes)
    assert any('26"' in w for w in wheel_sizes)

    # 2. Create custom attribute
    custom = create_pack_attribute(session, auth, {
        "pack_code": "cycle-toys",
        "attr_type": "wheel_size",
        "code": "FAT_TIRE_26",
        "name": '26" x 4.0 Fat Tire',
        "is_active": True,
    })
    session.commit()
    assert custom["name"] == '26" x 4.0 Fat Tire'

    # 3. Update attribute
    updated = update_pack_attribute(session, auth, custom["id"], {
        "name": '26" x 4.5 Super Fat Tire',
    })
    session.commit()
    assert updated["name"] == '26" x 4.5 Super Fat Tire'

    # 4. Delete attribute
    delete_pack_attribute(session, auth, custom["id"])
    session.commit()

    rows_after = list_pack_attributes(session, company_id, "cycle-toys")
    assert not any(r["id"] == custom["id"] for r in rows_after)
