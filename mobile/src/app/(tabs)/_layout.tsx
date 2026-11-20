import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { colors } from "@/components/ui";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Prova de vida", headerTitle: "Virgílio", tabBarIcon: icon("heart-circle-outline") }} />
      <Tabs.Screen name="virgilios" options={{ title: "Virgílios", headerTitle: "Meus Virgílios", tabBarIcon: icon("people-outline") }} />
      <Tabs.Screen name="instrucoes" options={{ title: "Instruções", headerTitle: "Minhas instruções", tabBarIcon: icon("document-text-outline") }} />
      <Tabs.Screen name="protegidos" options={{ title: "Protegidos", tabBarIcon: icon("shield-checkmark-outline") }} />
      <Tabs.Screen name="conta" options={{ title: "Conta", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
