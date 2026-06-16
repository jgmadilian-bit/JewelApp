-- ===========================================================================
-- 0003_rls.sql — Row Level Security. Direct writes to membership/threads go
-- through the definer RPCs in 0002; clients can only read what they're allowed
-- to see and create their own listings/messages.
-- ===========================================================================

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.listings      enable row level security;
alter table public.threads       enable row level security;
alter table public.messages      enable row level security;

-- --- Profiles: name/avatar are peer-visible; phone is NOT column-selectable.
-- Phone is only reachable via thread_contact() after a claim, honoring
-- "contact details revealed on claim".
revoke select on public.profiles from anon, authenticated;
grant  select (id, name, avatar_url, created_at) on public.profiles to authenticated;
grant  update (name, avatar_url)                 on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.shares_active_group(id)
    or public.shares_active_thread(id)
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- --- Groups: public groups are discoverable; private only to members/creator.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (type = 'public' or public.is_group_member(id) or created_by = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
-- (inserts happen via create_group())

-- --- Group members: visible to co-members; managed by admins.
drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
    or public.is_group_admin(group_id)
  );

drop policy if exists group_members_admin_update on public.group_members;
create policy group_members_admin_update on public.group_members for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

drop policy if exists group_members_admin_delete on public.group_members;
create policy group_members_admin_delete on public.group_members for delete to authenticated
  using (public.is_group_admin(group_id) and user_id <> auth.uid());
-- (joins happen via join_group())

-- --- Listings: readable by group members; seller owns their own rows.
drop policy if exists listings_select on public.listings;
create policy listings_select on public.listings for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (
    seller_id = auth.uid()
    and status = 'available'
    and public.is_group_member(group_id)
  );

drop policy if exists listings_update_seller on public.listings;
create policy listings_update_seller on public.listings for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
-- (claims happen via claim_listing())

-- --- Threads: only the two participants can see them.
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());
-- (inserts happen via claim_listing())

-- --- Messages: only participants read/post.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.threads t
      where t.id = thread_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.threads t
      where t.id = thread_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );
