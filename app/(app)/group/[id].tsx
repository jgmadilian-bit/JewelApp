import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/src/components/ListingCard';
import { Button, EmptyState } from '@/src/components/ui';
import { createInvite, getGroup, getListing, getListings } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { subscribeGroupListings } from '@/src/lib/realtime';
import type { Group, Listing } from '@/src/lib/types';
import { colors, font, spacing } from '@/src/theme';

export default function GroupFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const listRef = useRef<FlatList<Listing>>(null);

  const groupId = id as string;

  const load = useCallback(async () => {
    try {
      const [g, items] = await Promise.all([getGroup(groupId, userId ?? undefined), getListings(groupId)]);
      setGroup(g);
      setListings(items);
    } catch (err) {
      console.warn('Failed to load feed', err);
    } finally {
      setLoading(false);
    }
  }, [groupId, userId]);

  // Refresh whenever the screen regains focus (e.g. after posting a listing).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Realtime: new listings appear instantly, claims flip the badge in place.
  useEffect(() => {
    setLive(true);
    const unsub = subscribeGroupListings(groupId, {
      onInsert: async (row) => {
        if (!row.id) return;
        const full = await getListing(row.id);
        if (!full) return;
        setListings((prev) => (prev.some((l) => l.id === full.id) ? prev : [full, ...prev]));
      },
      onUpdate: (row) => {
        if (!row.id) return;
        setListings((prev) =>
          prev
            .map((l) => (l.id === row.id ? { ...l, ...row } : l))
            // Drop listings that leave the feed.
            .filter((l) => l.status !== 'withdrawn' && l.status !== 'sold_elsewhere'),
        );
      },
    });
    return () => {
      setLive(false);
      unsub();
    };
  }, [groupId]);

  // Each tap mints a fresh single-use code so it can't be passed around.
  const invite = async () => {
    try {
      const code = await createInvite(groupId);
      await Share.share({
        message:
          `Join my JewelApp group "${group?.name}" with this single-use invite code: ${code}\n\n` +
          'It works once, for one person.',
      });
    } catch (err) {
      Alert.alert('Could not create invite', err instanceof Error ? err.message : 'Try again.');
    }
  };

  const isAdmin = group?.my_role === 'admin';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Feed',
          headerRight: isAdmin
            ? () => (
                <Pressable onPress={invite} hitSlop={10}>
                  <Text style={styles.headerLink}>Invite</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={styles.liveBar}>
        <View style={[styles.dot, { backgroundColor: live ? colors.green : colors.textFaint }]} />
        <Text style={styles.liveText}>{live ? 'Live feed' : 'Connecting…'}</Text>
        {group ? (
          <Text style={styles.liveMeta}>
            · {group.member_count} member{group.member_count === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={listings}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{
          paddingHorizontal: spacing(4),
          paddingBottom: insets.bottom + spacing(28),
          paddingTop: spacing(2),
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing(4) }} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing(16) }} />
          ) : (
            <EmptyState
              title="No listings yet"
              subtitle="Be the first to post a stone. The whole group sees it the instant you do."
              icon="◆"
            />
          )
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
        )}
      />

      <View style={[styles.fabBar, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Button
          title="＋ New listing"
          onPress={() => router.push(`/listing/new?group=${groupId}`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerLink: { ...font.bodyStrong, color: colors.goldSoft },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(2),
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { ...font.micro, color: colors.textMuted, textTransform: 'uppercase' },
  liveMeta: { ...font.small, color: colors.textFaint },
  fabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    backgroundColor: 'rgba(11,11,15,0.92)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
});
