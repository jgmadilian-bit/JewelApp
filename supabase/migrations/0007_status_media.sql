-- ===========================================================================
-- 0007_status_media.sql — richer seller statuses + video media.
--   available      — live, claimable
--   out_for_look   — on hold, a buyer is reviewing it (not claimable)
--   claimed        — sold here (a member tapped Sold; opens a thread)
--   sold_elsewhere — the seller sold it outside the app
--   withdrawn      — removed
-- ===========================================================================

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('available', 'out_for_look', 'claimed', 'sold_elsewhere', 'withdrawn'));

alter table public.listings add column if not exists videos text[] not null default '{}';
