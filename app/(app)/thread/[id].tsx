import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMessages, getThread, getThreadContact, sendMessage } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { formatPrice } from '@/src/lib/format';
import { subscribeThreadMessages } from '@/src/lib/realtime';
import type { Contact, Message, Thread } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = id as string;
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [thread, setThread] = useState<Thread | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [t, c, m] = await Promise.all([
        getThread(threadId),
        getThreadContact(threadId),
        getMessages(threadId),
      ]);
      setThread(t);
      setContact(c);
      setMessages(m);
    } catch (err) {
      console.warn('Failed to load thread', err);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = subscribeThreadMessages(threadId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    });
    return unsub;
  }, [threadId]);

  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await sendMessage(threadId, userId, body);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      setDraft(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const listing = thread?.listing;
  const iAmBuyer = thread?.buyer_id === userId;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
    >
      <Stack.Screen options={{ title: contact?.name ?? 'Conversation' }} />

      {/* Pinned listing context — visible above every conversation */}
      {listing ? (
        <View style={styles.pinned}>
          {listing.photos?.[0] ? (
            <Image source={{ uri: listing.photos[0] }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text style={{ color: colors.goldDeep, fontSize: 22 }}>◇</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle} numberOfLines={1}>
              {listing.title ?? listing.category ?? listing.stone_type ?? 'Item'}
            </Text>
            <Text style={styles.pinnedPrice}>{formatPrice(listing.price, listing.currency)}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>{iAmBuyer ? 'You bought' : 'You sold'}</Text>
          </View>
        </View>
      ) : null}

      {/* Contact card — revealed because the deal is claimed */}
      {contact ? (
        <View style={styles.contact}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactLabel}>{iAmBuyer ? 'Seller' : 'Buyer'} contact</Text>
            <Text style={styles.contactName}>{contact.name ?? 'Dealer'}</Text>
          </View>
          {contact.phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${contact.phone}`)}
              style={styles.callBtn}
            >
              <Text style={styles.callText}>{contact.phone}  ›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing(10) }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing(4), gap: spacing(2), flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.starter}>
              <Text style={styles.starterText}>
                You&apos;re connected. Arrange payment and delivery directly — JewelApp stays out of
                the deal.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && { color: colors.onGold }]}>
                    {item.body}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing(2) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={colors.textFaint}
          style={styles.composerInput}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={sending || !draft.trim()}
          style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.4 }]}
        >
          <Text style={styles.sendGlyph}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    padding: spacing(3),
    margin: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  pinnedTitle: { ...font.bodyStrong, color: colors.text },
  pinnedPrice: { ...font.small, color: colors.goldSoft },
  rolePill: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
  },
  roleText: { ...font.micro, color: colors.textMuted, textTransform: 'uppercase' },

  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginHorizontal: spacing(3),
    marginBottom: spacing(2),
    padding: spacing(4),
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.goldDeep,
  },
  contactLabel: { ...font.micro, color: colors.goldDeep, textTransform: 'uppercase' },
  contactName: { ...font.bodyStrong, color: colors.text, marginTop: spacing(1) },
  callBtn: {
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
    borderRadius: radius.pill,
  },
  callText: { ...font.bodyStrong, color: colors.goldSoft },

  starter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(8) },
  starterText: { ...font.small, color: colors.textFaint, textAlign: 'center', maxWidth: 280 },

  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  bubbleMine: { backgroundColor: colors.gold, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surfaceHi, borderBottomLeftRadius: 4 },
  bubbleText: { ...font.body, color: colors.text },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing(2),
    paddingHorizontal: spacing(3),
    paddingTop: spacing(2),
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.bg,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    paddingBottom: spacing(3),
    color: colors.text,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: { color: colors.onGold, fontSize: 22, fontWeight: '800' },
});
