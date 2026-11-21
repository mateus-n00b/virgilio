"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert, Badge, Empty, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAppConfig } from "@/lib/config";
import { dateTime, GUARDIAN_STATUS, inviteMessage, whatsappLink } from "@/lib/format";
import type { Guardian, GuardianInput, User } from "@/lib/types";

const EMPTY: GuardianInput = { name: "", email: "", phone: "", relation: "" };

function GuardiansPage({ user }: { user: User }) {
  const cfg = useAppConfig();
  const [list, setList] = useState<Guardian[] | null>(null);
  const [form, setForm] = useState<GuardianInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null); // link recém-gerado, destacado na lista

  const load = useCallback(() => api<Guardian[]>("/me/guardians").then(setList).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof GuardianInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const body = { ...form, email: form.email || null, phone: form.phone || null, relation: form.relation || null };
      if (editing) {
        await api(`/me/guardians/${editing}`, { method: "PUT", body });
        setInfo("Dados atualizados.");
      } else {
        const g = await api<Guardian>("/me/guardians", { body });
        setInfo(
          g.email && cfg?.mail_enabled
            ? `Convite enviado por e-mail para ${g.name}. Você também pode mandar pelo WhatsApp.`
            : `${g.name} foi adicionado(a). Agora envie o convite pelo WhatsApp ou copie o link.`,
        );
      }
      setForm(EMPTY);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function createLink() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const g = await api<Guardian>("/me/guardians/link", { body: {} });
      setFresh(g.id);
      setInfo("Link criado. Envie pelo WhatsApp ou copie e mande como preferir. Cada link vale para uma pessoa.");
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: Guardian) {
    if (!confirm(g.open_invite ? "Cancelar este link de convite? Ele deixará de funcionar." : `Remover ${g.name} dos seus Virgílios? O link dele(a) deixará de funcionar.`)) return;
    try {
      await api(`/me/guardians/${g.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function resend(g: Guardian) {
    try {
      await api(`/me/guardians/${g.id}/resend`, { body: {} });
      setInfo(`Convite reenviado para ${g.email}.`);
      await load();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  async function copy(g: Guardian) {
    try {
      await navigator.clipboard.writeText(inviteMessage(g.name, user.name, g.invite_url));
      setInfo("Convite copiado. Cole onde quiser (SMS, Telegram, e-mail…).");
    } catch {
      prompt("Copie o link do convite:", g.invite_url);
    }
  }

  const max = cfg?.limits.max_guardians ?? 5;
  const active = list?.filter((g) => g.status !== "DECLINED").length ?? 0;

  return (
    <div className="stack">
      <div>
        <h1>Meus Virgílios</h1>
        <p className="muted">
          Pessoas próximas que serão avisadas se você não der sinal de vida: amigos, vizinhos, conhecidos. Elas não precisam instalar o app; só
          aceitar o convite. Enquanto está tudo bem, não veem suas instruções nem sua localização.
        </p>
      </div>
      <Alert>{error}</Alert>
      <Alert kind="success">{info}</Alert>
      {cfg && !cfg.mail_enabled && (
        <Alert kind="warn">
          O envio de e-mails não está configurado neste servidor: só Virgílios que usam o app (com notificações) serão avisados.
        </Alert>
      )}

      {active < max && (
        <div className="card app-download">
          <div>
            <h3 style={{ marginBottom: 2 }}>Convidar por link</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Gere um link e mande para quem quiser, sem cadastrar nada antes. A pessoa informa o nome e o e-mail ao aceitar.
            </p>
          </div>
          <button className="btn" onClick={createLink} disabled={busy}>
            Gerar link de convite
          </button>
        </div>
      )}

      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>Você ainda não tem Virgílios. Adicione o primeiro abaixo.</Empty>
      ) : (
        list.map((g) => (
          <div className="card person" key={g.id} style={g.id === fresh ? { borderColor: "var(--brand)" } : undefined}>
            <div className="avatar" aria-hidden>
              {g.open_invite ? "🔗" : g.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="body">
              <div className="row between">
                <h3>
                  {g.open_invite ? "Link de convite" : g.name}
                  {g.relation && <span className="muted small"> · {g.relation}</span>}
                </h3>
                <Badge map={GUARDIAN_STATUS} value={g.status} />
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {g.open_invite
                  ? `Criado em ${dateTime(g.created_at)}. Quem aceitar informa nome e e-mail.`
                  : [g.email, g.phone].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
                {g.has_app && " · usa o app"}
              </p>
              <div className="actions">
                {g.status !== "ACCEPTED" && (
                  <a className="btn whatsapp small" href={whatsappLink(inviteMessage(g.name, user.name, g.invite_url), g.phone)} target="_blank" rel="noreferrer">
                    Convidar pelo WhatsApp
                  </a>
                )}
                {g.status !== "ACCEPTED" && (
                  <button className="btn secondary small" onClick={() => copy(g)}>
                    Copiar convite
                  </button>
                )}
                {g.status !== "ACCEPTED" && g.email && cfg?.mail_enabled && (
                  <button className="btn secondary small" onClick={() => resend(g)}>
                    Reenviar e-mail
                  </button>
                )}
                {!g.open_invite && (
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setEditing(g.id);
                    setForm({ name: g.name, email: g.email ?? "", phone: g.phone ?? "", relation: g.relation ?? "" });
                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                  }}
                >
                  Editar
                </button>
                )}
                <button className="btn danger outline small" onClick={() => remove(g)}>
                  {g.open_invite ? "Cancelar link" : "Remover"}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {(editing || active < max) && (
        <form className="card" onSubmit={save}>
          <h2>{editing ? "Editar Virgílio" : "Ou cadastre a pessoa"}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="g-name">Nome</label>
              <input id="g-name" required minLength={2} maxLength={120} value={form.name} onChange={set("name")} />
            </div>
            <div className="field">
              <label htmlFor="g-rel">Relação (opcional)</label>
              <input id="g-rel" placeholder="vizinha, amigo, primo…" maxLength={60} value={form.relation ?? ""} onChange={set("relation")} />
            </div>
            <div className="field">
              <label htmlFor="g-email">E-mail</label>
              <input id="g-email" type="email" value={form.email ?? ""} onChange={set("email")} />
              <div className="hint">Por onde os alertas chegam. Se não souber, a pessoa informa ao aceitar.</div>
            </div>
            <div className="field">
              <label htmlFor="g-phone">WhatsApp (opcional)</label>
              <input id="g-phone" type="tel" placeholder="(71) 99999-0000" maxLength={30} value={form.phone ?? ""} onChange={set("phone")} />
              <div className="hint">Para enviar o convite e para os outros Virgílios poderem ligar.</div>
            </div>
          </div>
          <div className="row">
            <button className="btn" disabled={busy}>
              {editing ? "Salvar" : "Adicionar"}
            </button>
            {editing && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY);
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
      {!editing && active >= max && <p className="muted small">Você atingiu o limite de {max} Virgílios.</p>}
    </div>
  );
}

export default function Page() {
  return <RequireAuth>{(user) => <GuardiansPage user={user} />}</RequireAuth>;
}
