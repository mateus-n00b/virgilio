from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import RateLimit
from app.core.security import create_access_token
from app.users import service
from app.users.models import User
from app.users.schemas import (
    AuthOut,
    ForgotIn,
    ForgotOut,
    LoginIn,
    PasswordChangeIn,
    RegisterIn,
    ResetIn,
    UserOut,
    UserUpdateIn,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_out(user: User) -> AuthOut:
    return AuthOut(access_token=create_access_token(user.id, user.token_version), user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=201, dependencies=[Depends(RateLimit("register", times=10, seconds=600))])
def register(body: RegisterIn, db: Session = Depends(get_db)):
    return _auth_out(service.register(db, body.name, body.email, body.password, body.accept_terms))


@router.post("/login", response_model=AuthOut, dependencies=[Depends(RateLimit("login", times=20, seconds=600))])
def login(body: LoginIn, db: Session = Depends(get_db)):
    return _auth_out(service.login(db, body.email, body.password))


@router.post("/password/forgot", response_model=ForgotOut, dependencies=[Depends(RateLimit("forgot", times=5, seconds=600))])
def forgot(body: ForgotIn, db: Session = Depends(get_db)):
    return ForgotOut(dev_reset_url=service.forgot_password(db, body.email))


@router.post("/password/reset", response_model=AuthOut, dependencies=[Depends(RateLimit("reset", times=10, seconds=600))])
def reset(body: ResetIn, db: Session = Depends(get_db)):
    return _auth_out(service.reset_password(db, body.token, body.password))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name, user.phone, user.address = body.name.strip(), body.phone, body.address
    db.commit()
    return user


@router.put("/me/password", status_code=204, dependencies=[Depends(RateLimit("password_change", times=10, seconds=600))])
def password_change(body: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    service.change_password(db, user, body.current_password, body.new_password)


@router.delete("/me", status_code=204)
def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    service.delete_account(db, user)
