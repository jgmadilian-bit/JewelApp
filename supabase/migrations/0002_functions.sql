-- ===========================================================================
-- 0002_functions.sql — security-definer helpers + business RPCs.
-- Defined before RLS (0003) because policies reference the helper functions.
-- ===========================================================================

-- --- RLS helper predicates (definer => no policy recursion) -----------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
      and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.shares_active_group(p_other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_other and b.status = 'active'
  );
$$;

create or replace function public.shares_active_thread(p_other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.threads
    where (buyer_id = auth.uid() and seller_id = p_other)
       or (seller_id = auth.uid() and buyer_id = p_other)
  );
$$;

-- --- claim_listing: the dispute-critical "first tap wins" lock ---------------
-- The atomic `UPDATE ... WHERE status = 'available'` is the lock. Under
-- concurrency Postgres serializes the row update: the first committed tx flips
-- the status, and every later tx then matches 0 rows (found = false) and loses.
-- clock_timestamp() records the real wall-clock instant of the winning update
-- (sub-millisecond precision) rather than the transaction start time.
create or replace function public.claim_listing(p_listing_id uuid)
returns table (thread_id uuid, won boolean, claimed_by uuid, claimed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_seller    uuid;
  v_group     uuid;
  v_claimed_by uuid;
  v_claimed_at timestamptz;
  v_thread_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.listings as l
     set status     = 'claimed',
         claimed_by = v_uid,
         claimed_at = clock_timestamp()
   where l.id = p_listing_id
     and l.status = 'available'
     and l.seller_id <> v_uid
     and exists (
       select 1 from public.group_members gm
       where gm.group_id = l.group_id
         and gm.user_id = v_uid
         and gm.status = 'active'
     )
  returning l.seller_id, l.group_id, l.claimed_by, l.claimed_at
       into v_seller, v_group, v_claimed_by, v_claimed_at;

  if found then
    -- We won. Open the buyer/seller thread (unique per listing => idempotent).
    insert into public.threads (listing_id, buyer_id, seller_id)
    values (p_listing_id, v_uid, v_seller)
    on conflict (listing_id) do nothing
    returning id into v_thread_id;

    if v_thread_id is null then
      select id into v_thread_id from public.threads where listing_id = p_listing_id;
    end if;

    return query select v_thread_id, true, v_claimed_by, v_claimed_at;
  else
    -- We lost (already claimed) or the listing isn't claimable by us. Report
    -- the existing claim so the UI can show who got it and exactly when.
    select l.claimed_by, l.claimed_at into v_claimed_by, v_claimed_at
    from public.listings l where l.id = p_listing_id;

    select t.id into v_thread_id from public.threads t where t.listing_id = p_listing_id;

    return query select v_thread_id, false, v_claimed_by, v_claimed_at;
  end if;
end;
$$;

-- --- create_group: make a group and add the creator as admin ----------------
create or replace function public.create_group(
  p_name text,
  p_type text default 'private',
  p_description text default null
)
returns setof public.groups
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'group name required'; end if;
  if p_type not in ('public', 'private') then raise exception 'invalid group type'; end if;

  insert into public.groups (name, description, type, invite_code, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_type,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_uid
  )
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_group.id, v_uid, 'admin', 'active');

  return next v_group;
end;
$$;

-- --- join_group: join via invite code ---------------------------------------
create or replace function public.join_group(p_invite_code text)
returns table (group_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_group    public.groups;
  v_existing public.group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_group from public.groups
  where invite_code = upper(btrim(p_invite_code));
  if not found then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;

  select * into v_existing from public.group_members
  where group_members.group_id = v_group.id and user_id = v_uid;
  if found then
    if v_existing.status = 'banned' then
      raise exception 'you are banned from this group';
    end if;
    return query select v_group.id, v_existing.status;
    return;
  end if;

  -- Holding a valid invite code implies approval => join as active member.
  insert into public.group_members (group_id, user_id, role, status)
  values (v_group.id, v_uid, 'member', 'active');

  return query select v_group.id, 'active'::text;
end;
$$;

-- --- thread_contact: reveal the counterparty's name + phone after a claim ----
create or replace function public.thread_contact(p_thread_id uuid)
returns table (name text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_thread public.threads;
  v_other  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_thread from public.threads where id = p_thread_id;
  if not found then raise exception 'thread not found'; end if;
  if v_uid <> v_thread.buyer_id and v_uid <> v_thread.seller_id then
    raise exception 'not a participant of this thread';
  end if;

  v_other := case when v_uid = v_thread.buyer_id then v_thread.seller_id
                  else v_thread.buyer_id end;

  return query select p.name, p.phone from public.profiles p where p.id = v_other;
end;
$$;

-- --- Execute grants ---------------------------------------------------------
grant execute on function public.is_group_member(uuid)   to authenticated;
grant execute on function public.is_group_admin(uuid)    to authenticated;
grant execute on function public.shares_active_group(uuid) to authenticated;
grant execute on function public.shares_active_thread(uuid) to authenticated;
grant execute on function public.claim_listing(uuid)     to authenticated;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text)        to authenticated;
grant execute on function public.thread_contact(uuid)    to authenticated;
