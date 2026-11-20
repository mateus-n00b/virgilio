"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/config";
import { dateTime } from "@/lib/format";
import type { User, Watch } from "@/lib/types";

/** "2026-12-24" → fim daquele dia no fuso do navegador, em ISO. */
function endOfDayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 0).toISOString();
}

function Profile({ user }: { user: User }) {
  const { refresh } = useAuth();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/auth/me", { method: "PATCH", body: { name, phone, address } });
      await refresh();
      setMsg({ kind: "success", text: "Dados salvos." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).message });
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Seus dados</h2>
      <p className="muted small">Telefone e endereço são mostrados aos seus Virgílios apenas durante um alerta, para que saibam onde ir e como ligar.</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="phone">Telefone</label>
          <input id="phone" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="address">Endereço</label>
        <input id="address" maxLength={255} placeholder="Rua, número, apartamento, bairro, cidade" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <p className="muted small">E-mail da conta: {user.email}</p>
      <button className="btn">Salvar</button>
    </form>
  );
}

function Cycle() {
  const cfg = useAppConfig();
  const [w, setW] = useState<Watch | null>(null);
  const [interval, setInterval_] = useState(2);
  const [grace, setGrace] = useState(1);
  const [pause, setPause] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    api<Watch>("/me/watch").then((r) => {
      setW(r);
      setInterval_(r.interval_days);
      setGrace(r.grace_days);
    });
  }, []);

  async function save(paused_until: string | null) {
    try {
      const r = await api<Watch>("/me/watch", { method: "PUT", body: { interval_days: interval, grace_days: grace, paused_until } });
      setW(r);
      setPause("");
      setMsg({ kind: "success", text: r.paused ? `Pausado até ${dateTime(r.paused_until)}.` : "Ciclo atualizado." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).message });
    }
  }

  if (!w) return <Loading />;
  const lim = cfg?.limits;
  return (
    <div className="card" id="ciclo">
      <h2>Ciclo de prova de vida</h2>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(w.paused ? w.paused_until : null);
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="interval">Pedir prova de vida a cada (x)</label>
            <select id="interval" value={interval} onChange={(e) => setInterval_(Number(e.target.value))}>
              {Array.from({ length: lim?.max_interval_days ?? 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="grace">Tolerância antes de avisar (y)</label>
            <select id="grace" value={grace} onChange={(e) => setGrace(Number(e.target.value))}>
              {Array.from({ length: lim?.max_grace_days ?? 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  mais {n} {n === 1 ? "dia" : "dias"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted small">
          Depois de {interval} {interval === 1 ? "dia" : "dias"} sem prova de vida, você recebe um lembrete. Se não responder em mais {grace}{" "}
          {grace === 1 ? "dia" : "dias"} (total de {interval + grace}), seus Virgílios são avisados.
        </p>
        <button className="btn">Salvar ciclo</button>
      </form>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "20px 0" }} />
      <h3>Pausa</h3>
      {w.paused ? (
        <div className="row between">
          <p style={{ margin: 0 }}>Pausado até {dateTime(w.paused_until)}.</p>
          <button className="btn secondary small" onClick={() => save(null)}>
            Retomar agora
          </button>
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (pause) save(endOfDayIso(pause));
          }}
        >
          <p className="muted small" style={{ flexBasis: "100%", margin: 0 }}>
            Viagem com família, internação planejada? Pause por até {lim?.max_pause_days ?? 60} dias. O ciclo recomeça no fim da pausa.
          </p>
          <input type="date" style={{ maxWidth: 200 }} required value={pause} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setPause(e.target.value)} />
          <button className="btn secondary">Pausar até esta data</button>
        </form>
      )}
    </div>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/auth/me/password", { method: "PUT", body: { current_password: current, new_password: next } });
      setCurrent("");
      setNext("");
      setMsg({ kind: "success", text: "Senha alterada." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as ApiError).message });
    }
  }
  return (
    <form className="card" onSubmit={save}>
      <h2>Senha</h2>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="cur">Senha atual</label>
          <input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new">Nova senha</label>
          <input id="new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
      </div>
      <button className="btn secondary">Alterar senha</button>
    </form>
  );
}

function DeleteAccount() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  async function remove() {
    if (!confirm("Excluir sua conta? Seus Virgílios, instruções e localização serão apagados e ninguém mais será avisado. Não dá para desfazer.")) return;
    try {
      await api("/auth/me", { method: "DELETE" });
      signOut();
      router.replace("/");
    } catch (err) {
      setError((err as ApiError).message);
    }
  }
  return (
    <div className="card">
      <h2>Excluir conta</h2>
      <Alert>{error}</Alert>
      <p className="muted small">Apaga definitivamente todos os seus dados.</p>
      <button className="btn danger outline" onClick={remove}>
        Excluir minha conta
      </button>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      {(user) => (
        <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1>Conta</h1>
          <Cycle />
          <Profile user={user} />
          <Password />
          <DeleteAccount />
        </div>
      )}
    </RequireAuth>
  );
}
