-- ===========================================================================
-- 0001_schema.sql — tables, indexes, and the signup -> profile trigger.
-- All user references point at public.profiles(id) (which mirrors
-- auth.users.id) so PostgREST can embed profile data on listings/threads.
-- ===========================================================================

create extension if not exists pgcrypto;

-- --- Profiles ---------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Create a profile automatically on signup, reading name/phone from the
-- signup metadata (or auth.users.phone if phone auth is used in production).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), new.phone)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Groups -----------------------------------------------------------------
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  type        text not null default 'private' check (type in ('public', 'private')),
  invite_code text unique,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  status    text not null default 'active' check (status in ('active', 'pending', 'banned')),
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists idx_group_members_user  on public.group_members(user_id);
create index if not exists idx_group_members_group on public.group_members(group_id);

-- --- Listings ---------------------------------------------------------------
create table if not exists public.listings (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  seller_id      uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'available' check (status in ('available', 'claimed', 'withdrawn')),
  title          text,
  price          numeric(12, 2),
  currency       text not null default 'USD',
  photos         text[] not null default '{}',
  certificate_url text,
  -- Stone attributes (autofilled by OCR, editable by seller):
  stone_type     text,
  shape          text,
  carat          numeric(6, 2),
  color          text,
  clarity        text,
  cut            text,
  measurements   text,
  lab            text,
  cert_number    text,
  extra          jsonb,
  created_at     timestamptz not null default now(),
  claimed_at     timestamptz,
  claimed_by     uuid references public.profiles(id) on delete set null
);
create index if not exists idx_listings_group_created on public.listings(group_id, created_at desc);
create index if not exists idx_listings_status        on public.listings(status);

-- --- Threads (exactly one per claimed listing) ------------------------------
create table if not exists public.threads (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id) on delete cascade,
  buyer_id   uuid not null references public.profiles(id) on delete cascade,
  seller_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_threads_buyer  on public.threads(buyer_id);
create index if not exists idx_threads_seller on public.threads(seller_id);

-- --- Messages ---------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_thread_created on public.messages(thread_id, created_at);
