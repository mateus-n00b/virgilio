from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, utcnow


class PushToken(Base):
    """Aparelho que recebe push (Expo push token). Um aparelho pertence ao último usuário que entrou nele."""

    __tablename__ = "push_tokens"
    __table_args__ = (CheckConstraint("platform IN ('android','ios')", name="ck_push_tokens_platform"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True)
    platform: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    disabled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # app desinstalado (DeviceNotRegistered)


class DeliveryKind(StrEnum):
    REMINDER = "REMINDER"  # para o usuário: "você está bem?"
    ALERT = "ALERT"  # para os Virgílios: sem prova de vida (ou SOS)
    ACK = "ACK"  # para os outros Virgílios: "fulano vai verificar"
    RESOLVED = "RESOLVED"  # para os Virgílios: "está tudo bem"
    INVITE = "INVITE"  # para o Virgílio convidado (se tiver e-mail)


class DeliveryChannel(StrEnum):
    EMAIL = "EMAIL"
    PUSH = "PUSH"


class DeliveryStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    SKIPPED = "SKIPPED"  # sem e-mail configurado, sem aparelho, destinatário removido
    FAILED = "FAILED"  # desistência após várias tentativas


class Delivery(Base):
    """Fila de saída (padrão Outbox): gravada na mesma transação do evento e enviada logo depois.

    Se o envio falhar (SMTP fora do ar, Expo indisponível), o aviso fica pendente e a próxima
    varredura do cron tenta de novo. Num app de segurança pessoal, nenhum alerta pode se perder.
    """

    __tablename__ = "deliveries"
    __table_args__ = (
        CheckConstraint("kind IN ('REMINDER','ALERT','ACK','RESOLVED','INVITE')", name="ck_deliveries_kind"),
        CheckConstraint("channel IN ('EMAIL','PUSH')", name="ck_deliveries_channel"),
        CheckConstraint("status IN ('PENDING','SENT','SKIPPED','FAILED')", name="ck_deliveries_status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    channel: Mapped[str] = mapped_column(String(10))
    subject_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # a pessoa acompanhada
    guardian_id: Mapped[int | None] = mapped_column(ForeignKey("guardians.id", ondelete="CASCADE"), index=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(10), default=DeliveryStatus.PENDING, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
