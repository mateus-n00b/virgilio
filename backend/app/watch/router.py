import hmac

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db, utcnow
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.mailer import mail_configured
from app.core.ratelimit import RateLimit
from app.guardians.models import Guardian, GuardianStatus
from app.notify import service as notify
from app.users.models import User
from app.watch import service
from app.watch.models import Alert
from app.watch.schemas import AlertOut, CheckInIn, LinkCheckInIn, LinkCheckInOut, WatchOut, WatchUpdateIn

router = APIRouter(tags=["prova de vida"])


def alert_out(db: Session, alert: Alert | None) -> AlertOut | None:
    if alert is None:
        return None
    ack = db.get(Guardian, alert.acknowledged_by_guardian_id) if alert.acknowledged_by_guardian_id else None
    return AlertOut(
        id=alert.id,
        reason=alert.reason,
        status=alert.status,
        created_at=alert.created_at,
        notify_count=alert.notify_count,
        acknowledged_at=alert.acknowledged_at,
        acknowledged_by=ack.name if ack else None,
        resolved_at=alert.resolved_at,
    )


def watch_out(db: Session, user: User) -> WatchOut:
    watch = service.get_watch(db, user)
    now = utcnow()
    guardians = list(db.scalars(select(Guardian).where(Guardian.user_id == user.id)))
    accepted = [g for g in guardians if g.status == GuardianStatus.ACCEPTED]
    mail = mail_configured()
    reachable = sum(1 for g in accepted if (g.email and mail) or notify.has_device(db, g.linked_user_id))
    return WatchOut(
        interval_days=watch.interval_days,
        grace_days=watch.grace_days,
        state=watch.state,
        paused=watch.is_paused(now),
        paused_until=watch.paused_until if watch.is_paused(now) else None,
        last_check_in_at=watch.last_check_in_at,
        due_at=watch.due_at(now),
        alert_at=watch.alert_at(now),
        alert=alert_out(db, service.open_alert(db, user.id)),
        guardians_accepted=len(accepted),
        guardians_reachable=reachable,
        guardians_pending=sum(1 for g in guardians if g.status == GuardianStatus.PENDING),
        location_shared_at=watch.last_location_at,
    )


@router.get("/me/watch", response_model=WatchOut)
def get_watch(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return watch_out(db, user)


@router.put("/me/watch", response_model=WatchOut)
def update_watch(body: WatchUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    service.update_settings(db, user, body.interval_days, body.grace_days, body.paused_until)
    return watch_out(db, user)


@router.post("/me/check-in", response_model=WatchOut, dependencies=[Depends(RateLimit("check_in", times=30, seconds=60))])
def check_in(body: CheckInIn | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """"Estou bem": prova de vida, opcionalmente com a localização atual."""
    service.check_in(db, user, location=body.location if body else None)
    return watch_out(db, user)


@router.post("/me/sos", response_model=WatchOut, dependencies=[Depends(RateLimit("sos", times=10, seconds=600))])
def sos(body: CheckInIn | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pedido de ajuda: avisa os Virgílios na hora."""
    service.sos(db, user, location=body.location if body else None)
    return watch_out(db, user)


@router.delete("/me/location", response_model=WatchOut)
def clear_location(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Apaga a última localização guardada."""
    service.clear_location(db, user)
    return watch_out(db, user)


@router.post("/check-in/link", response_model=LinkCheckInOut, dependencies=[Depends(RateLimit("check_in_link", times=30, seconds=600))])
def check_in_link(body: LinkCheckInIn, db: Session = Depends(get_db)):
    """Confirmação em um clique pelo link do e-mail de lembrete (sem login)."""
    user, now = service.check_in_with_link(db, body.token, body.location)
    return LinkCheckInOut(name=user.first_name, confirmed_now=now)


@router.get("/internal/sweep", include_in_schema=False)
def sweep(request: Request, db: Session = Depends(get_db)) -> dict:
    """Varredura chamada pelo cron (Vercel Cron ou GitHub Actions) com Authorization: Bearer <CRON_SECRET>."""
    secret = get_settings().cron_secret
    if not secret:
        raise AppError(503, "cron_disabled", "Varredura não configurada (defina CRON_SECRET).")
    given = request.headers.get("authorization", "")
    if not hmac.compare_digest(given.encode(), f"Bearer {secret}".encode()):
        raise AppError(401, "unauthorized", "Não autorizado.")
    from app.admin import service as admin

    stats = service.sweep(db)
    out = {**stats, **notify.dispatch(db, limit=5000)}
    out["encrypted_legacy"] = admin.encrypt_legacy(db)
    out["purged"] = admin.purge_expired(db)
    out["snapshot"] = admin.snapshot_daily(db)
    return out
