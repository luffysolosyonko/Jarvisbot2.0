"""drop the bar weight and weigh-in check settings (fixed at 45 lb and 5%)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-10 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.drop_column("outlier_pct")
        batch_op.drop_column("bar_lb")


def downgrade() -> None:
    with op.batch_alter_table("user_settings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bar_lb", sa.Float(), nullable=False, server_default="45"))
        batch_op.add_column(
            sa.Column("outlier_pct", sa.Integer(), nullable=False, server_default="5")
        )
