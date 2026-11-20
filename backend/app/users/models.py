from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, utcnow


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class User(Base):
    """Pessoa que usa o app: quem é acompanhado e/ou quem é Virgílio de alguém."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("status IN ('ACTIVE','SUSPENDED')", name="ck_users_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)  # sempre em minúsculas
    password_hash: Mapped[str] = mapped_column(String(255))  # scrypt (app.core.security)
    # Incrementado ao redefinir a senha: invalida todas as sessões e links de redefinição anteriores
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # Mostrados aos Virgílios só durante um alerta, para que saibam como chegar e quem chamar
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.ACTIVE)
    terms_accepted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    @property
    def first_name(self) -> str:
        return self.name.split(" ")[0] if self.name else ""
