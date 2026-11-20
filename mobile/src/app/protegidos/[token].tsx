import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Alert as NativeAlert, ScrollView, Text, View } from "react-native";
import type { GuardianView } from "@shared/types";
import { dateTime, plural, relative } from "@shared/format";
import { Alert, Button, Card, colors, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/** O que um Virgílio vê pelo app: estado da pessoa e, durante um alerta, contato, localização e instruções. */
export default function ProtectedPersonScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [v, setV] = useState<GuardianView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setV(await api<GuardianView>(`/guardian/${token}`));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [token]);
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);
  useEffect(() => {
    if (!v?.alert) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [v?.alert, load]);

  async function act(path: "ack" | "resolve" | "decline") {
    setBusy(true);
    setError("");
    try {
      setV(await api<GuardianView>(`/guardian/${token}/${path}`, { body: {} }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const confirmThen = (title: string, msg: string, path: "resolve" | "decline") =>
    NativeAlert.alert(title, msg, [{ text: "Cancelar", style: "cancel" }, { text: "Confirmar", onPress: () => act(path) }]);

  if (!v) return error ? <View style={styles.content}><Alert>{error}</Alert></View> : <Loading />;
  const first = v.person.first_name;
  const a = v.alert;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: v.person.name }} />
      <Alert>{error}</Alert>

      {v.status !== "ACCEPTED" ? (
        <Card>
          <Text style={styles.text}>Você não é mais Virgílio de {first}.</Text>
        </Card>
      ) : !a ? (
        <Card>
          <Text style={[styles.h3, { color: colors.ok }]}>Tudo certo</Text>
          <Text style={styles.text}>
            {v.watch?.paused ? `${first} pausou as provas de vida por um tempo.` : `Última prova de vida ${relative(v.watch!.last_check_in_at)}.`}
          </Text>
          <Text style={styles.small}>
            {first} confirma a cada {plural(v.watch?.interval_days ?? 1, "dia", "dias")}. Se passar do prazo, você recebe um alerta.
          </Text>
        </Card>
      ) : (
        <>
          <View style={[styles.alert, { backgroundColor: colors.dangerSoft, gap: 6 }]}>
            <Text style={[styles.h2, { color: colors.danger }]}>{a.reason === "SOS" ? `${first} pediu ajuda` : `${first} não dá sinal de vida`}</Text>
            <Text style={{ color: colors.danger }}>
              {a.reason === "SOS" ? `Pedido enviado em ${dateTime(a.created_at)}.` : `Última prova de vida: ${dateTime(v.watch?.last_check_in_at)}.`}
            </Text>
            <Text style={{ color: colors.danger }}>
              {a.acknowledged_by ? `${a.acknowledged_by === v.guardian_name ? "Você avisou" : `${a.acknowledged_by} avisou`} que vai verificar.` : "Ninguém avisou ainda que vai verificar."}
            </Text>
            {!a.acknowledged_by && <Button title="Vou verificar" kind="danger" onPress={() => act("ack")} busy={busy} />}
            <Button
              title={`Encontrei: ${first} está bem`}
              kind="secondary"
              disabled={busy}
              onPress={() => confirmThen("Encerrar alerta?", `Confirmar que ${first} está bem? Os outros Virgílios serão avisados.`, "resolve")}
            />
          </View>
          <Text style={styles.small}>Em emergência, ligue 192 (SAMU), 193 (Bombeiros) ou 190 (Polícia).</Text>

          {v.contact && (
            <Card>
              <Text style={styles.h3}>Contato de {first}</Text>
              {v.contact.phone && (
                <Text style={styles.link} onPress={() => Linking.openURL(`tel:${v.contact!.phone!.replace(/[^\d+]/g, "")}`)}>
                  Ligar: {v.contact.phone}
                </Text>
              )}
              {v.contact.address && (
                <Text
                  style={styles.link}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.contact!.address!)}`)}
                >
                  {v.contact.address}
                </Text>
              )}
              <Text style={styles.text}>{v.contact.email}</Text>
              {v.other_guardians.length > 0 && <Text style={styles.small}>Outros Virgílios: {v.other_guardians.join(", ")}</Text>}
            </Card>
          )}

          {v.last_location && (
            <Card>
              <Text style={styles.h3}>Última localização conhecida</Text>
              <Text style={styles.small}>
                Enviada em {dateTime(v.last_location.at)} ({relative(v.last_location.at)})
                {v.last_location.accuracy_m ? `, precisão de ~${Math.round(v.last_location.accuracy_m)} m` : ""}.
              </Text>
              <Button title="Abrir no mapa" kind="secondary" onPress={() => Linking.openURL(v.last_location!.maps_url)} style={{ marginTop: 8 }} />
            </Card>
          )}

          <Card>
            <Text style={styles.h3}>Instruções de {first}</Text>
            {v.instructions.length === 0 ? (
              <Text style={styles.muted}>{first} não deixou instruções.</Text>
            ) : (
              v.instructions.map((i, n) => (
                <View key={n} style={{ borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: 12, marginTop: 8 }}>
                  <Text style={styles.h3}>{i.title}</Text>
                  <Text style={styles.text}>{i.body}</Text>
                </View>
              ))
            )}
          </Card>
        </>
      )}

      {v.status === "ACCEPTED" && (
        <Text
          style={[styles.small, { textAlign: "center", marginTop: 12 }]}
          onPress={() => confirmThen("Deixar de ser Virgílio?", `Você não receberá mais avisos sobre ${first}.`, "decline")}
        >
          Não quer mais ser Virgílio de {first}? <Text style={styles.link}>Sair</Text>
        </Text>
      )}
    </ScrollView>
  );
}
