"""Painel administrativo, criptografia de dados pessoais e retenção."""
import os
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import utcnow
from tests.conftest import days

ADMIN = "admin@example.com"


@pytest.fixture()
def admin_token(api, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", ADMIN)
    get_settings.cache_clear()
    yield api.register(name="Admin", email=ADMIN)
    monkeypatch.delenv("ADMIN_EMAILS")
    get_settings.cache_clear()


def test_admin_routes_are_restricted(api, admin_token):
    user = api.register()
    assert api.me(user)["is_admin"] is False and api.me(admin_token)["is_admin"] is True
    for path in ("/api/admin/stats", "/api/admin/users", "/api/admin/audit"):
        assert api.c.get(path, headers=api.h(user)).status_code == 403
        assert api.c.get(path).status_code == 401
        assert api.c.get(path, headers=api.h(admin_token)).status_code == 200


def test_stats_count_active_users_and_cycle(api, admin_token, outbox):
    a = api.register(email="a@example.com")
    b = api.register(email="b@example.com")
    api.accepted_guardian(a)
    api.c.post("/api/me/sos", headers=api.h(b))
    s = api.c.get("/api/admin/stats", headers=api.h(admin_token)).json()
    assert s["users"]["total"] == 3 and s["users"]["new_7d"] == 3
    assert s["users"]["active_1d"] == 3  # o cadastro conta como prova de vida
    assert s["users"]["with_accepted_guardian"] == 1 and s["users"]["without_accepted_guardian"] == 2
    assert s["cycle"]["alerted"] == 1 and s["alerts"]["open"] == 1 and s["alerts"]["sos_30d"] == 1
    assert s["guardians"]["accepted"] == 1
    assert isinstance(s["history"], list)


def test_admin_never_sees_sensitive_data(api, admin_token, outbox):
    """Endereço, telefone, instruções, localização e contatos dos Virgílios não saem nas rotas de admin."""
    token = api.register(name="Beatriz", email="bia@example.com")
    api.c.patch("/api/auth/me", headers=api.h(token), json={"name": "Beatriz", "phone": "71 99999-1234", "address": "Rua Secreta, 42"})
    api.c.post("/api/me/instructions", headers=api.h(token), json={"title": "Chave", "body": "debaixo do vaso azul"})
    api.c.post("/api/me/check-in", headers=api.h(token), json={"location": {"lat": -12.97, "lng": -38.5}})
    api.accepted_guardian(token, "Dona Neide", "neide@example.com")
    api.c.post("/api/me/sos", headers=api.h(token))
    uid = api.me(token)["id"]
    raw = api.c.get(f"/api/admin/users/{uid}", headers=api.h(admin_token)).text
    raw += api.c.get("/api/admin/users?q=bia", headers=api.h(admin_token)).text
    raw += api.c.get("/api/admin/stats", headers=api.h(admin_token)).text
    for secret in ("99999-1234", "Rua Secreta", "vaso azul", "-12.97", "Neide", "neide@example.com"):
        assert secret not in raw, secret
    assert '"guardians_accepted":1' in raw and "bia@example.com" in raw


def test_suspend_stops_cycle_and_is_audited(api, admin_token, outbox):
    token = api.register(email="c@example.com")
    uid = api.me(token)["id"]
    assert api.c.post(f"/api/admin/users/{uid}/suspend", headers=api.h(admin_token), json={"reason": "x"}).status_code == 422
    r = api.c.post(f"/api/admin/users/{uid}/suspend", headers=api.h(admin_token), json={"reason": "pedido do titular por e-mail"})
    assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
    assert api.c.get("/api/auth/me", headers=api.h(token)).status_code == 401  # sessão encerrada
    api.sweep(days(2.1))
    detail = api.c.get(f"/api/admin/users/{uid}", headers=api.h(admin_token)).json()
    assert detail["state"] == "OK" and detail["deliveries"] == []  # ciclo parado: nenhum lembrete
    me = api.me(admin_token)["id"]
    assert api.c.post(f"/api/admin/users/{me}/suspend", headers=api.h(admin_token), json={"reason": "teste"}).status_code == 422
    api.c.post(f"/api/admin/users/{uid}/reactivate", headers=api.h(admin_token), json={"reason": "resolvido"})
    log = api.c.get("/api/admin/audit", headers=api.h(admin_token)).json()
    assert [e["action"] for e in log][:2] == ["user.reactivated", "user.suspended"]
    assert log[1]["details"] == {"reason": "pedido do titular por e-mail"} and log[1]["target_user_id"] == uid


def test_retry_failed_deliveries(api, admin_token, outbox):
    token = api.register()
    api.accepted_guardian(token)
    outbox["smtp_down"] = True
    for i in range(6):
        api.sweep(days(2.1 + i * 0.01))
    uid = api.me(token)["id"]
    assert api.c.get(f"/api/admin/users/{uid}", headers=api.h(admin_token)).json()["failed_deliveries"] >= 1
    outbox["smtp_down"] = False
    r = api.c.post(f"/api/admin/users/{uid}/retry-failed", headers=api.h(admin_token))
    assert r.json()["requeued"] >= 1 and r.json()["sent"] >= 1


def test_personal_data_encrypted_at_rest_and_legacy_plaintext_readable(api, db_session_factory, outbox):
    token = api.register(name="Beatriz")
    api.c.patch("/api/auth/me", headers=api.h(token), json={"name": "Beatriz", "phone": "71 99999-1234", "address": "Rua Secreta, 42"})
    api.add_guardian(token, "Dona Neide", "neide@example.com", phone="71 98888-0000", relation="vizinha")
    with db_session_factory() as db:
        u = db.execute(text("SELECT phone, address FROM users WHERE name = 'Beatriz'")).one()
        g = db.execute(text("SELECT name, email, phone, relation FROM guardians")).one()
    for value in (*u, *g):
        assert value.startswith("gAAAAA"), value
    # Valor antigo em texto puro (gravado antes da criptografia) continua legível
    with db_session_factory() as db:
        db.execute(text("UPDATE users SET address = 'Rua Antiga, 1' WHERE name = 'Beatriz'"))
        db.commit()
    assert api.me(token)["address"] == "Rua Antiga, 1"
    assert api.c.get("/api/me/guardians", headers=api.h(token)).json()[0]["email"] == "neide@example.com"


def test_retention_purges_old_data_and_daily_snapshot(api, db_session_factory, outbox):
    from app.admin import service as admin
    from app.admin.models import DailyStat
    from app.guardians.models import Guardian
    from app.notify.models import Delivery
    from app.watch.models import Alert

    token = api.register()
    api.accepted_guardian(token)
    g = api.add_guardian(token, "Recusou", "r@example.com")
    api.c.post(f"/api/guardian/{g['invite_url'].rsplit('/', 1)[1]}/decline")
    api.c.post("/api/me/sos", headers=api.h(token))
    api.c.post("/api/me/check-in", headers=api.h(token))  # encerra o alerta
    with db_session_factory() as db:
        assert admin.purge_expired(db) == {"deliveries": 0, "alerts": 0, "declined_guardians": 0}  # nada vencido ainda
        far = utcnow() + timedelta(days=400)
        out = admin.purge_expired(db, now=far)
        assert out["alerts"] == 1 and out["declined_guardians"] == 1 and out["deliveries"] >= 1
        assert db.query(Alert).count() == 0 and db.query(Delivery).count() == 0
        assert [x.name for x in db.query(Guardian)] == ["Dona Neide"]
        assert admin.snapshot_daily(db) is True and admin.snapshot_daily(db) is False  # uma foto por dia
        assert db.query(DailyStat).count() == 1
    os.environ.pop("ADMIN_EMAILS", None)


def test_legacy_plaintext_is_encrypted_by_sweep(api, db_session_factory, outbox):
    from app.admin import service as admin

    token = api.register(name="Beatriz")
    api.add_guardian(token, "Dona Neide", "neide@example.com")
    with db_session_factory() as db:  # simula dados gravados antes da migração 0002
        db.execute(text("UPDATE users SET address = 'Rua Antiga, 1', phone = '71 90000-0000' WHERE name = 'Beatriz'"))
        db.execute(text("UPDATE guardians SET name = 'Dona Neide', email = 'neide@example.com'"))
        db.commit()
        assert admin.encrypt_legacy(db) == 2
        assert admin.encrypt_legacy(db) == 0  # idempotente
        u = db.execute(text("SELECT phone, address FROM users WHERE name = 'Beatriz'")).one()
        g = db.execute(text("SELECT name, email FROM guardians")).one()
    assert all(v.startswith("gAAAAA") for v in (*u, *g))
    assert api.me(token)["address"] == "Rua Antiga, 1"
    assert api.c.get("/api/me/guardians", headers=api.h(token)).json()[0]["name"] == "Dona Neide"
