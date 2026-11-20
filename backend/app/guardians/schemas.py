from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.users.schemas import clean_optional
from app.watch.schemas import AlertOut, LocationOut


class GuardianIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    relation: str | None = Field(default=None, max_length=60)

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v):
        v = clean_optional(v)
        return v.lower() if v else None

    @field_validator("phone", "relation")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_optional(v)


class GuardianOut(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    relation: str | None
    status: str
    has_app: bool  # aceitou logado no app: recebe push além do e-mail
    invite_url: str
    created_at: datetime
    responded_at: datetime | None


class AcceptIn(BaseModel):
    email: EmailStr | None = None
    link_account: bool = False  # vincula a conta logada (recebe push no app)

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v):
        v = clean_optional(v)
        return v.lower() if v else None


class PersonOut(BaseModel):
    name: str
    first_name: str


class ContactOut(BaseModel):
    email: str
    phone: str | None
    address: str | None


class InstructionView(BaseModel):
    title: str
    body: str


class WatchView(BaseModel):
    state: str
    paused: bool
    last_check_in_at: datetime
    interval_days: int
    due_at: datetime


class GuardianView(BaseModel):
    """O que um Virgílio vê no seu link. Dados pessoais e instruções só aparecem durante um alerta."""

    guardian_name: str
    guardian_email: str | None
    status: str
    has_app: bool
    person: PersonOut
    watch: WatchView | None = None  # só depois de aceitar
    alert: AlertOut | None = None
    contact: ContactOut | None = None  # só com alerta aberto
    last_location: LocationOut | None = None  # só com alerta aberto (última localização conhecida)
    instructions: list[InstructionView] = []  # só com alerta aberto
    other_guardians: list[str] = []  # só com alerta aberto, para combinarem entre si


class ProtectingOut(BaseModel):
    token: str
    person_name: str
    state: str
    paused: bool
    last_check_in_at: datetime
    alert: AlertOut | None
