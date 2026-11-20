"""Ciclo de prova de vida: lembrete em x dias, alerta em x + y, avisos repetidos e encerramento."""
from sqlalchemy import select

from app.notify.models import Delivery
from tests.conftest import days


def kinds(outbox, to=None):
    return [e["subject"] for e in outbox["emails"] if to is None or e["to"] == to]


def test_full_cycle_reminder_alert_and_check_in(api, outbox):
    token = api.register(name="Beatriz Lima", email="bia@example.com")
    api.accepted_guardian(token, "Dona Neide", "neide@example.com")
    api.accepted_guardian(token, "Seu Jorge", "jorge@example.com")
    assert api.watch(token)["guardians_reachable"] == 2
    outbox["emails"].clear()  # convites

    # Antes de x dias: nada
    assert api.sweep(days(1.9))["reminded"] == 0
    assert outbox["emails"] == []

    # x = 2 dias: lembrete para a própria pessoa, com link de confirmação
    assert api.sweep(days(2.01))["reminded"] == 1
    assert kinds(outbox) == ["Beatriz, você está bem?"]
    assert "https://virgilio.test/confirmar?t=" in outbox["emails"][0]["body"]
    assert api.watch(token)["state"] == "REMINDED"

    # Rodar de novo logo em seguida não repete
    api.sweep(days(2.02))
    assert len(outbox["emails"]) == 1

    # x + y = 3 dias: os dois Virgílios são avisados
    stats = api.sweep(days(3.01))
    assert stats["alerted"] == 1
    alerts = [e for e in outbox["emails"] if e["subject"].startswith("Alerta")]
    assert sorted(e["to"] for e in alerts) == ["jorge@example.com", "neide@example.com"]
    assert "https://virgilio.test/v/" in alerts[0]["body"]
    w = api.watch(token)
    assert w["state"] == "ALERTED" and w["alert"]["reason"] == "MISSED"

    # A pessoa aparece: alerta encerrado e Virgílios avisados de que está tudo bem
    outbox["emails"].clear()
    r = api.c.post("/api/me/check-in", headers=api.h(token))
    assert r.status_code == 200
    assert r.json()["state"] == "OK" and r.json()["alert"] is None
    assert sorted(e["to"] for e in outbox["emails"]) == ["jorge@example.com", "neide@example.com"]
    assert all(e["subject"] == "Beatriz está bem" for e in outbox["emails"])


def test_custom_interval_and_grace(api, outbox):
    token = api.register()
    api.accepted_guardian(token)
    r = api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 7, "grace_days": 3})
    assert r.status_code == 200
    assert api.sweep(days(6.9))["reminded"] == 0
    assert api.sweep(days(7.1))["reminded"] == 1
    assert api.sweep(days(9.9))["alerted"] == 0
    assert api.sweep(days(10.1))["alerted"] == 1


def test_limits_on_settings(api):
    token = api.register()
    assert api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 31, "grace_days": 1}).status_code == 422
    assert api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 0, "grace_days": 1}).status_code == 422
    assert api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 2, "grace_days": 15}).status_code == 422


def test_daily_reminders_and_realerts_stop_after_acknowledge(api, outbox):
    token = api.register(name="Beatriz")
    neide = api.accepted_guardian(token, "Dona Neide", "neide@example.com")
    api.accepted_guardian(token, "Seu Jorge", "jorge@example.com")
    api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 1, "grace_days": 3})
    outbox["emails"].clear()  # convites

    api.sweep(days(1.1))
    api.sweep(days(2.1))  # mais de 20 h depois: lembra de novo
    assert kinds(outbox).count("Beatriz, você está bem?") == 2

    api.sweep(days(4.2))  # alerta
    api.sweep(days(5.2))  # ninguém respondeu: avisa de novo
    to_neide = [e for e in outbox["emails"] if e["to"] == "neide@example.com"]
    assert len(to_neide) == 2 and "aviso nº 2" in to_neide[1]["body"]

    # Dona Neide vai verificar: Seu Jorge fica sabendo e os avisos repetidos param
    outbox["emails"].clear()
    r = api.c.post(f"/api/guardian/{neide}/ack")
    assert r.status_code == 200 and r.json()["alert"]["acknowledged_by"] == "Dona Neide"
    assert [(e["to"], e["subject"]) for e in outbox["emails"]] == [("jorge@example.com", "Dona Neide vai verificar Beatriz")]
    assert api.c.post(f"/api/guardian/{neide}/ack").status_code == 200  # idempotente
    outbox["emails"].clear()
    stats = api.sweep(days(6.3))
    assert stats["realerted"] == 0
    assert not any(e["subject"].startswith("Alerta") for e in outbox["emails"])


def test_realerts_are_capped(api, outbox):
    token = api.register()
    api.accepted_guardian(token)
    outbox["emails"].clear()  # convite
    api.sweep(days(2.1))
    api.sweep(days(3.1))
    for d in range(4, 20):
        api.sweep(days(d + 0.1))
    alerts = [e for e in outbox["emails"] if e["to"] == "neide@example.com"]
    assert len(alerts) == 7  # MAX_ALERT_NOTIFICATIONS


def test_sos_alerts_immediately(api, outbox):
    token = api.register(name="Beatriz Lima")
    api.accepted_guardian(token)
    outbox["emails"].clear()  # convite
    r = api.c.post("/api/me/sos", headers=api.h(token))
    assert r.status_code == 200
    assert r.json()["state"] == "ALERTED" and r.json()["alert"]["reason"] == "SOS"
    assert [e["subject"] for e in outbox["emails"] if e["to"] == "neide@example.com"] == ["Beatriz Lima pediu ajuda"]
    api.c.post("/api/me/sos", headers=api.h(token))  # de novo: não duplica o alerta
    assert len([e for e in outbox["emails"] if e["to"] == "neide@example.com"]) == 1


def test_pause_suspends_cycle_and_counts_as_check_in(api, outbox):
    token = api.register()
    api.accepted_guardian(token)
    until = days(10)
    r = api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 2, "grace_days": 1, "paused_until": until.isoformat()})
    assert r.status_code == 200 and r.json()["paused"] is True
    assert api.sweep(days(5))["reminded"] == 0
    # Pausa terminada: o prazo conta a partir do fim dela
    assert api.sweep(days(11))["reminded"] == 0
    assert api.sweep(days(12.1))["reminded"] == 1

    too_long = (days(61)).isoformat()
    r = api.c.put("/api/me/watch", headers=api.h(token), json={"interval_days": 2, "grace_days": 1, "paused_until": too_long})
    assert r.status_code == 422


def test_reminder_sent_just_before_check_in_is_dropped(api, outbox, db_session_factory):
    """Lembrete ainda na fila quando a pessoa confirma: não sai mais."""
    from app.watch import service

    token = api.register()
    with db_session_factory() as db:
        service.sweep(db, now=days(2.1))  # enfileira, sem enviar
    api.c.post("/api/me/check-in", headers=api.h(token))
    with db_session_factory() as db:
        from app.notify.service import dispatch

        dispatch(db)
        rows = db.scalars(select(Delivery)).all()
    assert [r.last_error for r in rows] == ["already_checked_in"]
    assert outbox["emails"] == []


def test_failed_email_is_retried_on_next_sweep(api, outbox):
    token = api.register()
    api.accepted_guardian(token)
    api.sweep(days(2.1))
    outbox["smtp_down"] = True
    stats = api.sweep(days(3.1))
    assert stats["alerted"] == 1 and stats["retry"] >= 1
    assert not any(e["subject"].startswith("Alerta") for e in outbox["emails"])
    outbox["smtp_down"] = False
    api.sweep(days(3.2))
    assert any(e["subject"].startswith("Alerta") and e["to"] == "neide@example.com" for e in outbox["emails"])


def test_one_click_link_confirms_only_current_cycle(api, outbox):
    token = api.register(name="Beatriz")
    api.sweep(days(2.1))
    link = outbox["emails"][0]["body"].split("confirmar?t=", 1)[1].split()[0]
    r = api.c.post("/api/check-in/link", json={"token": link})
    assert r.status_code == 200 and r.json() == {"name": "Beatriz", "confirmed_now": True}
    assert api.watch(token)["state"] == "OK"
    # O mesmo link de novo (ou um e-mail antigo): não faz nada
    assert api.c.post("/api/check-in/link", json={"token": link}).json()["confirmed_now"] is False
    assert api.c.post("/api/check-in/link", json={"token": "x" * 40}).status_code == 400


def test_cron_endpoint_requires_secret(api, outbox):
    api.register()
    assert api.c.get("/api/internal/sweep").status_code == 401
    r = api.c.get("/api/internal/sweep", headers={"Authorization": "Bearer segredo-do-cron"})
    assert r.status_code == 200
    assert set(r.json()) >= {"reminded", "alerted", "realerted", "sent"}


def test_push_to_user_and_linked_guardian(api, outbox):
    token = api.register(name="Beatriz")
    guardian_user = api.register(name="Neide", email="neide@example.com")
    api.c.put("/api/me/watch", headers=api.h(guardian_user), json={"interval_days": 30, "grace_days": 14})
    api.c.post("/api/me/push-tokens", headers=api.h(token), json={"token": "ExponentPushToken[aaaa]", "platform": "android"})
    api.c.post("/api/me/push-tokens", headers=api.h(guardian_user), json={"token": "ExponentPushToken[bbbb]", "platform": "ios"})
    g = api.add_guardian(token, "Dona Neide", None)
    gtoken = g["invite_url"].rsplit("/", 1)[1]
    r = api.c.post(f"/api/guardian/{gtoken}/accept", headers=api.h(guardian_user), json={"link_account": True})
    assert r.status_code == 200 and r.json()["has_app"] is True
    assert r.json()["guardian_email"] == "neide@example.com"  # e-mail da conta vinculada

    api.sweep(days(2.1))
    assert [(p["to"], p["data"]["url"]) for p in outbox["pushes"]] == [("ExponentPushToken[aaaa]", "/")]
    api.sweep(days(3.1))
    assert outbox["pushes"][-1]["to"] == "ExponentPushToken[bbbb]"
    assert outbox["pushes"][-1]["data"]["url"] == f"/protegidos/{gtoken}"

    r = api.c.get("/api/me/protecting", headers=api.h(guardian_user))
    assert r.json()[0]["person_name"] == "Beatriz" and r.json()[0]["alert"]["reason"] == "MISSED"


def test_no_reachable_guardian_is_reported(api, outbox, monkeypatch):
    token = api.register()
    api.accepted_guardian(token)
    monkeypatch.setattr("app.watch.router.mail_configured", lambda: False)
    w = api.watch(token)
    assert w["guardians_accepted"] == 1 and w["guardians_reachable"] == 0
