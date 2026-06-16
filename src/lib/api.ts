import { supabase } from '@/src/lib/supabase';
import type {
  ClaimResult,
  Contact,
  Group,
  GroupType,
  Listing,
  Message,
  Thread,
} from '@/src/lib/types';

// PostgREST embed hint: listings has two FKs to profiles (seller_id, claimed_by),
// so we name the constraint explicitly to disambiguate the join.
const SELLER_EMBED = 'seller:profiles!listings_seller_id_fkey(id, name, avatar_url, created_at)';

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function getMyGroups(userId: string): Promise<Group[]> {
  const { data: memberships, error: mErr } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (mErr) throw mErr;

  const ids = (memberships ?? []).map((m) => m.group_id as string);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('groups')
    .select('*, members:group_members(count)')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const roleByGroup = new Map(
    (memberships ?? []).map((m) => [m.group_id as string, m.role as Group['my_role']]),
  );
  return (data ?? []).map((g: any) => ({
    ...g,
    member_count: g.members?.[0]?.count ?? 0,
    my_role: roleByGroup.get(g.id),
  })) as Group[];
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('*, members:group_members(count)')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as any),
    member_count: (data as any).members?.[0]?.count ?? 0,
  } as Group;
}

export async function createGroup(
  name: string,
  type: GroupType,
  description?: string,
): Promise<Group> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name.trim(),
    p_type: type,
    p_description: description?.trim() || null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as Group;
}

export async function joinGroup(
  inviteCode: string,
): Promise<{ group_id: string; status: string }> {
  const { data, error } = await supabase.rpc('join_group', {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as { group_id: string; status: string };
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export async function getListings(groupId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(`*, ${SELLER_EMBED}`)
    .eq('group_id', groupId)
    .neq('status', 'withdrawn')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Listing[];
}

export async function getListing(listingId: string): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select(`*, ${SELLER_EMBED}`)
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Listing) ?? null;
}

export interface NewListingInput {
  group_id: string;
  seller_id: string;
  title: string | null;
  price: number | null;
  currency: string;
  photos: string[];
  certificate_url: string | null;
  stone_type: string | null;
  shape: string | null;
  carat: number | null;
  color: string | null;
  clarity: string | null;
  cut: string | null;
  measurements: string | null;
  lab: string | null;
  cert_number: string | null;
}

export async function createListing(input: NewListingInput): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .insert(input)
    .select(`*, ${SELLER_EMBED}`)
    .single();
  if (error) throw error;
  return data as unknown as Listing;
}

/**
 * Atomic first-tap-wins claim. The server (claim_listing RPC) does the locking;
 * this just relays the result. `won` is true only for the first caller.
 */
export async function claimListing(listingId: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_listing', { p_listing_id: listingId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ClaimResult;
}

export async function withdrawListing(listingId: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'withdrawn' })
    .eq('id', listingId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Threads & messages
// ---------------------------------------------------------------------------

const THREAD_EMBED = `*, listing:listings(*, ${SELLER_EMBED})`;

export async function getThread(threadId: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select(THREAD_EMBED)
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Thread) ?? null;
}

/** Resolve the thread attached to a claimed listing (participants only, via RLS). */
export async function getThreadByListing(listingId: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('threads')
    .select(THREAD_EMBED)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Thread) ?? null;
}

/** Reveals the counterparty's name + phone — only works for thread participants. */
export async function getThreadContact(threadId: string): Promise<Contact | null> {
  const { data, error } = await supabase.rpc('thread_contact', { p_thread_id: threadId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Contact) ?? null;
}

export async function getMyThreads(userId: string): Promise<Thread[]> {
  const { data, error } = await supabase
    .from('threads')
    .select(THREAD_EMBED)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Thread[];
}

export async function getMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(
  threadId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ thread_id: threadId, sender_id: senderId, body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}
