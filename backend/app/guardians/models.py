from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, UTCDateTime, utcnow


class GuardianStatus(StrEnum):
    PENDING = "PENDING"  # convite enviado, ainda sem resposta
    ACCEPTED = "ACCEPTED"
    DECLINED = "DECLINED"  # recusou o convite ou deixou de ser Virgílio


class Guardian(Base):
    """Um Virgílio: pessoa próxima (amigo, vizinho, conhecido) avisada se o usuário sumir.

    Não precisa ter conta. O acesso é pelo link pessoal (token), enviado no convite e nos alertas.
    Se aceitar o convite logado no app, a conta fica vinculada (linked_user_id) e recebe push também.
    """

    __tablename__ = "guardians"
    __table_args__ = (CheckConstraint("status IN ('PENDING','ACCEPTED','DECLINED')", name="ck_guardians_status"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # quem é protegido
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(30))
    relation: Mapped[str | None] = mapped_column(String(60))  # vizinha, amigo, primo...
    token: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), default=GuardianStatus.PENDING, index=True)
    linked_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    responded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
