-- Утренняя сводка на телефон: подписки Web Push, ключи VAPID и ежедневный запуск.
-- Серверные функции (service_role) тоже считаются владельцем: их вызывает только расписание и наши Edge Functions.
create or replace function health.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or coalesce(
    lower(auth.jwt() ->> 'email') = lower((select value #>> '{}' from health.sync_state where key = 'owner_email')),
    false)
$$;

create table if not exists health.push_subs (
  endpoint text primary key,
  p256dh text not null, auth text not null,
  ua text,
  dead boolean not null default false, -- подписка отозвана (410), не шлём
  created_at timestamptz not null default now()
);
alter table health.push_subs enable row level security;

create or replace function public.hl_push_save(sub jsonb, ua text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.push_subs (endpoint, p256dh, auth, ua)
  values (sub->>'endpoint', sub->'keys'->>'p256dh', sub->'keys'->>'auth', ua)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, dead = false;
end $$;

create or replace function public.hl_push_dead(ep text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.push_subs set dead = true where endpoint = ep;
end $$;

-- Подписки и закрытый ключ VAPID — только для серверной функции.
create or replace function public.hl_push_targets() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth))) from health.push_subs where not dead), '[]'),
    'vapid', (select value from health.sync_state where key = 'vapid'));
end $$;

create or replace function public.hl_vapid_set(v jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.sync_state (key, value) values ('vapid', v) on conflict (key) do nothing;
end $$;

-- Открытый ключ VAPID для подписки в браузере и число подписанных устройств.
create or replace function public.hl_push_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('public_key', (select value ->> 'public' from health.sync_state where key = 'vapid'),
    'devices', (select count(*) from health.push_subs where not dead));
end $$;

create or replace function public.hl_admin_ok(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(k = (select value #>> '{}' from health.sync_state where key = 'admin_key'), false)
$$;

do $$
declare f text;
begin
  foreach f in array array['hl_push_save(jsonb,text)','hl_push_dead(text)','hl_push_info()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['hl_push_targets()','hl_vapid_set(jsonb)','hl_admin_ok(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 07:40 по Москве (04:40 UTC): после пересчёта дневных итогов и готовности в :20 и :25.
select cron.schedule('health-morning-push', '40 4 * * *', $$
  select net.http_post(
    url := 'https://yfdaldpzbfyzoancmywn.supabase.co/functions/v1/morning',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-health-key', (select value #>> '{}' from health.sync_state where key = 'admin_key')),
    body := '{"action":"cron"}'::jsonb, timeout_milliseconds := 150000)
  where exists (select 1 from health.push_subs where not dead)
$$);
