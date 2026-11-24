"""Web Push (navegador / app instalado pelo Chrome) na mesma fila dos avisos do app nativo."""
import base64
import json

import http_ece
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from app.core.config import get_settings
from app.notify import webpush
from app.notify.models import PushToken
from tests.conftest import days

ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123:APA91bTeste"


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _browser(endpoint: str = ENDPOINT) -> dict:
    """Chaves de um navegador inscrito (o que o PushManager gera de verdade)."""
    key = ec.generate_private_key(ec.SECP256R1())
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    auth = b"0123456789abcdef"
    return {"key": key, "auth": auth, "sub": {"endpoint": endpoint, "keys": {"p256dh": _b64(pub), "auth": _b64(auth)}}}


def _open(browser: dict, data: bytes) -> dict:
    return json.loads(http_ece.decrypt(data, private_key=browser["key"], auth_secret=browser["auth"], version="aes128gcm"))


@pytest.fixture()
def vapid(monkeypatch):
    pub, priv = webpush.generate_vapid_keys()
    s = get_settings()
    monkeypatch.setattr(s, "vapid_public_key", pub)
    monkeypatch.setattr(s, "vapid_private_key", priv)
    return pub, priv


class FakeResp:
    def __init__(self, code):
        self.status_code, self.text, self.headers, self.reason = code, "", {}, "Gone" if code == 410 else "x"


@pytest.fixture()
def wire(monkeypatch):
    """Intercepta o POST ao serviço de push do navegador."""
    calls: list[dict] = []
    state = {"code": 201}

    def fake_post(url, data=None, headers=None, timeout=None, **kw):
        calls.append({"url": url, "data": data, "headers": headers})
        return FakeResp(state["code"])

    import requests

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests.Session, "post", lambda self, *a, **k: fake_post(*a, **k))
    return calls, state


def test_payload_is_encrypted_and_vapid_signed(vapid, wire):
    b = _browser()
    assert webpush.send(b["sub"], {"title": "Você está bem?", "url": "/"}) == {"status": "ok"}
    call = wire[0][0]
    assert call["headers"]["content-encoding"] == "aes128gcm" and b"bem?" not in call["data"]
    assert _open(b, call["data"])["title"] == "Você está bem?"
    auth = call["headers"]["authorization"]
    token, k = auth.split("t=")[1].split(",")[0], auth.split("k=")[1]
    assert k == vapid[0]
    pubkey = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), _unb64(k))
    assert jwt.decode(token, pubkey, algorithms=["ES256"], audience="https://fcm.googleapis.com")["sub"].startswith("mailto:")


def test_register_requires_config(api):
    token = api.register()
    assert api.c.get("/api/config").json()["vapid_public_key"] is None
    r = api.c.post("/api/me/push-tokens/web", headers=api.h(token), json=_browser()["sub"])
    assert r.json()["detail"]["code"] == "web_push_disabled"


def test_reminder_and_alert_reach_browsers(api, outbox, vapid, wire):
    person, guardian_user = api.register(name="Beatriz"), api.register(name="Neide", email="neide@example.com")
    api.c.put("/api/me/watch", headers=api.h(guardian_user), json={"interval_days": 30, "grace_days": 14})
    pb, gb = _browser(ENDPOINT + "p"), _browser(ENDPOINT + "g")
    assert api.c.post("/api/me/push-tokens/web", headers=api.h(person), json=pb["sub"]).status_code == 204
    assert api.c.post("/api/me/push-tokens/web", headers=api.h(guardian_user), json=gb["sub"]).status_code == 204
    bad = {**pb["sub"], "endpoint": "http://inseguro"}
    assert api.c.post("/api/me/push-tokens/web", headers=api.h(person), json=bad).status_code == 422

    g = api.add_guardian(person, "Dona Neide", None)
    gtoken = g["invite_url"].rsplit("/", 1)[1]
    r = api.c.post(f"/api/guardian/{gtoken}/accept", headers=api.h(guardian_user), json={"link_account": True})
    assert r.json()["has_app"] is True  # navegador com notificações conta como aparelho

    api.sweep(days(2.1))  # prazo venceu: lembrete à pessoa
    reminder = _open(pb, wire[0][-1]["data"])
    assert reminder["title"] == "Você está bem?" and reminder["url"] == "/"
    assert outbox["pushes"] == []  # nada pelo Expo: só há aparelhos web

    api.sweep(days(3.1))  # alerta aos Virgílios
    alert = _open(gb, wire[0][-1]["data"])
    assert wire[0][-1]["url"] == ENDPOINT + "g" and alert["url"] == f"/protegidos/{gtoken}"


def test_web_subscriptions_ignored_without_keys(api, outbox, vapid, wire, monkeypatch):
    person = api.register()
    api.c.post("/api/me/push-tokens/web", headers=api.h(person), json=_browser()["sub"])
    monkeypatch.setattr(get_settings(), "vapid_private_key", "")  # chaves removidas do ambiente
    api.sweep(days(2.1))
    assert wire[0] == []  # sem tentativa de envio web; o lembrete segue por e-mail
    assert outbox["emails"]


def test_expired_subscription_is_disabled(api, outbox, vapid, wire, db_session_factory):
    person = api.register()
    api.c.post("/api/me/push-tokens/web", headers=api.h(person), json=_browser()["sub"])
    wire[1]["code"] = 410
    api.sweep(days(2.1))
    with db_session_factory() as db:
        assert db.scalars(select(PushToken)).one().disabled_at is not None


def test_unregister_web(api, vapid, db_session_factory):
    person = api.register()
    api.c.post("/api/me/push-tokens/web", headers=api.h(person), json=_browser()["sub"])
    api.c.post("/api/me/push-tokens/unregister", headers=api.h(person), json={"token": ENDPOINT})
    with db_session_factory() as db:
        assert db.scalars(select(PushToken)).first() is None
