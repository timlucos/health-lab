-- История упражнений, стоимость запросов к ИИ, дневник питания и база продуктов.

alter table health.ai_reports add column if not exists tokens_in integer,
  add column if not exists tokens_out integer, add column if not exists cost_rub numeric;
alter table health.ai_reports drop constraint ai_reports_kind_check,
  add constraint ai_reports_kind_check check (kind in ('workout','weekly','chat','daily','health','food'));

create table if not exists health.food_products (
  id bigint generated always as identity primary key,
  barcode text unique,
  name text not null, brand text,
  kcal numeric, protein numeric, fat numeric, carbs numeric, -- на 100 г
  portion_g numeric,
  source text not null default 'user' check (source in ('off','label','user','ai')),
  uses integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists health.food_log (
  id bigint generated always as identity primary key,
  day date not null,
  meal text not null default 'snack' check (meal in ('breakfast','lunch','dinner','snack')),
  name text not null, grams numeric not null,
  kcal numeric, protein numeric, fat numeric, carbs numeric, -- на порцию
  product_id bigint references health.food_products(id),
  source text not null default 'text' check (source in ('photo','text','barcode','label','product','manual')),
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists food_log_day on health.food_log (day);
alter table health.food_products enable row level security;
alter table health.food_log enable row level security;

create or replace function public.hl_exercise_history(ex_id text, lim integer default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.day desc) from (
    select s.day, jsonb_agg(jsonb_build_object('n', s.set_no, 'reps', s.reps, 'kg', s.weight_kg) order by s.set_no) as sets,
           max(s.weight_kg) as top_kg, round(max(s.weight_kg * (1 + s.reps / 30.0)), 1) as e1rm
    from health.workout_sets s where s.exercise_id = ex_id and s.reps > 0
    group by s.day order by s.day desc limit least(greatest(lim, 1), 100)) x), '[]');
end $$;

create or replace function public.hl_ai_log(kind text, d date, model text, question text, answer text, tokens_in integer, tokens_out integer, cost_rub numeric) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.ai_reports (kind, day, model, question, answer, tokens_in, tokens_out, cost_rub)
  values (hl_ai_log.kind, d, hl_ai_log.model, hl_ai_log.question, hl_ai_log.answer, hl_ai_log.tokens_in, hl_ai_log.tokens_out, hl_ai_log.cost_rub)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.hl_ai_spend() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'month_rub', coalesce(sum(cost_rub) filter (where created_at >= date_trunc('month', now())), 0),
    'month_n', count(*) filter (where created_at >= date_trunc('month', now())),
    'avg_rub', round(avg(cost_rub), 2))
    from health.ai_reports);
end $$;

create or replace function public.hl_food_product_get(code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select to_jsonb(p) from health.food_products p where p.barcode = code);
end $$;

create or replace function public.hl_food_product_save(r jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare row_ health.food_products;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(r->>'barcode','') is not null then
    insert into health.food_products (barcode, name, brand, kcal, protein, fat, carbs, portion_g, source)
    values (r->>'barcode', r->>'name', nullif(r->>'brand',''), (r->>'kcal')::numeric, (r->>'protein')::numeric, (r->>'fat')::numeric, (r->>'carbs')::numeric,
            (r->>'portion_g')::numeric, coalesce(nullif(r->>'source',''), 'user'))
    on conflict (barcode) do update set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein,
      fat = excluded.fat, carbs = excluded.carbs, portion_g = coalesce(excluded.portion_g, health.food_products.portion_g), source = excluded.source, updated_at = now()
    returning * into row_;
  else
    insert into health.food_products (name, brand, kcal, protein, fat, carbs, portion_g, source)
    values (r->>'name', nullif(r->>'brand',''), (r->>'kcal')::numeric, (r->>'protein')::numeric, (r->>'fat')::numeric, (r->>'carbs')::numeric,
            (r->>'portion_g')::numeric, coalesce(nullif(r->>'source',''), 'user'))
    returning * into row_;
  end if;
  return to_jsonb(row_);
end $$;

create or replace function public.hl_food_products(q text, lim integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.uses desc, p.updated_at desc) from (
    select * from health.food_products where q is null or q = '' or name ilike '%' || q || '%' or brand ilike '%' || q || '%'
    order by uses desc, updated_at desc limit least(greatest(lim,1),100)) p), '[]');
end $$;

create or replace function public.hl_food_add(d date, meal text, items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into health.food_log (day, meal, name, grams, kcal, protein, fat, carbs, product_id, source)
    values (d, coalesce(nullif(meal,''), 'snack'), it->>'name', (it->>'grams')::numeric, (it->>'kcal')::numeric, (it->>'protein')::numeric,
            (it->>'fat')::numeric, (it->>'carbs')::numeric, (it->>'product_id')::bigint, coalesce(nullif(it->>'source',''), 'text'));
    if (it->>'product_id') is not null then
      update health.food_products set uses = uses + 1 where id = (it->>'product_id')::bigint;
    end if;
  end loop;
end $$;

create or replace function public.hl_food_remove(entry_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.food_log set removed = true where id = entry_id;
end $$;

create or replace function public.hl_food_day(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'entries', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from health.food_log f where f.day = d and not f.removed), '[]'),
    'week', coalesce((select jsonb_agg(to_jsonb(w) order by w.day) from (
       select day, round(sum(kcal)) kcal, round(sum(protein)) protein, round(sum(fat)) fat, round(sum(carbs)) carbs
       from health.food_log where day between d - 6 and d and not removed group by day) w), '[]'),
    'recent', coalesce((select jsonb_agg(to_jsonb(x)) from (
       select distinct on (lower(name)) name, grams, kcal, protein, fat, carbs, product_id
       from health.food_log where not removed and day >= d - 30 order by lower(name), created_at desc limit 20) x), '[]'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['hl_exercise_history(text,integer)','hl_ai_log(text,date,text,text,text,integer,integer,numeric)','hl_ai_spend()',
    'hl_food_product_get(text)','hl_food_product_save(jsonb)','hl_food_products(text,integer)','hl_food_add(date,text,jsonb)',
    'hl_food_remove(bigint)','hl_food_day(date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
