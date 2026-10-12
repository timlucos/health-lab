-- Уведомления по расписанию владельца: утренняя сводка (время настраивается), вечернее напоминание,
-- воскресный недельный разбор. Один тик pg_cron раз в 5 минут решает, что пора отправить.
alter function health.tz set search_path = health, public;
alter function health.refresh_daily set search_path = health, public;
alter function health.refresh_load set search_path = health, public;

create or replace function health.push_prefs() returns jsonb
language sql stable security definer set search_path = '' as $$
  select '{"morning":"07:40","evening_on":true,"evening":"21:30","weekly_on":true,"weekly":"19:00"}'::jsonb
    || coalesce((select value from health.sync_state where key = 'push_prefs'), '{}'::jsonb)
$$;

create or replace function public.hl_push_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('public_key', (select value ->> 'public' from health.sync_state where key = 'vapid'),
    'devices', (select count(*) from health.push_subs where not dead),
    'prefs', health.push_prefs());
end $$;

create or replace function public.hl_push_prefs_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare clean jsonb := '{}';
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p ? 'morning' and p->>'morning' ~ '^([01]\d|2[0-3]):[0-5]\d$' then clean := clean || jsonb_build_object('morning', p->>'morning'); end if;
  if p ? 'evening' and p->>'evening' ~ '^([01]\d|2[0-3]):[0-5]\d$' then clean := clean || jsonb_build_object('evening', p->>'evening'); end if;
  if p ? 'weekly' and p->>'weekly' ~ '^([01]\d|2[0-3]):[0-5]\d$' then clean := clean || jsonb_build_object('weekly', p->>'weekly'); end if;
  if jsonb_typeof(p->'evening_on') = 'boolean' then clean := clean || jsonb_build_object('evening_on', p->'evening_on'); end if;
  if jsonb_typeof(p->'weekly_on') = 'boolean' then clean := clean || jsonb_build_object('weekly_on', p->'weekly_on'); end if;
  insert into health.sync_state (key, value) values ('push_prefs', clean)
  on conflict (key) do update set value = health.sync_state.value || excluded.value;
  return health.push_prefs();
end $$;

revoke all on function public.hl_push_prefs_save(jsonb) from public, anon;
grant execute on function public.hl_push_prefs_save(jsonb) to authenticated;
revoke all on function health.push_prefs() from public, anon, authenticated;

-- Тик: за 25 минут до сводки подтягивает свежие данные с часов, в назначенное время пересчитывает день и шлёт.
create or replace function health.push_tick() returns text
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := health.push_prefs();
  last jsonb := coalesce((select value from health.sync_state where key = 'push_last'), '{}');
  ts timestamp := now() at time zone 'Europe/Moscow';
  today date := ts::date;
  t time := ts::time;
  m time := (p->>'morning')::time;
  key text := (select value #>> '{}' from health.sync_state where key = 'admin_key');
  base text := 'https://yfdaldpzbfyzoancmywn.supabase.co/functions/v1/';
  done text := '';
  k text;
  at_ time;
begin
  if not exists (select 1 from health.push_subs where not dead) then return 'no subs'; end if;

  if coalesce(last->>'prep', '') < today::text and t >= m - interval '25 minutes' and t < m then
    perform net.http_post(url := base || 'google-health/recent',
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', key),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
    last := last || jsonb_build_object('prep', today);
    done := done || 'prep ';
  end if;

  foreach k in array array['morning', 'evening', 'weekly'] loop
    continue when k = 'evening' and not (p->>'evening_on')::boolean;
    continue when k = 'weekly' and (not (p->>'weekly_on')::boolean or extract(isodow from today) <> 7);
    at_ := (p->>k)::time;
    continue when coalesce(last->>k, '') >= today::text or t < at_ or t >= at_ + interval '2 hours';
    if k = 'morning' then
      perform health.refresh_daily(today - 3);
      perform health.refresh_load(today - 3);
    end if;
    perform net.http_post(url := base || 'morning',
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', key),
      body := jsonb_build_object('action', 'cron', 'kind', k), timeout_milliseconds := 150000);
    last := last || jsonb_build_object(k, today);
    done := done || k || ' ';
  end loop;

  if done <> '' then
    insert into health.sync_state (key, value) values ('push_last', last)
    on conflict (key) do update set value = excluded.value;
  end if;
  return coalesce(nullif(done, ''), 'idle');
end $$;

revoke all on function health.push_tick() from public, anon, authenticated;

select cron.unschedule('health-morning-push') where exists (select 1 from cron.job where jobname = 'health-morning-push');
select cron.schedule('health-push-tick', '*/5 * * * *', $cron$ select health.push_tick() $cron$);
