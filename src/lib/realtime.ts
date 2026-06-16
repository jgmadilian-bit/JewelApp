import { supabase } from '@/src/lib/supabase';
import type { Listing, Message } from '@/src/lib/types';

type Row = Record<string, unknown>;

/**
 * Live feed for a group. Realtime payloads only carry the raw row (no embeds),
 * so callers typically re-fetch on INSERT to hydrate the seller, and merge
 * status changes on UPDATE.
 */
export function subscribeGroupListings(
  groupId: string,
  handlers: { onInsert: (row: Partial<Listing>) => void; onUpdate: (row: Partial<Listing>) => void },
) {
  const channel = supabase
    .channel(`listings:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'listings', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onInsert(payload.new as Row as Partial<Listing>),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'listings', filter: `group_id=eq.${groupId}` },
      (payload) => handlers.onUpdate(payload.new as Row as Partial<Listing>),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Watch a single listing for status changes (e.g. someone else claims it). */
export function subscribeListing(listingId: string, onUpdate: (row: Partial<Listing>) => void) {
  const channel = supabase
    .channel(`listing:${listingId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${listingId}` },
      (payload) => onUpdate(payload.new as Row as Partial<Listing>),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeThreadMessages(threadId: string, onInsert: (row: Message) => void) {
  const channel = supabase
    .channel(`messages:${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onInsert(payload.new as unknown as Message),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
