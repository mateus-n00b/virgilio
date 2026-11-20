#!/usr/bin/env bash
# Gera o APK release do Android localmente, com limite de memória e CPU para não travar a máquina.
#
# Uso:  mobile/scripts/build-android.sh [--install] [--abi <abis>]
#   --install   instala no aparelho conectado ao adb (USB ou depuração Wi-Fi) e abre o app
#   --abi       arquiteturas (padrão: arm64-v8a, que cobre os celulares atuais;
#               para o emulador use x86_64; várias: arm64-v8a,x86_64)
#
# Variáveis opcionais: BUILD_MEM_GB (teto de RAM em GB; padrão: RAM disponível - 2, entre 4 e 12),
#                      BUILD_CPUS (núcleos; padrão 6).
# Lê mobile/.env (EXPO_PUBLIC_API_URL, GOOGLE_MAPS_ANDROID_KEY...). O APK sai assinado com a chave
# de debug: serve para testes, não para a Play Store (use EAS para publicar).
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL=0
ABIS="arm64-v8a"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --abi) ABIS="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_HOME
ADB="$ANDROID_HOME/platform-tools/adb"

# Expo SDK 58 exige Node 22.13+; usa o do nvm se o do sistema for mais antigo
node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }
if [[ "$(node_major || echo 0)" -lt 22 ]]; then
  NVM_NODE="$(ls -d "$HOME"/.nvm/versions/node/v22.* 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$NVM_NODE" ]] || { echo "Node 22 não encontrado (instale com: nvm install 22)" >&2; exit 1; }
  export PATH="$NVM_NODE/bin:$PATH"
fi
echo "Node $(node -v)"

# Teto de memória: o que está disponível agora menos 2 GB de folga, entre 4 e 12 GB
AVAIL_GB=$(free -g | awk '/^Mem/ {print $7}')
MEM_GB="${BUILD_MEM_GB:-$(( AVAIL_GB - 2 ))}"
(( MEM_GB > 12 )) && MEM_GB=12
if (( MEM_GB < 4 )); then
  echo "Pouca memória livre (${AVAIL_GB} GB disponíveis). Feche programas ou defina BUILD_MEM_GB." >&2
  exit 1
fi
WORKERS=$(( MEM_GB >= 9 ? 3 : 2 ))
CPUS="${BUILD_CPUS:-6}"
echo "Limites: ${MEM_GB} GB de RAM, ${CPUS} núcleos, ${WORKERS} workers, ABI ${ABIS}"

cd "$MOBILE_DIR"
# Regenera android/ a partir do app.config.ts (chaves e URL do .env entram aqui)
CI=1 npx expo prebuild --platform android --clean --no-install

UNIT="virgilio-android-build-$$"
cleanup() { systemctl --user stop "$UNIT.scope" 2>/dev/null || true; }  # encerra daemons do Kotlin que sobram
trap cleanup EXIT

cd android
systemd-run --user --scope --unit="$UNIT" -q \
  -p MemoryMax="${MEM_GB}G" -p MemorySwapMax=0 -p CPUQuota="$(( CPUS * 100 ))%" \
  nice -n 15 taskset -c "0-$(( CPUS - 1 ))" \
  ./gradlew assembleRelease --no-daemon --max-workers="$WORKERS" -x lint \
    -PreactNativeArchitectures="$ABIS" -Porg.gradle.parallel=false \
    "-Dorg.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m" "-Pkotlin.daemon.jvmargs=-Xmx1g"

APK="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
echo
echo "APK: $APK ($(du -h "$APK" | cut -f1))"

if (( INSTALL )); then
  "$ADB" get-state >/dev/null 2>&1 || { echo "Nenhum aparelho no adb (conecte por USB ou: adb pair / adb connect)" >&2; exit 1; }
  "$ADB" install -r "$APK"
  "$ADB" shell monkey -p br.com.virgilio.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  echo "Instalado e aberto. Logs do app: $ADB logcat --pid=\$($ADB shell pidof br.com.virgilio.app)"
fi
