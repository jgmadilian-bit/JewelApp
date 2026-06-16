import type { Session } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/src/lib/supabase';
import type { Profile } from '@/src/lib/types';

/**
 * Phone number is the identity anchor. For a zero-friction demo that works on a
 * fresh Supabase project with no SMS provider, we map the phone number to a
 * deterministic internal email and use email+password auth. The phone the user
 * types is what's stored on the profile and shown everywhere.
 *
 * To move to true phone auth in production, swap the two `supabase.auth` calls
 * below for `signUp({ phone })` / `signInWithPassword({ phone })` (and add OTP),
 * plus Google/Apple via `signInWithIdToken`. Nothing else in the app changes.
 */
function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `p${digits}@phone.jewelapp.app`;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

interface AuthContextValue {
  initializing: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  myPhone: string | null;
  /** A restored session is locked until the user passes Face ID. */
  locked: boolean;
  biometricLabel: string;
  signUp: (name: string, phone: string, password: string) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  unlock: () => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [locked, setLocked] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    let active = true;

    LocalAuthentication.supportedAuthenticationTypesAsync().then((types) => {
      if (!active) return;
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel('Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel('Touch ID');
      } else {
        setBiometricLabel('biometrics');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      // A persisted session means the user is "logged in forever" — they only
      // need to pass Face ID to open the app, never re-enter credentials.
      setLocked(Boolean(data.session));
      setInitializing(false);
      if (data.session?.user) void loadProfile(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLocked(false);
      }
      if (nextSession?.user) void loadProfile(nextSession.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback(async (name: string, phone: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password,
      options: { data: { name: name.trim(), phone: normalizePhone(phone) } },
    });
    if (error) throw error;
    if (!data.session) {
      // No session means email confirmation is still enabled on the project.
      throw new Error(
        'Account created, but the project requires email confirmation. Turn OFF ' +
          '"Confirm email" in Supabase → Authentication → Providers → Email to sign in instantly.',
      );
    }
    setLocked(false); // just authenticated interactively
  }, []);

  const signIn = useCallback(async (phone: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    if (error) throw error;
    setLocked(false);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setLocked(false);
  }, []);

  const unlock = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    // If there's no biometric hardware enrolled (e.g. a simulator), don't trap
    // the user — a persisted session is enough.
    if (!hasHardware || !enrolled) {
      setLocked(false);
      return true;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock JewelApp',
      fallbackLabel: 'Use Passcode',
    });
    if (result.success) {
      setLocked(false);
      return true;
    }
    return false;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      session,
      userId: session?.user?.id ?? null,
      profile,
      myPhone: (session?.user?.user_metadata?.phone as string | undefined) ?? null,
      locked,
      biometricLabel,
      signUp,
      signIn,
      signOut,
      unlock,
      refreshProfile,
    }),
    [
      initializing,
      session,
      profile,
      locked,
      biometricLabel,
      signUp,
      signIn,
      signOut,
      unlock,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
