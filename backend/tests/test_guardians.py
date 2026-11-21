"""Virgílios: convite, aceite, recusa e o que podem ver (instruções só durante um alerta)."""
from sqlalchemy import select

from app.instructions.models import Instruction
from tests.conftest import days


def token_of(g: dict) -> str:
    return g["invite_url"].rsplit("/", 1)[1]


def test_invite_by_email_and_accept(api, outbox):
    token = api.register(name="Beatriz Lima")
    g = api.add_guardian(token, "Dona Neide", "Neide@Example.com", relation="vizinha")
    assert g["status"] == "PENDING" and g["email"] == "neide@example.com"
    assert g["invite_url"].startswith("https://virgilio.test/v/")
    assert outbox["emails"][0]["subject"] == "Beatriz convidou você para ser Virgílio"
    assert g["invite_url"] in outbox["emails"][0]["body"]

    view = api.c.get(f"/api/guardian/{token_of(g)}").json()
    assert view["status"] == "PENDING" and view["person"]["name"] == "Beatriz Lima"
    assert view["watch"] is None and view["instructions"] == []

    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", json={})
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTED"
    assert r.json()["watch"]["state"] == "OK"
    listed = api.c.get("/api/me/guardians", headers=api.h(token)).json()
    assert listed[0]["status"] == "ACCEPTED"


def test_guardian_without_email_must_give_one_to_accept(api, outbox):
    token = api.register()
    g = api.add_guardian(token, "Seu Jorge", None, phone="71 98888-0000")
    assert outbox["emails"] == []  # convite vai pelo link (WhatsApp)
    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", json={})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "unreachable"
    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", json={"email": "jorge@example.com"})
    assert r.status_code == 200 and r.json()["guardian_email"] == "jorge@example.com"


def test_decline_erases_contact_and_resend_needs_new_email(api, outbox):
    """Quem recusa tem o contato apagado na hora (minimização); reenviar exige cadastrar de novo."""
    token = api.register()
    g = api.add_guardian(token, phone="71 98888-0000", relation="vizinha")
    assert api.c.post(f"/api/guardian/{token_of(g)}/decline").json()["status"] == "DECLINED"
    listed = api.c.get("/api/me/guardians", headers=api.h(token)).json()[0]
    assert listed["status"] == "DECLINED" and listed["name"] == "Dona Neide"
    assert (listed["email"], listed["phone"], listed["relation"]) == (None, None, None)
    r = api.c.post(f"/api/me/guardians/{g['id']}/resend", headers=api.h(token))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "no_email"
    api.c.put(f"/api/me/guardians/{g['id']}", headers=api.h(token), json={"name": "Dona Neide", "email": "neide@example.com"})
    r = api.c.post(f"/api/me/guardians/{g['id']}/resend", headers=api.h(token))
    assert r.status_code == 200 and r.json()["status"] == "PENDING"
    assert len(outbox["emails"]) == 2


def test_instructions_only_visible_during_alert(api, outbox, db_session_factory):
    token = api.register(name="Beatriz Lima")
    api.c.patch("/api/auth/me", headers=api.h(token), json={"name": "Beatriz Lima", "phone": "71 99999-0000", "address": "Rua A, 10"})
    r = api.c.post("/api/me/instructions", headers=api.h(token), json={"title": "Gata Mel", "body": "A chave está debaixo do tapete."})
    assert r.status_code == 201 and r.json()["body"] == "A chave está debaixo do tapete."
    neide = api.accepted_guardian(token, "Dona Neide", "neide@example.com")
    api.accepted_guardian(token, "Seu Jorge", "jorge@example.com")

    # Criptografado no banco
    with db_session_factory() as db:
        stored = db.scalar(select(Instruction.body_enc))
    assert "tapete" not in stored

    view = api.c.get(f"/api/guardian/{neide}").json()
    assert view["instructions"] == [] and view["contact"] is None and view["alert"] is None

    api.sweep(days(2.1))
    api.sweep(days(3.1))
    view = api.c.get(f"/api/guardian/{neide}").json()
    assert view["alert"]["reason"] == "MISSED"
    assert view["instructions"] == [{"title": "Gata Mel", "body": "A chave está debaixo do tapete."}]
    assert view["contact"] == {"email": api.me(token)["email"], "phone": "71 99999-0000", "address": "Rua A, 10"}
    assert view["other_guardians"] == ["Seu Jorge"]

    # Dona Neide encontrou a Beatriz: alerta encerrado, conta como prova de vida
    outbox["emails"].clear()
    r = api.c.post(f"/api/guardian/{neide}/resolve")
    assert r.status_code == 200 and r.json()["alert"] is None and r.json()["instructions"] == []
    assert [(e["to"], e["subject"]) for e in outbox["emails"]] == [("jorge@example.com", "Beatriz está bem")]
    assert "Dona Neide confirmou" in outbox["emails"][0]["body"]
    assert api.watch(token)["state"] == "OK"
    assert api.c.post(f"/api/guardian/{neide}/resolve").status_code == 409  # nada aberto


def test_pending_or_declined_guardian_is_not_alerted(api, outbox):
    token = api.register()
    api.add_guardian(token, "Pendente", "p@example.com")
    g = api.add_guardian(token, "Recusou", "r@example.com")
    api.c.post(f"/api/guardian/{token_of(g)}/decline")
    outbox["emails"].clear()
    api.sweep(days(2.1))
    api.sweep(days(3.1))
    assert all(e["to"] not in ("p@example.com", "r@example.com") for e in outbox["emails"])


def test_guardian_cannot_act_on_someone_elses_or_unknown_link(api, outbox):
    assert api.c.get("/api/guardian/inexistente").status_code == 404
    token = api.register()
    g = api.add_guardian(token)
    assert api.c.post(f"/api/guardian/{token_of(g)}/ack").status_code == 403  # ainda não aceitou


def test_guardian_limits_and_ownership(api, outbox):
    token = api.register(email="dono@example.com")
    for i in range(5):
        api.add_guardian(token, f"Pessoa {i}", f"p{i}@example.com")
    r = api.c.post("/api/me/guardians", headers=api.h(token), json={"name": "Sexta", "email": "s@example.com"})
    assert r.status_code == 409
    other = api.register()
    gid = api.c.get("/api/me/guardians", headers=api.h(token)).json()[0]["id"]
    assert api.c.delete(f"/api/me/guardians/{gid}", headers=api.h(other)).status_code == 404
    assert api.c.delete(f"/api/me/guardians/{gid}", headers=api.h(token)).status_code == 204
    r = api.c.post("/api/me/guardians", headers=api.h(token), json={"name": "Eu", "email": "dono@example.com"})
    assert r.status_code == 422


def test_self_link_is_rejected(api, outbox):
    token = api.register(email="eu@example.com")
    g = api.add_guardian(token, "Amiga", "amiga@example.com")
    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", headers=api.h(token), json={"link_account": True})
    assert r.status_code == 422


def test_instructions_crud_and_ownership(api):
    token = api.register()
    other = api.register()
    r = api.c.post("/api/me/instructions", headers=api.h(token), json={"title": "Plantas", "body": "Regar às terças"})
    iid = r.json()["id"]
    r = api.c.put(f"/api/me/instructions/{iid}", headers=api.h(token), json={"title": "Plantas", "body": "Regar às quintas"})
    assert r.json()["body"] == "Regar às quintas"
    assert api.c.put(f"/api/me/instructions/{iid}", headers=api.h(other), json={"title": "x" * 3, "body": "y"}).status_code == 404
    assert api.c.get("/api/me/instructions", headers=api.h(other)).json() == []
    assert api.c.delete(f"/api/me/instructions/{iid}", headers=api.h(token)).status_code == 204
    assert api.c.get("/api/me/instructions", headers=api.h(token)).json() == []


def test_link_invite_without_registering_first(api, outbox):
    """"Gerar link de convite": ninguém é cadastrado antes; quem aceita informa nome e e-mail."""
    token = api.register(name="Beatriz Lima")
    r = api.c.post("/api/me/guardians/link", headers=api.h(token))
    assert r.status_code == 201
    g = r.json()
    assert g["open_invite"] is True and g["name"] == "" and g["status"] == "PENDING"
    assert outbox["emails"] == []  # sem e-mail: o link é compartilhado pela própria pessoa

    view = api.c.get(f"/api/guardian/{token_of(g)}").json()
    assert view["needs_name"] is True and view["person"]["name"] == "Beatriz Lima"

    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", json={"email": "neide@example.com"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "name_required"
    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", json={"name": " Dona Neide ", "email": "neide@example.com"})
    assert r.status_code == 200
    assert r.json()["status"] == "ACCEPTED" and r.json()["needs_name"] is False and r.json()["guardian_name"] == "Dona Neide"

    listed = api.c.get("/api/me/guardians", headers=api.h(token)).json()
    assert [(x["name"], x["email"], x["open_invite"]) for x in listed] == [("Dona Neide", "neide@example.com", False)]

    # O link já foi usado: aceitar de novo não troca o nome de quem aceitou
    api.c.post(f"/api/guardian/{token_of(g)}/accept", json={"name": "Outra Pessoa"})
    assert api.c.get(f"/api/guardian/{token_of(g)}").json()["guardian_name"] == "Dona Neide"

    # E recebe os alertas normalmente, pelo nome informado
    api.sweep(days(2.1))
    api.sweep(days(3.1))
    alert = next(e for e in outbox["emails"] if e["to"] == "neide@example.com")
    assert alert["body"].startswith("Olá, Dona Neide.")


def test_link_invite_with_app_account_uses_account_name(api, outbox):
    token = api.register(name="Beatriz")
    other = api.register(name="Jorge Amado", email="jorge@example.com")
    g = api.c.post("/api/me/guardians/link", headers=api.h(token)).json()
    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", headers=api.h(other), json={"link_account": True})
    assert r.status_code == 200
    assert r.json()["guardian_name"] == "Jorge Amado" and r.json()["guardian_email"] == "jorge@example.com"


def test_link_invites_count_toward_limit(api, outbox):
    token = api.register()
    for _ in range(5):
        assert api.c.post("/api/me/guardians/link", headers=api.h(token)).status_code == 201
    assert api.c.post("/api/me/guardians/link", headers=api.h(token)).status_code == 409


def test_link_app_account_after_accepting_logged_out(api, outbox):
    """Aceitou deslogado (só e-mail) e depois vincula a conta pelo mesmo link: passa a ver em Protegidos."""
    person = api.register(name="Beatriz")
    me = api.register(name="Neide", email="neide@example.com")
    g = api.add_guardian(person, "Dona Neide", None)
    assert api.c.post(f"/api/guardian/{token_of(g)}/accept", json={"email": "neide@example.com"}).status_code == 200
    assert api.c.get("/api/me/protecting", headers=api.h(me)).json() == []  # só pelo e-mail, sem prova do link

    r = api.c.post(f"/api/guardian/{token_of(g)}/accept", headers=api.h(me), json={"link_account": True})
    assert r.status_code == 200 and r.json()["has_app"] is True and r.json()["status"] == "ACCEPTED"
    assert [p["person_name"] for p in api.c.get("/api/me/protecting", headers=api.h(me)).json()] == ["Beatriz"]
