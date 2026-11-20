from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, get_optional_user
from app.core.errors import AppError
from app.core.ratelimit import RateLimit
from app.guardians import service
from app.guardians.schemas import AcceptIn, GuardianIn, GuardianOut, GuardianView, ProtectingOut
from app.users.models import User

router = APIRouter(tags=["virgílios"])

# ------------------------------------------------------------------ meus Virgílios


@router.get("/me/guardians", response_model=list[GuardianOut])
def my_guardians(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [service.guardian_out(g) for g in service.list_guardians(db, user)]


@router.post(
    "/me/guardians", response_model=GuardianOut, status_code=201, dependencies=[Depends(RateLimit("guardian_add", times=20, seconds=3600))]
)
def add_guardian(body: GuardianIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.guardian_out(service.add_guardian(db, user, body.name, body.email, body.phone, body.relation))


@router.put("/me/guardians/{guardian_id}", response_model=GuardianOut)
def update_guardian(guardian_id: int, body: GuardianIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.guardian_out(service.update_guardian(db, user, guardian_id, body.name, body.email, body.phone, body.relation))


@router.delete("/me/guardians/{guardian_id}", status_code=204)
def remove_guardian(guardian_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    service.remove_guardian(db, user, guardian_id)


@router.post(
    "/me/guardians/{guardian_id}/resend",
    response_model=GuardianOut,
    dependencies=[Depends(RateLimit("guardian_resend", times=10, seconds=3600))],
)
def resend_invite(guardian_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.guardian_out(service.resend_invite(db, user, guardian_id))


@router.get("/me/protecting", response_model=list[ProtectingOut])
def protecting(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pessoas de quem sou Virgílio."""
    return service.protecting(db, user)


# ------------------------------------------------------------------ link pessoal do Virgílio (sem login)

_limit = Depends(RateLimit("guardian_link", times=60, seconds=600))


@router.get("/guardian/{token}", response_model=GuardianView, dependencies=[_limit])
def guardian_view(token: str, db: Session = Depends(get_db)):
    g, person = service.by_token(db, token)
    return service.view(db, g, person)


@router.post("/guardian/{token}/accept", response_model=GuardianView, dependencies=[_limit])
def accept(token: str, body: AcceptIn, viewer: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    g, person = service.by_token(db, token)
    if body.link_account and viewer is None:
        raise AppError(401, "unauthorized", "Entre na sua conta para vincular o app.")
    service.accept(db, g, person, body.email, viewer if body.link_account else None)
    return service.view(db, g, person)


@router.post("/guardian/{token}/decline", response_model=GuardianView, dependencies=[_limit])
def decline(token: str, db: Session = Depends(get_db)):
    g, person = service.by_token(db, token)
    service.decline(db, g)
    return service.view(db, g, person)


@router.post("/guardian/{token}/ack", response_model=GuardianView, dependencies=[_limit])
def acknowledge(token: str, db: Session = Depends(get_db)):
    g, person = service.by_token(db, token)
    service.acknowledge(db, g, person)
    return service.view(db, g, person)


@router.post("/guardian/{token}/resolve", response_model=GuardianView, dependencies=[_limit])
def resolve(token: str, db: Session = Depends(get_db)):
    g, person = service.by_token(db, token)
    service.resolve(db, g, person)
    return service.view(db, g, person)
