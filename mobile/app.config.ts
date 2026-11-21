import type { ConfigContext, ExpoConfig } from "expo/config";

/*
 * Configuração dinâmica: chaves e IDs vêm de variáveis de ambiente (.env ou EAS secrets),
 * nunca do código. Ver mobile/.env.example.
 */
const env = process.env;

// HTTP sem TLS só para desenvolvimento (emulador/rede local); em produção a API é https
const cleartextApi = (env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000/api").startsWith("http://");
const LOCATION_TEXT =
  "Se você quiser, sua localização é enviada junto com a prova de vida. Ela fica em sigilo e só é mostrada aos seus Virgílios em caso de alerta.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Virgílio",
  slug: "virgilio",
  scheme: "virgilio",
  version: "1.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: env.IOS_BUNDLE_ID || "br.com.virgilio.app",
    supportsTablet: false,
    infoPlist: { NSLocationWhenInUseUsageDescription: LOCATION_TEXT },
  },
  android: {
    package: env.ANDROID_PACKAGE || "br.com.virgilio.app",
    // Aumente a cada APK publicado: o Android só instala por cima uma versão maior
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: "#2F6B4F",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.ACCESS_BACKGROUND_LOCATION"],
    predictiveBackGestureEnabled: false,
    // Firebase (FCM) para receber push no Android; caminho do google-services.json (fora do git)
    ...(env.GOOGLE_SERVICES_JSON ? { googleServicesFile: env.GOOGLE_SERVICES_JSON } : {}),
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-status-bar",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#F8F5EE" }],
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: cleartextApi,
          // Mesma escolha do promoAE: sem R8 no release (classes carregadas por reflexão eram removidas)
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
        },
        ios: {},
      },
    ],
    // Só localização "durante o uso", e só quando a pessoa escolhe compartilhar
    ["expo-location", { locationWhenInUsePermission: LOCATION_TEXT }],
    ["expo-notifications", { icon: "./assets/android-icon-monochrome.png", color: "#2F6B4F", defaultChannel: "virgilio" }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Projeto EAS: necessário para o token de push do Expo (lembretes e alertas)
    ...(env.EAS_PROJECT_ID ? { eas: { projectId: env.EAS_PROJECT_ID } } : {}),
  },
});
