-- ===========================================================================
-- 0004_realtime_storage.sql — enable realtime on the live tables and create
-- the public media bucket with upload policies.
-- ===========================================================================

-- --- Realtime: stream new/updated listings (the live feed) and messages -----
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings'
  ) then
    execute 'alter publication supabase_realtime add table public.listings';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end$$;

-- --- Storage: public bucket for stone photos + certificate scans ------------
insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', true)
on conflict (id) do nothing;

drop policy if exists "listing-media read" on storage.objects;
create policy "listing-media read" on storage.objects for select
  using (bucket_id = 'listing-media');

drop policy if exists "listing-media insert" on storage.objects;
create policy "listing-media insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing-media update" on storage.objects;
create policy "listing-media update" on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
