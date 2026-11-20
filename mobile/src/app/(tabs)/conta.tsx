import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Alert as NativeAlert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { Watch } from "@shared/types";
import { dateTime } from "@shared/format";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Button, Card, colors, Field, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/config";
import { notificationPermission, openNotificationSettings, registerForPush, type PushStatus } from "@/lib/push";

function Stepper({ label, value, min, max, onChange, unit }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; unit: (n: number) => string }) {
  const btn = (txt: string, next: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${txt === "+" ? "Aumentar" : "Diminuir"} ${label}`}
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: next < min || next > max ? 0.4 : 1 }}
    >
      <Text style={{ fontSize: 20, color: colors.text }}>{txt}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.between, { marginVertical: 6 }]}>
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
      <View style={styles.row}>
        {btn("−", value - 1)}
        <Text style={[styles.h3, { minWidth: 70, textAlign: "center", marginBottom: 0 }]}>{unit(value)}</Text>
        {btn("+", value + 1)}
      </View>
    </View>
  );
}

const days = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

export default function AccountScreen() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const cfg = useAppConfig();
  const [w, setW] = useState<Watch | null>(null);
  const [interval, setInterval_] = useState(2);
  const [grace, setGrace] = useState(1);
  const [pauseDays, setPauseDays] = useState(7);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [push, setPush] = useState<PushStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setName(user.name);
      setPhone(user.phone ?? "");
      setAddress(user.address ?? "");
      api<Watch>("/me/watch").then((r) => {
        setW(r);
        setInterval_(r.interval_days);
        setGrace(r.grace_days);
      });
      notificationPermission(false).then(setPush);
    }, [user]),
  );

  if (!user) return <SignInPrompt message="Entre para ver sua conta." />;

  const fail = (e: unknown) => setMsg({ kind: "error", text: (e as ApiError).message });

  async function saveCycle(paused_until: string | null) {
    try {
      const r = await api<Watch>("/me/watch", { method: "PUT", body: { interval_days: interval, grace_days: grace, paused_until } });
      setW(r);
      setMsg({ kind: "success", text: r.paused ? `Pausado até ${dateTime(r.paused_until)}.` : "Ciclo atualizado." });
    } catch (e) {
      fail(e);
    }
  }

  async function saveProfile() {
    try {
      await api("/auth/me", { method: "PATCH", body: { name, phone, address } });
      await refresh();
      setMsg({ kind: "success", text: "Dados salvos." });
    } catch (e) {
      fail(e);
    }
  }

  function deleteAccount() {
    NativeAlert.alert("Excluir conta", "Seus Virgílios, instruções e localização serão apagados. Não dá para desfazer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await api("/auth/me", { method: "DELETE" });
            await signOut();
            router.navigate("/");
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);
  }

  const lim = cfg?.limits;
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

        <Card>
          <Text style={styles.h2}>Ciclo de prova de vida</Text>
          <Stepper label="Pedir a cada (x)" value={interval} min={1} max={lim?.max_interval_days ?? 30} onChange={setInterval_} unit={days} />
          <Stepper label="Tolerância (y)" value={grace} min={1} max={lim?.max_grace_days ?? 14} onChange={setGrace} unit={(n) => `+${days(n)}`} />
          <Text style={styles.small}>
            Lembrete após {days(interval)} sem confirmação; Virgílios avisados após {days(interval + grace)}.
          </Text>
          <Button title="Salvar ciclo" onPress={() => saveCycle(w?.paused ? w.paused_until : null)} style={{ marginTop: 8 }} />
        </Card>

        <Card>
          <Text style={styles.h2}>Pausa</Text>
          {w?.paused ? (
            <>
              <Text style={styles.text}>Pausado até {dateTime(w.paused_until)}.</Text>
              <Button title="Retomar agora" kind="secondary" onPress={() => saveCycle(null)} />
            </>
          ) : (
            <>
              <Text style={styles.small}>Viagem com família, internação planejada? O ciclo recomeça no fim da pausa.</Text>
              <Stepper label="Pausar por" value={pauseDays} min={1} max={lim?.max_pause_days ?? 60} onChange={setPauseDays} unit={days} />
              <Button
                title={`Pausar por ${days(pauseDays)}`}
                kind="secondary"
                onPress={() => saveCycle(new Date(Date.now() + pauseDays * 86_400_000).toISOString())}
              />
            </>
          )}
        </Card>

        <Card>
          <Text style={styles.h2}>Notificações</Text>
          <Text style={styles.small}>
            {push === "granted"
              ? "Ativadas: você recebe lembretes de prova de vida e alertas de quem você protege."
              : push === "unavailable"
                ? "Notificações push não configuradas neste build. Os lembretes chegam por e-mail."
                : "Desativadas. Sem elas, você pode perder o lembrete e seus Virgílios serem avisados à toa."}
          </Text>
          {push === "denied" && <Button title="Ativar notificações" onPress={() => registerForPush({ ask: true }).then(setPush)} />}
          {push === "blocked" && <Button title="Abrir configurações" kind="secondary" onPress={openNotificationSettings} />}
        </Card>

        <Card>
          <Text style={styles.h2}>Seus dados</Text>
          <Text style={[styles.small, { marginBottom: 8 }]}>Telefone e endereço só são mostrados aos Virgílios durante um alerta.</Text>
          <Field label="Nome" value={name} onChangeText={setName} maxLength={120} />
          <Field label="Telefone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={30} />
          <Field label="Endereço" value={address} onChangeText={setAddress} maxLength={255} placeholder="Rua, número, apto, bairro, cidade" />
          <Text style={[styles.small, { marginBottom: 8 }]}>E-mail: {user.email}</Text>
          <Button title="Salvar dados" kind="secondary" onPress={saveProfile} />
        </Card>

        <Button title="Sair" kind="secondary" onPress={signOut} />
        {cfg?.web_url ? (
          <Text style={[styles.small, { textAlign: "center" }]}>
            <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(`${cfg.web_url}/termos`)}>Termos</Text> ·{" "}
            <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(`${cfg.web_url}/privacidade`)}>Privacidade</Text> ·{" "}
            <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(`${cfg.web_url}/conta`)}>Trocar senha</Text>
          </Text>
        ) : null}
        <Text style={[styles.small, { textAlign: "center", color: colors.danger }]} onPress={deleteAccount}>
          Excluir minha conta
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
