"""Última localização conhecida: opcional na prova de vida, revelada só durante um alerta."""
from sqlalchemy import select

from app.watch.models import Watch
from tests.conftest import days

SALVADOR = {"lat": -12.971598, "lng": -38.501440, "accuracy_m": 25}


def test_location_hidden_until_alert_then_revealed(api, outbox, db_session_factory):
    token = api.register(name="Beatriz")
    neide = api.accepted_guardian(token)
    r = api.c.post("/api/me/check-in", headers=api.h(token), json={"location": SALVADOR})
    assert r.status_code == 200 and r.json()["location_shared_at"]

    # Criptografada no banco
    with db_session_factory() as db:
        stored = db.scalar(select(Watch.last_location_enc))
    assert "-12.97" not in stored

    assert api.c.get(f"/api/guardian/{neide}").json()["last_location"] is None

    # Check-ins sem localização mantêm a última conhecida
    outbox["emails"].clear()
    api.c.post("/api/me/check-in", headers=api.h(token))
    api.sweep(days(2.1))
    api.sweep(days(3.1))
    loc = api.c.get(f"/api/guardian/{neide}").json()["last_location"]
    assert loc["lat"] == SALVADOR["lat"] and loc["lng"] == SALVADOR["lng"] and loc["accuracy_m"] == 25
    assert loc["maps_url"].endswith("query=-12.971598,-38.50144")
    alert_email = next(e for e in outbox["emails"] if e["subject"].startswith("Alerta"))
    assert "última localização conhecida" in alert_email["body"]

    # Encerrado o alerta, volta a ficar oculta
    api.c.post("/api/me/check-in", headers=api.h(token))
    assert api.c.get(f"/api/guardian/{neide}").json()["last_location"] is None


def test_sos_with_location_and_clear(api, outbox):
    token = api.register()
    neide = api.accepted_guardian(token)
    api.c.post("/api/me/sos", headers=api.h(token), json={"location": SALVADOR})
    assert api.c.get(f"/api/guardian/{neide}").json()["last_location"]["lat"] == SALVADOR["lat"]

    r = api.c.delete("/api/me/location", headers=api.h(token))
    assert r.status_code == 200 and r.json()["location_shared_at"] is None
    assert api.c.get(f"/api/guardian/{neide}").json()["last_location"] is None


def test_link_check_in_accepts_location_and_validates(api, outbox):
    token = api.register()
    api.sweep(days(2.1))
    link = outbox["emails"][0]["body"].split("confirmar?t=", 1)[1].split()[0]
    bad = api.c.post("/api/check-in/link", json={"token": link, "location": {"lat": 200, "lng": 0}})
    assert bad.status_code == 422
    assert api.c.post("/api/check-in/link", json={"token": link, "location": SALVADOR}).json()["confirmed_now"] is True
    assert api.watch(token)["location_shared_at"]
