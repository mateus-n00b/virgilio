import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Alert as NativeAlert, Platform, ScrollView, Text, View } from "react-native";
import type { Instruction } from "@shared/types";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Alert, Button, Card, colors, Field, Loading, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const SUGGESTIONS = [
  { title: "Meu pet", body: "A Mel (gata) come 2x por dia. A ração fica no armário da cozinha." },
  { title: "Como entrar em casa", body: "Há uma cópia da chave com a vizinha do 102." },
  { title: "Quem avisar", body: "Minha irmã Carla: (81) 98888-0000." },
  { title: "Saúde", body: "Remédios na gaveta do criado-mudo. Plano de saúde: …" },
];

export default function InstructionsScreen() {
  const { user } = useAuth();
  const [list, setList] = useState<Instruction[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api<Instruction[]>("/me/instructions"));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (user) load();
    }, [user, load]),
  );

  if (!user) return <SignInPrompt message="Entre para deixar instruções aos seus Virgílios." />;

  function reset() {
    setTitle("");
    setBody("");
    setEditing(null);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (editing) await api(`/me/instructions/${editing}`, { method: "PUT", body: { title, body } });
      else await api("/me/instructions", { body: { title, body } });
      reset();
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function remove(i: Instruction) {
    NativeAlert.alert("Apagar instrução", `Apagar "${i.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          await api(`/me/instructions/${i.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
          load();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>O que fazer se você sumir. Ficam criptografadas e só são mostradas aos seus Virgílios durante um alerta.</Text>
        <Alert>{error}</Alert>
        {list === null ? (
          <Loading />
        ) : (
          list.map((i) => (
            <Card key={i.id}>
              <View style={{ borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: 12 }}>
                <Text style={styles.h3}>{i.title}</Text>
                <Text style={styles.text}>{i.body}</Text>
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <Button
                  title="Editar"
                  kind="secondary"
                  style={{ minHeight: 38 }}
                  onPress={() => {
                    setEditing(i.id);
                    setTitle(i.title);
                    setBody(i.body);
                  }}
                />
                <Button title="Apagar" kind="secondary" style={{ minHeight: 38 }} onPress={() => remove(i)} />
              </View>
            </Card>
          ))
        )}
        <Card>
          <Text style={styles.h2}>{editing ? "Editar instrução" : "Nova instrução"}</Text>
          {!editing && (
            <View style={[styles.row, { flexWrap: "wrap", marginBottom: 8 }]}>
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s.title}
                  title={`+ ${s.title}`}
                  kind="secondary"
                  style={{ minHeight: 34, paddingHorizontal: 12 }}
                  onPress={() => {
                    setTitle(s.title);
                    setBody(s.body);
                  }}
                />
              ))}
            </View>
          )}
          <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} />
          <Field
            label="O que fazer"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={4000}
            style={[styles.input, { minHeight: 120, textAlignVertical: "top", paddingTop: 10 }]}
          />
          <Text style={[styles.small, { marginBottom: 8 }]}>Evite senhas de banco. Prefira dizer com quem está a chave do que onde está escondida.</Text>
          <Button title={editing ? "Salvar" : "Adicionar"} onPress={save} busy={busy} disabled={title.trim().length < 2 || !body.trim()} />
          {editing && <Button title="Cancelar" kind="secondary" onPress={reset} style={{ marginTop: 8 }} />}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
