// Domain types shared across the app. These mirror the Postgres schema in
// supabase/migrations.

export type GroupType = 'public' | 'private';
export type MemberRole = 'admin' | 'member';
export type MemberStatus = 'active' | 'pending' | 'banned';
export type ListingStatus = 'available' | 'claimed' | 'withdrawn';

export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Contact {
  name: string | null;
  phone: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  invite_code: string | null;
  created_by: string;
  created_at: string;
  // Hydrated client-side / via joins:
  member_count?: number;
  my_role?: MemberRole;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  joined_at: string;
  profile?: Profile;
}

/** The structured stone attributes an OCR pass extracts from a certificate. */
export interface StoneDetails {
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

export interface ParsedCertificate extends StoneDetails {
  title: string | null;
  /** True when the edge function returned mock data (no OCR provider key set). */
  mock?: boolean;
}

export interface Listing extends StoneDetails {
  id: string;
  group_id: string;
  seller_id: string;
  status: ListingStatus;
  title: string | null;
  price: number | null;
  currency: string;
  photos: string[];
  certificate_url: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  // Hydrated via join:
  seller?: Profile | null;
}

export interface Thread {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
  // Hydrated via join:
  listing?: Listing | null;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Result returned by the atomic claim_listing() RPC. */
export interface ClaimResult {
  thread_id: string | null;
  won: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
}
