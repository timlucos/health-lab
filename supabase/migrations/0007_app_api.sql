-- API для веб-приложения: чтение через Supabase Auth, без секретных ключей в браузере.
-- Схема health остаётся закрытой; наружу открыты только функции ниже,
-- и они отвечают лишь владельцу (email из health.sync_state['owner_email']).

create or replace function health.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = lower((select value #>> '{}' from health.sync_state where key = 'owner_email')),
    false)
$$;
revoke all on function health.is_owner() from public, anon;

-- Дневные итоги, нагрузка и последние оценки против нормы.
create or replace function public.hl_summary(days int default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text := health.tz();
  from_day date := (now() at time zone health.tz())::date - least(greatest(days, 1), 3650);
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tz', tz,
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from health.daily_summary d where d.day >= from_day), '[]'),
    'load', coalesce((select jsonb_agg(to_jsonb(l) order by l.day) from health.v_daily_load l where l.day >= from_day), '[]'),
    'baseline', coalesce((select jsonb_agg(to_jsonb(b)) from (
        select distinct on (metric) * from health.v_daily_baseline order by metric, day desc) b), '[]'),
    'sync', (select max(fetched_at) from health.gh_jobs where status = 'done'));
end $$;

-- Один день: пульс по минутам, сон со стадиями, тренировки, шаги по часам.
create or replace function public.hl_day(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t0 timestamptz := (d::timestamp at time zone health.tz());
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'date', d,
    'summary', (select to_jsonb(s) from health.daily_summary s where s.day = d),
    'hr', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from ts)::bigint, value, meta->'min', meta->'max') order by ts)
            from health.samples where source = 'google_health' and metric = 'heart-rate.bpm'
              and ts >= t0 and ts < t0 + interval '1 day'), '[]'),
    'steps', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from h)::bigint, n) order by h) from (
              select date_trunc('hour', ts) h, sum(value)::int n from health.samples
              where source = 'google_health' and metric = 'steps.count' and ts >= t0 and ts < t0 + interval '1 day'
              group by 1) x), '[]'),
    'sleep', coalesce((select jsonb_agg(jsonb_build_object('start', s.start_ts, 'end', s.end_ts, 'main', s.is_main,
              'stages', coalesce((select jsonb_agg(jsonb_build_array(extract(epoch from st.start_ts)::bigint, st.seconds, st.stage)
                                  order by st.start_ts) from health.sleep_stages st where st.session_id = s.id), '[]'))
              order by s.start_ts)
            from health.sleep_sessions s where s.source = 'google_health'
              and s.end_ts >= t0 and s.end_ts < t0 + interval '1 day'), '[]'),
    'workouts', coalesce((select jsonb_agg(to_jsonb(w) order by w.start_ts) from (
              select start_ts, activity, duration_s, calories, distance_m, avg_hr, steps from health.workouts
              where source = 'google_health' and start_ts >= t0 and start_ts < t0 + interval '1 day') w), '[]'));
end $$;

revoke all on function public.hl_summary(int) from public, anon;
revoke all on function public.hl_day(date) from public, anon;
grant execute on function public.hl_summary(int) to authenticated;
grant execute on function public.hl_day(date) to authenticated;
