-- Вкладка «Еда» (просьба 13.10): база рецептов с подбором по продуктам дома, напитки и вода, разбор привычек питания.
alter table health.ai_reports drop constraint ai_reports_kind_check,
  add constraint ai_reports_kind_check check (kind in ('workout','weekly','chat','daily','health','food','mealplan','nutrition'));
alter table health.food_log drop constraint food_log_source_check,
  add constraint food_log_source_check check (source in ('photo','text','barcode','label','product','manual','plan','recipe'));

create table if not exists health.recipes (
  slug text primary key,
  name text not null,
  emoji text,
  meals text[] not null default '{}',
  time_min int,
  servings int not null default 1,
  portion_g int,
  kcal numeric, protein numeric, fat numeric, carbs numeric,
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  tags text[] not null default '{}',
  tip text,
  fav boolean not null default false,
  cooked int not null default 0,
  created_at timestamptz not null default now()
);
alter table health.recipes enable row level security;

create table if not exists health.drinks (
  id bigint generated always as identity primary key,
  day date not null,
  kind text not null check (kind in ('water','coffee','tea','protein','juice','soda','milk','alcohol','other')),
  ml int not null check (ml > 0 and ml <= 3000),
  kcal numeric not null default 0,
  removed boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists drinks_day on health.drinks (day);
alter table health.drinks enable row level security;

create or replace function public.hl_recipes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) - 'created_at' order by r.fav desc, r.cooked desc, r.name) from health.recipes r), '[]');
end $$;

create or replace function public.hl_recipe_mark(s text, fav_ boolean default null, cooked_ boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.recipes set fav = coalesce(fav_, fav), cooked = cooked + case when cooked_ then 1 else 0 end where slug = s;
end $$;

-- Напитки за день и вода по дням за неделю.
create or replace function public.hl_drinks(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'list', coalesce((select jsonb_agg(to_jsonb(x) order by x.at) from health.drinks x where x.day = d and not x.removed), '[]'),
    'week', coalesce((select jsonb_agg(w order by w.day) from (
      select day, sum(ml) filter (where kind in ('water','tea')) as water_ml, sum(ml) as total_ml,
             count(*) filter (where kind = 'coffee') as coffee, round(sum(kcal)) as kcal
      from health.drinks where day > d - 7 and day <= d and not removed group by day) w), '[]'));
end $$;

create or replace function public.hl_drink_add(d date, k text, ml_ int, kcal_ numeric default 0) returns bigint
language plpgsql security definer set search_path = '' as $$
declare i bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.drinks (day, kind, ml, kcal) values (d, k, ml_, coalesce(kcal_, 0)) returning id into i;
  return i;
end $$;

create or replace function public.hl_drink_remove(i bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.drinks set removed = true where id = i;
end $$;

-- Что и когда он обычно ест и пьёт: для разбора привычек (без имён и почты — только еда и время).
create or replace function public.hl_food_habits(days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d0 date := (now() at time zone 'Europe/Moscow')::date - least(greatest(days, 3), 60);
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'days_logged', (select count(distinct day) from health.food_log where not removed and day > d0),
    'per_day', coalesce((select jsonb_agg(x order by x.day) from (
      select day, round(sum(kcal)) kcal, round(sum(protein)) p, round(sum(fat)) f, round(sum(carbs)) c, count(*) n,
             to_char(min(created_at at time zone 'Europe/Moscow'), 'HH24:MI') first_at, to_char(max(created_at at time zone 'Europe/Moscow'), 'HH24:MI') last_at
      from health.food_log where not removed and day > d0 group by day) x), '[]'),
    'top', coalesce((select jsonb_agg(x) from (
      select name, count(*) times, round(avg(grams)) g, round(avg(kcal)) kcal, round(avg(protein)) p, string_agg(distinct meal, ',') meals
      from health.food_log where not removed and day > d0 group by name order by count(*) desc, sum(kcal) desc limit 25) x), '[]'),
    'by_meal', coalesce((select jsonb_object_agg(meal, k) from (
      select meal, round(sum(kcal) / greatest(count(distinct day), 1)) k from health.food_log where not removed and day > d0 group by meal) x), '{}'),
    'drinks', coalesce((select jsonb_agg(x) from (
      select kind, count(*) times, round(sum(ml)::numeric / greatest(count(distinct day), 1)) ml_per_day, count(distinct day) days
      from health.drinks where day > d0 and not removed group by kind) x), '[]'));
end $$;

revoke all on function public.hl_recipes(), public.hl_recipe_mark(text, boolean, boolean), public.hl_drinks(date),
  public.hl_drink_add(date, text, int, numeric), public.hl_drink_remove(bigint), public.hl_food_habits(int) from public, anon;
grant execute on function public.hl_recipes(), public.hl_recipe_mark(text, boolean, boolean), public.hl_drinks(date),
  public.hl_drink_add(date, text, int, numeric), public.hl_drink_remove(bigint), public.hl_food_habits(int) to authenticated, service_role;
