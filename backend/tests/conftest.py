import os

# Testes não leem o .env do desenvolvedor (chaves reais, segredos, banco local)
os.environ["VIRGILIO_ENV_FILE"] = ""
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("CRON_SECRET", "segredo-do-cron")
os.environ.setdefault("FRONTEND_URL", "https://virgilio.test")

from datetime import datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.db import Base, get_db, utcnow  # noqa: E402
from app.core.ratelimit import reset_rate_limits  # noqa: E402
from app.main import app  # noqa: E402
from app.notify import push  # noqa: E402
from app.notify import service as notify  # noqa: E402
from app.watch import service as watch_service  # noqa: E402

# Por padrão usa SQLite em memória. Para rodar contra Postgres:
#   TEST_DATABASE_URL=postgresql+psycopg://user:pass@host/db_de_teste pytest
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture()
def db_session_factory():
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(engine)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    if TEST_DATABASE_URL:
        Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(db_session_factory):
    def _get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    reset_rate_limits()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def outbox(monkeypatch):
    """Substitui SMTP e Expo: guarda o que seria enviado. `box["smtp_down"]` simula falha."""
    box = {"emails": [], "pushes": [], "smtp_down": False}

    def fake_send_email(to, subject, body, reply_to=None):
        if box["smtp_down"]:
            return False
        box["emails"].append({"to": to, "subject": subject, "body": body})
        return True

    def fake_push(messages):
        box["pushes"].extend(messages)
        return [{"status": "ok", "id": "t"} for _ in messages]

    monkeypatch.setattr(notify, "mail_configured", lambda: True)
    monkeypatch.setattr("app.watch.router.mail_configured", lambda: True)
    monkeypatch.setattr(notify, "send_email", fake_send_email)
    monkeypatch.setattr(push, "send", fake_push)
    return box


class Api:
    """Helpers para montar cenários pelos endpoints públicos."""

    def __init__(self, client: TestClient, factory):
        self.c = client
        self.factory = factory
        self._seq = 0

    @staticmethod
    def h(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def register(self, name: str = "Beatriz Lima", email: str | None = None, password: str = "senha123") -> str:
        self._seq += 1
        email = email or f"pessoa{self._seq}@example.com"
        r = self.c.post("/api/auth/register", json={"name": name, "email": email, "password": password, "accept_terms": True})
        assert r.status_code == 201, r.text
        return r.json()["access_token"]

    def me(self, token: str) -> dict:
        return self.c.get("/api/auth/me", headers=self.h(token)).json()

    def watch(self, token: str) -> dict:
        r = self.c.get("/api/me/watch", headers=self.h(token))
        assert r.status_code == 200, r.text
        return r.json()

    def add_guardian(self, token: str, name: str = "Dona Neide", email: str | None = "neide@example.com", **kw) -> dict:
        r = self.c.post("/api/me/guardians", headers=self.h(token), json={"name": name, "email": email, **kw})
        assert r.status_code == 201, r.text
        return r.json()

    def accepted_guardian(self, token: str, name: str = "Dona Neide", email: str | None = "neide@example.com") -> str:
        g = self.add_guardian(token, name, email)
        gtoken = g["invite_url"].rsplit("/", 1)[1]
        r = self.c.post(f"/api/guardian/{gtoken}/accept", json={})
        assert r.status_code == 200, r.text
        return gtoken

    def sweep(self, at: datetime) -> dict:
        """Roda a varredura como se fosse o instante `at` e envia os avisos."""
        with self.factory() as db:
            stats = watch_service.sweep(db, now=at)
            stats.update(notify.dispatch(db))
            return stats


def days(n: float) -> datetime:
    return utcnow() + timedelta(days=n)


@pytest.fixture()
def api(client, db_session_factory) -> Api:
    return Api(client, db_session_factory)
