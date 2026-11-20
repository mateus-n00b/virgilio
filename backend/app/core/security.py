import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt

from app.core.config import get_settings
from app.core.db import utcnow

ALGORITHM = "HS256"


# ---------- Sessão ----------

def create_access_token(user_id: int, version: int) -> str:
    """O "v" (token_version) invalida todas as sessões quando a senha é redefinida."""
    s = get_settings()
    now = utcnow()
    payload = {"sub": str(user_id), "v": version, "typ": "access", "iat": now, "exp": now + timedelta(minutes=s.jwt_expires_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> tuple[int, int] | None:
    payload = _decode(token, "access")
    if payload is None:
        return None
    try:
        return int(payload["sub"]), int(payload.get("v", 0))
    except (KeyError, ValueError):
        return None


# ---------- Links de uso único (e-mail) ----------

def create_purpose_token(purpose: str, user_id: int, ttl: timedelta, **claims) -> str:
    s = get_settings()
    now = utcnow()
    payload = {"sub": str(user_id), "typ": purpose, "iat": now, "exp": now + ttl, **claims}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def decode_purpose_token(token: str, purpose: str) -> dict | None:
    return _decode(token, purpose)


def _decode(token: str, purpose: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == purpose else None


# ---------- Tokens opacos (link do Virgílio) ----------

def new_opaque_token() -> str:
    return secrets.token_urlsafe(24)


# ---------- Senhas ----------
# scrypt da biblioteca padrão: lento e com uso de memória de propósito (dificulta força bruta)
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        # Mesmo custo quando a conta não existe: o tempo de resposta não revela e-mails cadastrados
        hash_password(password)
        return False
    try:
        _, n, r, p, salt, digest = stored.split("$")
        candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
    except ValueError:
        return False
    return hmac.compare_digest(candidate.hex(), digest)
