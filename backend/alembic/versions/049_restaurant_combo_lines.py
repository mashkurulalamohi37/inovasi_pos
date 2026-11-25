"""Tie combo component lines together on a restaurant order.

A combo is rung up as one order line per component, not as a single bundled
line, because components cook at different stations and send_to_kitchen groups
lines by kitchen_station — a single line could only ever reach one station.

combo_group_id links the components that were added by one combo tap so the
POS can show them as a single priced item, and combo_name carries the bundle's
name for the cart, the KOT and the receipt.
"""

from alembic import op
import sqlalchemy as sa

revision = "049_restaurant_combo_lines"
down_revision = "048_eimama_legacy_menu_retire"
branch_labels = None
depends_on = None

TABLE = "restaurant_order_line"
COLUMNS = (
    ("combo_group_id", sa.String(), True),
    ("combo_name", sa.String(), False),
)
INDEX = "ix_restaurant_order_line_combo_group_id"


def _existing(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if TABLE not in inspector.get_table_names():
        return set()
    return {c["name"] for c in inspector.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    present = _existing(bind)
    if not present:
        return
    for name, type_, indexed in COLUMNS:
        if name in present:
            continue
        op.add_column(TABLE, sa.Column(name, type_, nullable=True))
        if indexed:
            op.create_index(INDEX, TABLE, [name])


def downgrade() -> None:
    bind = op.get_bind()
    present = _existing(bind)
    if not present:
        return
    inspector = sa.inspect(bind)
    if INDEX in {i["name"] for i in inspector.get_indexes(TABLE)}:
        op.drop_index(INDEX, table_name=TABLE)
    for name, _type, _indexed in COLUMNS:
        if name in present:
            op.drop_column(TABLE, name)
