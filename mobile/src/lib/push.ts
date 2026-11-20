import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { AndroidImportance, IosAuthorizationStatus, SchedulableTriggerInputTypes } from "expo-notifications";
import { Linking, Platform } from "react-native";
import { api } from "./api";

/*
 * Dois tipos de aviso:
 *  - push (Expo Push Service → FCM/APNs): lembretes da API e alertas para quem é Virgílio.
 *    Exige um projeto EAS (EAS_PROJECT_ID) e, no Android, o google-services.json do Firebase.
 *  - lembrete local: agendado no próprio aparelho para o fim do prazo. Funciona mesmo sem push
 *    e sem internet, e é a forma mais pontual de lembrar a pessoa.
 */
const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

export const notificationsAvailable = Platform.OS !== "web";
export const pushAvailable = notificationsAvailable && !!projectId;
const CHANNEL_ID = "virgilio"; // o backend envia com este channelId
const REMINDER_ID = "virgilio-checkin-reminder";

let registeredToken: string | null = null;

if (notificationsAvailable) {
  // Com o app aberto, o aviso também aparece como banner
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type PushStatus = "granted" | "denied" | "blocked" | "unavailable";

function isGranted(p: Notifications.NotificationPermissionsStatus) {
  return p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

async function ensureChannel() {
  if (Platform.OS === "android") {
    // No Android 13+ o canal precisa existir antes do pedido de permissão
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Prova de vida e alertas",
      description: "Lembretes para confirmar que você está bem e alertas das pessoas que você protege",
      importance: AndroidImportance.MAX,
    });
  }
}

/** Permissão de notificações. Com `ask`, pede (usar após uma ação da pessoa). */
export async function notificationPermission(ask: boolean): Promise<PushStatus> {
  if (!notificationsAvailable) return "unavailable";
  await ensureChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!isGranted(perm) && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  return isGranted(perm) ? "granted" : perm.canAskAgain ? "denied" : "blocked";
}

/** Registra o aparelho na API para receber push. Sem `ask`, só renova se já houver permissão. */
export async function registerForPush({ ask }: { ask: boolean }): Promise<PushStatus> {
  const status = await notificationPermission(ask);
  if (status !== "granted" || !pushAvailable) return pushAvailable ? status : "unavailable";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("/me/push-tokens", { body: { token, platform: Platform.OS } });
  registeredToken = token;
  return "granted";
}

/** Ao sair da conta: o aparelho deixa de receber avisos dela. */
export async function unregisterPush(): Promise<void> {
  await cancelLocalReminder();
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await api("/me/push-tokens/unregister", { body: { token } }).catch(() => {});
}

/** Agenda (ou reagenda) o lembrete local para o fim do prazo da prova de vida. */
export async function scheduleLocalReminder(dueAt: string | null): Promise<void> {
  if (!notificationsAvailable) return;
  await cancelLocalReminder();
  if (!dueAt) return;
  const when = new Date(dueAt).getTime();
  if (when <= Date.now() + 60_000) return;
  if ((await Notifications.getPermissionsAsync()).granted === false) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Você está bem?",
      body: "Seu prazo de prova de vida chegou. Toque para confirmar que está tudo bem.",
      data: { url: "/" },
      sound: "default",
    },
    trigger: { type: SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
  });
}

export async function cancelLocalReminder(): Promise<void> {
  if (!notificationsAvailable) return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}

export function openNotificationSettings() {
  return Linking.openSettings();
}
