import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { Protecting } from "@shared/types";
import { relative, WATCH_STATE, watchStateKey } from "@shared/format";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Badge, Card, Empty, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProtectingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<Protecting[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
