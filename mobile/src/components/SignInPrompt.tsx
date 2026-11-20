import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button, styles } from "./ui";

/** Telas que exigem conta mostram este convite quando não há sessão. */
export function SignInPrompt({ message }: { message: string }) {
  const router = useRouter();
  return (
    <View style={[styles.center, { gap: 14 }]}>
      <Text style={[styles.text, { textAlign: "center" }]}>{message}</Text>
      <Button title="Entrar ou criar conta" onPress={() => router.push("/entrar")} />
    </View>
  );
}
