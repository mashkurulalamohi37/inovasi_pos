"""Phase 5 integrations platform — connectors, inbox, outbox, OAuth state."""

from alembic import op
import sqlalchemy as sa

revision = "005_integrations_platform"
down_revision = "004_sales_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "integration_connector" not in tables:
        op.create_table(
            "integration_connector",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("connector_code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), server_default="active", nullable=False),
            sa.Column("config_json", sa.String(), nullable=True),
            sa.Column("oauth_access_token", sa.String(), nullable=True),
            sa.Column("oauth_refresh_token", sa.String(), nullable=True),
            sa.Column("oauth_expires_at", sa.DateTime(), nullable=True),
            sa.Column("last_error", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_integration_connector_company_id", "integration_connector", ["company_id"])
        op.create_index("ix_integration_connector_code", "integration_connector", ["connector_code"])

    if "integration_inbox" not in tables:
        op.create_table(
            "integration_inbox",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("connector_id", sa.String(), sa.ForeignKey("integration_connector.id"), nullable=True),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("payload_json", sa.String(), nullable=False),
            sa.Column("status", sa.String(), server_default="pending", nullable=False),
            sa.Column("source", sa.String(), server_default="webhook", nullable=False),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_integration_inbox_company_id", "integration_inbox", ["company_id"])
        op.create_index("ix_integration_inbox_event_type", "integration_inbox", ["event_type"])

    if "integration_outbox" not in tables:
        op.create_table(
            "integration_outbox",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("connector_id", sa.String(), sa.ForeignKey("integration_connector.id"), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("payload_json", sa.String(), nullable=False),
            sa.Column("status", sa.String(), server_default="pending", nullable=False),
            sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
            sa.Column("last_error", sa.String(), nullable=True),
            sa.Column("next_retry_at", sa.DateTime(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_integration_outbox_company_id", "integration_outbox", ["company_id"])
        op.create_index("ix_integration_outbox_connector_id", "integration_outbox", ["connector_id"])
        op.create_index("ix_integration_outbox_event_type", "integration_outbox", ["event_type"])

    if "integration_oauth_state" not in tables:
        op.create_table(
            "integration_oauth_state",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("company_id", sa.String(), sa.ForeignKey("company.id"), nullable=False),
            sa.Column("connector_id", sa.String(), sa.ForeignKey("integration_connector.id"), nullable=False),
            sa.Column("state", sa.String(), nullable=False, unique=True),
            sa.Column("redirect_uri", sa.String(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_integration_oauth_state_company_id", "integration_oauth_state", ["company_id"])
        op.create_index("ix_integration_oauth_state_connector_id", "integration_oauth_state", ["connector_id"])


def downgrade() -> None:
    op.drop_table("integration_oauth_state")
    op.drop_table("integration_outbox")
    op.drop_table("integration_inbox")
    op.drop_table("integration_connector")
