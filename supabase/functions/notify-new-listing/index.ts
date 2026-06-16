// notify-new-listing — sends a push notification to a group's members when a
// new listing is posted. Wire it as a Supabase Database Webhook:
//
//   Database -> Webhooks -> Create
//     Table:  public.listings
//     Events: INSERT
//     Type:   Supabase Edge Function -> notify-new-listing
//     Header: x-webhook-secret: <WEBHOOK_SECRET>
//
// Secrets (supabase secrets set ...):
//   WEBHOOK_SECRET=<any-random-string>
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy: supabase functions deploy notify-new-listing --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ListingRecord {
  id: string;
  group_id: string;
  seller_id: string;
  title: string | null;
  price: number | null;
  currency: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const record: ListingRecord | undefined = payload?.record;
  if (!record?.id) return new Response('No record', { status: 400 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Active members of the group, excluding the seller.
  const { data: members } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', record.group_id)
    .eq('status', 'active')
    .neq('user_id', record.seller_id);

  const userIds = (members ?? []).map((m) => m.user_id);
  if (userIds.length === 0) return new Response('ok (no recipients)');

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('token')
    .in('user_id', userIds);

  const recipients = (tokens ?? []).map((t) => t.token).filter(Boolean);
  if (recipients.length === 0) return new Response('ok (no tokens)');

  const price =
    record.price != null ? ` · ${record.currency ?? 'USD'} ${Math.round(record.price)}` : '';
  const messages = recipients.map((to) => ({
    to,
    sound: 'default',
    title: 'New listing',
    body: `${record.title ?? 'A stone'}${price}`,
    data: { listingId: record.id, groupId: record.group_id },
  }));

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }

  return new Response(`ok (${messages.length} sent)`);
});
