import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import type { AuthResponse } from "@shared/types";
import { Alert, Button, Card, colors, Field, Segmented, styles } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppConfig } from "@/lib/config";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const cfg = useAppConfig();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "login"
          ? await api<AuthResponse>("/auth/login", { body: { email, password } })
          : await api<AuthResponse>("/auth/register", { body: { name, email, password, accept_terms: terms } });
      await signIn(res);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const openDoc = (path: string) => cfg?.web_url && WebBrowser.openBrowserAsync(`${cfg.web_url}${path}`);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError("");
            }}
            options={[
              { value: "login", label: "Entrar" },
              { value: "register", label: "Criar conta" },
            ]}
          />
          <View style={{ height: 12 }} />
          <Alert>{error}</Alert>
          {mode === "register" && <Field label="Seu nome" testID="name" autoComplete="name" value={name} onChangeText={setName} maxLength={120} />}
          <Field
            label="E-mail"
            testID="email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={(v) => setEmail(v.trim())}
          />
          <Field
            label="Senha"
            testID="password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            textContentType={mode === "login" ? "password" : "newPassword"}
            value={password}
            onChangeText={setPassword}
            maxLength={128}
          />
          {mode === "register" && (
            <>
              <Text style={styles.small}>Senha: 8 ou mais caracteres, com letras e números.</Text>
              <View style={[styles.row, { marginVertical: 8 }]}>
                <Switch value={terms} onValueChange={setTerms} trackColor={{ true: colors.brand }} accessibilityLabel="Aceito os Termos de Uso e a Política de Privacidade" />
                <Text style={[styles.small, { flex: 1 }]}>
                  Li e aceito os{" "}
                  <Text style={styles.link} onPress={() => openDoc("/termos")}>
                    Termos de Uso
                  </Text>{" "}
                  e a{" "}
                  <Text style={styles.link} onPress={() => openDoc("/privacidade")}>
                    Política de Privacidade
                  </Text>
                  .
                </Text>
              </View>
            </>
          )}
          <Button title={mode === "login" ? "Entrar" : "Criar conta"} onPress={submit} busy={busy} disabled={!email || !password} />
          {mode === "login" && cfg?.web_url ? (
            <Text style={[styles.small, { textAlign: "center", marginTop: 12 }]} onPress={() => openDoc("/esqueci-senha")}>
              <Text style={styles.link}>Esqueci minha senha</Text>
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
