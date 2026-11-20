"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, Loading, Tabs } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { afterLogin, useAuth } from "@/lib/auth";
import type { AuthResponse } from "@/lib/types";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(params.get("criar") ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("next");

  useEffect(() => {
    if (user) router.replace(afterLogin(next));
  }, [user, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "login"
          ? await api<AuthResponse>("/auth/login", { body: { email, password } })
          : await api<AuthResponse>("/auth/register", { body: { name, email, password, accept_terms: terms } });
      signIn(res);
      router.replace(afterLogin(next));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
      <div className="card">
        <Tabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError("");
          }}
          options={[
            { value: "login", label: "Entrar" },
            { value: "register", label: "Criar conta" },
          ]}
        />
        <Alert>{error}</Alert>
        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="name">Seu nome</label>
              <input id="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode === "register" && <div className="hint">É para onde vão os lembretes de prova de vida.</div>}
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "register" ? 8 : 1}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && <div className="hint">8 ou mais caracteres, com letras e números.</div>}
          </div>
          {mode === "register" && (
            <label className="checkbox field">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                Li e aceito os <Link href="/termos" target="_blank">Termos de Uso</Link> e a{" "}
                <Link href="/privacidade" target="_blank">Política de Privacidade</Link>.
              </span>
            </label>
          )}
          <button className="btn block" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        {mode === "login" && (
          <p className="center small mt" style={{ marginBottom: 0 }}>
            <Link href="/esqueci-senha">Esqueci minha senha</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}
