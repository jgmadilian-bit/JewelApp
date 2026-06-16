import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Pill } from '@/src/components/ui';
import { claimListing, getListing, getThreadByListing, withdrawListing } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { formatClaimTime, formatPrice, timeAgo } from '@/src/lib/format';
import { subscribeListing } from '@/src/lib/realtime';
import type { Listing } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

const { width } = Dimensions.get('window');

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = id as string;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    try {
      setListing(await getListing(listingId));
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live status: if another member claims while we're looking, flip in place.
  useEffect(() => {
    const unsub = subscribeListing(listingId, (row) =>
      setListing((prev) => (prev ? { ...prev, ...row } : prev)),
    );
    return unsub;
  }, [listingId]);

  const onClaim = async () => {
    setClaiming(true);
    try {
      const result = await claimListing(listingId);
      if (result.won && result.thread_id) {
        router.replace(`/thread/${result.thread_id}`);
      } else {
        setListing((prev) =>
          prev
            ? { ...prev, status: 'claimed', claimed_by: result.claimed_by, claimed_at: result.claimed_at }
            : prev,
        );
        Alert.alert(
          'Just missed it',
          result.claimed_at
            ? `This stone was claimed at ${formatClaimTime(result.claimed_at)}.`
            : 'This stone was already claimed.',
        );
      }
    } catch (err) {
      Alert.alert('Could not claim', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const onWithdraw = () => {
    Alert.alert('Withdraw listing?', 'It will be removed from the group feed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdrawListing(listingId);
            router.back();
          } catch (err) {
            Alert.alert('Could not withdraw', err instanceof Error ? err.message : 'Try again.');
          }
        },
      },
    ]);
  };

  const openChat = async () => {
    const thread = await getThreadByListing(listingId);
    if (thread) router.replace(`/thread/${thread.id}`);
    else Alert.alert('Chat unavailable', 'No conversation is attached to this listing.');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Listing not found.</Text>
      </View>
    );
  }

  const isSeller = listing.seller_id === userId;
  const isClaimer = listing.claimed_by === userId;
  const available = listing.status === 'available';
  const weightValue =
    listing.gross_weight != null ? `${listing.gross_weight} ${listing.weight_unit ?? ''}`.trim() : null;
  const specs: { label: string; value: string | null }[] = [
    { label: 'Type', value: listing.category },
    { label: 'Metal', value: listing.metal },
    { label: 'Weight', value: weightValue },
    { label: 'Era / style', value: listing.era },
    { label: 'Ring size', value: listing.ring_size },
    { label: 'Length', value: listing.item_length },
    { label: 'Carat', value: listing.carat != null ? `${listing.carat}` : null },
    { label: 'Total ctw', value: listing.total_carat != null ? `${listing.total_carat}` : null },
    { label: 'Shape', value: listing.shape },
    { label: 'Color', value: listing.color },
    { label: 'Clarity', value: listing.clarity },
    { label: 'Cut', value: listing.cut },
    { label: 'Lab', value: listing.lab },
    { label: 'Cert #', value: listing.cert_number },
    { label: 'Measurements', value: listing.measurements },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: listing.title ?? 'Listing' }} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(28) }}>
        {/* Photos */}
        {listing.photos.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {listing.photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ width, height: width }} contentFit="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.noPhoto, { width, height: width * 0.7 }]}>
            <Text style={styles.noPhotoGlyph}>◇</Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {listing.title ?? listing.category ?? listing.stone_type ?? 'Item'}
              </Text>
              <Text style={styles.time}>Posted {timeAgo(listing.created_at)}</Text>
            </View>
            {available ? <Pill text="Live" tone="green" /> : <Pill text="Sold" tone="red" />}
          </View>

          <View>
            <Text style={styles.price}>{formatPrice(listing.price, listing.currency)}</Text>
            {listing.price_terms ? <Text style={styles.terms}>{listing.price_terms}</Text> : null}
          </View>

          {listing.description ? (
            <Text style={styles.description}>{listing.description}</Text>
          ) : null}

          {listing.condition ? (
            <View style={styles.conditionRow}>
              <Text style={styles.conditionLabel}>Condition</Text>
              <Text style={styles.conditionText}>{listing.condition}</Text>
            </View>
          ) : null}

          {/* Specs grid */}
          <View style={styles.specGrid}>
            {specs
              .filter((s) => s.value)
              .map((s) => (
                <View key={s.label} style={styles.specCell}>
                  <Text style={styles.specLabel}>{s.label}</Text>
                  <Text style={styles.specValue}>{s.value}</Text>
                </View>
              ))}
          </View>

          {listing.gemstones && listing.gemstones.length > 0 ? (
            <View style={{ gap: spacing(2) }}>
              <Text style={styles.specLabel}>Stones</Text>
              <View style={styles.gemWrap}>
                {listing.gemstones.map((g, i) => (
                  <View key={i} style={styles.gemChip}>
                    <Text style={styles.gemChipText}>
                      {[
                        g.carat != null
                          ? `${g.each ? '~' : ''}${g.carat}${g.ctw ? 'ctw' : 'ct'}${g.each ? ' ea' : ''}`
                          : null,
                        g.shape,
                        g.type,
                        g.color,
                        g.clarity,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {listing.certificate_url ? (
            <Pressable
              onPress={() => Linking.openURL(listing.certificate_url as string)}
              style={styles.certBtn}
            >
              <Text style={styles.certText}>📄  View certificate</Text>
            </Pressable>
          ) : null}

          {/* Seller */}
          <View style={styles.seller}>
            <Avatar name={listing.seller?.name} size={36} />
            <View>
              <Text style={styles.sellerLabel}>Seller</Text>
              <Text style={styles.sellerName}>{listing.seller?.name ?? 'Dealer'}</Text>
            </View>
          </View>

          {!available ? (
            <View style={styles.claimedBanner}>
              <Text style={styles.claimedTitle}>
                {isClaimer ? 'You claimed this stone' : 'Claimed'}
              </Text>
              {listing.claimed_at ? (
                <Text style={styles.claimedTime}>at {formatClaimTime(listing.claimed_at)}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing(3) }]}>
        {isSeller ? (
          available ? (
            <Button title="Withdraw listing" variant="secondary" onPress={onWithdraw} />
          ) : (
            <Button title="Open chat with buyer" onPress={openChat} />
          )
        ) : available ? (
          <Button title="Sold — claim this stone" onPress={onClaim} loading={claiming} />
        ) : isClaimer ? (
          <Button title="Open chat with seller" onPress={openChat} />
        ) : (
          <Button title="Already claimed" variant="secondary" onPress={() => {}} disabled />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { ...font.body, color: colors.textMuted },
  noPhoto: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  noPhotoGlyph: { fontSize: 64, color: colors.goldDeep },

  body: { padding: spacing(5), gap: spacing(4) },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(3) },
  title: { ...font.h1, color: colors.text },
  time: { ...font.small, color: colors.textFaint, marginTop: spacing(1) },
  price: { ...font.h1, color: colors.goldSoft },
  terms: { ...font.small, color: colors.textMuted, marginTop: spacing(1) },
  description: {
    ...font.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(4),
    lineHeight: 22,
  },
  conditionRow: { gap: spacing(1) },
  conditionLabel: { ...font.micro, color: colors.red, textTransform: 'uppercase' },
  conditionText: { ...font.body, color: colors.text },
  gemWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  gemChip: {
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  gemChipText: { ...font.small, color: colors.text },

  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  specCell: { width: '50%', padding: spacing(4), gap: spacing(1) },
  specLabel: { ...font.micro, color: colors.textFaint, textTransform: 'uppercase' },
  specValue: { ...font.bodyStrong, color: colors.text },

  certBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(4),
    alignItems: 'center',
  },
  certText: { ...font.bodyStrong, color: colors.goldSoft },

  seller: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  sellerLabel: { ...font.micro, color: colors.textFaint, textTransform: 'uppercase' },
  sellerName: { ...font.bodyStrong, color: colors.text },

  claimedBanner: {
    backgroundColor: 'rgba(255,69,58,0.1)',
    borderColor: colors.redDeep,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(1),
  },
  claimedTitle: { ...font.bodyStrong, color: '#FFB3AD' },
  claimedTime: { ...font.small, color: colors.textMuted },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    backgroundColor: 'rgba(11,11,15,0.94)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
});
