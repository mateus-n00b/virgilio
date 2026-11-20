import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Embutida no build (EXPO_PUBLIC_*). Inclui o prefixo /api.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000/api").replace(/\/$/, "");
const TOKEN_KEY = "virgilio.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

// O token fica no Keychain/Keystore; em memória para não ler o armazenamento a cada requisição
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function loadToken(): Promise<string | null> {
  try {
    token = Platform.OS === "web" ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export async function setToken(value: string | null) {
  token = value;
  try {
    if (Platform.OS === "web") {
      if (value) globalThis.localStorage?.setItem(TOKEN_KEY, value);
      else globalThis.localStorage?.removeItem(TOKEN_KEY);
    } else if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível: a sessão vale até fechar o app */
  }
}

export const hasToken = () => !!token;

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    const values = Array.isArray(v) ? v : [String(v)];
    values.forEach((item) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(item)}`));
  }
  return API_URL + path + (parts.length ? `?${parts.join("&")}` : "");
}

function messageFrom(status: number, body: any): { code: string; message: string } {
  const detail = body?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
    return { code: detail.code, message: detail.message };
  }
  if (Array.isArray(detail)) {
    const msg = detail.map((d: any) => String(d.msg).replace(/^Value error, /, "")).join(" ");
    return { code: "validation_error", message: msg };
  }
  return { code: `http_${status}`, message: typeof detail === "string" ? detail : "Algo deu errado. Tente novamente." };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network", "Sem conexão com o servidor. Verifique sua internet.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message } = messageFrom(res.status, body);
    if (res.status === 401 && token) {
      await setToken(null);
      onUnauthorized?.();
    }
    throw new ApiError(res.status, code, message, body?.detail);
  }
  return body as T;
}
