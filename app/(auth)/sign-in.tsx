import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field } from '@/src/components/ui';
import { useAuth } from '@/src/lib/auth';
import { hasSupabaseConfig } from '@/src/lib/supabase';
import { colors, font, spacing } from '@/src/theme';

type Mode = 'signin' | 'signup';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!phone.trim() || !password) {
      Alert.alert('Missing details', 'Enter your phone number and a password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Missing name', 'Tell us your name so dealers know who they are buying from.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(name, phone, password);
      } else {
        await signIn(phone, password);
      }
      // On success the root layout redirects into the app automatically.
    } catch (err) {
      Alert.alert(
        mode === 'signup' ? 'Could not create account' : 'Could not sign in',
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const comingSoon = (provider: string) =>
    Alert.alert(
      `${provider} sign-in`,
      `Enable the ${provider} provider in your Supabase project to turn this on. Phone + password works now.`,
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing(12), paddingBottom: insets.bottom + spacing(8) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.mark}>◆</Text>
        <Text style={styles.brand}>JewelApp</Text>
        <Text style={styles.tagline}>The trade floor, in your pocket.</Text>

        {!hasSupabaseConfig ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Supabase isn&apos;t configured. Copy .env.example to .env, add your project URL and
              anon key, then restart the dev server.
            </Text>
          </View>
        ) : null}

        <View style={styles.form}>
          {mode === 'signup' ? (
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Jordan Diamonds"
              autoCapitalize="words"
              autoComplete="name"
            />
          ) : null}
          <Field
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 212 555 0148"
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />

          <Button
            title={mode === 'signup' ? 'Create account' : 'Sign in'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: spacing(2) }}
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.line} />
        </View>

        <View style={{ gap: spacing(3) }}>
          <Button title="Continue with Apple" variant="secondary" onPress={() => comingSoon('Apple')} />
          <Button title="Continue with Google" variant="secondary" onPress={() => comingSoon('Google')} />
        </View>

        <Pressable
          onPress={() => setMode((m) => (m === 'signup' ? 'signin' : 'signup'))}
          style={{ marginTop: spacing(8) }}
        >
          <Text style={styles.switch}>
            {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
            <Text style={styles.switchAccent}>
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing(6), gap: spacing(3) },
  mark: { fontSize: 44, color: colors.gold, textAlign: 'center' },
  brand: { ...font.h1, color: colors.text, textAlign: 'center' },
  tagline: { ...font.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing(4) },
  warn: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderColor: colors.redDeep,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing(3.5),
  },
  warnText: { ...font.small, color: '#FFB3AD' },
  form: { gap: spacing(4), marginTop: spacing(2) },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(5) },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...font.small, color: colors.textFaint },
  switch: { ...font.body, color: colors.textMuted, textAlign: 'center' },
  switchAccent: { color: colors.goldSoft, fontWeight: '600' },
});
