"""Record the price-override reason on a restaurant order line.

The pricing authority (sales_policy_service.enforce_line_pricing) runs for every
pack. Restaurant orders only reached it at settlement, inside bill_and_pay_order,
which meant a line priced below list/MSP was rejected *after* the kitchen had
cooked and the guest had eaten — with no field anywhere to carry an approval. The
order could never be closed and the table never released.

The check now runs at order entry, where a cashier can still act on it, and the
approved reason is stored here so settlement can replay it instead of
re-challenging the bill.
"""

from alembic import op
import sqlalchemy as sa

revision = "047_restaurant_line_price_override"
down_revision = "046_attendance_absence"
branch_labels = None
depends_on = None

TABLE = "restaurant_order_line"
COLUMN = "price_override_reason"


def _column_missing(bind) -> bool:
    inspector = sa.inspect(bind)
    if TABLE not in inspector.get_table_names():
        return False
    return COLUMN not in {c["name"] for c in inspector.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if _column_missing(bind):
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE not in inspector.get_table_names():
        return
    if COLUMN in {c["name"] for c in inspector.get_columns(TABLE)}:
        op.drop_column(TABLE, COLUMN)
