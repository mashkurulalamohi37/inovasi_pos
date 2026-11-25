"""Allow attendance rows with no clock_in so absence can be recorded.

An absent employee never clocks in, but mini_hr_attendance.clock_in was NOT NULL,
so marking someone absent required inventing a fake start time that then polluted
the shift-duration totals. Making the column nullable lets an absence be an honest
record: a date, a status of "absent", and no times.
"""

from alembic import op
import sqlalchemy as sa

revision = "046_attendance_absence"
down_revision = "045_customer_advance"
branch_labels = None
depends_on = None

TABLE = "mini_hr_attendance"


def _table_missing(bind) -> bool:
    # mini_hr_attendance is created by SQLModel.metadata.create_all rather than by
    # any migration, so on a migrate-only fresh database it may not exist yet.
    return TABLE not in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _table_missing(bind):
        return
    col = {c["name"]: c for c in sa.inspect(bind).get_columns(TABLE)}.get("clock_in")
    if col is None or col.get("nullable"):
        return
    with op.batch_alter_table(TABLE) as batch_op:
        batch_op.alter_column("clock_in", existing_type=sa.DateTime(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    if _table_missing(bind):
        return
    # Absence rows have no clock_in and cannot satisfy a NOT NULL constraint.
    op.execute(f"DELETE FROM {TABLE} WHERE clock_in IS NULL")
    with op.batch_alter_table(TABLE) as batch_op:
        batch_op.alter_column("clock_in", existing_type=sa.DateTime(), nullable=False)
