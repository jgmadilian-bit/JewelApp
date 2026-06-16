# JewelApp — agent guide

A mobile-first B2B jewelry trade platform: dealers post stone listings to
private groups, the **first member to tap "Sold" claims it** (atomic,
server-side), then the app connects buyer + seller and stays out of the deal.
**Expo / React Native (iPhone-first) + Supabase.** See `README.md` for setup and
the full architecture map.

## Stack notes — Expo HAS CHANGED

This project is on **Expo SDK 56** (React 19, React Native 0.85, expo-router v6,
TypeScript 6). Read the versioned docs at
<https://docs.expo.dev/versions/v56.0.0/> before changing native config — APIs
differ from older SDKs. Specifics that bit us:

- `expo-file-system` uses the new object API: `new File(uri).arrayBuffer()` /
  `.base64()`. The old `readAsStringAsync` lives under `expo-file-system/legacy`.
- `expo-image-picker` uses `mediaTypes: ['images']` (string array), not the
  deprecated `MediaTypeOptions`.
- `Notifications.setNotificationHandler` returns
  `{ shouldShowBanner, shouldShowList, shouldPlaySound, shouldSetBadge }`.
- `newArchEnabled` is **not** a valid `app.json` key anymore (new arch is
  default).
- tsconfig uses `paths` **without** `baseUrl` (deprecated in TS 6).
- `.npmrc` pins `legacy-peer-deps=true` — keep it; npm otherwise fails on a
  react-dom peer mismatch in the Expo web devtools chain.

## Conventions

- Import via the `@/` alias (maps to repo root): `@/src/lib/...`.
- Data access goes through `src/lib/api.ts` (typed queries + RPCs); realtime
  through `src/lib/realtime.ts`. Don't call `supabase.from(...)` from screens.
- All user FKs reference `public.profiles(id)` (not `auth.users`) so PostgREST
  can embed profiles. When adding a second FK to a table, name the embed in
  queries (e.g. `seller:profiles!listings_seller_id_fkey(...)`).
- RLS: anything that needs to bypass policies (membership checks, claim, group
  create/join, contact reveal) is a `security definer` function in
  `0002_functions.sql`. Helper predicates avoid policy recursion — reuse them.
- Theme tokens live in `src/theme`. Dark + gold; mobile-first; reusable UI in
  `src/components/ui.tsx`.
- Listings are **caption-first** and cover finished jewelry, not just loose
  diamonds. `src/lib/captionParser.ts` turns a free-text post into structured
  fields (metal, weight in dwt/grams, category, gemstones[], era, condition,
  price terms, …) — it's the primary "OCR equivalent" and runs anywhere. The
  raw caption is stored in `listings.description`; structured columns were added
  in `0006_listing_fields.sql`. Cert OCR (`certParser.ts`) is secondary.

## Validate before finishing

```bash
npm run typecheck            # must be clean
npx expo-doctor              # 21/21
npx expo export --platform ios --output-dir dist-check && rm -rf dist-check
```

The last one is the best smoke test available without a device — it runs the
full Metro bundle and catches import/alias/babel failures.

## The claim is dispute-critical

`claim_listing()` relies on a single atomic
`UPDATE ... WHERE status='available'` for first-tap-wins. Do not move that logic
client-side or split it across statements.

## Not built yet

Admin dashboard (members/approvals/bans/invites/moderation/analytics) and public
group discovery. Schema + admin RLS already support them.
