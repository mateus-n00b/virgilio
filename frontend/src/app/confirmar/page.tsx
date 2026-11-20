"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { currentPosition } from "@/lib/geo";

/** Link do e-mail de lembrete: confirma a prova de vida sem precisar entrar. */
function Confirm() {
  const token = useSearchParams().get("t") ?? "";
  const [result, setResult] = useState<{ name: string; confirmed_now: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmNow(withLocation: boolean) {
    setBusy(true);
    setError("");
    try {
      const location = withLocation ? await currentPosition() : null;
      setResult(await api("/check-in/link", { body: { token, location } }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow card center">
      {result ? (
        <>
          <h1>{result.confirmed_now ? `Obrigado, ${result.name}!` : "Já estava confirmado"}</h1>
          <p className="muted">
            {result.confirmed_now
              ? "Prova de vida registrada. Seus Virgílios não serão avisados."
              : "Você já confirmou depois deste e-mail. Está tudo certo."}
          </p>
          <Link href="/" className="btn secondary">
            Ir para o app
          </Link>
        </>
      ) : (
        <>
          <h1>Você está bem?</h1>
          <Alert>{error}</Alert>
          <p className="muted">Confirme para que seus Virgílios não sejam avisados.</p>
          <div className="stack">
            <button className="btn block" disabled={busy || !token} onClick={() => confirmNow(false)}>
              Sim, estou bem
            </button>
            <button className="btn secondary block" disabled={busy || !token} onClick={() => confirmNow(true)}>
              Estou bem e compartilhar minha localização
            </button>
          </div>
          <p className="muted small mt" style={{ marginBottom: 0 }}>
            A localização fica guardada em sigilo e só é mostrada aos seus Virgílios se houver um alerta.
          </p>
        </>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Confirm />
    </Suspense>
  );
}
