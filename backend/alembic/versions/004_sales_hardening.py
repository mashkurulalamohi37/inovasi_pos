"""Phase 4 sales hardening — split payments stored on payment rows."""

from alembic import op
import sqlalchemy as sa

revision = "004_sales_hardening"
down_revision = "003_procurement_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No structural changes — Payment table already supports multiple rows per invoice.
    # Store policies for return window are seeded via app.seed.
    pass


def downgrade() -> None:
    pass
