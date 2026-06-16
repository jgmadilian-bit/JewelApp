# JewelApp

A mobile-first B2B jewelry trade platform — a private marketplace that replaces
the WhatsApp-group workflow diamond/stone dealers use today. Dealers post
listings to private groups; the **first member to tap "Sold" claims it**, the
app connects buyer and seller, then gets out of the way. No payments, no
shipping — pure discovery + claiming + a clean deal history.

> **This milestone = the core loop, end to end:**
> create a listing (OCR autofills the certificate) → it appears **live** in the
> group feed → first tap **Sold** wins an atomic server-side claim → a private
> buyer/seller chat opens with the listing pinned and contact details revealed.

Built with **Expo / React Native** (iPhone-first) + **Supabase** (Postgres
realtime, auth, storage, edge functions).

---

## 1. Prerequisites

- Node 18+ (developed on Node 24)
- An iPhone with the **Expo Go** app (App Store) for instant testing, _or_ an
  iOS Simulator on a Mac
- A free **Supabase** account → <https://supabase.com>
- _(optional)_ The **Supabase CLI** → `npm i -g supabase` (for `db push` /
  `functions deploy`). You can also paste SQL in the dashboard instead.

## 2. Install

```bash
npm install
```

(An `.npmrc` with `legacy-peer-deps=true` is committed so installs resolve
cleanly on Expo SDK 56.)

## 3. Create the Supabase backend

1. Create a new project at <https://supabase.com/dashboard>.
2. **Run the schema.** In the dashboard go to **SQL Editor** and run each file
   in order (or `supabase db push` if you linked the CLI):
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_functions.sql`
   - `supabase/migrations/0003_rls.sql`
   - `supabase/migrations/0004_realtime_storage.sql`
   - `supabase/migrations/0005_push.sql`
3. **Auth settings** (Authentication → Sign In / Providers → Email):
   - Keep **Email** enabled.
   - Turn **"Confirm email" OFF.** The app uses phone-as-identity mapped to an
     internal email so it works with zero SMS setup; with confirmation off,
     signup logs the user straight in. (See _Production hardening_ to switch to
     real phone OTP + Google/Apple.)
4. **Realtime** is enabled by `0004` (listings + messages added to the
   `supabase_realtime` publication). Nothing else to do.
5. **Storage**: `0004` creates the public `listing-media` bucket automatically.

## 4. Configure the app

```bash
cp .env.example .env
```

Fill in from **Project Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

## 5. Deploy the OCR edge function _(optional but recommended)_

The create-listing flow calls a `parse-certificate` edge function. **Without
it deployed, certificate scanning returns realistic mock data** so the flow
still works — fields just need manual edits.

```bash
supabase link --project-ref <your-ref>
supabase functions deploy parse-certificate
# For real OCR (vision model) instead of mock data:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## 6. Run it

```bash
npx expo start
```

Scan the QR code with your iPhone camera to open in **Expo Go**, or press `i`
for the iOS simulator.

---

## Try the core loop (needs two accounts)

1. **Account A** (your phone): create an account → **＋ New group** ("47th St.
   Diamonds", Private) → copy its **Invite** code (top-right of the feed).
2. **Account B** (simulator, or a second device, or sign out and make another
   account): **Join with code** using A's invite code.
3. As **A**: **＋ New listing** → *Scan certificate* (camera/photo/PDF) → fields
   autofill → add a price → **Post to group**.
4. Watch the listing appear **instantly** in B's feed (no refresh).
5. As **B**: open the listing → tap **Sold — claim this stone**. First tap wins
   server-side; B is taken straight into the chat thread with A's contact
   revealed. If A and B tap at the same instant, exactly one wins and the other
   sees the precise claim time.
6. Both find the conversation later under **Deals**.

---

## Architecture

```
app/                         expo-router screens (file-based routing)
  _layout.tsx                providers, auth-gate redirect, Face ID lock overlay
  index.tsx                  splash / redirect target
  (auth)/sign-in.tsx         phone + password (and OAuth placeholders)
  (app)/
    groups.tsx               home: your groups, create / join
    deals.tsx                deal history (your threads)
    group/[id].tsx           LIVE realtime feed + new-listing FAB
    listing/new.tsx          fast create flow with OCR autofill
    listing/[id].tsx         detail + the atomic "Sold" claim button
    thread/[id].tsx          buyer/seller chat, listing pinned, contact reveal

src/
  lib/
    supabase.ts              client (AsyncStorage session, auto-refresh)
    auth.tsx                 AuthProvider: signup/in, persisted session, Face ID
    api.ts                   typed data access (queries + RPC calls)
    realtime.ts              postgres_changes subscriptions (feed, messages)
    storage.ts               upload media / read file as base64
    ocr.ts                   parse-certificate invocation
    push.ts                  Expo push token registration
    types.ts, format.ts      domain types + formatting
  components/                Button, Field, ListingCard, etc.
  theme/                     dark + gold design tokens

supabase/
  migrations/                schema, functions, RLS, realtime/storage, push
  functions/
    parse-certificate/       OCR + structured extraction (vision model or mock)
    notify-new-listing/      push fan-out (wire as a DB webhook)
```

### How the dispute-critical claim works

`claim_listing(listing_id)` (in `0002_functions.sql`) runs a single atomic
`UPDATE listings SET status='claimed' WHERE id=? AND status='available'`.
Postgres serializes concurrent updates on the row, so the first transaction to
commit wins and every later one matches zero rows and loses — **no app-level
race, no double-claim.** The winning instant is stamped with `clock_timestamp()`
(sub-millisecond) and the buyer/seller thread is created in the same call.

### Privacy

`profiles.phone` is **not** column-selectable by clients (RLS column grants).
Names/avatars are visible to co-group members; a counterparty's **phone is only
revealed via `thread_contact()` after a claim** — honoring "contact shown on
claim."

---

## Production hardening (intentional simplifications)

| Area | Now (demo) | Production |
|------|-----------|-----------|
| Auth | Phone mapped to internal email + password (no SMS needed) | Supabase phone **OTP** + **Google/Apple** via `signInWithIdToken` — swap the two calls in `src/lib/auth.tsx` |
| Face ID | Unlocks a persisted session; auto-passes if no biometrics enrolled | Same, but only meaningful in a **dev/standalone build** (not Expo Go) |
| OCR | Mock data if no key; vision model if `ANTHROPIC_API_KEY` set; PDFs use mock | Add a PDF→image step; tune the extraction prompt per lab |
| Certificates | Public `listing-media` bucket | Private bucket + signed URLs |
| Push | Client registers tokens; `notify-new-listing` ready to wire | Requires a **dev build** (remote push doesn't work in Expo Go SDK 53+) + a DB Webhook on `listings` INSERT → `notify-new-listing` |
| Apple Shortcuts / action button | — | Add an App Intent / URL scheme (`jewelapp://listing/new`) in a dev build |

## Not in this milestone (next up)

The admin dashboard (member management, approvals, bans, invite-link
management, moderation, flag/report, analytics) and public-group discovery are
specified but **not built yet** — the schema (`group_members.role/status`,
admin RLS policies, `is_group_admin()`) already supports them.

## Scripts

```bash
npm start            # expo dev server
npm run ios          # open in iOS simulator (macOS)
npm run typecheck    # tsc --noEmit
npx expo-doctor      # project health check
```
