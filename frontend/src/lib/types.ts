// Tipos da API, compartilhados entre o site e o app mobile (@shared/types)

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface AppConfig {
  web_url: string;
  mail_enabled: boolean;
  support_email: string;
  limits: {
    max_interval_days: number;
    max_grace_days: number;
    max_pause_days: number;
    max_guardians: number;
    max_instructions: number;
  };
}

export type WatchState = "OK" | "REMINDED" | "ALERTED";

export interface AlertInfo {
  id: number;
  reason: "MISSED" | "SOS";
  status: "OPEN" | "RESOLVED";
  created_at: string;
  notify_count: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
}

export interface Watch {
  interval_days: number;
  grace_days: number;
  state: WatchState;
  paused: boolean;
  paused_until: string | null;
  last_check_in_at: string;
  due_at: string;
  alert_at: string;
  alert: AlertInfo | null;
  guardians_accepted: number;
  guardians_reachable: number;
  guardians_pending: number;
  location_shared_at: string | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
}

export interface LastLocation {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  at: string;
  maps_url: string;
}

export type GuardianStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface Guardian {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  relation: string | null;
  status: GuardianStatus;
  has_app: boolean;
  invite_url: string;
  created_at: string;
  responded_at: string | null;
}

export interface GuardianInput {
  name: string;
  email: string | null;
  phone: string | null;
  relation: string | null;
}

export interface Instruction {
  id: number;
  title: string;
  body: string;
  position: number;
  updated_at: string;
}

/** O que um Virgílio vê no link pessoal. Contato, instruções e localização só durante um alerta. */
export interface GuardianView {
  guardian_name: string;
  guardian_email: string | null;
  status: GuardianStatus;
  has_app: boolean;
  person: { name: string; first_name: string };
  watch: { state: WatchState; paused: boolean; last_check_in_at: string; interval_days: number; due_at: string } | null;
  alert: AlertInfo | null;
  contact: { email: string; phone: string | null; address: string | null } | null;
  last_location: LastLocation | null;
  instructions: { title: string; body: string }[];
  other_guardians: string[];
}

export interface Protecting {
  token: string;
  person_name: string;
  state: WatchState;
  paused: boolean;
  last_check_in_at: string;
  alert: AlertInfo | null;
}
