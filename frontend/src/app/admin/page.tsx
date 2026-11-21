"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Alert, Badge, Empty, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dateTime, relative, WATCH_STATE } from "@/lib/format";
import type { User } from "@/lib/types";

// ---------------------------------------------------------------- tipos (só do painel)

interface Stats {
  generated_at: string;
  users: {
    total: number; suspended: number; new_7d: number; new_30d: number;
    active_1d: number; active_7d: number; active_30d: number;
    with_accepted_guardian: number; without_accepted_guardian: number; with_app: number;
  };
  cycle: { ok: number; reminded: number; alerted: number; paused: number };
  guardians: { accepted: number; pending: number; declined: number };
  alerts: { open: number; missed_30d: number; sos_30d: number; resolved_by_user_30d: number; resolved_by_guardian_30d: number };
  deliveries_7d: { sent: number; pending: number; skipped: number; failed: number; reasons: Record<string, number> };
  history: { day: string; users: number; new: number; active_1d: number; active_7d: number; alerted: number }[];
}

interface AdminUser {
  id: number; name: string; email: string; status: "ACTIVE" | "SUSPENDED";
  created_at: string; last_login_at: string | null; last_check_in_at: string | null;
  state: "OK" | "REMINDED" | "ALERTED" | null; paused: boolean; interval_days: number | null; grace_days: number | null;
  guardians_accepted: number; guardians_pending: number; failed_deliveries: number; has_app: boolean;
}

interface AdminUserDetail extends AdminUser {
  alerts: { id: number; reason: string; status: string; created_at: string; notify_count: number; acknowledged_at: string | null; resolved_at: string | null; resolved_by: string | null }[];
  deliveries: { id: number; kind: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }[];
}

interface AuditEvent { id: number; actor_user_id: number | null; action: string; target_user_id: number | null; details: Record<string, unknown>; created_at: string }

const DELIVERY_STATUS: Record<string, { label: string; tone: string }> = {
  SENT: { label: "Enviado", tone: "ok" },
  PENDING: { label: "Na fila", tone: "info" },
  SKIPPED: { label: "Descartado", tone: "muted" },
  FAILED: { label: "Falhou", tone: "danger" },
};
const KIND: Record<string, string> = { REMINDER: "Lembrete", ALERT: "Alerta", ACK: "Vou verificar", RESOLVED: "Está bem", INVITE: "Convite" };
const REASON: Record<string, string> = {
  stale: "expirou na fila", already_checked_in: "já confirmou", alert_resolved: "alerta encerrado", guardian_inactive: "Virgílio inativo",
  invite_answered: "convite já respondido", user_inactive: "conta inativa", no_email: "sem e-mail", mail_disabled: "SMTP desligado",
  no_device: "sem aparelho", smtp_error: "erro de SMTP", guardian_removed: "Virgílio removido",
};
const USER_STATE: Record<string, { label: string; tone: string }> = {
  ...WATCH_STATE,
  SUSPENDED: { label: "Suspensa", tone: "danger" },
};

// ---------------------------------------------------------------- componentes

function Tile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Uma série: usuários com prova de vida nas últimas 24 h, por dia (foto diária da varredura). */
function ActiveChart({ history }: { history: Stats["history"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (history.length < 2)
    return <p className="muted small">A série aparece a partir do segundo dia de varreduras (uma foto agregada por dia).</p>;
  const max = Math.max(1, ...history.map((h) => h.active_1d));
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <>
      <div className="row between">
        <span className="muted small">máximo no período: {max}</span>
        <button className="link small" onClick={() => setTable(!table)}>
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>
      {table ? (
        <div className="table-wrap mt">
          <table>
            <thead>
              <tr><th>Dia</th><th className="num">Ativos 24 h</th><th className="num">Ativos 7 dias</th><th className="num">Novos</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.day}><td>{fmt(h.day)}</td><td className="num">{h.active_1d}</td><td className="num">{h.active_7d}</td><td className="num">{h.new}</td><td className="num">{h.users}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="bars" role="img" aria-label={`Usuários ativos em 24 horas nos últimos ${history.length} dias`} onMouseLeave={() => setHover(null)}>
            {history.map((h, i) => (
              <div
                key={h.day}
                className="bar"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${fmt(h.day)}: ${h.active_1d} ativos`}
              >
                <span style={{ height: `${(h.active_1d / max) * 100}%` }} />
              </div>
            ))}
            {hover !== null && (
              <div className="tip" style={{ left: `${((hover + 0.5) / history.length) * 100}%` }}>
                {fmt(history[hover].day)} · <strong>{history[hover].active_1d}</strong> ativos · {history[hover].new} novos
              </div>
            )}
          </div>
          <div className="axis">
            <span>{fmt(history[0].day)}</span>
            <span>{fmt(history[history.length - 1].day)}</span>
          </div>
        </>
      )}
    </>
  );
}

function UserDetail({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const load = useCallback(() => api<AdminUserDetail>(`/admin/users/${id}`).then(setU).catch((e) => setMsg({ kind: "error", text: e.message })), [id]);
  useEffect(() => {
    setU(null);
    setMsg(null);
    load();
  }, [load]);

  async function setStatus(action: "suspend" | "reactivate") {
    const reason = prompt(
      action === "suspend"
        ? "Motivo da suspensão (fica na auditoria). Atenção: a conta deixa de ser acompanhada e os Virgílios não serão avisados."
        : "Motivo da reativação (fica na auditoria):",
    );
    if (!reason) return;
    try {
      setU(await api<AdminUserDetail>(`/admin/users/${id}/${action}`, { body: { reason } }));
      setMsg({ kind: "success", text: action === "suspend" ? "Conta suspensa." : "Conta reativada." });
      onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: (e as ApiError).message });
    }
  }

  async function retry() {
    try {
      const r = await api<{ requeued: number; sent: number }>(`/admin/users/${id}/retry-failed`, { body: {} });
      setMsg({ kind: "success", text: `${r.requeued} aviso(s) devolvido(s) à fila; ${r.sent} enviado(s) agora.` });
      load();
      onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: (e as ApiError).message });
    }
  }

  if (!u) return msg ? <Alert>{msg.text}</Alert> : <Loading />;
  return (
    <div className="card stack">
      <div className="row between">
        <div>
          <h2 style={{ marginBottom: 0 }}>{u.name}</h2>
          <span className="muted small">{u.email} · conta nº {u.id}</span>
        </div>
        <Badge map={USER_STATE} value={u.status === "SUSPENDED" ? "SUSPENDED" : u.paused && u.state === "OK" ? "PAUSED" : u.state ?? "OK"} />
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <dl className="facts">
        <dt>Cadastro</dt><dd>{dateTime(u.created_at)}</dd>
        <dt>Último login</dt><dd>{u.last_login_at ? `${dateTime(u.last_login_at)} (${relative(u.last_login_at)})` : "nunca"}</dd>
        <dt>Última prova de vida</dt><dd>{u.last_check_in_at ? `${dateTime(u.last_check_in_at)} (${relative(u.last_check_in_at)})` : "—"}</dd>
        <dt>Ciclo</dt><dd>a cada {u.interval_days} dia(s), tolerância de {u.grace_days}</dd>
        <dt>Virgílios</dt><dd>{u.guardians_accepted} aceitaram, {u.guardians_pending} pendente(s)</dd>
        <dt>App</dt><dd>{u.has_app ? "sim, com notificações" : "não"}</dd>
      </dl>
      <div className="actions">
        {u.failed_deliveries > 0 && (
          <button className="btn small" onClick={retry}>Reenviar {u.failed_deliveries} aviso(s) com falha</button>
        )}
        {u.status === "ACTIVE" ? (
          <button className="btn danger outline small" onClick={() => setStatus("suspend")}>Suspender conta</button>
        ) : (
          <button className="btn secondary small" onClick={() => setStatus("reactivate")}>Reativar conta</button>
        )}
      </div>

      <h3 className="mt">Alertas</h3>
      {u.alerts.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Nenhum alerta.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Aberto em</th><th>Motivo</th><th className="num">Avisos</th><th>Assumido</th><th>Encerrado</th></tr></thead>
            <tbody>
              {u.alerts.map((a) => (
                <tr key={a.id}>
                  <td>{dateTime(a.created_at)}</td>
                  <td>{a.reason === "SOS" ? "SOS" : "Sem prova de vida"}</td>
                  <td className="num">{a.notify_count}</td>
                  <td>{a.acknowledged_at ? dateTime(a.acknowledged_at) : "—"}</td>
                  <td>{a.resolved_at ? `${dateTime(a.resolved_at)} (${a.resolved_by === "GUARDIAN" ? "por Virgílio" : "pela pessoa"})` : <span className="badge danger">Aberto</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt">Avisos recentes</h3>
      {u.deliveries.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>Nenhum aviso.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Criado</th><th>Tipo</th><th>Canal</th><th>Situação</th><th>Detalhe</th></tr></thead>
            <tbody>
              {u.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{dateTime(d.created_at)}</td>
                  <td>{KIND[d.kind] ?? d.kind}</td>
                  <td>{d.channel === "EMAIL" ? "E-mail" : "Push"}</td>
                  <td><Badge map={DELIVERY_STATUS} value={d.status} /></td>
                  <td className="small">{d.last_error ? `${REASON[d.last_error] ?? d.last_error}${d.attempts ? ` (${d.attempts} tentativas)` : ""}` : d.sent_at ? dateTime(d.sent_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- página

function AdminPanel() {
  const [s, setS] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(() => {
    api<Stats>("/admin/stats").then(setS).catch((e) => setMsg({ kind: "error", text: e.message }));
    api<AuditEvent[]>("/admin/audit").then(setAudit).catch(() => {});
  }, []);
  const loadUsers = useCallback(() => {
    api<AdminUser[]>("/admin/users", { query: { q, state } }).then(setUsers).catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [q, state]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(loadUsers, 250); // espera a digitação
    return () => clearTimeout(t);
  }, [loadUsers]);

  async function run(path: string, label: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<Record<string, unknown>>(path, { body: {} });
      const parts = Object.entries(r).filter(([, v]) => typeof v === "number" && v).map(([k, v]) => `${k}: ${v}`);
      setMsg({ kind: "success", text: `${label} concluído. ${parts.join(", ") || "Nada a fazer."}` });
      loadStats();
      loadUsers();
    } catch (e) {
      setMsg({ kind: "error", text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return msg ? <Alert>{msg.text}</Alert> : <Loading />;
  const failed = s.deliveries_7d.failed;
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 0 }}>Administração</h1>
          <span className="muted small">Atualizado {relative(s.generated_at)}</span>
        </div>
        <div className="row">
          <button className="btn secondary small" disabled={busy} onClick={() => run("/admin/sweep", "Varredura")}>Rodar varredura agora</button>
          <button className="btn secondary small" disabled={busy} onClick={() => run("/admin/deliveries/retry-failed", "Reenvio")}>Reenviar falhas (3 dias)</button>
        </div>
      </div>
      <Alert kind="info">
        Por privacidade, este painel mostra só números, estados e dados técnicos. Instruções, localização, endereço, telefone e contatos dos
        Virgílios nunca aparecem aqui, e toda ação fica registrada na auditoria.
      </Alert>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="tiles">
        <Tile label="Usuários" value={s.users.total} sub={`+${s.users.new_7d} em 7 dias · +${s.users.new_30d} em 30`} />
        <Tile label="Ativos 24 h" value={s.users.active_1d} sub="fizeram prova de vida" />
        <Tile label="Ativos 7 dias" value={s.users.active_7d} />
        <Tile label="Ativos 30 dias" value={s.users.active_30d} />
        <Tile label="Sem Virgílio aceito" value={s.users.without_accepted_guardian} sub="ninguém seria avisado" />
        <Tile label="Usam o app" value={s.users.with_app} sub="com notificações" />
      </div>

      <div className="card">
        <h3>Usuários ativos em 24 h, por dia</h3>
        <ActiveChart history={s.history} />
      </div>

      <div className="grid">
        <div className="card">
          <h3>Ciclos agora</h3>
          <dl className="facts">
            <dt>Em dia</dt><dd>{s.cycle.ok}</dd>
            <dt>Aguardando confirmação</dt><dd>{s.cycle.reminded}</dd>
            <dt>Virgílios avisados</dt><dd>{s.cycle.alerted}</dd>
            <dt>Alertas abertos</dt><dd>{s.alerts.open} {s.alerts.open > 0 && <span className="badge danger">atenção</span>}</dd>
            <dt>Em pausa</dt><dd>{s.cycle.paused}</dd>
            <dt>Contas suspensas</dt><dd>{s.users.suspended}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Alertas (30 dias)</h3>
          <dl className="facts">
            <dt>Sem prova de vida</dt><dd>{s.alerts.missed_30d}</dd>
            <dt>SOS</dt><dd>{s.alerts.sos_30d}</dd>
            <dt>Encerrados pela pessoa</dt><dd>{s.alerts.resolved_by_user_30d}</dd>
            <dt>Encerrados por Virgílio</dt><dd>{s.alerts.resolved_by_guardian_30d}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Avisos (7 dias)</h3>
          <dl className="facts">
            <dt>Enviados</dt><dd>{s.deliveries_7d.sent}</dd>
            <dt>Na fila</dt><dd>{s.deliveries_7d.pending}</dd>
            <dt>Descartados</dt><dd>{s.deliveries_7d.skipped}</dd>
            <dt>Falharam</dt><dd>{failed} {failed > 0 && <span className="badge danger">verificar</span>}</dd>
          </dl>
          {Object.keys(s.deliveries_7d.reasons).length > 0 && (
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Motivos: {Object.entries(s.deliveries_7d.reasons).map(([k, v]) => `${REASON[k] ?? k} (${v})`).join(", ")}
            </p>
          )}
        </div>
        <div className="card">
          <h3>Virgílios</h3>
          <dl className="facts">
            <dt>Aceitaram</dt><dd>{s.guardians.accepted}</dd>
            <dt>Pendentes</dt><dd>{s.guardians.pending}</dd>
            <dt>Recusaram</dt><dd>{s.guardians.declined}</dd>
          </dl>
        </div>
      </div>

      <h2 className="mt">Usuários</h2>
      <div className="row">
        <input style={{ maxWidth: 320 }} placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuários" />
        <select style={{ maxWidth: 240 }} value={state} onChange={(e) => setState(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Todas as situações</option>
          <option value="OK">Em dia</option>
          <option value="REMINDED">Aguardando confirmação</option>
          <option value="ALERTED">Virgílios avisados</option>
          <option value="SUSPENDED">Suspensas</option>
        </select>
      </div>
      {users === null ? (
        <Loading />
      ) : users.length === 0 ? (
        <Empty>Nenhum usuário encontrado.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Situação</th><th>Última prova de vida</th><th className="num">Virgílios</th><th className="num">Falhas</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`clickable${selected === u.id ? " selected" : ""}`} onClick={() => setSelected(u.id)}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><Badge map={USER_STATE} value={u.status === "SUSPENDED" ? "SUSPENDED" : u.paused && u.state === "OK" ? "PAUSED" : u.state ?? "OK"} /></td>
                  <td>{u.last_check_in_at ? relative(u.last_check_in_at) : "—"}</td>
                  <td className="num">{u.guardians_accepted}</td>
                  <td className="num">{u.failed_deliveries || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <UserDetail
          id={selected}
          onChanged={() => {
            loadStats();
            loadUsers();
          }}
        />
      )}

      <h2 className="mt">Auditoria</h2>
      {audit.length === 0 ? (
        <p className="muted small">Nenhuma ação registrada.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Ação</th><th>Por</th><th>Conta</th><th>Detalhes</th></tr></thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id}>
                  <td>{dateTime(e.created_at)}</td>
                  <td><code>{e.action}</code></td>
                  <td>{e.actor_user_id ? `nº ${e.actor_user_id}` : "sistema"}</td>
                  <td>{e.target_user_id ? `nº ${e.target_user_id}` : "—"}</td>
                  <td className="small">{Object.entries(e.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Gate({ user }: { user: User }) {
  if (!user.is_admin)
    return (
      <div className="narrow card center">
        <h1>Acesso restrito</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Esta área é só para a administração do Virgílio.</p>
      </div>
    );
  return <AdminPanel />;
}

export default function AdminPage() {
  return <RequireAuth>{(user) => <Gate user={user} />}</RequireAuth>;
}
