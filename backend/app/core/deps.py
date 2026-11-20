from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.users.models import User, UserStatus

bearer = HTTPBearer(auto_error=False)


def _user_from(creds: HTTPAuthorizationCredentials | None, db: Session) -> User | None:
    decoded = decode_access_token(creds.credentials) if creds else None
    if decoded is None:
        return None
    user_id, version = decoded
    user = db.get(User, user_id)
    if user is None or user.token_version != version:
        return None
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    user = _user_from(creds, db)
    if user is None:
        raise AppError(401, "unauthorized", "Faça login para continuar.")
    if user.status != UserStatus.ACTIVE:
        raise AppError(403, "user_inactive", "Conta suspensa.")
    return user


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Usuário logado, se houver (rotas públicas que aproveitam a identificação quando existe)."""
    user = _user_from(creds, db)
    return user if user is not None and user.status == UserStatus.ACTIVE else None
