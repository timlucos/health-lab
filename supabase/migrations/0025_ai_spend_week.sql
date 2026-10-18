-- Расход на ИИ (просьба 18.10): к месяцу добавлены сегодня, неделя и всё время — для «Разборов» и недельного пуша.
create or replace function public.hl_ai_spend() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d0 date := (now() at time zone 'Europe/Moscow')::date;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'today_rub', coalesce(sum(cost_rub) filter (where (created_at at time zone 'Europe/Moscow')::date = d0), 0),
    'week_rub', coalesce(sum(cost_rub) filter (where created_at >= now() - interval '7 days'), 0),
    'week_n', count(*) filter (where created_at >= now() - interval '7 days'),
    'month_rub', coalesce(sum(cost_rub) filter (where created_at >= date_trunc('month', now())), 0),
    'month_n', count(*) filter (where created_at >= date_trunc('month', now())),
    'total_rub', coalesce(sum(cost_rub), 0),
    'avg_rub', round(avg(cost_rub), 2))
    from health.ai_reports);
end $$;
