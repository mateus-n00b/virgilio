import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError

_buckets: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def reset_rate_limits() -> None:
    with _lock:
        _buckets.clear()


class RateLimit:
    """Janela deslizante em memória por IP e escopo.

    Suficiente para o MVP em instância única; para múltiplas instâncias, trocar por Redis.
    """

    def __init__(self, scope: str, times: int, seconds: int):
        self.scope, self.times, self.seconds = scope, times, seconds

    def __call__(self, request: Request) -> None:
        if not get_settings().rate_limit_enabled:
            return
        # Último IP do X-Forwarded-For = o anexado pelo nosso proxy (Next.js); os anteriores podem ser forjados
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        ip = forwarded[-1] if forwarded else (request.client.host if request.client else "unknown")
        key = f"{self.scope}:{ip}"
        now = time.monotonic()
        with _lock:
            bucket = _buckets[key]
            while bucket and now - bucket[0] > self.seconds:
                bucket.popleft()
            if len(bucket) >= self.times:
                raise AppError(429, "rate_limited", "Muitas tentativas. Aguarde um pouco e tente novamente.")
            bucket.append(now)
