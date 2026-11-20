// Formatação compartilhada entre o site e o app mobile (@shared/format). Sem APIs do navegador.
import type { GuardianStatus, Watch, WatchState } from "./types";

const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export const dateTime = (v: string | null | undefined) => (v ? dt.format(new Date(v)) : "—");
export const longDay = (v: string | null | undefined) => (v ? dayFmt.format(new Date(v)) : "—");

/** "em 2 dias", "há 3 horas" — feito à mão (o Hermes do app não tem Intl.RelativeTimeFormat). */
export function relative(v: string, now: number = Date.now()): string {
  const diff = new Date(v).getTime() - now;
  const abs = Math.abs(diff);
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  let text: string;
  if (abs < min) return "agora";
  if (abs < hour) {
    const n = Math.round(abs / min);
    text = `${n} minuto${n > 1 ? "s" : ""}`;
  } else if (abs < day) {
    const n = Math.round(abs / hour);
    text = `${n} hora${n > 1 ? "s" : ""}`;
  } else {
    const n = Math.round(abs / day);
    text = `${n} dia${n > 1 ? "s" : ""}`;
  }
  return diff > 0 ? `em ${text}` : `há ${text}`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const WATCH_STATE: Record<WatchState | "PAUSED", { label: string; tone: string }> = {
  OK: { label: "Tudo certo", tone: "ok" },
  REMINDED: { label: "Aguardando sua confirmação", tone: "warn" },
  ALERTED: { label: "Virgílios avisados", tone: "danger" },
  PAUSED: { label: "Em pausa", tone: "muted" },
};

export const GUARDIAN_STATUS: Record<GuardianStatus, { label: string; tone: string }> = {
  PENDING: { label: "Convite pendente", tone: "warn" },
  ACCEPTED: { label: "Aceitou", tone: "ok" },
  DECLINED: { label: "Recusou", tone: "muted" },
};

export function watchStateKey(w: Pick<Watch, "state" | "paused">): WatchState | "PAUSED" {
  return w.paused && w.state === "OK" ? "PAUSED" : w.state;
}

/** Mensagem para compartilhar o convite (WhatsApp, SMS...). */
export function inviteMessage(guardianName: string, myName: string, url: string): string {
  const first = guardianName.split(" ")[0];
  return (
    `Oi, ${first}! Uso o Virgílio, um app de prova de vida para quem mora só ou longe da família. ` +
    `Você aceita ser meu Virgílio? Você só recebe um aviso se eu passar alguns dias sem dar sinal de vida, ` +
    `com instruções do que fazer. Não precisa instalar nada: ${url}\n— ${myName}`
  );
}

export const whatsappLink = (text: string, phone?: string | null) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits ? (digits.length <= 11 ? `55${digits}` : digits) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
};
