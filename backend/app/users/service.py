import logging
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError
from app.core.mailer import mail_configured, send_email
from app.core.security import create_purpose_token, decode_purpose_token, hash_password, verify_password
from app.users.models import User, UserStatus

log = logging.getLogger(__name__)
RESET_TTL = timedelta(hours=1)


def register(db: Session, name: str, email: str, password: str, accept_terms: bool) -> User:
    from app.watch.service import create_watch

    if not accept_terms:
        raise AppError(400, "terms_required", "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.")
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(409, "email_taken", "Já existe uma conta com este e-mail. Entre com a sua senha.")
    now = utcnow()
    user = User(name=name.strip(), email=email, password_hash=hash_password(password), terms_accepted_at=now, last_login_at=now)
    db.add(user)
    db.flush()
    create_watch(db, user)  # o cadastro já conta como a primeira prova de vida
    db.commit()
    return user


def login(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if not verify_password(password, user.password_hash if user else None):
        raise AppError(401, "invalid_credentials", "E-mail ou senha incorretos.")
    if user.status != UserStatus.ACTIVE:
        raise AppError(403, "user_inactive", "Conta suspensa. Fale com o suporte.")
    user.last_login_at = utcnow()
    db.commit()
    return user


def change_password(db: Session, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise AppError(400, "invalid_credentials", "Senha atual incorreta.")
    user.password_hash = hash_password(new)
    db.commit()


def forgot_password(db: Session, email: str) -> str | None:
    """Envia o link de redefinição. Responde igual exista ou não a conta (não revela e-mails cadastrados).

    Retorna o link só em desenvolvimento sem SMTP, para testar o fluxo.
    """
    user = db.scalar(select(User).where(User.email == email, User.status == UserStatus.ACTIVE))
    if user is None:
        return None
    token = create_purpose_token("reset", user.id, RESET_TTL, v=user.token_version)
    url = f"{get_settings().web_url}/redefinir-senha?t={token}"
    if mail_configured():
        send_email(
            user.email,
            "Redefinir sua senha do Virgílio",
            f"Olá, {user.first_name}.\n\nPara criar uma nova senha, abra o link abaixo (válido por 1 hora):\n{url}\n\n"
            "Se não foi você, ignore esta mensagem: sua senha continua a mesma.",
        )
        return None
    if get_settings().is_dev:
        return url
    log.warning("pedido de redefinição de senha sem SMTP configurado")
    return None


def reset_password(db: Session, token: str, password: str) -> User:
    payload = decode_purpose_token(token, "reset")
    user = db.get(User, int(payload["sub"])) if payload else None
    if user is None or payload.get("v") != user.token_version or user.status != UserStatus.ACTIVE:
        raise AppError(400, "invalid_link", "Link inválido ou expirado. Peça um novo.")
    user.password_hash = hash_password(password)
    user.token_version += 1  # derruba as sessões abertas e invalida o link
    db.commit()
    return user


def delete_account(db: Session, user: User) -> None:
    """Exclusão a pedido do titular (LGPD): apaga tudo, inclusive instruções e Virgílios."""
    from app.guardians.models import Guardian
    from app.instructions.models import Instruction
    from app.notify.service import forget_user
    from app.watch.models import Alert, Watch

    forget_user(db, user.id)
    db.execute(update(Guardian).where(Guardian.linked_user_id == user.id).values(linked_user_id=None))
    db.execute(delete(Alert).where(Alert.user_id == user.id))
    db.execute(delete(Guardian).where(Guardian.user_id == user.id))
    db.execute(delete(Instruction).where(Instruction.user_id == user.id))
    db.execute(delete(Watch).where(Watch.user_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
