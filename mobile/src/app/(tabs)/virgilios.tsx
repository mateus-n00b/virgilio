import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Linking, Alert as NativeAlert, Platform, ScrollView, Share, Text, View } from "react-native";
import type { Guardian, GuardianInput } from "@shared/types";
import { GUARDIAN_STATUS, inviteMessage, whatsappLink } from "@shared/format";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Badge, Button, Card, Field, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/config";

const EMPTY: GuardianInput = { name: "", email: "", phone: "", relation: "" };

export default function GuardiansScreen() {
  const { user } = useAuth();
  const cfg = useAppConfig();
  const [list, setList] = useState<Guardian[] | null>(null);
  const [form, setForm] = useState<GuardianInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Guardian[]>("/me/guardians"));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (user) load();
    }, [user, load]),
  );

  if (!user) return <SignInPrompt message="Entre para escolher seus Virgílios." />;

  const set = (k: keyof GuardianInput) => (v: string) => setForm({ ...form, [k]: v });

  async function save() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const body = { ...form, email: form.email || null, phone: form.phone || null, relation: form.relation || null };
      if (editing) await api(`/me/guardians/${editing}`, { method: "PUT", body });
      else {
        const g = await api<Guardian>("/me/guardians", { body });
        setInfo(g.email && cfg?.mail_enabled ? `Convite enviado por e-mail para ${g.name}.` : `${g.name} adicionado(a). Envie o convite abaixo.`);
      }
      setForm(EMPTY);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function remove(g: Guardian) {
    NativeAlert.alert("Remover Virgílio", `Remover ${g.name}? O link dele(a) deixará de funcionar.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          await api(`/me/guardians/${g.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
          load();
        },
      },
    ]);
  }

  const message = (g: Guardian) => inviteMessage(g.name, user.name, g.invite_url);
  const max = cfg?.limits.max_guardians ?? 5;
  const active = list?.filter((g) => g.status !== "DECLINED").length ?? 0;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Pessoas próximas avisadas se você não der sinal de vida. Não precisam instalar o app. Enquanto está tudo bem, não veem suas instruções nem
          sua localização.
        </Text>
        <Alert>{error}</Alert>
        <Alert kind="success">{info}</Alert>

        {list === null ? (
          <Loading />
        ) : (
          list.map((g) => (
            <Card key={g.id}>
              <View style={styles.between}>
                <Text style={[styles.h3, { flex: 1 }]}>
                  {g.name}
                  {g.relation ? <Text style={styles.small}> · {g.relation}</Text> : null}
                </Text>
                <Badge map={GUARDIAN_STATUS} value={g.status} />
              </View>
              <Text style={styles.small}>{[g.email, g.phone].filter(Boolean).join(" · ") || "Sem contato"}{g.has_app ? " · usa o app" : ""}</Text>
              <View style={[styles.row, { flexWrap: "wrap", marginTop: 8 }]}>
                {g.status !== "ACCEPTED" && (
                  <Button title="WhatsApp" kind="whatsapp" onPress={() => Linking.openURL(whatsappLink(message(g), g.phone))} style={{ minHeight: 38 }} />
                )}
                {g.status !== "ACCEPTED" && (
                  <Button title="Compartilhar" kind="secondary" onPress={() => Share.share({ message: message(g) })} style={{ minHeight: 38 }} />
                )}
                <Button
                  title="Editar"
                  kind="secondary"
                  style={{ minHeight: 38 }}
                  onPress={() => {
                    setEditing(g.id);
                    setForm({ name: g.name, email: g.email ?? "", phone: g.phone ?? "", relation: g.relation ?? "" });
                  }}
                />
                <Button title="Remover" kind="secondary" onPress={() => remove(g)} style={{ minHeight: 38 }} />
              </View>
            </Card>
          ))
        )}

        {(editing || active < max) && (
          <Card>
            <Text style={styles.h2}>{editing ? "Editar Virgílio" : "Adicionar Virgílio"}</Text>
            <Field label="Nome" value={form.name} onChangeText={set("name")} maxLength={120} />
            <Field label="Relação (opcional)" placeholder="vizinha, amigo, primo…" value={form.relation ?? ""} onChangeText={set("relation")} maxLength={60} />
            <Field
              label="E-mail (por onde os alertas chegam)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={form.email ?? ""}
              onChangeText={set("email")}
            />
            <Field label="WhatsApp (opcional)" keyboardType="phone-pad" value={form.phone ?? ""} onChangeText={set("phone")} maxLength={30} />
            <Button title={editing ? "Salvar" : "Adicionar"} onPress={save} busy={busy} disabled={form.name.trim().length < 2} />
            {editing && (
              <Button
                title="Cancelar"
                kind="secondary"
                onPress={() => {
                  setEditing(null);
                  setForm(EMPTY);
                }}
                style={{ marginTop: 8 }}
              />
            )}
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
