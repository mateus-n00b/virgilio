import * as Notifications from "expo-notifications";
import { router, Stack, type Href } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/components/ui";
import { AuthProvider } from "@/lib/auth";
import { notificationsAvailable } from "@/lib/push";

/** Ao tocar num aviso, abre a tela certa (também com o app fechado). */
function useNotificationObserver() {
  useEffect(() => {
    if (!notificationsAvailable) return;
    let active = true;
    function open(response: Notifications.NotificationResponse) {
      const url = response.notification.request.content.data?.url;
      // Só rotas internas conhecidas: o conteúdo do aviso vem de fora do app
      if (url === "/") router.navigate("/");
      else if (typeof url === "string" && /^\/protegidos\/[A-Za-z0-9_-]+$/.test(url)) router.push(url as Href);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (active && r) open(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  useNotificationObserver();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="protegidos/[token]" options={{ title: "Virgílio de…" }} />
          <Stack.Screen name="entrar" options={{ title: "Entrar", presentation: "modal" }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
