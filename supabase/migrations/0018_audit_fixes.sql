-- Исправления по проверке: зависший рацион не прячет готовый, траты за месяц по Москве,
-- цель сохраняется, даже если активной ещё нет, окна уведомлений не ломаются около полуночи.

-- Без id: последний готовый рацион, а свежий (до 10 минут) составляемый или ошибочный — поверх него.
create or replace function public.hl_meal_plan(pid bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'plan', (select to_jsonb(m) from health.meal_plans m where (pid is null or m.id = pid)
             and (pid is not null or m.status = 'ready' or m.created_at > now() - interval '10 minutes')
             order by m.created_at desc limit 1),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'week_start', m.week_start, 'status', m.status, 'created_at', m.created_at,
             'cost_rub', m.cost_rub, 'title', m.plan->>'title') order by m.created_at desc)
             from (select * from health.meal_plans order by created_at desc limit 20) m), '[]'));
end $$;

create or replace function public.hl_ai_spend() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m0 timestamptz := date_trunc('month', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow';
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'month_rub', coalesce(sum(cost_rub) filter (where created_at >= m0), 0),
    'month_n', count(*) filter (where created_at >= m0),
    'avg_rub', round(avg(cost_rub), 2))
    from health.ai_reports);
end $$;

create or replace function public.hl_goal_save(r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.goals g set
    title = coalesce(nullif(r->>'title',''), g.title),
    end_day = coalesce((r->>'end_day')::date, g.end_day),
    details = g.details || coalesce(r->'details', '{}'::jsonb)
  where g.id = (select id from health.goals where active order by created_at desc limit 1);
  if not found then
    insert into health.goals (title, start_day, end_day, details, active)
    values (coalesce(nullif(r->>'title',''), 'Моя цель'), (now() at time zone 'Europe/Moscow')::date,
            coalesce((r->>'end_day')::date, (now() at time zone 'Europe/Moscow')::date + 182), coalesce(r->'details', '{}'::jsonb), true);
  end if;
end $$;

-- Окна уведомлений считаются по меткам времени, а не по часам: 22:30 + 2 часа не «переворачивается» на 00:30.
create or replace function health.push_tick() returns text
language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := health.push_prefs();
  last jsonb := coalesce((select value from health.sync_state where key = 'push_last'), '{}');
  ts timestamp := now() at time zone 'Europe/Moscow';
  today date := ts::date;
  m timestamp := today + (p->>'morning')::time;
  key text := (select value #>> '{}' from health.sync_state where key = 'admin_key');
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
      headers := jsonb_build_object('content-type', 'application/json', 'x-health-key', key),
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
