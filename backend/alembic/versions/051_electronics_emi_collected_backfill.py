"""Correct EMI total_collected, which double-counted the down payment.

create_emi seeded `total_collected` with the down payment even though
`total_payable` is the FINANCED balance and already excludes it
(payable = principal - down + fee). The running total therefore started one down
payment ahead of the schedule, and the `total_collected >= total_payable`
completion check fired several installments early — closing agreements as
"completed" while installments were still pending and money was still owed.

On a 100,000 principal with a 20,000 down payment over 10 installments the
agreement flipped to completed at installment 8, writing off 16,000.

The service now seeds `total_collected` at 0. This migration repairs rows
already written under the old behaviour by rebuilding `total_collected` from the
installments that were actually collected, and reopening any agreement that was
closed without being fully paid.

Rows are only touched when the stored total matches the buggy formula
(collected == down + sum(paid)), so an agreement an operator has already
hand-corrected is left alone.
"""

from alembic import op
import sqlalchemy as sa

revision = "051_electronics_emi_collected_backfill"
down_revision = "050_eimama_restore_combo_items"
branch_labels = None
depends_on = None

TABLES = ("electronics_emi", "electronics_emi_installment")


def _tables_present(bind) -> bool:
    inspector = sa.inspect(bind)
    return set(TABLES) <= set(inspector.get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    if not _tables_present(bind):
        return

    rows = bind.execute(
        sa.text(
            """
            SELECT e.id,
                   e.down_payment,
                   e.total_collected,
                   e.total_payable,
                   e.status,
                   COALESCE((
                       SELECT SUM(i.paid_amount)
                       FROM electronics_emi_installment i
                       WHERE i.emi_id = e.id AND i.status = 'paid'
                   ), 0) AS paid_sum
            FROM electronics_emi e
            """
        )
    ).fetchall()

    for row in rows:
        down = float(row.down_payment or 0)
        stored = float(row.total_collected or 0)
        payable = float(row.total_payable or 0)
        paid_sum = float(row.paid_sum or 0)

        # Only repair rows still carrying the buggy seed.
        if round(stored, 2) != round(down + paid_sum, 2):
            continue
        if round(down, 2) == 0.0:
            continue  # no down payment means nothing was double-counted

        corrected = round(paid_sum, 2)
        # An agreement closed by the early-completion check is reopened unless the
        # installments genuinely cover the financed balance.
        status = row.status
        if status == "completed" and corrected < round(payable, 2):
            status = "active"

        bind.execute(
            sa.text(
                "UPDATE electronics_emi SET total_collected = :c, status = :s WHERE id = :i"
            ),
            {"c": corrected, "s": status, "i": row.id},
        )


def downgrade() -> None:
    # Restoring the double-counted figure would reintroduce the write-off, and the
    # pre-migration status cannot be recovered. Intentionally not reversible.
    pass
