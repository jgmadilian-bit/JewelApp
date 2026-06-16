import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Pill } from '@/src/components/ui';
import { getMyThreads } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { formatPrice, timeAgo } from '@/src/lib/format';
import type { Thread } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

export default function DealsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setThreads(await getMyThreads(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={threads}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8), gap: spacing(3) }}
      ListEmptyComponent={
        <EmptyState
          title="No deals yet"
          subtitle="When you claim a stone or sell one, the conversation lands here — with the listing attached."
          icon="◆"
        />
      }
      renderItem={({ item }) => {
        const l = item.listing;
        const iAmBuyer = item.buyer_id === userId;
        return (
          <Pressable
            onPress={() => router.push(`/thread/${item.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
          >
            {l?.photos?.[0] ? (
              <Image source={{ uri: l.photos[0] }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Text style={{ color: colors.goldDeep, fontSize: 22 }}>◇</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: spacing(1) }}>
              <Text style={styles.title} numberOfLines={1}>
                {l?.title ?? l?.category ?? l?.stone_type ?? 'Item'}
              </Text>
              <Text style={styles.price}>{formatPrice(l?.price, l?.currency ?? 'USD')}</Text>
              <View style={styles.metaRow}>
                <Pill text={iAmBuyer ? 'Bought' : 'Sold'} tone={iAmBuyer ? 'green' : 'gold'} />
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing(3),
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { ...font.bodyStrong, color: colors.text },
  price: { ...font.small, color: colors.goldSoft },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginTop: spacing(1) },
  time: { ...font.small, color: colors.textFaint },
  chevron: { fontSize: 26, color: colors.textFaint },
});
