-- ===========================================================================
-- 0005_push.sql — Expo push tokens per device. Populated by the client after
-- login; read by the notify-new-listing edge function (service role).
-- ===========================================================================

create table if not exists public.device_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_device_tokens_user on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_rw on public.device_tokens;
create policy device_tokens_rw on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
