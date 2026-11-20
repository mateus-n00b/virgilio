import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    # VIRGILIO_ENV_FILE="" desativa a leitura do .env (usado pelos testes)
    model_config = SettingsConfigDict(env_file=os.environ.get("VIRGILIO_ENV_FILE", ".env") or None, extra="ignore")

    # dev | test | prod. Padrão prod: esquecer ENV no deploy não pode liberar o modo dev
    # (links de redefinição de senha na resposta, JWT_SECRET padrão). O .env local define ENV=dev.
    env: str = "prod"
    database_url: str = "postgresql+psycopg://virgilio:virgilio@localhost:5432/virgilio"
    cors_origins: str = "http://localhost:3000"
    cors_origin_regex: str | None = None
    # Endereço público do site: vai nos links dos e-mails (convite, alerta, confirmação de vida)
    frontend_url: str = "http://localhost:3000"

    jwt_secret: str = "dev-secret-change-me-dev-secret-change-me"
    jwt_expires_minutes: int = 60 * 24 * 30  # 30 dias: quem mora só não pode perder a sessão do app à toa

    # Chave da criptografia das instruções (Fernet, 32 bytes em base64 urlsafe). Vazia = derivada do
    # JWT_SECRET. Defina uma vez e não troque: as instruções já gravadas deixariam de ser legíveis.
    instructions_key: str = ""

    # Limites do ciclo de prova de vida (em dias)
    default_interval_days: int = 2
    default_grace_days: int = 1
    max_interval_days: int = 30
    max_grace_days: int = 14
    max_pause_days: int = 60
    max_guardians: int = 5
    max_instructions: int = 20
    # Lembretes ao usuário e novos avisos aos Virgílios são repetidos a cada N horas (abaixo de 24 h
    # para que um cron diário não "pule" um dia por diferença de minutos)
    repeat_after_hours: int = 20
    # Quantas vezes, no máximo, os Virgílios são avisados de um mesmo alerta sem resposta
    max_alert_notifications: int = 7

    # Segredo do cron (Authorization: Bearer <CRON_SECRET>); vazio = rota de varredura desativada
    cron_secret: str = ""

    # Notificações push (app mobile, via Expo Push Service)
    expo_access_token: str = ""

    # E-mail (SMTP): lembretes, convites e alertas. Na Vercel use a porta 587 ou 465.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # ex.: "Virgílio <nao-responda@seudominio.com.br>"
    # Link de download do APK Android exibido no site (ex.: release do GitHub). Vazio = botão oculto.
    android_apk_url: str = ""
    support_email: str = "anonimizae@proton.me"  # contato exibido no site (mesmo do promoAE)

    rate_limit_enabled: bool = True
    local_timezone: str = "America/Sao_Paulo"

    @field_validator("database_url")
    @classmethod
    def _sqlalchemy_url(cls, v: str) -> str:
        """Aceita URLs no formato dos provedores (postgres://, postgresql://) e usa o driver psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def is_serverless(self) -> bool:
        """Executando como função serverless (Vercel define VERCEL=1)."""
        return bool(os.environ.get("VERCEL"))

    @property
    def is_dev(self) -> bool:
        return self.env in ("dev", "test")

    @property
    def web_url(self) -> str:
        return self.frontend_url.rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


DEFAULT_JWT_SECRET = "dev-secret-change-me-dev-secret-change-me"


def check_production_settings(s: Settings) -> None:
    """Impede subir em produção com configuração insegura."""
    if s.is_dev:
        return
    problems = []
    if s.jwt_secret in (DEFAULT_JWT_SECRET, "troque-este-segredo") or len(s.jwt_secret) < 32:
        problems.append("JWT_SECRET ausente, padrão ou curto (mín. 32 caracteres)")
    if s.database_url.startswith("sqlite"):
        problems.append("DATABASE_URL aponta para SQLite")
    if s.database_url == Settings.model_fields["database_url"].default:
        problems.append("DATABASE_URL não definida (na Vercel, confira a integração do banco)")
    if problems:
        raise RuntimeError("Configuração de produção inválida: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
