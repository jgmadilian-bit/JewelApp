import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, font, radius, spacing } from '@/src/theme';
import { initialsOf } from '@/src/lib/format';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = Boolean(disabled || loading);
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.gold, fg: colors.onGold },
    secondary: { bg: colors.surfaceHi, fg: colors.text, border: colors.border },
    danger: { bg: colors.red, fg: '#fff' },
    ghost: { bg: 'transparent', fg: colors.textMuted },
  };
  const c = palette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: c.bg, borderColor: c.border ?? 'transparent', borderWidth: c.border ? 1 : 0 },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <Text style={[styles.btnText, small && styles.btnTextSmall, { color: c.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  style,
  ...rest
}: TextInputProps & { label?: string; hint?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: spacing(1.5) }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        {...rest}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'neutral' | 'gold' | 'green' | 'red';
}) {
  const tones = {
    neutral: { bg: colors.surfaceHi, fg: colors.textMuted },
    gold: { bg: 'rgba(212,175,55,0.16)', fg: colors.goldSoft },
    green: { bg: 'rgba(52,199,89,0.16)', fg: colors.green },
    red: { bg: 'rgba(255,69,58,0.16)', fg: colors.red },
  } as const;
  const c = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name?: string | null; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({
  title,
  subtitle,
  icon = '◇',
}: {
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(5),
  },
  btnSmall: { minHeight: 38, paddingHorizontal: spacing(3.5), borderRadius: radius.sm },
  btnText: { ...font.bodyStrong },
  btnTextSmall: { fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },

  label: { ...font.micro, color: colors.textMuted, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    color: colors.text,
    fontSize: 16,
  },
  hint: { ...font.small, color: colors.textFaint },

  pill: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.pill },
  pillText: { ...font.micro, textTransform: 'uppercase' },

  avatar: {
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { color: colors.goldSoft, fontWeight: '700' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
  },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(16), gap: spacing(2) },
  emptyIcon: { fontSize: 44, color: colors.goldDeep },
  emptyTitle: { ...font.h3, color: colors.text, textAlign: 'center' },
  emptySub: { ...font.small, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },
});
