import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Field, Label, Pill } from '@/src/components/ui';
import { createGroup, getMyGroups, joinGroup } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import type { Group, GroupType } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, myPhone, signOut } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setGroups(await getMyGroups(userId));
    } catch (err) {
      console.warn('Failed to load groups', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/deals')} hitSlop={10}>
              <Text style={styles.headerLink}>Deals</Text>
            </Pressable>
          ),
        }}
      />

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(28) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.gold}
          />
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              title="No groups yet"
              subtitle="Create a private group for your trade circle, or join one with an invite code."
              icon="◇"
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/group/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            <View style={{ flex: 1, gap: spacing(2) }}>
              <View style={styles.rowTop}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.my_role === 'admin' ? <Pill text="Admin" tone="gold" /> : null}
              </View>
              <View style={styles.metaRow}>
                <Pill text={item.type === 'public' ? 'Public' : 'Private'} />
                <Text style={styles.meta}>
                  {item.member_count} member{item.member_count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing(3) }} />}
        ListFooterComponent={
          <Pressable onPress={() => void signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>
              {myPhone ? `Signed in as ${myPhone} · ` : ''}Sign out
            </Text>
          </Pressable>
        }
      />

      <View style={[styles.fabBar, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Button title="Join with code" variant="secondary" onPress={() => setSheet('join')} style={{ flex: 1 }} />
        <Button title="＋ New group" onPress={() => setSheet('create')} style={{ flex: 1 }} />
      </View>

      <GroupSheet
        mode={sheet}
        onClose={() => setSheet(null)}
        onCreated={(g) => {
          setSheet(null);
          void load();
          router.push(`/group/${g.id}`);
        }}
        onJoined={(groupId) => {
          setSheet(null);
          void load();
          router.push(`/group/${groupId}`);
        }}
      />
    </View>
  );
}

function GroupSheet({
  mode,
  onClose,
  onCreated,
  onJoined,
}: {
  mode: null | 'create' | 'join';
  onClose: () => void;
  onCreated: (g: Group) => void;
  onJoined: (groupId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('private');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setType('private');
    setCode('');
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'create') {
        if (!name.trim()) {
          Alert.alert('Name required', 'Give your group a name.');
          return;
        }
        const g = await createGroup(name, type);
        reset();
        onCreated(g);
      } else if (mode === 'join') {
        if (!code.trim()) {
          Alert.alert('Code required', 'Enter the invite code you were given.');
          return;
        }
        const { group_id } = await joinGroup(code);
        reset();
        onJoined(group_id);
      }
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(6) }]}>
          <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{mode === 'create' ? 'New group' : 'Join a group'}</Text>

        {mode === 'create' ? (
          <View style={{ gap: spacing(4) }}>
            <Field label="Group name" value={name} onChangeText={setName} placeholder="47th St. Diamonds" />
            <View style={{ gap: spacing(2) }}>
              <Label>Visibility</Label>
              <View style={styles.segment}>
                {(['private', 'public'] as GroupType[]).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={[styles.segmentItem, type === t && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>
                      {t === 'private' ? 'Private (invite only)' : 'Public'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <Field
            label="Invite code"
            value={code}
            onChangeText={setCode}
            placeholder="e.g. 8FK2C1A0"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}

        <Button
          title={mode === 'create' ? 'Create group' : 'Join group'}
          onPress={submit}
          loading={busy}
          style={{ marginTop: spacing(6) }}
        />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerLink: { ...font.bodyStrong, color: colors.goldSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(4),
    gap: spacing(3),
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  groupName: { ...font.h3, color: colors.text, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  meta: { ...font.small, color: colors.textMuted },
  chevron: { fontSize: 28, color: colors.textFaint },
  signOut: { alignItems: 'center', paddingVertical: spacing(8) },
  signOutText: { ...font.small, color: colors.textFaint },

  fabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    backgroundColor: 'rgba(11,11,15,0.92)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing(6),
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHi,
    alignSelf: 'center',
    marginBottom: spacing(5),
  },
  sheetTitle: { ...font.h2, color: colors.text, marginBottom: spacing(5) },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: spacing(3), borderRadius: radius.sm, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.surfaceHi },
  segmentText: { ...font.small, color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
});
