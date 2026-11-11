"""drop the weigh-in confirmation flag and hidden Ask answers

Every weigh-in counts as written, and Ask answers can no longer be hidden: the ones
that were hidden are deleted.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-12 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    ask_messages = sa.table("ask_messages", sa.column("hidden", sa.Boolean()))
    op.execute(ask_messages.delete().where(ask_messages.c.hidden.is_(True)))
    with op.batch_alter_table("ask_messages", schema=None) as batch_op:
        batch_op.drop_column("hidden")
    with op.batch_alter_table("logs", schema=None) as batch_op:
        batch_op.drop_column("weight_confirmed")


def downgrade() -> None:
    with op.batch_alter_table("logs", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("weight_confirmed", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table("ask_messages", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false())
        )
