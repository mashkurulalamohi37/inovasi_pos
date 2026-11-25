"""Retire the superseded REST-EM-* menu for EI MAMA STREET FOOD.

The tenant carries two overlapping catalogues: 44 legacy REST-EM-* products
from the original import, and the 38 EM-* products seeded from the official
menu card. Both are active, so the POS grid lists every dish twice — often at
two different prices (Regular Combo is 125 on the legacy row and 120 on the
menu-card row), leaving the cashier to guess which to ring up.

The menu card is authoritative, so the legacy rows are deactivated rather than
deleted: sales history, stock ledger rows and invoice lines keep pointing at
real products, and the change is a single flag flip to undo. The POS requests
status="active", so deactivated rows disappear from the grid.

Guarded on the menu-card products actually being present — on a database seeded
before them, deactivating the legacy rows would leave the restaurant with no
menu at all.
"""

from alembic import op
import sqlalchemy as sa

revision = "048_eimama_legacy_menu_retire"
down_revision = "047_restaurant_line_price_override"
branch_labels = None
depends_on = None

COMPANY_CODE = "EIMAMA"
LEGACY_PREFIX = "REST-EM-%"
# LIKE 'EM-%' cannot match 'REST-EM-...' — the pattern is anchored at the start.
MENU_CARD_PREFIX = "EM-%"


def _eimama_id(bind):
    inspector = sa.inspect(bind)
    names = set(inspector.get_table_names())
    if not {"company", "product"} <= names:
        return None
    return bind.execute(
        sa.text("SELECT id FROM company WHERE code = :code"), {"code": COMPANY_CODE}
    ).scalar()


def upgrade() -> None:
    bind = op.get_bind()
    cid = _eimama_id(bind)
    if not cid:
        return

    menu_card_count = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM product "
            "WHERE company_id = :cid AND sku LIKE :pat AND is_active = true"
        ),
        {"cid": cid, "pat": MENU_CARD_PREFIX},
    ).scalar()
    if not menu_card_count:
        # Replacement menu absent — leave the legacy catalogue as the only menu.
        return

    bind.execute(
        sa.text(
            "UPDATE product SET is_active = false "
            "WHERE company_id = :cid AND sku LIKE :pat AND is_active = true"
        ),
        {"cid": cid, "pat": LEGACY_PREFIX},
    )


def downgrade() -> None:
    bind = op.get_bind()
    cid = _eimama_id(bind)
    if not cid:
        return
    bind.execute(
        sa.text(
            "UPDATE product SET is_active = true "
            "WHERE company_id = :cid AND sku LIKE :pat"
        ),
        {"cid": cid, "pat": LEGACY_PREFIX},
    )
