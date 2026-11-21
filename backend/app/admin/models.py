from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, Integer, String
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.db import Base, UTCDateTime, utcnow


class AuditEvent(Base):
    """Trilha das ações administrativas. Sem dados pessoais: só IDs, ação e motivo.

    Sem chave estrangeira de propósito: a trilha sobrevive à exclusão das contas envolvidas.
    """

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, index=True)  # None = sistema
    action: Mapped[str] = mapped_column(String(60), index=True)
    target_user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)


class DailyStat(Base):
    """Foto diária de números agregados (série histórica do painel), sem rastrear ninguém."""

    __tablename__ = "daily_stats"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


def audit(db: Session, actor_user_id: int | None, action: str, target_user_id: int | None = None, **details: Any) -> None:
    """Registra na transação corrente (sem commit). Não passe dados pessoais em `details`."""
    db.add(AuditEvent(actor_user_id=actor_user_id, action=action, target_user_id=target_user_id, details=details))
