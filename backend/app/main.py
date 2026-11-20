import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  (registra modelos)
from app.core.config import check_production_settings, get_settings
from app.core.mailer import mail_configured
from app.guardians.router import router as guardians_router
from app.instructions.router import router as instructions_router
from app.notify.router import router as notify_router
from app.users.router import router as users_router
from app.watch.router import router as watch_router

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

check_production_settings(get_settings())

app = FastAPI(
    title="Virgílio API",
    version="0.1.0",
    description="Prova de vida periódica para quem mora só ou longe da família.",
    # A documentação interativa fica só no ambiente local
    docs_url="/api/docs" if get_settings().is_dev else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if get_settings().is_dev else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_origin_regex=get_settings().cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (users_router, watch_router, guardians_router, instructions_router, notify_router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config", tags=["health"])
def public_config() -> dict:
    """Configuração pública lida pelo site e pelo app em tempo de execução."""
    s = get_settings()
    return {
        "web_url": s.web_url,
        "mail_enabled": mail_configured(),
        "support_email": s.support_email,
        "limits": {
            "max_interval_days": s.max_interval_days,
            "max_grace_days": s.max_grace_days,
            "max_pause_days": s.max_pause_days,
            "max_guardians": s.max_guardians,
            "max_instructions": s.max_instructions,
        },
    }
