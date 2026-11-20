import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { GeoPoint } from "@shared/types";

const PREF_KEY = "virgilio.shareLocation";

/** Preferência do aparelho: compartilhar a localização junto com a prova de vida (padrão: não). */
export async function getSharePref(): Promise<boolean> {
  try {
    const v = Platform.OS === "web" ? globalThis.localStorage?.getItem(PREF_KEY) : await SecureStore.getItemAsync(PREF_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export async function setSharePref(v: boolean): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(PREF_KEY, v ? "1" : "0");
    else await SecureStore.setItemAsync(PREF_KEY, v ? "1" : "0");
  } catch {
    /* armazenamento indisponível */
  }
}

/** Pede a permissão "durante o uso". Retorna se foi concedida. */
export async function askLocationPermission(): Promise<boolean> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  return granted;
}

/**
 * Localização atual, ou null se negada/indisponível (a prova de vida segue sem ela).
 * Limita a espera: confirmar que está bem não pode travar por causa do GPS.
 */
export async function currentPosition(timeoutMs = 10000): Promise<GeoPoint | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted && !(await askLocationPermission())) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const pos = await Promise.race([fix, timeout]);
    const p = pos ?? (await Location.getLastKnownPositionAsync());
    if (!p) return null;
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy ? Math.round(p.coords.accuracy) : null };
  } catch {
    return null;
  }
}
