"""Create screen_config and screen_field_config tables for screen-level customization persistence."""

from alembic import op
import sqlalchemy as sa

revision = "056_screen_config"
down_revision = "055_time_pricing_rules"
branch_labels = None
depends_on = None


def _has_table(inspector: sa.engine.reflection.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "screen_config"):
        op.create_table(
            "screen_config",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("company_id", sa.String(length=36), sa.ForeignKey("company.id"), nullable=False, index=True),
            sa.Column("screen_key", sa.String(length=100), nullable=False, index=True),
            sa.Column("config_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _has_table(inspector, "screen_field_config"):
        op.create_table(
            "screen_field_config",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("screen_config_id", sa.String(length=36), sa.ForeignKey("screen_config.id"), nullable=False, index=True),
            sa.Column("field_key", sa.String(length=100), nullable=False),
            sa.Column("visible", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "screen_field_config"):
        op.drop_table("screen_field_config")

    if _has_table(inspector, "screen_config"):
        op.drop_table("screen_config")
