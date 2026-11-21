"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, plural, relative } from "@/lib/format";
import type { GuardianView, LastLocation } from "@/lib/types";

function osmEmbed(l: LastLocation) {
  const d = 0.006;
  const bbox = [l.lng - d, l.lat - d, l.lng + d, l.lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${l.lat},${l.lng}`;
}

/** O que um Virgílio vê e faz pelo link pessoal: aceitar o convite e agir durante um alerta. */
export function GuardianPanel({ token }: { token: string }) {
  const { user } = useAuth();
  const [v, setV] = useState<GuardianView | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<GuardianView>(`/guardian/${token}`)
        .then((r) => {
          setV(r);
          setEmail((e) => e || r.guardian_email || "");
        })
        .catch((e: ApiError) => (e.status === 404 ? setNotFound(true) : setError(e.message))),
    [token],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Durante um alerta, atualiza sozinho (outro Virgílio pode ter agido, ou a pessoa ter aparecido)
  useEffect(() => {
    if (!v?.alert) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [v?.alert, load]);

  async function act(path: string, body: unknown = {}, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      setV(await api<GuardianView>(`/guardian/${token}/${path}`, { body }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (notFound)
    return (
      <div className="narrow card center">
        <h1>Link inválido</h1>
        <p className="muted">Este convite não existe mais. Talvez a pessoa tenha removido você ou excluído a conta.</p>
      </div>
    );
  if (!v) return error ? <Alert>{error}</Alert> : <Loading />;

  const first = v.person.first_name;

  // ---------- Convite (ainda não aceito ou recusado)
  if (v.status !== "ACCEPTED") {
    return (
      <div className="narrow stack">
        <h1>
          {v.guardian_name ? `${v.guardian_name.split(" ")[0]}, ` : ""}
          {v.person.name} quer você como Virgílio
        </h1>
        <Alert>{error}</Alert>
        {v.status === "DECLINED" && <Alert kind="info">Você recusou este convite. Se mudou de ideia, ainda pode aceitar.</Alert>}
        <div className="card">
          <p>
            O Virgílio é um app de prova de vida para quem mora só ou longe da família. {first} confirma de tempos em tempos que está bem.
            Se passar do prazo sem responder, <strong>você recebe um aviso</strong> com as instruções que {first} deixou (por exemplo, quem chamar
            ou como entrar em casa) e a última localização conhecida, se houver.
          </p>
          <p className="muted small">
            Enquanto estiver tudo bem, você não recebe nada e não vê dados pessoais de {first}. Você pode deixar de ser Virgílio quando quiser.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act("accept", { name: name || null, email: email || null, link_account: !!user && link });
            }}
          >
            {v.needs_name && (
              <div className="field">
                <label htmlFor="g-name">Seu nome</label>
                <input
                  id="g-name"
                  autoComplete="name"
                  required={!user || !link}
                  minLength={2}
                  maxLength={120}
                  placeholder={user && link ? user.name : undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="hint">É assim que {first} verá você na lista de Virgílios.</div>
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Seu e-mail para receber os avisos</label>
              <input id="email" type="email" required={!user || !link} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {user ? (
              <label className="checkbox field">
                <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
                <span>Receber também as notificações no app, na minha conta ({user.email})</span>
              </label>
            ) : (
              <p className="small muted">
                Usa o app do Virgílio? <Link href={`/entrar?next=${encodeURIComponent(`/v/${token}`)}`}>Entre</Link> antes de aceitar para receber
                notificações no celular.
              </p>
            )}
            <div className="row">
              <button className="btn" disabled={busy}>
                Aceitar ser Virgílio de {first}
              </button>
              {v.status === "PENDING" && (
                <button type="button" className="btn secondary" disabled={busy} onClick={() => act("decline", {}, `Recusar o convite de ${first}?`)}>
                  Recusar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---------- Virgílio ativo
  const a = v.alert;
  return (
    <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1>{a ? `${first} precisa de você` : `Você é Virgílio de ${v.person.name}`}</h1>
      <Alert>{error}</Alert>

      {!v.has_app && (
        <div className="card app-download">
          <div>
            <h3 style={{ marginBottom: 2 }}>Acompanhar pelo app</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {user
                ? `Vincule este convite à sua conta (${user.email}) para ver ${first} em Protegidos e receber os alertas também como notificação.`
                : `Tem conta no Virgílio? Entre e abra este link de novo para ver ${first} em Protegidos e receber notificações.`}
            </p>
          </div>
          {user ? (
            <button className="btn" disabled={busy} onClick={() => act("accept", { link_account: true })}>
              Vincular à minha conta
            </button>
          ) : (
            <Link className="btn secondary" href={`/entrar?next=${encodeURIComponent(`/v/${token}`)}`}>
              Entrar
            </Link>
          )}
        </div>
      )}

      {!a && v.watch && (
        <div className="card">
          <p style={{ marginBottom: 4 }}>
            <span className="badge ok">Tudo certo</span>{" "}
            {v.watch.paused ? `${first} pausou as provas de vida por um tempo.` : `Última prova de vida de ${first} ${relative(v.watch.last_check_in_at)}.`}
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {first} confirma a cada {plural(v.watch.interval_days, "dia", "dias")}. Se o prazo passar sem resposta, você recebe um aviso
            {v.guardian_email ? ` em ${v.guardian_email}` : ""}
            {v.has_app ? " e no app" : ""}. Guarde este link: é por ele que você verá as instruções.
          </p>
        </div>
      )}

      {a && (
        <>
          <div className="alert-banner">
            <h2>{a.reason === "SOS" ? `${first} pediu ajuda` : `${first} não dá sinal de vida`}</h2>
            <p>
              {a.reason === "SOS"
                ? `Pedido de ajuda enviado em ${dateTime(a.created_at)}.`
                : `Última prova de vida: ${dateTime(v.watch?.last_check_in_at)} (${relative(v.watch?.last_check_in_at ?? a.created_at)}).`}
            </p>
            {a.acknowledged_by ? (
              <p style={{ marginBottom: 0 }}>
                <strong>{a.acknowledged_by === v.guardian_name ? "Você avisou" : `${a.acknowledged_by} avisou`}</strong> que vai verificar (
                {relative(a.acknowledged_at!)}).
              </p>
            ) : (
              <p style={{ marginBottom: 0 }}>Ninguém avisou ainda que vai verificar.</p>
            )}
            <div className="actions">
              {!a.acknowledged_by && (
                <button className="btn danger" disabled={busy} onClick={() => act("ack")}>
                  Vou verificar
                </button>
              )}
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => act("resolve", {}, `Confirmar que ${first} está bem? O alerta será encerrado e os outros Virgílios avisados.`)}
              >
                Encontrei: {first} está bem
              </button>
            </div>
          </div>
          <p className="small muted">Em emergência, ligue 192 (SAMU), 193 (Bombeiros) ou 190 (Polícia).</p>

          {v.contact && (
            <div className="card">
              <h2>Contato de {first}</h2>
              <dl className="facts">
                {v.contact.phone && (
                  <>
                    <dt>Telefone</dt>
                    <dd>
                      <a href={`tel:${v.contact.phone.replace(/[^\d+]/g, "")}`}>{v.contact.phone}</a>
                    </dd>
                  </>
                )}
                {v.contact.address && (
                  <>
                    <dt>Endereço</dt>
                    <dd>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.contact.address)}`} target="_blank" rel="noreferrer">
                        {v.contact.address}
                      </a>
                    </dd>
                  </>
                )}
                <dt>E-mail</dt>
                <dd>{v.contact.email}</dd>
                {v.other_guardians.length > 0 && (
                  <>
                    <dt>Outros Virgílios</dt>
                    <dd>{v.other_guardians.join(", ")}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {v.last_location && (
            <div className="card">
              <h2>Última localização conhecida</h2>
              <p className="muted small">
                Enviada por {first} em {dateTime(v.last_location.at)} ({relative(v.last_location.at)})
                {v.last_location.accuracy_m ? `, com precisão de cerca de ${Math.round(v.last_location.accuracy_m)} m` : ""}.
              </p>
              <iframe className="map-frame" title={`Última localização de ${first}`} src={osmEmbed(v.last_location)} loading="lazy" />
              <div className="actions">
                <a className="btn secondary small" href={v.last_location.maps_url} target="_blank" rel="noreferrer">
                  Abrir no Google Maps
                </a>
              </div>
            </div>
          )}

          <div className="card">
            <h2>Instruções de {first}</h2>
            {v.instructions.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                {first} não deixou instruções.
              </p>
            ) : (
              v.instructions.map((i, n) => (
                <div className="instruction" key={n}>
                  <h3>{i.title}</h3>
                  <p className="pre" style={{ marginBottom: 0 }}>
                    {i.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <p className="small center muted">
        Não quer mais ser Virgílio de {first}?{" "}
        <button className="link" onClick={() => act("decline", {}, `Deixar de ser Virgílio de ${first}? Você não receberá mais avisos.`)}>
          Sair
        </button>
      </p>
    </div>
  );
}
