import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert as NativeAlert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { Watch } from "@shared/types";
import { dateTime, longDay, plural, relative, WATCH_STATE, watchStateKey } from "@shared/format";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Badge, Button, Card, colors, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { askLocationPermission, currentPosition, getSharePref, setSharePref } from "@/lib/location";
import { scheduleLocalReminder } from "@/lib/push";

export default function HomeScreen() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user)
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.h1, { fontFamily: "serif" }]}>Ninguém atravessa sozinho.</Text>
        <Text style={styles.text}>
          Mora só ou longe da família? O Virgílio pede uma prova de vida de tempos em tempos. Se você não responder, avisamos as pessoas
          próximas que você escolheu — seus Virgílios — com as instruções que você deixou.
        </Text>
        <SignInPrompt message="Crie sua conta para começar." />
      </ScrollView>
    );
  return <Dashboard firstName={user.name.split(" ")[0]} />;
}

function Dashboard({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [w, setW] = useState<Watch | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [share, setShare] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0); // instante da última leitura (barra de progresso)

  const apply = useCallback((r: Watch) => {
    setW(r);
    setLoadedAt(Date.now());
    // Lembrete local para o fim do prazo (só enquanto está em dia e sem pausa)
    scheduleLocalReminder(r.state === "OK" && !r.paused ? r.due_at : null).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await api<Watch>("/me/watch"));
      setError("");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [apply]);

  useEffect(() => {
    getSharePref().then(setShare);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function act(path: "/me/check-in" | "/me/sos") {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const location = share ? await currentPosition() : null;
      const r = await api<Watch>(path, { body: { location } });
      apply(r);
      setDone(
        path === "/me/sos"
          ? "Pedido de ajuda enviado. Seus Virgílios foram avisados agora."
          : `Prova de vida registrada. Próximo prazo: ${longDay(r.due_at)}.` +
              (share && !location ? " (Sem localização desta vez; a confirmação valeu mesmo assim.)" : ""),
      );
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShare(v: boolean) {
    if (v && !(await askLocationPermission())) {
      NativeAlert.alert("Localização negada", "Para compartilhar, permita o acesso à localização nas configurações do aparelho.", [
        { text: "Agora não" },
        { text: "Abrir configurações", onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setShare(v);
    setSharePref(v);
  }

  function sos() {
    NativeAlert.alert("Pedir ajuda?", "Todos os seus Virgílios serão avisados agora. Em emergência, ligue 192 (SAMU).", [
      { text: "Cancelar", style: "cancel" },
      { text: "Avisar meus Virgílios", style: "destructive", onPress: () => act("/me/sos") },
    ]);
  }

  async function clearLocation() {
    try {
      apply(await api<Watch>("/me/location", { method: "DELETE" }));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  if (!w) return error ? <View style={styles.content}><Alert>{error}</Alert></View> : <Loading />;

  const tone = w.state === "ALERTED" ? colors.danger : w.state === "REMINDED" ? colors.accent : colors.brand;
  const ring = w.state === "ALERTED" ? colors.dangerSoft : w.state === "REMINDED" ? colors.warnSoft : colors.brandSoft;
  const start = new Date(w.last_check_in_at).getTime();
  const pct = Math.min(100, Math.max(2, ((loadedAt - start) / (new Date(w.alert_at).getTime() - start)) * 100));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={styles.h1}>Olá, {firstName}.</Text>
      <Alert>{error}</Alert>
      <Alert kind="success">{done}</Alert>

      {w.alert && (
        <View style={[styles.alert, { backgroundColor: colors.dangerSoft, gap: 4 }]}>
          <Text style={[styles.h3, { color: colors.danger }]}>
            {w.alert.reason === "SOS" ? "Pedido de ajuda enviado" : "Seus Virgílios foram avisados"}
          </Text>
          <Text style={{ color: colors.danger }}>
            {w.alert.acknowledged_by ? `${w.alert.acknowledged_by} avisou que vai verificar. ` : ""}
            Se está tudo bem, toque em “Estou bem”: o alerta é encerrado e eles ficam sabendo.
          </Text>
        </View>
      )}

      {w.guardians_reachable === 0 && (
        <Pressable onPress={() => router.navigate("/virgilios")}>
          <Alert kind="warn">
            {w.guardians_accepted === 0
              ? "Nenhum Virgílio aceitou seu convite ainda. Sem eles, ninguém será avisado. Toque para convidar."
              : "Nenhum dos seus Virgílios pode ser avisado agora. Toque para revisar."}
          </Alert>
        </Pressable>
      )}

      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        <Badge map={WATCH_STATE} value={watchStateKey(w)} />
        <Pressable
          testID="check-in"
          accessibilityRole="button"
          accessibilityLabel="Estou bem: registrar prova de vida"
          disabled={busy}
          onPress={() => act("/me/check-in")}
          style={({ pressed }) => [
            local.checkin,
            { backgroundColor: tone, borderColor: ring, transform: [{ scale: pressed ? 0.97 : 1 }], opacity: busy ? 0.7 : 1 },
          ]}
        >
          <Text style={local.checkinText}>{busy ? "Enviando…" : "Estou bem"}</Text>
          <Text style={local.checkinSub}>prova de vida</Text>
        </Pressable>

        <View style={[styles.row, { alignSelf: "stretch" }]}>
          <Switch value={share} onValueChange={toggleShare} trackColor={{ true: colors.brand }} accessibilityLabel="Compartilhar minha localização" />
          <Text style={[styles.small, { flex: 1 }]}>
            Compartilhar minha localização atual — só revelada aos Virgílios em caso de alerta
          </Text>
        </View>

        {w.paused ? (
          <Text style={[styles.text, { marginTop: 12, textAlign: "center" }]}>Em pausa até {dateTime(w.paused_until)}.</Text>
        ) : (
          <>
            <View style={local.progress}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: tone, borderRadius: 999 }} />
            </View>
            <Text style={[styles.text, { textAlign: "center" }]}>
              Última prova de vida {relative(w.last_check_in_at)}.{" "}
              {w.state === "OK"
                ? `Próximo prazo: ${longDay(w.due_at)} (${relative(w.due_at)}).`
                : w.state === "REMINDED"
                  ? `Prazo vencido. Seus Virgílios serão avisados ${relative(w.alert_at)}.`
                  : ""}
            </Text>
            <Text style={[styles.small, { textAlign: "center", marginTop: 4 }]}>
              A cada {plural(w.interval_days, "dia", "dias")}, com {plural(w.grace_days, "dia", "dias")} de tolerância.
            </Text>
          </>
        )}
        {w.location_shared_at && (
          <Text style={[styles.small, { marginTop: 8 }]}>
            Última localização guardada {relative(w.location_shared_at)}.{" "}
            <Text style={styles.link} onPress={clearLocation}>
              Apagar
            </Text>
          </Text>
        )}
      </Card>

      <Card>
        <Text style={styles.h3}>Precisa de ajuda agora?</Text>
        <Text style={styles.muted}>Avisa todos os seus Virgílios imediatamente.</Text>
        <Button title="Pedir ajuda (SOS)" kind="danger" onPress={sos} disabled={busy || !!w.alert} style={{ marginTop: 8 }} />
      </Card>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  checkin: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 10,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  checkinText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  checkinSub: { color: "#fff", fontSize: 13, opacity: 0.9, marginTop: 2 },
  progress: { alignSelf: "stretch", height: 8, borderRadius: 999, backgroundColor: colors.surface2, overflow: "hidden", marginTop: 16, marginBottom: 8 },
});
