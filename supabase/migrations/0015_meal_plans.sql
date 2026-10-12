-- Недельный рацион от ИИ: создаётся в фоне (pending → ready/error), клиент опрашивает.
alter table health.ai_reports drop constraint ai_reports_kind_check,
  add constraint ai_reports_kind_check check (kind in ('workout','weekly','chat','daily','health','food','mealplan'));
alter table health.food_log drop constraint food_log_source_check,
  add constraint food_log_source_check check (source in ('photo','text','barcode','label','product','manual','plan'));

create table if not exists health.meal_plans (
  id bigint generated always as identity primary key,
  week_start date not null,
  status text not null default 'pending' check (status in ('pending','ready','error')),
  prefs jsonb not null default '{}',
  plan jsonb,
  error text,
  model text, cost_rub numeric,
  created_at timestamptz not null default now()
);
alter table health.meal_plans enable row level security;

create or replace function public.hl_meal_plan_start(ws date, prefs jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.meal_plans (week_start, prefs) values (ws, coalesce(prefs, '{}')) returning id into new_id;
  return new_id;
end $$;

create or replace function public.hl_meal_plan_finish(pid bigint, plan jsonb, err text, model text, cost_rub numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.meal_plans m set plan = hl_meal_plan_finish.plan, error = err, model = hl_meal_plan_finish.model, cost_rub = hl_meal_plan_finish.cost_rub,
    status = case when hl_meal_plan_finish.plan is null then 'error' else 'ready' end
  where m.id = pid;
end $$;

-- Один рацион (по id или последний) и список прошлых без тела плана.
create or replace function public.hl_meal_plan(pid bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'plan', (select to_jsonb(m) from health.meal_plans m where (pid is null or m.id = pid)
             and (pid is not null or m.status <> 'error' or m.created_at > now() - interval '10 minutes')
             order by m.created_at desc limit 1),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'week_start', m.week_start, 'status', m.status, 'created_at', m.created_at,
             'cost_rub', m.cost_rub, 'title', m.plan->>'title') order by m.created_at desc)
             from (select * from health.meal_plans order by created_at desc limit 20) m), '[]'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['hl_meal_plan_start(date,jsonb)','hl_meal_plan_finish(bigint,jsonb,text,text,numeric)','hl_meal_plan(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
