import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthResponse, User } from "@shared/types";
import { api, ApiError, loadToken, setToken, setUnauthorizedHandler } from "./api";
import { registerForPush, unregisterPush } from "./push";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (res: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!(await loadToken())) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
      registerForPush({ ask: false }).catch(() => {});
    } catch (e) {
      // Sem rede: mantém o token e tenta de novo depois; 401 já limpou o token em api()
      if (e instanceof ApiError && e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    void (async () => {
      await refresh(); // sessão salva no aparelho
    })();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const signIn = useCallback(async (res: AuthResponse) => {
    await setToken(res.access_token);
    setUser(res.user);
    // Lembretes e alertas são o coração do app: pede a permissão logo após entrar
    registerForPush({ ask: true }).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush(); // antes de apagar o token: a API precisa saber de quem é o aparelho
    await setToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
