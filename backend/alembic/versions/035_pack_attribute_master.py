"""Alembic: pack_attribute industry master table."""

from alembic import op
import sqlalchemy as sa

revision = "035_pack_attribute_master"
down_revision = "034_saas_signup_approval_periods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pack_attribute" in inspector.get_table_names():
        return
    op.create_table(
        "pack_attribute",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False, index=True),
        sa.Column("pack_code", sa.String(), nullable=False, index=True),
        sa.Column("attr_type", sa.String(), nullable=False, index=True),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("pack_attribute.id"), nullable=True, index=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_pack_attribute_company_pack_type",
        "pack_attribute",
        ["company_id", "pack_code", "attr_type"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pack_attribute" not in inspector.get_table_names():
        return
    op.drop_index("ix_pack_attribute_company_pack_type", table_name="pack_attribute")
    op.drop_table("pack_attribute")
