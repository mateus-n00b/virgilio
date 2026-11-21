import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { Protecting } from "@shared/types";
import { relative, WATCH_STATE, watchStateKey } from "@shared/format";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Badge, Button, Card, Empty, Field, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProtectingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Protecting[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Protecting[]>("/me/protecting"));
      setError("");
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (user) load();
    }, [user, load]),
  );

  if (!user) return <SignInPrompt message="Entre para acompanhar as pessoas de quem você é Virgílio." />;

  /** Vincula à conta um convite recebido por link (aceito antes deslogado, ou ainda pendente). */
  async function linkInvite() {
    const token = link.trim().match(/\/(?:v|protegidos)\/([A-Za-z0-9_-]{16,})/)?.[1];
    setError("");
    setInfo("");
    if (!token) {
      setError("Cole o link completo do convite (termina em /v/...).");
      return;
    }
    setBusy(true);
    try {
      const v = await api<{ person: { first_name: string } }>(`/guardian/${token}/accept`, { body: { link_account: true } });
      setLink("");
      setInfo(`Pronto: você acompanha ${v.person.first_name} pelo app.`);
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

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
      <Text style={styles.muted}>Pessoas de quem você é Virgílio. Aparecem aqui os convites aceitos com “receber no app” marcado.</Text>
      <Alert>{error}</Alert>
      <Alert kind="success">{info}</Alert>
      <Card>
        <Text style={styles.h3}>Recebeu um convite por link?</Text>
        <Text style={styles.muted}>Cole aqui o link para ver a pessoa nesta lista e receber os alertas no celular, mesmo que já tenha aceitado pelo navegador.</Text>
        <Field label="Link do convite" autoCapitalize="none" autoCorrect={false} placeholder="https://…/v/…" value={link} onChangeText={setLink} />
        <Button title="Vincular à minha conta" onPress={linkInvite} busy={busy} disabled={!link.trim()} />
      </Card>
      {list === null ? (
        !error && <Loading />
      ) : list.length === 0 ? (
        <Empty>Você ainda não é Virgílio de ninguém nesta conta. Abra o link do convite e aceite estando logado.</Empty>
      ) : (
        list.map((p) => (
          <Pressable key={p.token} onPress={() => router.push(`/protegidos/${p.token}`)}>
            <Card>
              <View style={styles.between}>
                <Text style={[styles.h3, { flex: 1 }]}>{p.person_name}</Text>
                <Badge map={WATCH_STATE} value={watchStateKey(p)} />
              </View>
              <Text style={styles.small}>
                {p.alert ? (p.alert.reason === "SOS" ? "Pediu ajuda. Toque para ver as instruções." : "Sem sinal de vida. Toque para ver as instruções.") : `Última prova de vida ${relative(p.last_check_in_at)}.`}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
