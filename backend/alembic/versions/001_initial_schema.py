"""Initial Pulse POS schema from SQLModel metadata.

Revision ID: 001_initial
Revises:
Create Date: 2026-06-26
"""

from alembic import op
from sqlmodel import SQLModel

import app.models  # noqa: F401 — register all tables

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.drop_all(bind)
