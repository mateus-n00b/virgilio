# Virgílio — app mobile (Expo SDK 58)

Android e iOS com Expo Router. Abas: **Prova de vida** (botão “Estou bem”, localização opcional, SOS), **Virgílios** (convite por WhatsApp/compartilhar), **Instruções**, **Protegidos** (pessoas de quem você é Virgílio) e **Conta** (ciclo x/y, pausa, notificações, dados).

Tipos e formatação vêm do site (`@shared/*` → `../frontend/src/lib`), como no promoAE.

## Rodar

Node 22 (`.nvmrc`).

```bash
cp .env.example .env          # EXPO_PUBLIC_API_URL apontando para a API
npm install
npx expo start                # Expo Go não serve para push; use um development build
npx expo run:android          # development build local
scripts/build-android.sh --install   # APK release local (limita RAM/CPU), igual ao promoAE
```

Antes de terminar uma mudança: `npx expo lint`, `npx tsc --noEmit` e `npx expo-doctor`.

## Notificações

- **Lembrete local**: depois de cada prova de vida, o app agenda no aparelho um aviso para o fim do prazo. Funciona sem push configurado e sem internet.
- **Push** (lembretes da API e alertas de quem você protege): exige um projeto EAS e o Firebase no Android.
  1. `npx eas-cli@latest init` e coloque o ID em `EAS_PROJECT_ID` (`.env` ou secret do EAS).
  2. Android: crie um app no Firebase com o pacote `br.com.virgilio.app`, baixe o `google-services.json` (fora do git) e informe o caminho em `GOOGLE_SERVICES_JSON`. Envie a chave FCM v1 ao EAS (`npx eas-cli@latest credentials`).
  3. iOS: `eas build` configura o APNs.
  4. Se ativar a “enhanced push security” no EAS, defina `EXPO_ACCESS_TOKEN` na API.

Tocar num aviso abre a tela certa: lembrete → Prova de vida; alerta → detalhes da pessoa protegida.

## Localização

Só a permissão “durante o uso” (`ACCESS_BACKGROUND_LOCATION` está bloqueada no manifesto). A localização é obtida apenas no momento do “Estou bem”/SOS, quando a chave “Compartilhar minha localização” está ligada; se o GPS demorar mais de 10 s, a prova de vida segue sem ela.

## Produção

`EXPO_PUBLIC_API_URL=https://<seu-dominio>/api` no build (`eas build` com a variável no perfil ou secret).
