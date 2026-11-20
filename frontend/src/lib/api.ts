// Padrão: mesma origem (Vercel roteia /api para o backend; localmente, proxy do Next.js)
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
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

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(API_URL + path, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function messageFrom(status: number, body: any): { code: string; message: string } {
  const detail = body?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
    return { code: detail.code, message: detail.message };
  }
  if (Array.isArray(detail)) {
    // Erros de validação do FastAPI/Pydantic
    const msg = detail.map((d: any) => String(d.msg).replace(/^Value error, /, "")).join(" ");
    return { code: "validation_error", message: msg };
  }
  return { code: `http_${status}`, message: typeof detail === "string" ? detail : "Algo deu errado. Tente novamente." };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  // FormData: o navegador define o Content-Type com o boundary do multipart
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "network", "Sem conexão com o servidor.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message } = messageFrom(res.status, body);
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, code, message, body?.detail);
  }
  return body as T;
}
