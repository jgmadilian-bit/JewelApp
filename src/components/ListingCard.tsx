import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Pill } from '@/src/components/ui';
import { formatPrice, timeAgo } from '@/src/lib/format';
import type { Listing } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

export function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const photo = listing.photos?.[0];
  const claimed = listing.status === 'claimed';
  const weight =
    listing.gross_weight != null ? `${listing.gross_weight}${listing.weight_unit ?? ''}` : null;
  const stone = [
    listing.carat != null ? `${listing.carat}ct` : null,
    listing.shape,
    listing.color,
    listing.clarity,
  ]
    .filter(Boolean)
    .join(' ');
  const size = listing.ring_size ? `sz ${listing.ring_size}` : listing.item_length || null;
  const specs = [weight, stone || null, size].filter(Boolean).join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.media}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.image, styles.noImage]}>
            <Text style={styles.noImageGlyph}>◇</Text>
          </View>
        )}
        <View style={styles.badge}>
          {claimed ? <Pill text="Sold" tone="red" /> : <Pill text="Live" tone="green" />}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.title || listing.category || listing.stone_type || 'Item'}
          </Text>
          <Text style={styles.price}>{formatPrice(listing.price, listing.currency)}</Text>
        </View>
        {specs ? (
          <Text style={styles.specs} numberOfLines={1}>
            {specs}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.sellerRow}>
            <Avatar name={listing.seller?.name} size={22} />
            <Text style={styles.seller} numberOfLines={1}>
              {listing.seller?.name ?? 'Seller'}
            </Text>
          </View>
          <Text style={styles.time}>{timeAgo(listing.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  media: { position: 'relative' },
  image: { width: '100%', height: 200, backgroundColor: colors.surfaceAlt },
  noImage: { alignItems: 'center', justifyContent: 'center' },
  noImageGlyph: { fontSize: 56, color: colors.goldDeep },
  badge: { position: 'absolute', top: spacing(3), left: spacing(3) },

  body: { padding: spacing(4), gap: spacing(2) },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing(3) },
  title: { ...font.h3, color: colors.text, flexShrink: 1 },
  price: { ...font.h3, color: colors.goldSoft },
  specs: { ...font.small, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing(1),
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), flexShrink: 1 },
  seller: { ...font.small, color: colors.textMuted, flexShrink: 1 },
  time: { ...font.small, color: colors.textFaint },
});
