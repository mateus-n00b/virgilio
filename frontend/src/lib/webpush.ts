"use client";

import { api } from "./api";
import { getAppConfig } from "./config";

/** Estado das notificações neste navegador. */
export type PushState = "unsupported" | "disabled" | "denied" | "off" | "on";

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const cfg = await getAppConfig();
  if (!cfg?.vapid_public_key) return "disabled";
  if (Notification.permission === "denied") return "denied";
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Pede permissão (precisa de um toque do usuário) e registra a inscrição na conta atual. */
export async function enablePush(): Promise<PushState> {
  const cfg = await getAppConfig();
  if (!pushSupported() || !cfg?.vapid_public_key) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(cfg.vapid_public_key) });
  await api("/me/push-tokens/web", { body: sub.toJSON() });
  return "on";
}

/** Desliga neste navegador. Também chamado ao sair da conta (o aparelho não deve avisar outra pessoa). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await api("/me/push-tokens/unregister", { body: { token: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Reafirma a inscrição a cada login (o navegador pode trocar o endpoint; o aparelho passa a ser da conta atual). */
export async function refreshPush(): Promise<void> {
  if ((await pushState()) !== "on") return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) await api("/me/push-tokens/web", { body: sub.toJSON() }).catch(() => {});
}
