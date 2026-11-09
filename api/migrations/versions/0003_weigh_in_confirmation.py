"""weigh-in confirmation: what was typed, assumed units, and confirmed outliers

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-10 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("logs", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("weight_confirmed", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("weigh_ins", schema=None) as batch_op:
        batch_op.add_column(sa.Column("typed", sa.Float(), nullable=True))
        batch_op.add_column(
            sa.Column("typed_unit", sa.String(length=2), nullable=False, server_default="lb")
        )
        batch_op.add_column(
            sa.Column("unit_assumed", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("weigh_ins", schema=None) as batch_op:
        batch_op.drop_column("unit_assumed")
        batch_op.drop_column("typed_unit")
        batch_op.drop_column("typed")
    with op.batch_alter_table("logs", schema=None) as batch_op:
        batch_op.drop_column("weight_confirmed")
