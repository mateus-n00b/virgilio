from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import RateLimit
from app.notify import service
from app.users.models import User

router = APIRouter(prefix="/me/push-tokens", tags=["notificações"])


class PushTokenIn(BaseModel):
    token: str = Field(max_length=255)
    platform: Literal["android", "ios"]


class PushTokenRemoveIn(BaseModel):
    token: str = Field(max_length=255)


@router.post("", status_code=204, dependencies=[Depends(RateLimit("push_token", times=30, seconds=600))])
def register_push_token(body: PushTokenIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    service.register_token(db, user, body.token, body.platform)


@router.post("/unregister", status_code=204)
def unregister_push_token(body: PushTokenRemoveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    service.unregister_token(db, user, body.token)
