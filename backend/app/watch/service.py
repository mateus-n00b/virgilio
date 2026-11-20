"""Prova de vida: check-in, pedido de ajuda (SOS), pausa e a varredura periódica (cron)."""
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.core.db import utcnow
from app.core.errors import AppError
from app.core.security import decode_purpose_token
from app.guardians.models import Guardian
from app.notify import service as notify
from app.notify.models import DeliveryKind
from app.users.models import User, UserStatus
from app.watch.models import Alert, AlertReason, AlertStatus, Watch, WatchState
from app.watch.schemas import LocationIn, LocationOut

log = logging.getLogger(__name__)


def create_watch(db: Session, user: User) -> Watch:
    s = get_settings()
    watch = Watch(user_id=user.id, interval_days=s.default_interval_days, grace_days=s.default_grace_days, last_check_in_at=utcnow())
    db.add(watch)
    return watch


def get_watch(db: Session, user: User) -> Watch:
    watch = db.get(Watch, user.id)
    if watch is None:  # conta criada antes do ciclo existir (não deveria acontecer)
        watch = create_watch(db, user)
        db.commit()
    return watch


def open_alert(db: Session, user_id: int) -> Alert | None:
    return db.scalar(select(Alert).where(Alert.user_id == user_id, Alert.status == AlertStatus.OPEN).order_by(Alert.id.desc()))


# ------------------------------------------------------------------ última localização conhecida


def save_location(watch: Watch, location: LocationIn | None) -> None:
    """Sem localização nova, a anterior continua valendo como "última conhecida"."""
    if location is None:
        return
    data = {"lat": round(location.lat, 6), "lng": round(location.lng, 6), "accuracy_m": location.accuracy_m}
    watch.last_location_enc = encrypt(json.dumps(data))
    watch.last_location_at = utcnow()


def clear_location(db: Session, user: User) -> None:
    watch = get_watch(db, user)
    watch.last_location_enc = watch.last_location_at = None
    db.commit()


def read_location(watch: Watch) -> LocationOut | None:
    if not watch.last_location_enc or watch.last_location_at is None:
        return None
    try:
        data = json.loads(decrypt(watch.last_location_enc))
        lat, lng = float(data["lat"]), float(data["lng"])
    except (ValueError, KeyError, TypeError):
        return None  # chave trocada ou dado corrompido
    return LocationOut(
        lat=lat,
        lng=lng,
        accuracy_m=data.get("accuracy_m"),
        at=watch.last_location_at,
        maps_url=f"https://www.google.com/maps/search/?api=1&query={lat},{lng}",
    )


# ------------------------------------------------------------------ ações da pessoa


def check_in(db: Session, user: User, *, by_guardian: Guardian | None = None, location: LocationIn | None = None) -> Watch:
    """Prova de vida. Encerra o alerta aberto, se houver, e avisa os Virgílios que está tudo bem."""
    watch = get_watch(db, user)
    now = utcnow()
    save_location(watch, location)
    watch.last_check_in_at = now
    watch.state = WatchState.OK
    watch.last_reminder_at = None
    if watch.paused_until is not None and watch.paused_until <= now:
        watch.paused_until = None
    alert = open_alert(db, user.id)
    if alert is not None:
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = now
        alert.resolved_by = "GUARDIAN" if by_guardian else "USER"
        alert.resolved_by_guardian_id = by_guardian.id if by_guardian else None
        db.flush()
        notify.enqueue_for_guardians(
            db, user.id, DeliveryKind.RESOLVED, alert.id, exclude_guardian_id=by_guardian.id if by_guardian else None
        )
    db.commit()
    if alert is not None:
        notify.dispatch_quietly(db)
    return watch


def check_in_with_link(db: Session, token: str, location: LocationIn | None = None) -> tuple[User, bool]:
    """Confirmação pelo link do e-mail, sem login. Retorna (usuário, confirmou_agora)."""
    payload = decode_purpose_token(token, "checkin")
    invalid = AppError(400, "invalid_link", "Link inválido ou expirado. Entre no app para confirmar.")
    if payload is None:
        raise invalid
    user = db.get(User, int(payload["sub"]))
    if user is None or user.status != UserStatus.ACTIVE:
        raise invalid
    watch = get_watch(db, user)
    if int(watch.base_at(utcnow()).timestamp() * 1000) != payload.get("base"):
        return user, False  # já houve outra prova de vida depois do e-mail: nada a fazer
    check_in(db, user, location=location)
    return user, True


def sos(db: Session, user: User, location: LocationIn | None = None) -> Alert:
    """A própria pessoa pede ajuda: alerta imediato aos Virgílios (com a localização, se enviada)."""
    watch = get_watch(db, user)
    save_location(watch, location)
    alert = open_alert(db, user.id)
    if alert is None:
        alert = _raise_alert(db, user, watch, AlertReason.SOS)
        db.commit()
        notify.dispatch_quietly(db)
    else:
        db.commit()
    return alert


def update_settings(db: Session, user: User, interval_days: int, grace_days: int, paused_until: datetime | None) -> Watch:
    s = get_settings()
    now = utcnow()
    if paused_until is not None and paused_until > now + timedelta(days=s.max_pause_days):
        raise AppError(422, "pause_too_long", f"A pausa pode durar no máximo {s.max_pause_days} dias.")
    watch = get_watch(db, user)
    watch.interval_days, watch.grace_days = interval_days, grace_days
    watch.paused_until = paused_until if paused_until and paused_until > now else None
    # Prazo novo ainda não vencido: o lembrete enviado deixa de valer
    if watch.state == WatchState.REMINDED and (watch.is_paused(now) or watch.due_at(now) > now):
        watch.state, watch.last_reminder_at = WatchState.OK, None
    db.commit()
    return watch


# ------------------------------------------------------------------ varredura (cron)


def _raise_alert(db: Session, user: User, watch: Watch, reason: str) -> Alert:
    now = utcnow()
    alert = Alert(user_id=user.id, reason=reason, created_at=now, last_notified_at=now, notify_count=1)
    db.add(alert)
    db.flush()
    watch.state = WatchState.ALERTED
    reached = notify.enqueue_for_guardians(db, user.id, DeliveryKind.ALERT, alert.id)
    if reached == 0:
        log.warning("alerta %s do usuário %s sem nenhum Virgílio alcançável", alert.id, user.id)
    return alert


def sweep(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Avança os ciclos vencidos: lembretes, alertas e avisos repetidos. Idempotente."""
    s = get_settings()
    now = now or utcnow()
    repeat = timedelta(hours=s.repeat_after_hours)
    stats = {"reminded": 0, "alerted": 0, "realerted": 0}
    watches = db.scalars(
        select(Watch)
        .join(User, User.id == Watch.user_id)
        .where(User.status == UserStatus.ACTIVE)
        .order_by(Watch.user_id)
        .with_for_update(of=Watch, skip_locked=True)
    ).all()
    for watch in watches:
        if watch.is_paused(now):
            continue
        user = db.get(User, watch.user_id)
        if watch.state == WatchState.OK:
            if now >= watch.due_at(now):
                watch.state, watch.last_reminder_at = WatchState.REMINDED, now
                notify.enqueue_reminder(db, user)
                stats["reminded"] += 1
        elif watch.state == WatchState.REMINDED:
            if now >= watch.alert_at(now):
                _raise_alert(db, user, watch, AlertReason.MISSED)
                stats["alerted"] += 1
            elif watch.last_reminder_at is None or now - watch.last_reminder_at >= repeat:
                watch.last_reminder_at = now
                notify.enqueue_reminder(db, user)
                stats["reminded"] += 1
        elif watch.state == WatchState.ALERTED:
            # Continua lembrando a pessoa (pode ter só esquecido) e insiste com os Virgílios
            # enquanto ninguém avisar que vai verificar
            if watch.last_reminder_at is None or now - watch.last_reminder_at >= repeat:
                watch.last_reminder_at = now
                notify.enqueue_reminder(db, user)
            alert = open_alert(db, user.id)
            if alert is None:
                _raise_alert(db, user, watch, AlertReason.MISSED)
                stats["alerted"] += 1
            elif (
                alert.acknowledged_at is None
                and alert.notify_count < s.max_alert_notifications
                and now - alert.last_notified_at >= repeat
            ):
                alert.notify_count += 1
                alert.last_notified_at = now
                notify.enqueue_for_guardians(db, user.id, DeliveryKind.ALERT, alert.id)
                stats["realerted"] += 1
    db.commit()
    return stats
