"""Ciclo de prova de vida: um "Watch" por pessoa e os alertas abertos para os Virgílios.

Linha do tempo de um ciclo (x = interval_days, y = grace_days):

    check-in ──── x dias ────▶ due_at ──── y dias ────▶ alert_at
       OK                   lembrete (REMINDED)        alerta aos Virgílios (ALERTED)

Qualquer prova de vida (botão, link do e-mail, Virgílio que encontrou a pessoa) volta para OK.
"""
from datetime import datetime, timedelta
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, utcnow


class WatchState(StrEnum):
    OK = "OK"
    REMINDED = "REMINDED"  # prazo vencido, lembrete enviado, aguardando a prova de vida
    ALERTED = "ALERTED"  # Virgílios avisados


class Watch(Base):
    __tablename__ = "watches"
    __table_args__ = (
        CheckConstraint("state IN ('OK','REMINDED','ALERTED')", name="ck_watches_state"),
        CheckConstraint("interval_days >= 1", name="ck_watches_interval"),
        CheckConstraint("grace_days >= 1", name="ck_watches_grace"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    interval_days: Mapped[int] = mapped_column(Integer)
    grace_days: Mapped[int] = mapped_column(Integer)
    last_check_in_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # Pausa (viagem, internação planejada...): nada é cobrado até esta data; ela conta como prova de vida
    paused_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    state: Mapped[str] = mapped_column(String(20), default=WatchState.OK, index=True)
    last_reminder_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Última localização conhecida, enviada (opcionalmente) junto com uma prova de vida ou SOS.
    # Criptografada (app.core.crypto) e revelada aos Virgílios só durante um alerta.
    last_location_enc: Mapped[str | None] = mapped_column(Text)
    last_location_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    def is_paused(self, now: datetime) -> bool:
        return self.paused_until is not None and self.paused_until > now

    def base_at(self, now: datetime) -> datetime:
        """Início do ciclo atual: a última prova de vida ou o fim da pausa, o que for mais recente."""
        if self.paused_until is not None and self.paused_until <= now and self.paused_until > self.last_check_in_at:
            return self.paused_until
        return self.last_check_in_at

    def due_at(self, now: datetime) -> datetime:
        return self.base_at(now) + timedelta(days=self.interval_days)

    def alert_at(self, now: datetime) -> datetime:
        return self.due_at(now) + timedelta(days=self.grace_days)


class AlertReason(StrEnum):
    MISSED = "MISSED"  # prazo x + y sem prova de vida
    SOS = "SOS"  # a própria pessoa pediu ajuda


class AlertStatus(StrEnum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint("reason IN ('MISSED','SOS')", name="ck_alerts_reason"),
        CheckConstraint("status IN ('OPEN','RESOLVED')", name="ck_alerts_status"),
        CheckConstraint("resolved_by IS NULL OR resolved_by IN ('USER','GUARDIAN')", name="ck_alerts_resolved_by"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default=AlertStatus.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_notified_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    notify_count: Mapped[int] = mapped_column(Integer, default=1)
    # Virgílio que avisou "vou verificar" (os outros ficam sabendo e os avisos repetidos param)
    acknowledged_by_guardian_id: Mapped[int | None] = mapped_column(ForeignKey("guardians.id", ondelete="SET NULL"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolved_by: Mapped[str | None] = mapped_column(String(10))
    resolved_by_guardian_id: Mapped[int | None] = mapped_column(ForeignKey("guardians.id", ondelete="SET NULL"))
