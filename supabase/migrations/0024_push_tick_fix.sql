-- Исправление 18.10: переменная key совпадала с колонкой sync_state.key, и запись push_last падала с «column reference "key" is ambiguous».
-- Вся транзакция откатывалась вместе с отправкой, поэтому с 13.10 не уходило ни одно уведомление по расписанию.
create or replace function health.push_tick() returns text
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := health.push_prefs();
  last jsonb := coalesce((select value from health.sync_state where key = 'push_last'), '{}');
  ts timestamp := now() at time zone 'Europe/Moscow';
  today date := ts::date;
  m timestamp := today + (p->>'morning')::time;
  hkey text := (select value #>> '{}' from health.sync_state where key = 'admin_key');
  base text := 'https://yfdaldpzbfyzoancmywn.supabase.co/functions/v1/';
  done text := '';
  k text;
  at_ timestamp;
begin
  if not exists (select 1 from health.push_subs where not dead) then return 'no subs'; end if;

  -- За 25 минут до сводки подтягиваем свежие данные с часов (для сводки после полуночи — ещё накануне).
  if m - interval '25 minutes' < today then m := m + interval '1 day'; end if;
  if coalesce(last->>'prep', '') < m::date::text and ts >= m - interval '25 minutes' and ts < m then
    perform net.http_post(url := base || 'google-health/recent',
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', hkey),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
    last := last || jsonb_build_object('prep', m::date);
    done := done || 'prep ';
  end if;

  foreach k in array array['morning', 'evening', 'weekly'] loop
    continue when k = 'evening' and not (p->>'evening_on')::boolean;
    continue when k = 'weekly' and (not (p->>'weekly_on')::boolean or extract(isodow from today) <> 7);
    at_ := today + (p->>k)::time;
    continue when coalesce(last->>k, '') >= today::text or ts < at_ or ts >= at_ + interval '2 hours';
    if k = 'morning' then
      perform health.refresh_daily(today - 3);
      perform health.refresh_load(today - 3);
    end if;
    perform net.http_post(url := base || 'morning',
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', hkey),
      body := jsonb_build_object('action', 'cron', 'kind', k), timeout_milliseconds := 150000);
    last := last || jsonb_build_object(k, today);
    done := done || k || ' ';
  end loop;

  -- Заряд часов ≤ 20% по свежему замеру (cron health-devices, раз в час): одно напоминание в день, с 9 до 22.
  if coalesce(last->>'battery', '') < today::text and ts::time between '09:00' and '22:00'
     and coalesce(p->>'battery_on', 'true')::boolean
     and (select level from health.battery_log where at > now() - interval '3 hours' order by at desc limit 1) <= 20 then
    perform net.http_post(url := base || 'morning',
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', hkey),
      body := jsonb_build_object('action', 'cron', 'kind', 'battery'), timeout_milliseconds := 30000);
    last := last || jsonb_build_object('battery', today);
    done := done || 'battery ';
  end if;

  if done <> '' then
    insert into health.sync_state (key, value) values ('push_last', last)
    on conflict (key) do update set value = excluded.value;
  end if;
  return coalesce(nullif(done, ''), 'idle');
end $$;
