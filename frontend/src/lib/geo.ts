"use client";

import type { GeoPoint } from "./types";

const PREF_KEY = "virgilio.shareLocation";

/** Preferência local: compartilhar a localização junto com a prova de vida (padrão: não). */
export function getSharePref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSharePref(v: boolean) {
  try {
    localStorage.setItem(PREF_KEY, v ? "1" : "0");
  } catch {
    /* armazenamento indisponível */
  }
}

/** Localização atual do navegador, ou null se negada/indisponível (a prova de vida segue sem ela). */
export function currentPosition(timeoutMs = 10000): Promise<GeoPoint | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
