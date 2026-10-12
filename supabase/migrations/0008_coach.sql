-- Этап 3, основа тренера: база упражнений, зал, цели, планы, подходы и итоги.
-- Всё в закрытой схеме health; приложение читает и пишет через функции владельца.

-- Каталог упражнений (открытая база free-exercise-db, public domain; 2 картинки на упражнение: старт и финиш).
create table if not exists health.exercises (
  id text primary key,
  name text not null,
  name_ru text,
  category text,                -- strength, stretching, cardio, plyometrics…
  level text,                   -- beginner, intermediate, expert
  force text,                   -- push, pull, static
  mechanic text,                -- compound, isolation
  equipment text,               -- barbell, dumbbell, machine, cable, body only…
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  instructions text[] not null default '{}',
  instructions_ru text[],
  images text[] not null default '{}',  -- полные URL картинок
  source text not null default 'free-exercise-db',
  updated_at timestamptz not null default now()
);
create index if not exists exercises_equipment_idx on health.exercises (equipment);
create index if not exists exercises_muscles_idx on health.exercises using gin (primary_muscles);

-- Тренажёры и снаряды в зале владельца (распознаются по фото на этапе 3).
create table if not exists health.gym_equipment (
  id bigint generated always as identity primary key,
  name text not null,
  kind text,                              -- соответствует exercises.equipment
  photo_path text,                        -- путь в бакете gym-photos
  notes text,
  exercise_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Цели. Активная одна; details хранит вводные (опыт, частота, ограничения).
create table if not exists health.goals (
  id bigint generated always as identity primary key,
  title text not null,
  start_day date not null default current_date,
  end_day date,
  details jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- План на день: тренер составляет утром с учётом готовности и нагрузки.
create table if not exists health.workout_plans (
  id bigint generated always as identity primary key,
  day date not null,
  title text not null,
  focus text,                        -- ноги, спина и бицепс, кардио…
  readiness numeric,
  acwr numeric,
  plan jsonb not null default '[]',  -- [{exercise_id, sets, reps, weight_kg, rest_s, note}]
  rationale text,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'skipped')),
  created_by text not null default 'coach',
  created_at timestamptz not null default now(),
  unique (day, title)
);

-- Фактически выполненные подходы.
create table if not exists health.workout_sets (
  id bigint generated always as identity primary key,
  plan_id bigint references health.workout_plans (id) on delete set null,
  day date not null,
  exercise_id text references health.exercises (id),
  set_no int not null,
  reps int,
  weight_kg numeric,
  duration_s int,
  rpe numeric check (rpe between 1 and 10),
  done_at timestamptz not null default now()
);
create index if not exists workout_sets_day_idx on health.workout_sets (day);
create index if not exists workout_sets_ex_idx on health.workout_sets (exercise_id, day);

-- Итоги тренера: ежедневные и недельные.
create table if not exists health.coach_reviews (
  id bigint generated always as identity primary key,
  period text not null check (period in ('day', 'week')),
  start_day date not null,
  summary text not null,
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (period, start_day)
);

alter table health.exercises enable row level security;
alter table health.gym_equipment enable row level security;
alter table health.goals enable row level security;
alter table health.workout_plans enable row level security;
alter table health.workout_sets enable row level security;
alter table health.coach_reviews enable row level security;

-- Приватный бакет для фото зала и еды.
insert into storage.buckets (id, name, public) values ('gym-photos', 'gym-photos', false)
on conflict (id) do nothing;

-- Цель из ответов владельца 11.10.2026.
insert into health.goals (title, start_day, end_day, details)
select 'Мышечная масса и выносливость', date '2026-10-12', date '2027-04-12',
       jsonb_build_object('place', 'gym', 'experience', 'intermediate', 'focus', jsonb_build_array('hypertrophy', 'endurance'))
where not exists (select 1 from health.goals);
