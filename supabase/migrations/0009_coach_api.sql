-- Чтение каталога упражнений и цели из приложения (только владелец).

create or replace function public.hl_exercises(q text default null, muscle text default null, equip text default null, lim int default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x)) from (
      select id, name, name_ru, category, level, force, mechanic, equipment, primary_muscles, secondary_muscles, images
      from health.exercises e
      where (q is null or q = '' or e.name ilike '%' || q || '%' or e.name_ru ilike '%' || q || '%')
        and (muscle is null or muscle = '' or muscle = any (e.primary_muscles))
        and (equip is null or equip = '' or e.equipment = equip)
      order by (e.category = 'strength') desc, (e.mechanic = 'compound') desc, coalesce(e.name_ru, e.name)
      limit least(greatest(lim, 1), 300)) x), '[]');
end $$;

create or replace function public.hl_exercise(ex_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select to_jsonb(e) from health.exercises e where e.id = ex_id);
end $$;

create or replace function public.hl_goal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select to_jsonb(g) from health.goals g where g.active order by g.created_at desc limit 1);
end $$;

revoke all on function public.hl_exercises(text, text, text, int) from public, anon;
revoke all on function public.hl_exercise(text) from public, anon;
revoke all on function public.hl_goal() from public, anon;
grant execute on function public.hl_exercises(text, text, text, int) to authenticated;
grant execute on function public.hl_exercise(text) to authenticated;
grant execute on function public.hl_goal() to authenticated;
