"""Cliente do Expo Push Service (entrega via FCM no Android e APNs no iOS).

Documentação: https://docs.expo.dev/push-notifications/sending-notifications/
"""
import logging
import re

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

SEND_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100  # limite de mensagens por requisição do Expo
TOKEN_RE = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$")


def is_expo_token(token: str) -> bool:
    return bool(TOKEN_RE.match(token))


def send(messages: list[dict]) -> list[dict]:
    """Envia as mensagens em lotes e devolve um ticket por mensagem, na mesma ordem.

    Falha de rede ou HTTP num lote vira tickets de erro "Transport" para aquele lote, para que
    os lotes já aceitos não sejam reenviados.
    """
    headers = {"accept": "application/json", "content-type": "application/json"}
    token = get_settings().expo_access_token
    if token:
        headers["authorization"] = f"Bearer {token}"
    tickets: list[dict] = []
    for i in range(0, len(messages), BATCH_SIZE):
        chunk = messages[i : i + BATCH_SIZE]
        try:
            r = httpx.post(SEND_URL, json=chunk, headers=headers, timeout=10)
            r.raise_for_status()
            data = r.json()["data"]
            if len(data) != len(chunk):
                raise ValueError("resposta com número de tickets diferente do enviado")
        except (httpx.HTTPError, ValueError, KeyError) as e:
            log.warning("Expo push indisponível: %s", e)
            data = [{"status": "error", "message": str(e)[:200], "details": {"error": "Transport"}}] * len(chunk)
        tickets.extend(data)
    return tickets
