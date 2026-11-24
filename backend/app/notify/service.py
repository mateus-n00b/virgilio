"""Fila de avisos (e-mail e push) e aparelhos que recebem push."""
import logging
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError
from app.core.mailer import mail_configured, send_email
from app.guardians.models import Guardian, GuardianStatus
from app.notify import messages, push, webpush
from app.notify.models import Delivery, DeliveryChannel, DeliveryKind, DeliveryStatus, PushToken
from app.users.models import User, UserStatus
from app.watch.models import Alert, AlertStatus, Watch, WatchState

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
STALE_AFTER = timedelta(days=3)  # aviso que não saiu nesse prazo perde o sentido (o cron gera outro)


# ------------------------------------------------------------------ aparelhos


def register_token(db: Session, user: User, token: str, platform: str) -> None:
    """Associa o aparelho ao usuário atual. Se outra conta usou o aparelho antes, ele passa para esta."""
    if not push.is_expo_token(token):
        raise AppError(422, "invalid_push_token", "Token de notificação inválido.")
    now = utcnow()
    row = db.scalar(select(PushToken).where(PushToken.token == token))
    if row is None:
        db.add(PushToken(user_id=user.id, token=token, platform=platform, created_at=now, last_seen_at=now))
    else:
        row.user_id, row.platform, row.last_seen_at, row.disabled_at = user.id, platform, now, None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # o mesmo aparelho registrado em paralelo; o outro registro vale


def register_web_subscription(db: Session, user: User, endpoint: str, p256dh: str, auth: str) -> None:
    """Inscrição Web Push do navegador (Chrome/Android, app instalado ou não)."""
    if not get_settings().web_push_enabled:
        raise AppError(503, "web_push_disabled", "Notificações no navegador ainda não configuradas.")
    if not webpush.valid_endpoint(endpoint):
        raise AppError(422, "invalid_push_token", "Inscrição de notificação inválida.")
    now = utcnow()
    row = db.scalar(select(PushToken).where(PushToken.token == endpoint))
    if row is None:
        db.add(PushToken(user_id=user.id, token=endpoint, platform="web", web_p256dh=p256dh, web_auth=auth, created_at=now, last_seen_at=now))
    else:
        row.user_id, row.platform, row.web_p256dh, row.web_auth, row.last_seen_at, row.disabled_at = user.id, "web", p256dh, auth, now, None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def _active_tokens():
    """Aparelhos ativos; inscrições web só contam se o Web Push estiver configurado."""
    q = select(PushToken).where(PushToken.disabled_at.is_(None))
    if not get_settings().web_push_enabled:
        q = q.where(PushToken.platform != "web")
    return q


def unregister_token(db: Session, user: User, token: str) -> None:
    db.execute(delete(PushToken).where(PushToken.token == token, PushToken.user_id == user.id))
    db.commit()


def has_device(db: Session, user_id: int | None) -> bool:
    if user_id is None:
        return False
    return db.scalar(_active_tokens().where(PushToken.user_id == user_id).limit(1)) is not None


# ------------------------------------------------------------------ fila (sem commit: na transação do evento)


def _add(db: Session, kind: str, channel: str, subject_user_id: int, guardian_id: int | None = None, alert_id: int | None = None):
    db.add(Delivery(kind=kind, channel=channel, subject_user_id=subject_user_id, guardian_id=guardian_id, alert_id=alert_id))


def enqueue_reminder(db: Session, user: User) -> None:
    _add(db, DeliveryKind.REMINDER, DeliveryChannel.EMAIL, user.id)
    if has_device(db, user.id):
        _add(db, DeliveryKind.REMINDER, DeliveryChannel.PUSH, user.id)


def enqueue_for_guardians(
    db: Session, user_id: int, kind: str, alert_id: int | None = None, exclude_guardian_id: int | None = None
) -> int:
    """Um aviso por canal disponível de cada Virgílio que aceitou. Retorna quantos Virgílios."""
    count = 0
    for g in db.scalars(select(Guardian).where(Guardian.user_id == user_id, Guardian.status == GuardianStatus.ACCEPTED)):
        if g.id == exclude_guardian_id:
            continue
        reached = False
        if g.email:
            _add(db, kind, DeliveryChannel.EMAIL, user_id, g.id, alert_id)
            reached = True
        if has_device(db, g.linked_user_id):
            _add(db, kind, DeliveryChannel.PUSH, user_id, g.id, alert_id)
            reached = True
        count += reached
    return count


def enqueue_invite(db: Session, guardian: Guardian) -> bool:
    if not guardian.email:
        return False
    _add(db, DeliveryKind.INVITE, DeliveryChannel.EMAIL, guardian.user_id, guardian.id)
    return True


def forget_user(db: Session, user_id: int) -> None:
    """Exclusão de conta: remove aparelhos e avisos. Sem commit."""
    db.execute(delete(PushToken).where(PushToken.user_id == user_id))
    db.execute(delete(Delivery).where(Delivery.subject_user_id == user_id))


# ------------------------------------------------------------------ envio


def _skip_reason(d: Delivery, user: User | None, guardian: Guardian | None, alert: Alert | None, watch: Watch | None, now) -> str | None:
    if d.created_at < now - STALE_AFTER:
        return "stale"
    if user is None or user.status != UserStatus.ACTIVE or watch is None:
        return "user_inactive"
    if d.kind == DeliveryKind.REMINDER:
        return "already_checked_in" if watch.state == WatchState.OK else None
    if guardian is None:
        return "guardian_removed"
    if d.kind == DeliveryKind.INVITE:
        return None if guardian.status == GuardianStatus.PENDING else "invite_answered"
    if guardian.status != GuardianStatus.ACCEPTED:
        return "guardian_inactive"
    if d.kind in (DeliveryKind.ALERT, DeliveryKind.ACK) and (alert is None or alert.status != AlertStatus.OPEN):
        return "alert_resolved"
    return None


def _build(d: Delivery, user: User, guardian: Guardian | None, alert: Alert | None, watch: Watch, db: Session, now) -> messages.Message:
    if d.kind == DeliveryKind.REMINDER:
        accepted = list(db.scalars(select(Guardian).where(Guardian.user_id == user.id, Guardian.status == GuardianStatus.ACCEPTED)))
        return messages.reminder(user, watch, accepted, now)
    assert guardian is not None
    if d.kind == DeliveryKind.ALERT:
        assert alert is not None
        return messages.alert(user, watch, guardian, alert, now)
    if d.kind == DeliveryKind.ACK:
        by = db.get(Guardian, alert.acknowledged_by_guardian_id) if alert and alert.acknowledged_by_guardian_id else None
        return messages.ack(user, guardian, by)
    if d.kind == DeliveryKind.RESOLVED:
        by = db.get(Guardian, alert.resolved_by_guardian_id) if alert and alert.resolved_by_guardian_id else None
        return messages.resolved(user, guardian, alert, by)
    return messages.invite(user, guardian)


def _web_payload(p: dict) -> dict:
    """Mesmo texto do app nativo; a rota (/ ou /protegidos/<token>) existe igual no site."""
    url = p["data"]["url"]
    return {"title": p["title"], "body": p["body"], "url": url, "tag": url}


def _send_all(flat: list[tuple[Delivery, PushToken, dict]]) -> list[dict]:
    """Expo em lote; Web Push um a um. Tickets na mesma ordem de `flat`."""
    tickets: list[dict | None] = [None] * len(flat)
    expo = [i for i, (_, t, _) in enumerate(flat) if t.platform != "web"]
    if expo:
        for i, ticket in zip(expo, push.send([flat[i][2] for i in expo])):
            tickets[i] = ticket
    for i, (_, t, m) in enumerate(flat):
        if t.platform == "web":
            tickets[i] = webpush.send({"endpoint": t.token, "keys": {"p256dh": t.web_p256dh, "auth": t.web_auth}}, m)
    return tickets  # type: ignore[return-value]


def dispatch(db: Session, *, limit: int = 1000) -> dict[str, int]:
    """Envia os avisos pendentes e registra o resultado. Pode rodar em paralelo (linhas travadas)."""
    now = utcnow()
    stats = {"sent": 0, "skipped": 0, "failed": 0, "retry": 0}
    pending = list(
        db.scalars(
            select(Delivery)
            .where(Delivery.status == DeliveryStatus.PENDING)
            .order_by(Delivery.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    if not pending:
        db.rollback()
        return stats

    def skip(d: Delivery, reason: str) -> None:
        d.status, d.last_error = DeliveryStatus.SKIPPED, reason
        stats["skipped"] += 1

    def fail(d: Delivery, error: str) -> None:
        d.attempts += 1
        d.last_error = error[:255]
        if d.attempts >= MAX_ATTEMPTS:
            d.status = DeliveryStatus.FAILED
            stats["failed"] += 1
        else:
            stats["retry"] += 1

    def sent(d: Delivery) -> None:
        d.status, d.sent_at, d.last_error = DeliveryStatus.SENT, now, None
        stats["sent"] += 1

    outgoing: list[tuple[Delivery, list[PushToken], dict]] = []
    for d in pending:
        user = db.get(User, d.subject_user_id)
        guardian = db.get(Guardian, d.guardian_id) if d.guardian_id else None
        alert = db.get(Alert, d.alert_id) if d.alert_id else None
        watch = db.get(Watch, d.subject_user_id)
        reason = _skip_reason(d, user, guardian, alert, watch, now)
        if reason:
            skip(d, reason)
            continue
        msg = _build(d, user, guardian, alert, watch, db, now)

        if d.channel == DeliveryChannel.EMAIL:
            to = user.email if d.kind == DeliveryKind.REMINDER else guardian.email
            if not to:
                skip(d, "no_email")
            elif not mail_configured():
                skip(d, "mail_disabled")
            elif send_email(to, msg.subject, msg.body):
                sent(d)
            else:
                fail(d, "smtp_error")
            continue

        recipient_id = user.id if d.kind == DeliveryKind.REMINDER else guardian.linked_user_id
        tokens = list(db.scalars(_active_tokens().where(PushToken.user_id == recipient_id))) if recipient_id else []
        if not tokens:
            skip(d, "no_device")
            continue
        payload = {
            "title": msg.push_title[:100],
            "body": msg.push_body[:180],
            "data": {"url": msg.push_url},
            "sound": "default",
            "channelId": messages.ANDROID_CHANNEL,
            "priority": "high",
        }
        outgoing.append((d, tokens, payload))

    if outgoing:
        flat = [(d, t, _web_payload(p) if t.platform == "web" else {**p, "to": t.token}) for d, tokens, p in outgoing for t in tokens]
        tickets = _send_all(flat)
        results: dict[int, list[str]] = defaultdict(list)
        for (d, token, _), ticket in zip(flat, tickets):
            if ticket.get("status") == "ok":
                results[d.id].append("ok")
                continue
            error = (ticket.get("details") or {}).get("error") or "Unknown"
            if error == "DeviceNotRegistered":
                token.disabled_at = now  # app desinstalado ou permissão revogada
            results[d.id].append(error)
        for d, _, _ in outgoing:
            outcome = results[d.id]
            if "ok" in outcome:
                sent(d)
            elif all(e == "DeviceNotRegistered" for e in outcome):
                skip(d, "no_device")
            else:
                fail(d, ",".join(sorted(set(outcome))))
    db.commit()
    return stats


def dispatch_quietly(db: Session) -> None:
    """Envio logo após o evento. Falhas ficam pendentes para a próxima varredura e não afetam a ação."""
    try:
        stats = dispatch(db, limit=200)
        if any(stats.values()):
            log.info("avisos: %s", stats)
    except Exception:  # noqa: BLE001 - a ação já foi confirmada; a varredura tenta de novo
        db.rollback()
        log.exception("falha ao enviar avisos")
