"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AuthResponse } from "@/lib/types";

function ResetForm() {
  const token = useSearchParams().get("t") ?? "";
  const router = useRouter();
  const { signIn } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      signIn(await api<AuthResponse>("/auth/password/reset", { body: { token, password } }));
      router.replace("/");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Nova senha</h1>
      <div className="card">
        <Alert>{error}</Alert>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="hint">8 ou mais caracteres, com letras e números. As sessões abertas em outros aparelhos serão encerradas.</div>
          </div>
          <button className="btn block" disabled={busy || !token}>
            Salvar e entrar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResetForm />
    </Suspense>
  );
}
