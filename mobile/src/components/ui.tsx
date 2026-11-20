import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";

export const colors = {
  bg: "#f8f5ee",
  surface: "#ffffff",
  surface2: "#f0ebdf",
  text: "#1d2420",
  muted: "#5f6a63",
  border: "#e3dccb",
  brand: "#2f6b4f",
  brandStrong: "#22513b",
  brandSoft: "#e2efe7",
  accent: "#a8741a",
  ok: "#1f7a46",
  okSoft: "#dcf3e4",
  warn: "#8a5a00",
  warnSoft: "#fbefcd",
  danger: "#b42318",
  dangerSoft: "#fde4e1",
  info: "#22568f",
  infoSoft: "#e0ecfa",
  whatsapp: "#128c4a",
};

const TONES: Record<string, { fg: string; bg: string }> = {
  ok: { fg: colors.ok, bg: colors.okSoft },
  success: { fg: colors.ok, bg: colors.okSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  error: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  muted: { fg: colors.muted, bg: colors.surface2 },
};

type ButtonKind = "primary" | "secondary" | "whatsapp" | "danger";

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  busy,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const bg = { primary: colors.brand, secondary: colors.surface, whatsapp: colors.whatsapp, danger: colors.danger }[kind];
  const fg = kind === "secondary" ? colors.text : "#fff";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Alert({ children, kind = "error" }: { children?: React.ReactNode; kind?: "error" | "info" | "success" | "warn" }) {
  if (!children) return null;
  const t = TONES[kind];
  return (
    <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg }}>{children}</Text>
    </View>
  );
}

export function Badge({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const item = map[value] ?? { label: value, tone: "muted" };
  const t = TONES[item.tone] ?? TONES.muted;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{item.label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{children}</Text>
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} style={styles.input} {...props} />
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.brandStrong, fontWeight: "700" }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  h1: { fontSize: 24, fontWeight: "800", color: colors.text },
  h2: { fontSize: 20, fontWeight: "700", color: colors.text },
  h3: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4 },
  text: { fontSize: 15, color: colors.text, lineHeight: 21 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  small: { fontSize: 13, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 6 },
  link: { color: colors.brandStrong, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  center: { padding: 32, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  btn: { minHeight: 48, borderRadius: 999, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 16, fontWeight: "700" },
  alert: { borderRadius: 10, padding: 12 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  segmented: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 999, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, color: colors.muted },
});
