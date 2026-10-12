-- Итоги тренировки, еженедельные замеры, отчёты ИИ-тренера.

create table if not exists health.workout_reviews (
  day date primary key,
  plan_id bigint references health.workout_plans(id),
  energy smallint check (energy between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  mood smallint check (mood between 1 and 5),
  progress_feel text check (progress_feel in ('better','same','worse')),
  pain text,
  note text,
  updated_at timestamptz not null default now()
);
create table if not exists health.body_checkins (
  day date primary key,
  weight_kg numeric(5,2), waist_cm numeric(5,1), chest_cm numeric(5,1), arm_cm numeric(5,1), hip_cm numeric(5,1), thigh_cm numeric(5,1), body_fat_pct numeric(4,1),
  note text,
  updated_at timestamptz not null default now()
);
create table if not exists health.ai_reports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('workout','weekly','chat')),
  day date not null,
  model text,
  question text,
  answer text not null,
  created_at timestamptz not null default now()
);
alter table health.workout_reviews enable row level security;
alter table health.body_checkins enable row level security;
alter table health.ai_reports enable row level security;

create or replace function public.hl_review_save(d date, r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.workout_reviews (day, plan_id, energy, fatigue, sleep_quality, soreness, mood, progress_feel, pain, note)
  values (d, (r->>'plan_id')::bigint, (r->>'energy')::smallint, (r->>'fatigue')::smallint, (r->>'sleep_quality')::smallint, (r->>'soreness')::smallint,
          (r->>'mood')::smallint, nullif(r->>'progress_feel',''), nullif(r->>'pain',''), nullif(r->>'note',''))
  on conflict (day) do update set plan_id = excluded.plan_id, energy = excluded.energy, fatigue = excluded.fatigue, sleep_quality = excluded.sleep_quality,
    soreness = excluded.soreness, mood = excluded.mood, progress_feel = excluded.progress_feel, pain = excluded.pain, note = excluded.note, updated_at = now();
end $$;

create or replace function public.hl_checkin_save(d date, r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.body_checkins (day, weight_kg, waist_cm, chest_cm, arm_cm, hip_cm, thigh_cm, body_fat_pct, note)
  values (d, (r->>'weight_kg')::numeric, (r->>'waist_cm')::numeric, (r->>'chest_cm')::numeric, (r->>'arm_cm')::numeric, (r->>'hip_cm')::numeric,
          (r->>'thigh_cm')::numeric, (r->>'body_fat_pct')::numeric, nullif(r->>'note',''))
  on conflict (day) do update set weight_kg = excluded.weight_kg, waist_cm = excluded.waist_cm, chest_cm = excluded.chest_cm, arm_cm = excluded.arm_cm,
    hip_cm = excluded.hip_cm, thigh_cm = excluded.thigh_cm, body_fat_pct = excluded.body_fat_pct, note = excluded.note, updated_at = now();
end $$;

create or replace function public.hl_review(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select to_jsonb(r) from health.workout_reviews r where r.day = d);
end $$;

-- Всё для экрана «Прогресс»: замеры, самочувствие, тренировки по неделям, e1RM по Эпли, названия, отчёты ИИ.
create or replace function public.hl_progress(weeks int default 26) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since date := current_date - (least(greatest(weeks, 1), 104) * 7);
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) order by c.day) from health.body_checkins c where c.day >= since), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r) order by r.day) from health.workout_reviews r where r.day >= since), '[]'),
    'weeks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week) from (
       select date_trunc('week', s.day)::date as week, count(distinct s.day) as workouts, count(*) as sets,
              round(sum(s.reps * coalesce(s.weight_kg, 0))) as volume_kg
       from health.workout_sets s where s.day >= since and s.reps > 0 group by 1) w), '[]'),
    'lifts', coalesce((select jsonb_object_agg(x.exercise_id, x.pts) from (
       select s.exercise_id, jsonb_agg(jsonb_build_object('day', s.day, 'e1rm', s.e1rm) order by s.day) pts
       from (select exercise_id, day, round(max(weight_kg * (1 + reps / 30.0)), 1) e1rm
             from health.workout_sets where day >= since and reps > 0 and weight_kg > 0 group by 1, 2) s
       group by 1) x), '{}'),
    'names', coalesce((select jsonb_object_agg(e.id, coalesce(e.name_ru, e.name)) from health.exercises e
       where e.id in (select distinct exercise_id from health.workout_sets where day >= since and reps > 0)), '{}'),
    'reports', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from health.ai_reports where kind <> 'chat' order by created_at desc limit 10) a), '[]'));
end $$;

create or replace function public.hl_ai_report_save(kind text, d date, model text, question text, answer text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.ai_reports (kind, day, model, question, answer) values (hl_ai_report_save.kind, d, hl_ai_report_save.model, hl_ai_report_save.question, hl_ai_report_save.answer)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.hl_ai_reports(k text, lim int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from (
    select * from health.ai_reports where (k is null or kind = k) order by created_at desc limit least(greatest(lim,1),100)) a), '[]');
end $$;

revoke all on function public.hl_review_save(date, jsonb), public.hl_checkin_save(date, jsonb), public.hl_review(date), public.hl_progress(int),
  public.hl_ai_report_save(text, date, text, text, text), public.hl_ai_reports(text, int) from public, anon;
grant execute on function public.hl_review_save(date, jsonb), public.hl_checkin_save(date, jsonb), public.hl_review(date), public.hl_progress(int),
  public.hl_ai_report_save(text, date, text, text, text), public.hl_ai_reports(text, int) to authenticated;
