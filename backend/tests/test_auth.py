from sqlalchemy import select

from app.guardians.models import Guardian
from app.instructions.models import Instruction
from app.users.models import User
from app.watch.models import Watch


def test_register_login_and_profile(api):
    token = api.register(name="Beatriz Lima", email="Bia@Example.com")
    me = api.me(token)
    assert me["email"] == "bia@example.com"  # normalizado

    r = api.c.post("/api/auth/login", json={"email": "BIA@example.com", "password": "senha123"})
    assert r.status_code == 200
    r = api.c.post("/api/auth/login", json={"email": "bia@example.com", "password": "errada123"})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "invalid_credentials"

    r = api.c.patch("/api/auth/me", headers=api.h(token), json={"name": "Bia Lima", "phone": " 71 99999-0000 ", "address": ""})
    assert r.status_code == 200
    assert r.json()["phone"] == "71 99999-0000"
    assert r.json()["address"] is None


def test_register_requires_terms_unique_email_and_strong_password(api):
    body = {"name": "Ana", "email": "ana@example.com", "password": "senha123"}
    assert api.c.post("/api/auth/register", json=body).json()["detail"]["code"] == "terms_required"
    assert api.c.post("/api/auth/register", json={**body, "accept_terms": True}).status_code == 201
    r = api.c.post("/api/auth/register", json={**body, "accept_terms": True})
    assert r.status_code == 409
    r = api.c.post("/api/auth/register", json={**body, "email": "x@example.com", "password": "somenteletras", "accept_terms": True})
    assert r.status_code == 422


def test_register_creates_watch_counting_as_first_check_in(api):
    w = api.watch(api.register())
    assert w["state"] == "OK"
    assert w["interval_days"] == 2 and w["grace_days"] == 1
    assert w["guardians_accepted"] == 0


def test_password_reset_invalidates_sessions_and_link(api):
    old = api.register(email="carla@example.com")
    r = api.c.post("/api/auth/password/forgot", json={"email": "carla@example.com"})
    url = r.json()["dev_reset_url"]  # ENV=test sem SMTP devolve o link
    assert url and "/redefinir-senha?t=" in url
    token = url.split("t=", 1)[1]
    # E-mail inexistente responde igual (não revela cadastro)
    assert api.c.post("/api/auth/password/forgot", json={"email": "ninguem@example.com"}).json() == {"dev_reset_url": None}

    r = api.c.post("/api/auth/password/reset", json={"token": token, "password": "novasenha1"})
    assert r.status_code == 200
    assert api.c.get("/api/auth/me", headers=api.h(old)).status_code == 401  # sessão antiga caiu
    assert api.c.get("/api/auth/me", headers=api.h(r.json()["access_token"])).status_code == 200
    # O link só funciona uma vez
    assert api.c.post("/api/auth/password/reset", json={"token": token, "password": "outra1234"}).status_code == 400
    assert api.c.post("/api/auth/login", json={"email": "carla@example.com", "password": "novasenha1"}).status_code == 200


def test_change_password(api):
    token = api.register(email="d@example.com")
    r = api.c.put("/api/auth/me/password", headers=api.h(token), json={"current_password": "errada", "new_password": "nova12345"})
    assert r.status_code == 400
    r = api.c.put("/api/auth/me/password", headers=api.h(token), json={"current_password": "senha123", "new_password": "nova12345"})
    assert r.status_code == 204
    assert api.c.post("/api/auth/login", json={"email": "d@example.com", "password": "nova12345"}).status_code == 200


def test_delete_account_removes_everything(api, db_session_factory, outbox):
    token = api.register(email="sai@example.com")
    api.accepted_guardian(token)
    api.c.post("/api/me/instructions", headers=api.h(token), json={"title": "Gato", "body": "Ração no armário"})
    # A pessoa também é Virgílio de outra: o vínculo é desfeito, o Virgílio continua (por e-mail)
    other = api.register(email="outra@example.com")
    g = api.add_guardian(other, name="Sai", email="sai@example.com")
    gtoken = g["invite_url"].rsplit("/", 1)[1]
    assert api.c.post(f"/api/guardian/{gtoken}/accept", headers=api.h(token), json={"link_account": True}).status_code == 200

    assert api.c.delete("/api/auth/me", headers=api.h(token)).status_code == 204
    with db_session_factory() as db:
        assert db.scalar(select(User).where(User.email == "sai@example.com")) is None
        assert db.scalars(select(Instruction)).all() == []
        assert db.scalars(select(Watch)).all() != []  # a da outra pessoa
        remaining = db.scalars(select(Guardian)).all()
        assert [(x.name, x.linked_user_id) for x in remaining] == [("Sai", None)]
