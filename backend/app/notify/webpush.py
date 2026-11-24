"""Web Push (padrão W3C/IETF RFC 8030 + 8291 + VAPID RFC 8292): avisos no navegador e no app instalado pelo Chrome.

O conteúdo vai cifrado de ponta a ponta (aes128gcm): o serviço de push do navegador (FCM no Chrome/Android)
só entrega, não lê. O texto é o mesmo do push do app nativo.
"""
import base64
import json
import logging
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import get_settings

log = logging.getLogger(__name__)

TTL_SECONDS = 3 * 24 * 3600  # mesmo prazo do aviso no servidor (STALE_AFTER)


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def generate_vapid_keys() -> tuple[str, str]:
    """(pública, privada) em base64url: pública = ponto P-256 não comprimido; privada = escalar de 32 bytes."""
    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64url(pub), _b64url(priv)


def valid_endpoint(endpoint: str) -> bool:
    u = urlparse(endpoint)
    return u.scheme == "https" and bool(u.netloc)


def send(subscription: dict, payload: dict) -> dict:
    """Envia uma mensagem. Devolve um "ticket" no mesmo formato do Expo para o despachante tratar igual."""
    from pywebpush import WebPushException, webpush

    s = get_settings()
    u = urlparse(subscription["endpoint"])
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": f"mailto:{s.support_email}", "aud": f"{u.scheme}://{u.netloc}"},
            ttl=TTL_SECONDS,
            headers={"Urgency": "high"},
            timeout=10,
        )
        return {"status": "ok"}
    except WebPushException as e:
        code = getattr(e.response, "status_code", None)
        if code in (404, 410):  # inscrição expirada ou permissão revogada
            return {"status": "error", "details": {"error": "DeviceNotRegistered"}}
        log.warning("web push falhou (%s): %s", code, str(e)[:200])
        return {"status": "error", "details": {"error": f"WebPush{code or ''}"}}
    except Exception as e:  # noqa: BLE001 — rede/timeout: tenta de novo no próximo ciclo
        log.warning("web push indisponível: %s", str(e)[:200])
        return {"status": "error", "details": {"error": "Transport"}}
