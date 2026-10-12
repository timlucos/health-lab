-- Без удаления строк: снаряд выключается флагом active, старый план дня помечается skipped,
-- отмена подхода записывает reps = 0 (такие подходы не показываются и не считаются).

create or replace function public.hl_gym_toggle(k text, on_ boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if on_ then
    update health.gym_equipment set active = true where kind = k and photo_path is null;
    if not found then insert into health.gym_equipment (name, kind) values (k, k); end if;
  else
    update health.gym_equipment set active = false where kind = k and photo_path is null;
  end if;
end $$;

create or replace function public.hl_plan_save(d date, title text, focus text, readiness numeric, acwr numeric, plan jsonb, rationale text)
returns bigint language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.workout_plans p set status = 'skipped'
   where p.day = d and p.title <> hl_plan_save.title
     and not exists (select 1 from health.workout_sets s where s.plan_id = p.id);
  insert into health.workout_plans (day, title, focus, readiness, acwr, plan, rationale)
  values (d, hl_plan_save.title, hl_plan_save.focus, hl_plan_save.readiness, hl_plan_save.acwr, hl_plan_save.plan, hl_plan_save.rationale)
  on conflict (day, title) do update set focus = excluded.focus, plan = excluded.plan, rationale = excluded.rationale,
    readiness = excluded.readiness, acwr = excluded.acwr, status = 'planned', created_at = now()
  returning id into new_id;
  return new_id;
end $$;

-- hl_plan и hl_workouts: пропускают skipped-планы и подходы с reps = 0 (тело как в базе, см. 0010 с этими фильтрами).
revoke all on function public.hl_gym_toggle(text, boolean), public.hl_plan_save(date, text, text, numeric, numeric, jsonb, text) from public, anon;
grant execute on function public.hl_gym_toggle(text, boolean), public.hl_plan_save(date, text, text, numeric, numeric, jsonb, text) to authenticated;
