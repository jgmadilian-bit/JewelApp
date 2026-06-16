-- ===========================================================================
-- 0008_invites_reports.sql — single-use invite links + a flag/report system.
-- Invites are one-time: an admin generates a fresh code per person, and it is
-- consumed on first join so it can't be passed around to bring others in.
-- ===========================================================================

-- --- One-time invites --------------------------------------------------------
create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  code       text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz
);
create index if not exists idx_group_invites_group on public.group_invites(group_id);

alter table public.group_invites enable row level security;
drop policy if exists group_invites_select on public.group_invites;
create policy group_invites_select on public.group_invites for select to authenticated
  using (public.is_group_admin(group_id) or created_by = auth.uid());
-- creation + consumption go through the definer RPCs below

create or replace function public.create_invite(
  p_group_id uuid,
  p_expires_in interval default interval '7 days'
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_group_admin(p_group_id) then
    raise exception 'only group admins can create invites';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.group_invites (group_id, code, created_by, expires_at)
  values (p_group_id, v_code, v_uid, now() + p_expires_in);
  return v_code;
end;
$$;

-- Replaces the 0002 join_group: now consumes a single-use invite.
create or replace function public.join_group(p_invite_code text)
returns table (group_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.group_invites;
  v_existing public.group_members;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_invite from public.group_invites
  where code = upper(btrim(p_invite_code))
  for update;
  if not found then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  if v_invite.used_at is not null then
    raise exception 'this invite has already been used';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'this invite has expired';
  end if;

  -- Already a member? Don't burn the invite; just report status.
  select * into v_existing from public.group_members
  where group_members.group_id = v_invite.group_id and user_id = v_uid;
  if found then
    if v_existing.status = 'banned' then
      raise exception 'you are banned from this group';
    end if;
    return query select v_invite.group_id, v_existing.status;
    return;
  end if;

  update public.group_invites set used_by = v_uid, used_at = now() where id = v_invite.id;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_invite.group_id, v_uid, 'member', 'active');

  return query select v_invite.group_id, 'active'::text;
end;
$$;

grant execute on function public.create_invite(uuid, interval) to authenticated;

-- --- Flag / report -----------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

alter table public.reports enable row level security;

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_group_member(l.group_id)
    )
  );

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (
    reporter_id = auth.uid()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and public.is_group_admin(l.group_id)
    )
  );
