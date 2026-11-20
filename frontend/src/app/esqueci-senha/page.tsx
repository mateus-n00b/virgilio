"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ dev_reset_url: string | null }>("/auth/password/forgot", { body: { email } });
      setDevUrl(r.dev_reset_url);
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Esqueci minha senha</h1>
      <div className="card">
        <Alert>{error}</Alert>
        {sent ? (
          <>
            <Alert kind="success">Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.</Alert>
            {devUrl && (
              <p className="small">
                Ambiente de desenvolvimento (sem e-mail): <a href={devUrl}>abrir o link</a>
              </p>
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">E-mail da conta</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn block" disabled={busy}>
              Enviar link
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
