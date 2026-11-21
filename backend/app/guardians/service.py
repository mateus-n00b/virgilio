"""Virgílios: convite, aceite, e o que eles podem fazer durante um alerta."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import decrypt
from app.core.db import utcnow
from app.core.errors import AppError, not_found
from app.core.security import new_opaque_token
from app.guardians.models import Guardian, GuardianStatus
from app.guardians.schemas import (
    ContactOut,
    GuardianOut,
    GuardianView,
    InstructionView,
    PersonOut,
    ProtectingOut,
    WatchView,
)
from app.instructions.models import Instruction
from app.notify import service as notify
from app.notify.models import DeliveryKind
from app.users.models import User, UserStatus
from app.watch import service as watch_service
from app.watch.models import AlertStatus
from app.watch.router import alert_out


def invite_url(g: Guardian) -> str:
    return f"{get_settings().web_url}/v/{g.token}"


def guardian_out(g: Guardian) -> GuardianOut:
    return GuardianOut(
        id=g.id,
        name=g.name,
        email=g.email,
        phone=g.phone,
        relation=g.relation,
        status=g.status,
        has_app=g.linked_user_id is not None,
        open_invite=g.open_invite,
        invite_url=invite_url(g),
        created_at=g.created_at,
        responded_at=g.responded_at,
    )


# ------------------------------------------------------------------ lado de quem é protegido


def list_guardians(db: Session, user: User) -> list[Guardian]:
    return list(db.scalars(select(Guardian).where(Guardian.user_id == user.id).order_by(Guardian.created_at, Guardian.id)))


def _owned(db: Session, user: User, guardian_id: int) -> Guardian:
    g = db.get(Guardian, guardian_id)
    if g is None or g.user_id != user.id:
        raise not_found("Virgílio")
    return g


def add_guardian(db: Session, user: User, name: str, email: str | None, phone: str | None, relation: str | None) -> Guardian:
    s = get_settings()
    active = [g for g in list_guardians(db, user) if g.status != GuardianStatus.DECLINED]
    if len(active) >= s.max_guardians:
        raise AppError(409, "too_many_guardians", f"Você pode ter até {s.max_guardians} Virgílios.")
    if email and email == user.email:
        raise AppError(422, "self_guardian", "Você não pode ser seu próprio Virgílio.")
    if email and any(g.email == email for g in active):
        raise AppError(409, "guardian_exists", "Já existe um Virgílio com este e-mail.")
    g = Guardian(user_id=user.id, name=name.strip(), email=email, phone=phone, relation=relation, token=new_opaque_token())
    db.add(g)
    db.flush()
    notify.enqueue_invite(db, g)
    db.commit()
    notify.dispatch_quietly(db)
    return g


def create_link_invite(db: Session, user: User) -> Guardian:
    """Convite por link, sem cadastrar ninguém antes: quem abrir informa nome e e-mail ao aceitar.

    Cada link vale para uma pessoa (o primeiro que aceitar). Conta no limite de Virgílios.
    """
    s = get_settings()
    active = [g for g in list_guardians(db, user) if g.status != GuardianStatus.DECLINED]
    if len(active) >= s.max_guardians:
        raise AppError(409, "too_many_guardians", f"Você pode ter até {s.max_guardians} Virgílios.")
    g = Guardian(user_id=user.id, name="", token=new_opaque_token())
    db.add(g)
    db.commit()
    return g


def update_guardian(db: Session, user: User, guardian_id: int, name: str, email: str | None, phone: str | None, relation: str | None) -> Guardian:
    g = _owned(db, user, guardian_id)
    if email and email == user.email:
        raise AppError(422, "self_guardian", "Você não pode ser seu próprio Virgílio.")
    g.name, g.email, g.phone, g.relation = name.strip(), email, phone, relation
    db.commit()
    return g


def remove_guardian(db: Session, user: User, guardian_id: int) -> None:
    db.delete(_owned(db, user, guardian_id))
    db.commit()


def resend_invite(db: Session, user: User, guardian_id: int) -> Guardian:
    g = _owned(db, user, guardian_id)
    if g.status == GuardianStatus.ACCEPTED:
        raise AppError(409, "already_accepted", f"{g.name} já aceitou ser seu Virgílio.")
    g.status, g.responded_at = GuardianStatus.PENDING, None
    if not notify.enqueue_invite(db, g):
        raise AppError(422, "no_email", "Cadastre um e-mail para reenviar o convite, ou compartilhe o link.")
    db.commit()
    notify.dispatch_quietly(db)
    return g


# ------------------------------------------------------------------ lado do Virgílio (link pessoal)


def by_token(db: Session, token: str) -> tuple[Guardian, User]:
    g = db.scalar(select(Guardian).where(Guardian.token == token))
    person = db.get(User, g.user_id) if g else None
    if g is None or person is None or person.status != UserStatus.ACTIVE:
        raise not_found("Convite")
    return g, person


def view(db: Session, g: Guardian, person: User) -> GuardianView:
    out = GuardianView(
        guardian_name=g.name,
        guardian_email=g.email,
        status=g.status,
        has_app=g.linked_user_id is not None,
        needs_name=g.open_invite,
        person=PersonOut(name=person.name, first_name=person.first_name),
    )
    if g.status != GuardianStatus.ACCEPTED:
        return out
    watch = watch_service.get_watch(db, person)
    now = utcnow()
    out.watch = WatchView(
        state=watch.state,
        paused=watch.is_paused(now),
        last_check_in_at=watch.last_check_in_at,
        interval_days=watch.interval_days,
        due_at=watch.due_at(now),
    )
    alert = watch_service.open_alert(db, person.id)
    out.alert = alert_out(db, alert)
    if alert is not None:
        out.contact = ContactOut(email=person.email, phone=person.phone, address=person.address)
        out.last_location = watch_service.read_location(watch)
        out.instructions = [
            InstructionView(title=i.title, body=decrypt(i.body_enc))
            for i in db.scalars(select(Instruction).where(Instruction.user_id == person.id).order_by(Instruction.position, Instruction.id))
        ]
        out.other_guardians = [
            o.name
            for o in db.scalars(select(Guardian).where(Guardian.user_id == person.id, Guardian.status == GuardianStatus.ACCEPTED))
            if o.id != g.id
        ]
    return out


def accept(db: Session, g: Guardian, person: User, email: str | None, link_to: User | None, name: str | None = None) -> None:
    if g.open_invite:
        name = name or (link_to.name if link_to is not None else None)
        if not name or len(name) < 2:
            raise AppError(422, "name_required", "Informe seu nome para aceitar o convite.")
        g.name = name
    if link_to is not None:
        if link_to.id == person.id:
            raise AppError(422, "self_guardian", "Você não pode ser seu próprio Virgílio.")
        other = db.scalar(
            select(Guardian.id).where(Guardian.user_id == person.id, Guardian.linked_user_id == link_to.id, Guardian.id != g.id)
        )
        if other is not None:
            raise AppError(409, "guardian_exists", f"Você já é Virgílio de {person.first_name}.")
        g.linked_user_id = link_to.id
        if not email and not g.email:
            email = link_to.email
    if email:
        if email == person.email:
            raise AppError(422, "self_guardian", "Você não pode ser seu próprio Virgílio.")
        g.email = email
    if not g.email and g.linked_user_id is None:
        raise AppError(422, "unreachable", "Informe seu e-mail (ou entre na sua conta do app) para receber os avisos.")
    if g.status != GuardianStatus.ACCEPTED:
        g.status, g.responded_at = GuardianStatus.ACCEPTED, utcnow()
    db.commit()


def decline(db: Session, g: Guardian) -> None:
    """Recusa o convite ou deixa de ser Virgílio. A pessoa protegida vê o status no app.

    Minimização (LGPD): o contato de quem recusou é apagado na hora; o nome fica para a pessoa
    protegida ver quem recusou e o registro some após RETENTION_DECLINED_GUARDIANS_DAYS.
    """
    g.status, g.responded_at, g.linked_user_id = GuardianStatus.DECLINED, utcnow(), None
    g.email = g.phone = g.relation = None
    db.commit()


def _require_open_alert(db: Session, g: Guardian, person: User):
    if g.status != GuardianStatus.ACCEPTED:
        raise AppError(403, "not_guardian", "Aceite o convite primeiro.")
    alert = watch_service.open_alert(db, person.id)
    if alert is None or alert.status != AlertStatus.OPEN:
        raise AppError(409, "no_open_alert", f"Não há alerta aberto: {person.first_name} está bem.")
    return alert


def acknowledge(db: Session, g: Guardian, person: User) -> None:
    """"Vou verificar": os outros Virgílios ficam sabendo e os avisos repetidos param."""
    alert = _require_open_alert(db, g, person)
    if alert.acknowledged_at is not None:
        return
    alert.acknowledged_at, alert.acknowledged_by_guardian_id = utcnow(), g.id
    notify.enqueue_for_guardians(db, person.id, DeliveryKind.ACK, alert.id, exclude_guardian_id=g.id)
    db.commit()
    notify.dispatch_quietly(db)


def resolve(db: Session, g: Guardian, person: User) -> None:
    """"Encontrei, está tudo bem": encerra o alerta e conta como prova de vida."""
    _require_open_alert(db, g, person)
    watch_service.check_in(db, person, by_guardian=g)


def protecting(db: Session, user: User) -> list[ProtectingOut]:
    """Pessoas de quem o usuário logado é Virgílio (vinculado pelo app)."""
    out = []
    now = utcnow()
    for g in db.scalars(
        select(Guardian).where(Guardian.linked_user_id == user.id, Guardian.status == GuardianStatus.ACCEPTED).order_by(Guardian.id)
    ):
        person = db.get(User, g.user_id)
        if person is None or person.status != UserStatus.ACTIVE:
            continue
        watch = watch_service.get_watch(db, person)
        out.append(
            ProtectingOut(
                token=g.token,
                person_name=person.name,
                state=watch.state,
                paused=watch.is_paused(now),
                last_check_in_at=watch.last_check_in_at,
                alert=alert_out(db, watch_service.open_alert(db, person.id)),
            )
        )
    return out
