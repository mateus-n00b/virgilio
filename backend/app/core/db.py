from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings


class UTCDateTime(TypeDecorator):
    """Datetime sempre timezone-aware em UTC (Postgres timestamptz; SQLite nos testes)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


def _engine_options(url: str) -> dict:
    if get_settings().is_serverless:
        # Cada invocação serverless pode rodar em uma instância nova: sem pool local
        # (use a URL "pooled" do provedor, ex.: Neon/Supabase via PgBouncer). Sem prepared
        # statements automáticos, incompatíveis com PgBouncer em modo transação.
        from sqlalchemy.pool import NullPool

        opts: dict = {"poolclass": NullPool}
        if url.startswith("postgresql"):
            opts["connect_args"] = {"prepare_threshold": None}
        return opts
    return {"pool_pre_ping": True}


engine = create_engine(get_settings().database_url, **_engine_options(get_settings().database_url))
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
