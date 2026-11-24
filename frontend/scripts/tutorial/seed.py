"""Popula a API local de demonstração com pessoas fictícias para os prints do tutorial."""
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone

import httpx

API = "http://127.0.0.1:8123/api"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo.db")
c = httpx.Client(base_url=API, timeout=20)


def reg(name, email):
    r = c.post("/auth/register", json={"name": name, "email": email, "password": "senha-demo-123", "accept_terms": True})
    r.raise_for_status()
    return r.json()["access_token"]


def h(t):
    return {"Authorization": f"Bearer {t}"}


def ok(r):
    if r.status_code >= 400:
        raise SystemExit(f"{r.request.method} {r.request.url}: {r.status_code} {r.text}")
    return r.json() if r.content else None


lucia = reg("Lúcia Ferreira", "lucia@exemplo.com")
antonio = reg("Antônio Ramos", "antonio@exemplo.com")
zelia = reg("Zélia Campos", "zelia@exemplo.com")

ok(c.patch("/auth/me", headers=h(lucia), json={"name": "Lúcia Ferreira", "phone": "(85) 98888-1234", "address": "Rua das Acácias, 120, Fortaleza"}))
ok(c.patch("/auth/me", headers=h(antonio), json={"name": "Antônio Ramos", "phone": "(85) 99777-4321", "address": "Rua Barão de Aracati, 455, apto 302, Fortaleza"}))
ok(c.put("/me/watch", headers=h(lucia), json={"interval_days": 3, "grace_days": 1}))

# Virgílios da Lúcia
def tok(g):
    return g["invite_url"].rstrip("/").split("/")[-1]

carlos = ok(c.post("/me/guardians", headers=h(lucia), json={"name": "Carlos Mendes", "email": "carlos@exemplo.com", "phone": "(85) 98123-0001", "relation": "Vizinho"}))
ana = ok(c.post("/me/guardians", headers=h(lucia), json={"name": "Ana Ferreira", "email": "ana@exemplo.com", "relation": "Filha"}))
ok(c.post("/me/guardians", headers=h(lucia), json={"name": "Rita Souza", "email": "rita@exemplo.com", "relation": "Amiga da igreja"}))
ok(c.post(f"/guardian/{tok(carlos)}/accept", json={}))
ok(c.post(f"/guardian/{tok(ana)}/accept", json={}))

for title, body in [
    ("Alimente o gato Mingau", "A ração fica no armário embaixo da pia. Meia xícara de manhã e meia à noite, e troque a água."),
    ("Chave reserva", "Está com a Dona Zélia, do apartamento 12. Ela sabe que vocês podem pedir."),
    ("Remédios", "Tomo losartana pela manhã. A receita está na gaveta da cozinha. Minha médica é a Dra. Helena, (85) 3222-0000."),
]:
    ok(c.post("/me/instructions", headers=h(lucia), json={"title": title, "body": body}))

# Lúcia é Virgílio de Antônio e de Zélia
for owner, rel in [(antonio, "Vizinha"), (zelia, "Amiga")]:
    g = ok(c.post("/me/guardians", headers=h(owner), json={"name": "Lúcia Ferreira", "email": "lucia@exemplo.com", "relation": rel}))
    ok(c.post(f"/guardian/{tok(g)}/accept", headers=h(lucia), json={"link_account": True}))
    if owner is antonio:
        antonio_token = tok(g)

ok(c.post("/me/instructions", headers=h(antonio), json={"title": "Minha filha", "body": "Avise a Júlia, (11) 97777-0000. Ela mora em São Paulo."}))
ok(c.post("/me/instructions", headers=h(antonio), json={"title": "Porteiro", "body": "O Sr. Raimundo tem a chave do apartamento. Portaria 24h."}))
ok(c.post("/me/check-in", headers=h(antonio), json={"location": {"lat": -3.7275, "lng": -38.5005, "accuracy_m": 25}}))
ok(c.post("/me/check-in", headers=h(lucia), json={"location": {"lat": -3.7400, "lng": -38.4900, "accuracy_m": 20}}))

# Antônio sumiu: recua o último sinal dele e roda a varredura (lembrete e depois alerta)
past = (datetime.now(timezone.utc) - timedelta(days=5, hours=3)).replace(tzinfo=None)
db = sqlite3.connect(DB)
uid = db.execute("SELECT id FROM users WHERE email='antonio@exemplo.com'").fetchone()[0]
db.execute("UPDATE watches SET last_check_in_at=?, last_location_at=?, interval_days=3, grace_days=1 WHERE user_id=?", (past, past, uid))
db.commit()
for _ in range(2):
    ok(c.get("/internal/sweep", headers={"Authorization": "Bearer demo-cron"}))
    db.execute("UPDATE watches SET last_reminder_at=? WHERE user_id=?", (past + timedelta(days=3), uid))
    db.commit()

print(json.dumps({"lucia": lucia, "antonio_token": antonio_token}))
