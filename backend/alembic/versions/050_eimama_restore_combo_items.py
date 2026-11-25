"""Bring the legacy Combo menu items back for EI MAMA STREET FOOD.

048 retired the whole REST-EM-* catalogue in favour of the menu card. That also
took the Combo items with it, including "Student Special Combo (Rice, Veg,
Chicken)" at 80, which has no equivalent on the menu card — the nearest entry,
EM-RICE-01 "Student Special (Rice, Veg, Chicken 2pcs)", is a different dish at
60. Those Combo rows are restored here at the owner's request.

Four of the five restored rows overlap a menu-card item and two of those
disagree on price (Regular Combo 125 vs 120, Nati Combo 10 vs 50). Resolving
that is a pricing decision for the restaurant, not something a migration should
guess, so both rows are left active and the duplicate is reported in the deploy
notes for the owner to settle.
"""

from alembic import op
import sqlalchemy as sa

revision = "050_eimama_restore_combo_items"
down_revision = "049_restaurant_combo_lines"
branch_labels = None
depends_on = None

COMPANY_CODE = "EIMAMA"
# Matched on SKU, not on name: names carry Bengali text and trailing detail that
# varies between imports, while these SKUs are stable.
COMBO_SKUS = (
    "REST-EM-015",  # Mini Burger Combo
    "REST-EM-023",  # Student Special Combo (Rice, Veg, Chicken)
    "REST-EM-024",  # Regular Combo (Rice, Veg, Chicken Curry, Fries)
    "REST-EM-025",  # Superior Combo (Rice, Veg, Chicken Fry, Chili, Curry)
    "REST-EM-034",  # Nati Combo
)


def _eimama_id(bind):
    inspector = sa.inspect(bind)
    if not {"company", "product"} <= set(inspector.get_table_names()):
        return None
    return bind.execute(
        sa.text("SELECT id FROM company WHERE code = :code"), {"code": COMPANY_CODE}
    ).scalar()


def _set_active(active: bool) -> None:
    bind = op.get_bind()
    cid = _eimama_id(bind)
    if not cid:
        return
    bind.execute(
        sa.text(
            "UPDATE product SET is_active = :active "
            "WHERE company_id = :cid AND sku IN :skus"
        ).bindparams(sa.bindparam("skus", expanding=True)),
        {"cid": cid, "skus": list(COMBO_SKUS), "active": active},
    )


def upgrade() -> None:
    _set_active(True)


def downgrade() -> None:
    # Back to the 048 end state: menu card only.
    _set_active(False)
