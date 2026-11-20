from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.core.config import get_settings


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100_000)


class LocationOut(BaseModel):
    lat: float
    lng: float
    accuracy_m: float | None
    at: datetime
    maps_url: str


class CheckInIn(BaseModel):
    """Corpo opcional do check-in e do SOS: a localização só vai se a pessoa escolher compartilhar."""

    location: LocationIn | None = None


class AlertOut(BaseModel):
    id: int
    reason: str
    status: str
    created_at: datetime
    notify_count: int
    acknowledged_at: datetime | None
    acknowledged_by: str | None = None  # nome do Virgílio que vai verificar
    resolved_at: datetime | None = None


class WatchOut(BaseModel):
    interval_days: int
    grace_days: int
    state: str  # OK | REMINDED | ALERTED
    paused: bool
    paused_until: datetime | None
    last_check_in_at: datetime
    due_at: datetime
    alert_at: datetime
    alert: AlertOut | None
    guardians_accepted: int
    guardians_reachable: int  # aceitaram e têm como ser avisados (e-mail com SMTP ativo, ou app)
    guardians_pending: int
    location_shared_at: datetime | None  # quando a última localização foi guardada (nunca o local em si)


class WatchUpdateIn(BaseModel):
    interval_days: int = Field(ge=1)
    grace_days: int = Field(ge=1)
    paused_until: datetime | None = None

    @model_validator(mode="after")
    def _limits(self):
        s = get_settings()
        if self.interval_days > s.max_interval_days:
            raise ValueError(f"O intervalo pode ser de no máximo {s.max_interval_days} dias.")
        if self.grace_days > s.max_grace_days:
            raise ValueError(f"A tolerância pode ser de no máximo {s.max_grace_days} dias.")
        return self


class LinkCheckInIn(BaseModel):
    token: str = Field(min_length=10, max_length=2000)
    location: LocationIn | None = None


class LinkCheckInOut(BaseModel):
    name: str
    confirmed_now: bool
