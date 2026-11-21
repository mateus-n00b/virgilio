"""Painel administrativo: estatísticas agregadas, suporte operacional e retenção de dados.

Regra de privacidade deste módulo: nada aqui decifra instruções, localização, endereço,
telefone ou dados dos Virgílios. O admin trabalha com contagens, estados, datas e erros técnicos.
"""
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.admin.models import AuditEvent, DailyStat, audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, not_found
from app.guardians.models import Guardian, GuardianStatus
from app.notify.models import Delivery, DeliveryStatus, PushToken
from app.users.models import User, UserStatus
from app.watch.models import Alert, AlertStatus, Watch, WatchState


def _count(db: Session, stmt) -> int:
    return db.scalar(stmt) or 0


# ------------------------------------------------------------------ estatísticas


def stats(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    users = select(func.count()).select_from(User).where(User.status == UserStatus.ACTIVE)
    checkins = select(func.count()).select_from(Watch).join(User, User.id == Watch.user_id).where(User.status == UserStatus.ACTIVE)

    by_state = dict(
        db.execute(
            select(Watch.state, func.count())
            .join(User, User.id == Watch.user_id)
            .where(User.status == UserStatus.ACTIVE)
            .group_by(Watch.state)
        ).all()
    )
    paused = _count(db, checkins.where(Watch.paused_until.is_not(None), Watch.paused_until > now))
    guardians = dict(db.execute(select(Guardian.status, func.count()).group_by(Guardian.status)).all())
    with_guardian = _count(
        db,
        select(func.count(func.distinct(Guardian.user_id))).where(Guardian.status == GuardianStatus.ACCEPTED),
    )
    alerts_30d = dict(db.execute(select(Alert.reason, func.count()).where(Alert.created_at >= d30).group_by(Alert.reason)).all())
    resolved_30d = dict(
        db.execute(
            select(Alert.resolved_by, func.count())
            .where(Alert.resolved_at.is_not(None), Alert.resolved_at >= d30)
            .group_by(Alert.resolved_by)
        ).all()
    )
    deliveries_7d = dict(
        db.execute(select(Delivery.status, func.count()).where(Delivery.created_at >= d7).group_by(Delivery.status)).all()
    )
    failure_reasons = dict(
        db.execute(
            select(Delivery.last_error, func.count())
            .where(Delivery.created_at >= d7, Delivery.status.in_([DeliveryStatus.FAILED, DeliveryStatus.SKIPPED]))
            .group_by(Delivery.last_error)
        ).all()
    )
    total = _count(db, users)
    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": total,
            "suspended": _count(db, select(func.count()).select_from(User).where(User.status == UserStatus.SUSPENDED)),
            "new_7d": _count(db, users.where(User.created_at >= d7)),
            "new_30d": _count(db, users.where(User.created_at >= d30)),
            # "Ativo" = fez prova de vida no período (é o uso que importa neste produto)
            "active_1d": _count(db, checkins.where(Watch.last_check_in_at >= d1)),
            "active_7d": _count(db, checkins.where(Watch.last_check_in_at >= d7)),
            "active_30d": _count(db, checkins.where(Watch.last_check_in_at >= d30)),
            "with_accepted_guardian": with_guardian,
            "without_accepted_guardian": max(total - with_guardian, 0),
            "with_app": _count(db, select(func.count(func.distinct(PushToken.user_id))).where(PushToken.disabled_at.is_(None))),
        },
        "cycle": {
            "ok": by_state.get(WatchState.OK, 0),
            "reminded": by_state.get(WatchState.REMINDED, 0),
            "alerted": by_state.get(WatchState.ALERTED, 0),
            "paused": paused,
        },
        "guardians": {
            "accepted": guardians.get(GuardianStatus.ACCEPTED, 0),
            "pending": guardians.get(GuardianStatus.PENDING, 0),
            "declined": guardians.get(GuardianStatus.DECLINED, 0),
        },
        "alerts": {
            "open": _count(db, select(func.count()).select_from(Alert).where(Alert.status == AlertStatus.OPEN)),
            "missed_30d": alerts_30d.get("MISSED", 0),
            "sos_30d": alerts_30d.get("SOS", 0),
            "resolved_by_user_30d": resolved_30d.get("USER", 0),
            "resolved_by_guardian_30d": resolved_30d.get("GUARDIAN", 0),
        },
        "deliveries_7d": {
            "sent": deliveries_7d.get(DeliveryStatus.SENT, 0),
            "pending": deliveries_7d.get(DeliveryStatus.PENDING, 0),
            "skipped": deliveries_7d.get(DeliveryStatus.SKIPPED, 0),
            "failed": deliveries_7d.get(DeliveryStatus.FAILED, 0),
            "reasons": {k or "?": v for k, v in sorted(failure_reasons.items(), key=lambda kv: -kv[1])},
        },
    }


def snapshot_daily(db: Session, now: datetime | None = None) -> bool:
    """Grava a foto do dia (uma por data UTC). Chamada pela varredura; idempotente."""
    now = now or utcnow()
    today = now.date()
    if db.get(DailyStat, today) is not None:
        return False
    s = stats(db, now)
    db.add(
        DailyStat(
            day=today,
            data={
                "users": s["users"]["total"],
                "new": _count(db, select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=1))),
                "active_1d": s["users"]["active_1d"],
                "active_7d": s["users"]["active_7d"],
                "alerted": s["cycle"]["alerted"],
                "guardians_accepted": s["guardians"]["accepted"],
            },
        )
    )
    db.commit()
    return True


def history(db: Session, days: int = 30) -> list[dict]:
    rows = db.scalars(select(DailyStat).order_by(DailyStat.day.desc()).limit(days))
    return [{"day": r.day.isoformat(), **r.data} for r in reversed(list(rows))]


# ------------------------------------------------------------------ retenção (LGPD)


def purge_expired(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Apaga o que passou do prazo de guarda. Chamada pela varredura."""
    s = get_settings()
    now = now or utcnow()
    out = {"deliveries": 0, "alerts": 0, "declined_guardians": 0}
    if s.retention_deliveries_days:
        r = db.execute(
            delete(Delivery).where(
                Delivery.status != DeliveryStatus.PENDING,
                Delivery.created_at < now - timedelta(days=s.retention_deliveries_days),
            )
        )
        out["deliveries"] = r.rowcount or 0
    if s.retention_alerts_days:
        old = select(Alert.id).where(
            Alert.status == AlertStatus.RESOLVED, Alert.resolved_at < now - timedelta(days=s.retention_alerts_days)
        )
        db.execute(delete(Delivery).where(Delivery.alert_id.in_(old)))
        r = db.execute(delete(Alert).where(Alert.id.in_(old)))
        out["alerts"] = r.rowcount or 0
    if s.retention_declined_guardians_days:
        old_g = select(Guardian.id).where(
            Guardian.status == GuardianStatus.DECLINED,
            Guardian.responded_at < now - timedelta(days=s.retention_declined_guardians_days),
        )
        db.execute(delete(Delivery).where(Delivery.guardian_id.in_(old_g)))
        r = db.execute(delete(Guardian).where(Guardian.id.in_(old_g)))
        out["declined_guardians"] = r.rowcount or 0
    if any(out.values()):
        audit(db, None, "retention.purge", **out)
    db.commit()
    return out


# ------------------------------------------------------------------ criptografia de dados antigos


ENCRYPTED_COLUMNS = {User: ("phone", "address"), Guardian: ("name", "email", "phone", "relation")}


def encrypt_legacy(db: Session, batch: int = 500) -> int:
    """Cifra valores gravados em texto puro antes da migração 0002. Idempotente; roda na varredura.

    O filtro é SQL literal de propósito: comparar a coluna cifrada com um parâmetro cifraria o padrão.
    """
    total = 0
    for model, cols in ENCRYPTED_COLUMNS.items():
        table = model.__tablename__
        cond = " OR ".join(f"({c} IS NOT NULL AND {c} NOT LIKE 'gAAAAA%')" for c in cols)
        ids = list(db.execute(text(f"SELECT id FROM {table} WHERE {cond} LIMIT :n"), {"n": batch}).scalars())
        for row in db.scalars(select(model).where(model.id.in_(ids))) if ids else []:
            for c in cols:
                if getattr(row, c) is not None:
                    flag_modified(row, c)  # regrava: o tipo EncryptedText cifra na gravação
            total += 1
    if total:
        audit(db, None, "privacy.encrypt_legacy", rows=total)
    db.commit()
    return total


# ------------------------------------------------------------------ suporte


def _user_row(db: Session, u: User, now: datetime) -> dict:
    w = db.get(Watch, u.id)
    gstat = dict(db.execute(select(Guardian.status, func.count()).where(Guardian.user_id == u.id).group_by(Guardian.status)).all())
    failed = _count(
        db,
        select(func.count()).select_from(Delivery).where(Delivery.subject_user_id == u.id, Delivery.status == DeliveryStatus.FAILED),
    )
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "status": u.status,
        "created_at": u.created_at,
        "last_login_at": u.last_login_at,
        "last_check_in_at": w.last_check_in_at if w else None,
        "state": w.state if w else None,
        "paused": bool(w and w.is_paused(now)),
        "interval_days": w.interval_days if w else None,
        "grace_days": w.grace_days if w else None,
        "guardians_accepted": gstat.get(GuardianStatus.ACCEPTED, 0),
        "guardians_pending": gstat.get(GuardianStatus.PENDING, 0),
        "failed_deliveries": failed,
        "has_app": db.scalar(select(PushToken.id).where(PushToken.user_id == u.id, PushToken.disabled_at.is_(None)).limit(1)) is not None,
    }


def search_users(db: Session, q: str | None, state: str | None, limit: int = 50) -> list[dict]:
    now = utcnow()
    stmt = select(User).outerjoin(Watch, Watch.user_id == User.id)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like)))
    if state == "SUSPENDED":
        stmt = stmt.where(User.status == UserStatus.SUSPENDED)
    elif state:
        stmt = stmt.where(Watch.state == state)
    users = db.scalars(stmt.order_by(User.created_at.desc()).limit(limit))
    return [_user_row(db, u, now) for u in users]


def user_detail(db: Session, user_id: int) -> dict:
    u = db.get(User, user_id)
    if u is None:
        raise not_found("Usuário")
    now = utcnow()
    row = _user_row(db, u, now)
    row["alerts"] = [
        {
            "id": a.id,
            "reason": a.reason,
            "status": a.status,
            "created_at": a.created_at,
            "notify_count": a.notify_count,
            "acknowledged_at": a.acknowledged_at,
            "resolved_at": a.resolved_at,
            "resolved_by": a.resolved_by,
        }
        for a in db.scalars(select(Alert).where(Alert.user_id == u.id).order_by(Alert.id.desc()).limit(20))
    ]
    row["deliveries"] = [
        {
            "id": d.id,
            "kind": d.kind,
            "channel": d.channel,
            "status": d.status,
            "attempts": d.attempts,
            "last_error": d.last_error,
            "created_at": d.created_at,
            "sent_at": d.sent_at,
        }
        for d in db.scalars(select(Delivery).where(Delivery.subject_user_id == u.id).order_by(Delivery.id.desc()).limit(30))
    ]
    return row


def set_status(db: Session, admin: User, user_id: int, status: str, reason: str) -> dict:
    u = db.get(User, user_id)
    if u is None:
        raise not_found("Usuário")
    if u.id == admin.id:
        raise AppError(422, "self_action", "Você não pode suspender a própria conta.")
    if u.status != status:
        u.status = status
        if status == UserStatus.SUSPENDED:
            u.token_version += 1  # encerra as sessões abertas
        audit(db, admin.id, "user.suspended" if status == UserStatus.SUSPENDED else "user.reactivated", u.id, reason=reason)
        db.commit()
    return user_detail(db, u.id)


def retry_failed(db: Session, admin: User, user_id: int | None = None) -> int:
    """Devolve à fila os avisos que desistiram (FAILED) nos últimos 3 dias."""
    stmt = select(Delivery).where(Delivery.status == DeliveryStatus.FAILED, Delivery.created_at >= utcnow() - timedelta(days=3))
    if user_id is not None:
        stmt = stmt.where(Delivery.subject_user_id == user_id)
    rows = list(db.scalars(stmt))
    for d in rows:
        d.status, d.attempts, d.last_error = DeliveryStatus.PENDING, 0, None
    audit(db, admin.id, "deliveries.retry", user_id, count=len(rows))
    db.commit()
    return len(rows)


def audit_log(db: Session, limit: int = 100) -> list[dict]:
    rows = db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit))
    return [
        {"id": e.id, "actor_user_id": e.actor_user_id, "action": e.action, "target_user_id": e.target_user_id, "details": e.details, "created_at": e.created_at}
        for e in rows
    ]
