"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppDownload } from "@/components/AppDownload";
import { PushOptIn } from "@/components/PushOptIn";
import { Alert, Badge, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, longDay, plural, relative, WATCH_STATE, watchStateKey } from "@/lib/format";
import { currentPosition, getSharePref, setSharePref } from "@/lib/geo";
import type { User, Watch } from "@/lib/types";

export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Dashboard user={user} /> : <Landing />;
}

function Landing() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>Ninguém atravessa sozinho.</h1>
          <p className="lead">
            Mora só ou longe da família? O Virgílio pede uma prova de vida de tempos em tempos. Se você não responder, avisamos as pessoas
            próximas que você escolheu, seus <strong>Virgílios</strong>, com as instruções que você deixou.
          </p>
          <div className="row mt">
            <Link href="/entrar?criar=1" className="btn">
              Criar minha conta
            </Link>
            <Link href="/entrar" className="btn secondary">
              Já tenho conta
            </Link>
          </div>
        </div>
        <blockquote>
          “Ond’io per lo tuo me’ penso e discerno che tu mi segui, e io sarò tua guida.”
          <cite>Virgílio a Dante, Inferno, Canto I. Na Divina Comédia, Virgílio é quem guia e cuida de Dante na travessia.</cite>
        </blockquote>
      </section>

      <h2 className="mt">Como funciona</h2>
      <div className="grid steps">
        <div className="card">
          <h3>Escolha seus Virgílios</h3>
          <p className="muted">Amigos, vizinhos ou conhecidos de confiança. Eles recebem um convite por WhatsApp ou e-mail e não precisam instalar nada.</p>
        </div>
        <div className="card">
          <h3>Confirme que está bem</h3>
          <p className="muted">A cada <em>x</em> dias, um toque em “Estou bem” no app, no site ou no link do e-mail. Se quiser, junto com sua localização.</p>
        </div>
        <div className="card">
          <h3>Se você sumir, eles agem</h3>
          <p className="muted">
            Sem resposta em <em>x + y</em> dias, seus Virgílios são avisados e veem suas instruções: “alimente meu gato”, “a chave está com a vizinha”.
          </p>
        </div>
      </div>
      <div className="card mt">
        <h3>Privacidade em primeiro lugar</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Instruções e localização ficam criptografadas e só são reveladas aos seus Virgílios durante um alerta. Enquanto está tudo bem, eles
          só sabem que você está bem.
        </p>
      </div>
      <div className="mt">
        <AppDownload />
      </div>
    </>
  );
}

function Dashboard({ user }: { user: User }) {
  const [w, setW] = useState<Watch | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);

  const load = useCallback(() => api<Watch>("/me/watch").then(setW).catch((e) => setError(e.message)), []);
  useEffect(() => {
    setShare(getSharePref());
    load();
  }, [load]);

  async function act(path: "/me/check-in" | "/me/sos") {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const location = share ? await currentPosition() : null;
      const res = await api<Watch>(path, { body: { location } });
      setW(res);
      if (path === "/me/sos") setDone("Pedido de ajuda enviado. Seus Virgílios foram avisados agora.");
      else
        setDone(
          `Prova de vida registrada. Próximo prazo: ${longDay(res.due_at)}.` +
            (share && !location ? " (Não foi possível obter sua localização; a confirmação valeu mesmo assim.)" : ""),
        );
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function sos() {
    if (!confirm("Avisar todos os seus Virgílios agora que você precisa de ajuda?")) return;
    await act("/me/sos");
  }

  async function clearLocation() {
    try {
      setW(await api<Watch>("/me/location", { method: "DELETE" }));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  if (!w) return error ? <Alert>{error}</Alert> : <Loading />;

  const key = watchStateKey(w);
  const tone = w.state === "ALERTED" ? "danger" : w.state === "REMINDED" ? "warn" : "";
  const start = new Date(w.last_check_in_at).getTime();
  const pct = Math.min(100, Math.max(2, ((Date.now() - start) / (new Date(w.alert_at).getTime() - start)) * 100));

  return (
    <div className="stack narrow" style={{ maxWidth: 620 }}>
      <h1>Olá, {user.name.split(" ")[0]}.</h1>
      <PushOptIn variant="banner" />
      <Alert>{error}</Alert>
      <Alert kind="success">{done}</Alert>

      {w.alert && (
        <div className="alert-banner">
          <h2>{w.alert.reason === "SOS" ? "Pedido de ajuda enviado" : "Seus Virgílios foram avisados"}</h2>
          <p style={{ marginBottom: 6 }}>
            {w.alert.reason === "SOS" ? "Você pediu ajuda" : "Você não confirmou a prova de vida no prazo"} em {dateTime(w.alert.created_at)}.
            {w.alert.acknowledged_by && ` ${w.alert.acknowledged_by} avisou que vai verificar.`}
          </p>
          <p style={{ marginBottom: 0 }}>Se está tudo bem, toque em “Estou bem”: o alerta é encerrado e eles ficam sabendo.</p>
        </div>
      )}

      {w.guardians_reachable === 0 && (
        <Alert kind="warn">
          {w.guardians_accepted === 0
            ? "Você ainda não tem nenhum Virgílio que tenha aceitado o convite. Sem eles, ninguém será avisado."
            : "Nenhum dos seus Virgílios pode ser avisado agora (sem e-mail configurado no servidor e sem o app)."}{" "}
          <Link href="/virgilios">Convidar Virgílios</Link>
        </Alert>
      )}

      <div className="card status-card">
        <Badge map={WATCH_STATE} value={key} />
        <button className={`checkin ${tone}`} onClick={() => act("/me/check-in")} disabled={busy} aria-label="Estou bem: registrar prova de vida">
          {busy ? "Enviando…" : "Estou bem"}
          <small>prova de vida</small>
        </button>
        <label className="checkbox" style={{ justifyContent: "center", fontSize: ".9rem" }}>
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => {
              setShare(e.target.checked);
              setSharePref(e.target.checked);
            }}
          />
          <span>
            Compartilhar minha localização atual
            <span className="muted"> (só revelada aos Virgílios em caso de alerta)</span>
          </span>
        </label>

        {w.paused ? (
          <p className="when mt">Em pausa até {dateTime(w.paused_until)}. Nada será cobrado até lá.</p>
        ) : (
          <>
            <div className={`progress ${tone}`} aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="when" style={{ marginBottom: 4 }}>
              Última prova de vida {relative(w.last_check_in_at)}.{" "}
              {w.state === "OK" ? (
                <>
                  Próximo prazo: <strong>{longDay(w.due_at)}</strong> ({relative(w.due_at)}).
                </>
              ) : w.state === "REMINDED" ? (
                <>
                  Prazo vencido. <strong>Seus Virgílios serão avisados {relative(w.alert_at)}</strong> ({dateTime(w.alert_at)}).
                </>
              ) : null}
            </p>
            <p className="muted small">
              Ciclo: a cada {plural(w.interval_days, "dia", "dias")}, com {plural(w.grace_days, "dia", "dias")} de tolerância.{" "}
              <Link href="/conta#ciclo">Ajustar ou pausar</Link>
            </p>
          </>
        )}
        {w.location_shared_at && (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Última localização guardada {relative(w.location_shared_at)}.{" "}
            <button className="link" onClick={clearLocation}>
              Apagar
            </button>
          </p>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h3 style={{ marginBottom: 2 }}>Precisa de ajuda agora?</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Avisa todos os seus Virgílios imediatamente. Em emergência, ligue 192 (SAMU) ou 190.
            </p>
          </div>
          <button className="btn danger" onClick={sos} disabled={busy || !!w.alert}>
            Pedir ajuda (SOS)
          </button>
        </div>
      </div>

      <div className="grid">
        <Link href="/virgilios" className="card" style={{ textDecoration: "none" }}>
          <h3>Meus Virgílios</h3>
          <p className="muted small" style={{ margin: 0 }}>
            {plural(w.guardians_accepted, "aceitou", "aceitaram")}
            {w.guardians_pending > 0 && ` · ${plural(w.guardians_pending, "convite pendente", "convites pendentes")}`}
          </p>
        </Link>
        <Link href="/instrucoes" className="card" style={{ textDecoration: "none" }}>
          <h3>Minhas instruções</h3>
          <p className="muted small" style={{ margin: 0 }}>
            O que fazer se você sumir: pets, plantas, chaves, contatos.
          </p>
        </Link>
      </div>
      <AppDownload />
    </div>
  );
}
