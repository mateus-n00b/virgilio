"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import type { AuthResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** true logo após "Sair": páginas protegidas devem ir para a home, não pedir login. */
  signedOut: boolean;
  signIn: (res: AuthResponse) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch (e) {
      // Só sai da conta se a API recusar a sessão; queda de rede (ou navegação no meio) não desloga ninguém.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback((res: AuthResponse) => {
    setToken(res.access_token);
    setSignedOut(false);
    setUser(res.user);
    void import("./webpush").then((m) => m.refreshPush()).catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    // Desliga os avisos deste aparelho antes de apagar o token (a chamada precisa dele): o aparelho
    // não deve continuar avisando a pessoa que saiu.
    const old = getToken();
    void import("./webpush")
      .then((m) => m.disablePush())
      .catch(() => {})
      .finally(() => {
        if (getToken() === old) setToken(null); // não apaga um login novo feito nesse meio-tempo
      });
    setSignedOut(true);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signedOut, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

/** Destino pós-login: respeita ?next= só se for um caminho interno. */
export function afterLogin(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/entrar") ? next : "/";
}
