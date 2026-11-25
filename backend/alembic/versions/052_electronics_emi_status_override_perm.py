"""Split electronics.emi_status_override out of electronics.emi_manage.

`electronics.emi_manage` gated the whole EMI surface — creating agreements,
collecting installments, and PATCHing agreement status. Cashier holds that
permission because a cashier has to register an EMI at the point of sale and take
installment payments at the counter. That also handed every cashier the ability
to cancel, default or force-complete an agreement, each of which writes off a
receivable with no second pair of eyes.

The PATCH endpoint now requires the new `electronics.emi_status_override`
permission. This migration creates it and grants it to every role that already
holds `electronics.emi_manage` EXCEPT Cashier, so supervisors keep working
uninterrupted and only the cashier capability narrows.
"""

import uuid

from alembic import op
import sqlalchemy as sa

revision = "052_electronics_emi_status_override_perm"
down_revision = "051_electronics_emi_collected_backfill"
branch_labels = None
depends_on = None

NEW_CODE = "electronics.emi_status_override"
NEW_NAME = "Override electronics EMI agreement status"
SOURCE_CODE = "electronics.emi_manage"
MODULE = "electronics"

# Roles that serve customers at the counter keep create/collect but lose the
# ability to write off a receivable.
EXCLUDED_ROLE_CODES = ("Cashier",)

TABLES = ("permission", "role", "role_permission")


def _tables_present(bind) -> bool:
    inspector = sa.inspect(bind)
    return set(TABLES) <= set(inspector.get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    if not _tables_present(bind):
        return

    new_id = bind.execute(
        sa.text("SELECT id FROM permission WHERE code = :c"), {"c": NEW_CODE}
    ).scalar()
    if not new_id:
        new_id = str(uuid.uuid4())
        bind.execute(
            sa.text(
                "INSERT INTO permission (id, code, name, module) VALUES (:i, :c, :n, :m)"
            ),
            {"i": new_id, "c": NEW_CODE, "n": NEW_NAME, "m": MODULE},
        )

    source_id = bind.execute(
        sa.text("SELECT id FROM permission WHERE code = :c"), {"c": SOURCE_CODE}
    ).scalar()
    if not source_id:
        return

    excluded = ", ".join(f":r{i}" for i in range(len(EXCLUDED_ROLE_CODES)))
    params: dict = {f"r{i}": code for i, code in enumerate(EXCLUDED_ROLE_CODES)}
    params["src"] = source_id
    # Bound as a Python bool: `allowed` is a real boolean column on Postgres, so a
    # literal 1 would fail the comparison.
    params["yes"] = True

    role_ids = bind.execute(
        sa.text(
            f"""
            SELECT rp.role_id
            FROM role_permission rp
            JOIN role r ON r.id = rp.role_id
            WHERE rp.permission_id = :src
              AND rp.allowed = :yes
              AND r.code NOT IN ({excluded})
            """
        ),
        params,
    ).scalars().all()

    for role_id in role_ids:
        already = bind.execute(
            sa.text(
                "SELECT 1 FROM role_permission WHERE role_id = :r AND permission_id = :p"
            ),
            {"r": role_id, "p": new_id},
        ).scalar()
        if already:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO role_permission (id, role_id, permission_id, allowed)"
                " VALUES (:i, :r, :p, :yes)"
            ),
            {"i": str(uuid.uuid4()), "r": role_id, "p": new_id, "yes": True},
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _tables_present(bind):
        return
    perm_id = bind.execute(
        sa.text("SELECT id FROM permission WHERE code = :c"), {"c": NEW_CODE}
    ).scalar()
    if not perm_id:
        return
    bind.execute(sa.text("DELETE FROM role_permission WHERE permission_id = :p"), {"p": perm_id})
    bind.execute(sa.text("DELETE FROM permission WHERE id = :p"), {"p": perm_id})
