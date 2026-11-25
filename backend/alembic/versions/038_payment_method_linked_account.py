"""Add payment_method.linked_account_id — maps payment methods to GL cash/bank accounts"""

from alembic import op
import sqlalchemy as sa

revision = "038_payment_method_linked_account"
down_revision = "037_accounting_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # 001_initial creates every column currently on SQLModel.metadata's PaymentMethod
    # on a fresh database, so guard against re-adding this on a from-scratch migrate.
    cols = {c["name"] for c in inspector.get_columns("payment_method")}
    if "linked_account_id" in cols:
        return
    with op.batch_alter_table("payment_method") as batch_op:
        batch_op.add_column(
            sa.Column("linked_account_id", sa.String(length=36), sa.ForeignKey("account.id", name="fk_payment_method_linked_account_id"), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("payment_method") as batch_op:
        batch_op.drop_column("linked_account_id")
