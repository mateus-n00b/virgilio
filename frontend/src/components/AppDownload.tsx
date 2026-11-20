"use client";

import { useAppConfig } from "@/lib/config";

/** Download do APK Android (release do GitHub). Some quando ANDROID_APK_URL não está definida. */
export function AppDownload({ variant = "card" }: { variant?: "card" | "link" }) {
  const cfg = useAppConfig();
  const url = cfg?.android_apk_url;
  if (!url) return null;
  if (variant === "link")
    return (
      <a href={url} rel="noopener">
        App Android (APK)
      </a>
    );
  return (
    <div className="card app-download">
      <div>
        <h3 style={{ marginBottom: 2 }}>Virgílio no celular</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Lembretes no horário certo, mesmo sem internet, e alertas de quem você protege. Android 8 ou superior. Ao instalar, o Android pode pedir
          para permitir apps de fontes desconhecidas.
        </p>
      </div>
      <a className="btn" href={url} rel="noopener">
        Baixar para Android
      </a>
    </div>
  );
}
