import { useEffect, useState } from "react";
import type { AppConfig } from "@shared/types";
import { api } from "./api";

const FALLBACK: AppConfig = {
  web_url: "",
  mail_enabled: false,
  support_email: "anonimizae@proton.me",
  limits: { max_interval_days: 30, max_grace_days: 14, max_pause_days: 60, max_guardians: 5, max_instructions: 20 },
};

let cached: Promise<AppConfig> | null = null;

/** Configuração pública lida da API em tempo de execução. */
export function getAppConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = api<AppConfig>("/config").catch(() => {
      cached = null;
      return FALLBACK;
    });
  }
  return cached;
}

export function useAppConfig(): AppConfig | null {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    getAppConfig().then(setCfg);
  }, []);
  return cfg;
}
