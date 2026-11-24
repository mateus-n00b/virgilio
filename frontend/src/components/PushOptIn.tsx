"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/webpush";

const HIDE_KEY = "virgilio.push.hide";

/**
 * Notificações neste navegador: o lembrete de prova de vida e, para quem é Virgílio de alguém, os alertas.
 * - variant="banner": convite no painel (some se ativado ou dispensado).
 * - variant="card": controle completo na Conta.
 */
export function PushOptIn({ variant }: { variant: "banner" | "card" }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let alive = true;
    void pushState().then((s) => {
      if (!alive) return;
      setState(s);
      setHidden(localStorage.getItem(HIDE_KEY) === "1");
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    await disablePush();
    setState("off");
    setBusy(false);
  }

  if (!state || state === "disabled") return null;

  if (variant === "banner") {
    if (hidden || state !== "off") return null;
    return (
      <div className="push-banner" role="region" aria-label="Notificações">
        <span aria-hidden className="push-bell">
          🔔
        </span>
        <span className="push-text">
          <strong>Receber avisos neste aparelho?</strong> Lembramos você na hora da prova de vida e, se alguém que você protege precisar, avisamos na hora.
        </span>
        <span className="row">
          <button className="btn small" onClick={enable} disabled={busy}>
            Ativar avisos
          </button>
          <button
            className="btn secondary small"
            onClick={() => {
              localStorage.setItem(HIDE_KEY, "1");
              setHidden(true);
            }}
          >
            Agora não
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Avisos neste aparelho</h2>
      {state === "unsupported" && (
        <p className="muted">
          Este navegador não recebe avisos. No Android, use o Chrome (de preferência com o Virgílio instalado como app). No iPhone, adicione o Virgílio à
          Tela de Início primeiro (iOS 16.4 ou mais novo). Os e-mails continuam chegando normalmente.
        </p>
      )}
      {state === "denied" && (
        <Alert kind="warn">
          Os avisos foram bloqueados neste navegador. Para liberar: toque no cadeado ao lado do endereço (ou em Configurações do app) → Notificações →
          Permitir.
        </Alert>
      )}
      {state === "on" && (
        <>
          <Alert kind="success">Ativados: você recebe aqui o lembrete da prova de vida e os alertas de quem você protege.</Alert>
          <button className="btn secondary small" onClick={disable} disabled={busy}>
            Desativar neste aparelho
          </button>
        </>
      )}
      {state === "off" && (
        <>
          <p className="muted">
            Receba aqui, na hora, o lembrete da prova de vida e — se você é Virgílio de alguém — o alerta quando a pessoa não responder, mesmo com o
            navegador fechado. Os e-mails continuam chegando.
          </p>
          <button className="btn small" onClick={enable} disabled={busy}>
            Ativar avisos
          </button>
        </>
      )}
    </div>
  );
}
