"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

/** Evento do Chrome/Android que permite abrir o diálogo nativo de instalação. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __vgInstall?: BeforeInstallPromptEvent | null;
  }
}

const SNOOZE_KEY = "virgilio.install.snooze";
const SNOOZE_DAYS = 14;
/** Links abertos por quem não tem conta (convite do Virgílio, confirmação por e-mail): sem convite. */
const PUBLIC_PREFIXES = ["/v/", "/confirmar"];

/**
 * Captura o convite antes da hidratação do React (o Chrome pode dispará-lo cedo).
 * Vai como script inline no <head>.
 */
export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  window.__vgInstall = e;
  window.dispatchEvent(new Event("vg-install-ready"));
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
}`;

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function snoozed() {
  const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
  return Date.now() < until;
}

export function InstallPrompt() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [mode, setMode] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    if (standalone() || snoozed() || !window.matchMedia("(pointer: coarse)").matches) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    const ready = () => window.__vgInstall && setMode("android");
    const installed = () => {
      window.__vgInstall = null;
      setMode(null);
    };
    // setState dentro de callbacks (não direto no efeito)
    const t = window.setTimeout(() => (window.__vgInstall ? setMode("android") : ios ? setMode("ios") : undefined), 0);
    window.addEventListener("vg-install-ready", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("vg-install-ready", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!mode || !user || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  function later() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
    setMode(null);
  }

  async function install() {
    const ev = window.__vgInstall;
    if (!ev) return setMode(null);
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    window.__vgInstall = null;
    if (outcome === "dismissed") later();
    else setMode(null);
  }

  return (
    <div className="install-banner no-print" role="dialog" aria-labelledby="install-title">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div className="install-text">
        <strong id="install-title">Instalar o Virgílio como app?</strong>
        {mode === "android" ? (
          <span>Confirme que está bem com um toque, direto da tela inicial.</span>
        ) : (
          <span>
            Toque em <b>Compartilhar</b> (o quadrado com a seta para cima) e depois em <b>Adicionar à Tela de Início</b>.
          </span>
        )}
      </div>
      <div className="install-actions">
        {mode === "android" && (
          <button className="btn small" onClick={install}>
            Instalar
          </button>
        )}
        <button className="btn ghost small" onClick={later}>
          {mode === "android" ? "Agora não" : "Entendi"}
        </button>
      </div>
    </div>
  );
}
