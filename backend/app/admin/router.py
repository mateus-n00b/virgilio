from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.admin import service
from app.admin.models import audit
from app.core.db import get_db
from app.core.deps import require_admin
from app.notify import service as notify
from app.users.models import User, UserStatus
from app.watch import service as watch

router = APIRouter(prefix="/admin", tags=["admin"])


class StatusIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)  # motivo fica na trilha de auditoria


@router.get("/stats")
def stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    return {**service.stats(db), "history": service.history(db, 30)}


@router.get("/users")
def users(
    q: str | None = Query(default=None, max_length=100),
    state: Literal["OK", "REMINDED", "ALERTED", "SUSPENDED"] | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    return service.search_users(db, q, state)


@router.get("/users/{user_id}")
def user_detail(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    return service.user_detail(db, user_id)


@router.post("/users/{user_id}/suspend")
def suspend(user_id: int, body: StatusIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    """Suspende a conta: login bloqueado, sessões encerradas e ciclo de prova de vida parado."""
    return service.set_status(db, admin, user_id, UserStatus.SUSPENDED, body.reason)


@router.post("/users/{user_id}/reactivate")
def reactivate(user_id: int, body: StatusIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    return service.set_status(db, admin, user_id, UserStatus.ACTIVE, body.reason)


@router.post("/users/{user_id}/retry-failed")
def retry_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    count = service.retry_failed(db, admin, user_id)
    return {"requeued": count, **notify.dispatch(db, limit=500)}


@router.post("/deliveries/retry-failed")
def retry_all(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    count = service.retry_failed(db, admin)
    return {"requeued": count, **notify.dispatch(db, limit=5000)}


@router.post("/sweep")
def sweep_now(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    """Roda a varredura agora (sem esperar o cron)."""
    audit(db, admin.id, "sweep.manual")
    db.commit()
    return {**watch.sweep(db), **notify.dispatch(db, limit=5000)}


@router.get("/audit")
def audit_log(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    return service.audit_log(db)
