import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '@/src/components/ui';
import { AuthProvider, useAuth } from '@/src/lib/auth';
import { registerForPushNotificationsAsync } from '@/src/lib/push';
import { colors, font, spacing } from '@/src/theme';

function Splash() {
  return (
    <View style={styles.center}>
      <Text style={styles.brandMark}>◆</Text>
      <ActivityIndicator color={colors.gold} style={{ marginTop: spacing(4) }} />
    </View>
  );
}

function LockOverlay() {
  const { unlock, biometricLabel, signOut } = useAuth();

  useEffect(() => {
    // Auto-prompt Face ID as soon as the lock screen appears.
    void unlock();
  }, [unlock]);

  return (
    <View style={styles.lock}>
      <Text style={styles.brandMark}>◆</Text>
      <Text style={styles.lockTitle}>JewelApp is locked</Text>
      <Text style={styles.lockSub}>Unlock with {biometricLabel} to continue.</Text>
      <Button
        title={`Unlock with ${biometricLabel}`}
        onPress={() => void unlock()}
        style={{ alignSelf: 'stretch', marginTop: spacing(6) }}
      />
      <Pressable onPress={() => void signOut()} style={{ marginTop: spacing(5) }}>
        <Text style={styles.lockSignout}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function RootNavigator() {
  const { session, initializing, locked, userId } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) {
      router.replace('/sign-in');
    } else if (session && inAuth) {
      router.replace('/groups');
    }
  }, [session, initializing, segments, router]);

  // Register for push once the app is open and unlocked.
  useEffect(() => {
    if (userId && !locked) void registerForPushNotificationsAsync(userId);
  }, [userId, locked]);

  if (initializing) return <Splash />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {session && locked ? <LockOverlay /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  brandMark: { fontSize: 48, color: colors.gold },
  lock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(8),
    zIndex: 100,
  },
  lockTitle: { ...font.h2, color: colors.text, marginTop: spacing(5) },
  lockSub: { ...font.body, color: colors.textMuted, marginTop: spacing(2), textAlign: 'center' },
  lockSignout: { ...font.body, color: colors.textFaint },
});
