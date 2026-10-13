-- Быстрые блюда из мест, где владелец ест каждый день (кофейня Дринкит, просьба 13.10): запись в дневник в одно касание.
create table if not exists health.food_presets (
  id bigint generated always as identity primary key,
  place text not null default 'Дринкит',
  name text not null,
  grams numeric,
  kcal numeric, protein numeric, fat numeric, carbs numeric,
  estimate boolean not null default true,
  sort int not null default 0,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table health.food_presets enable row level security;

insert into health.food_presets (place, name, grams, kcal, protein, fat, carbs, estimate, sort)
select 'Дринкит', 'Сырники, 3 шт', 165, 365, 23, 17, 31, true, 1
where not exists (select 1 from health.food_presets);

create or replace function public.hl_presets() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) - 'removed' - 'created_at' order by p.place, p.sort, p.id) from health.food_presets p where not p.removed), '[]');
end $$;

create or replace function public.hl_preset_save(r jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare i bigint := nullif(r->>'id', '')::bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if i is null then
    insert into health.food_presets (place, name, grams, kcal, protein, fat, carbs, estimate, sort)
    values (coalesce(nullif(r->>'place', ''), 'Дринкит'), coalesce(nullif(r->>'name', ''), 'Блюдо'), (r->>'grams')::numeric, (r->>'kcal')::numeric,
            (r->>'protein')::numeric, (r->>'fat')::numeric, (r->>'carbs')::numeric, coalesce((r->>'estimate')::boolean, false),
            coalesce((select max(sort) + 1 from health.food_presets), 1))
    returning id into i;
  else
    update health.food_presets set place = coalesce(nullif(r->>'place', ''), place), name = coalesce(nullif(r->>'name', ''), name),
      grams = (r->>'grams')::numeric, kcal = (r->>'kcal')::numeric, protein = (r->>'protein')::numeric, fat = (r->>'fat')::numeric,
      carbs = (r->>'carbs')::numeric, estimate = coalesce((r->>'estimate')::boolean, false)
    where id = i;
  end if;
  return i;
end $$;

create or replace function public.hl_preset_remove(i bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.food_presets set removed = true where id = i;
end $$;

alter table health.food_log drop constraint food_log_source_check,
  add constraint food_log_source_check check (source in ('photo','text','barcode','label','product','manual','plan','recipe','preset'));

revoke all on function public.hl_presets(), public.hl_preset_save(jsonb), public.hl_preset_remove(bigint) from public, anon;
grant execute on function public.hl_presets(), public.hl_preset_save(jsonb), public.hl_preset_remove(bigint) to authenticated, service_role;
