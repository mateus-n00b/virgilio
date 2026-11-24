"""Web Push: aparelho do tipo "web" (navegador / app instalado pelo Chrome)

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-24 15:30:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("push_tokens", "token", type_=sa.String(length=1024), existing_type=sa.String(length=255), existing_nullable=False)
    op.add_column("push_tokens", sa.Column("web_p256dh", sa.String(length=128), nullable=True))
    op.add_column("push_tokens", sa.Column("web_auth", sa.String(length=64), nullable=True))
    op.drop_constraint("ck_push_tokens_platform", "push_tokens", type_="check")
    op.create_check_constraint("ck_push_tokens_platform", "push_tokens", "platform IN ('android','ios','web')")


def downgrade() -> None:
    op.execute("DELETE FROM push_tokens WHERE platform = 'web'")
    op.drop_constraint("ck_push_tokens_platform", "push_tokens", type_="check")
    op.create_check_constraint("ck_push_tokens_platform", "push_tokens", "platform IN ('android','ios')")
    op.drop_column("push_tokens", "web_auth")
    op.drop_column("push_tokens", "web_p256dh")
    op.alter_column("push_tokens", "token", type_=sa.String(length=255), existing_type=sa.String(length=1024), existing_nullable=False)
