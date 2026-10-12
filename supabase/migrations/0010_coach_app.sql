-- Тренер в приложении: мой зал (снаряды и фото), план дня, журнал подходов.
-- Всё через функции владельца; генерацию плана делает Edge Function coach.

create or replace function public.hl_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$ select health.is_owner() $$;
revoke all on function public.hl_is_owner() from public, anon;
grant execute on function public.hl_is_owner() to authenticated;

-- Фото зала: приватный бакет, доступ только владельцу.
drop policy if exists "gym photos owner read" on storage.objects;
drop policy if exists "gym photos owner write" on storage.objects;
drop policy if exists "gym photos owner delete" on storage.objects;
create policy "gym photos owner read" on storage.objects for select to authenticated
  using (bucket_id = 'gym-photos' and public.hl_is_owner());
create policy "gym photos owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'gym-photos' and public.hl_is_owner());
create policy "gym photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gym-photos' and public.hl_is_owner());

-- Один подход одного упражнения в день записывается один раз (повторная запись обновляет).
create unique index if not exists workout_sets_uniq on health.workout_sets (day, exercise_id, set_no);

-- ---------- мой зал ----------

create or replace function public.hl_gym() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'kinds', coalesce((select jsonb_agg(distinct kind) from health.gym_equipment where active and kind is not null), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from health.gym_equipment g where g.active), '[]'));
end $$;

-- Включить или выключить тип снаряда (штанга, гантели, блок…) без фото.
create or replace function public.hl_gym_toggle(k text, on_ boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  if on_ then
    insert into health.gym_equipment (name, kind)
    select k, k where not exists (select 1 from health.gym_equipment where kind = k and photo_path is null and active);
  else
    delete from health.gym_equipment where kind = k and photo_path is null;
  end if;
end $$;

create or replace function public.hl_gym_add_photo(path text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.gym_equipment (name, photo_path, notes) values ('Фото зала', path, 'ждёт распознавания')
  returning id into new_id;
  return new_id;
end $$;


-- ---------- план и подходы ----------

-- План на день с карточками упражнений и уже записанными подходами.
create or replace function public.hl_plan(d date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p health.workout_plans;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from health.workout_plans where day = d order by created_at desc limit 1;
  return jsonb_build_object(
    'plan', case when p.id is null then null else to_jsonb(p) end,
    'exercises', coalesce((
      select jsonb_object_agg(e.id, jsonb_build_object('name', e.name, 'name_ru', e.name_ru, 'images', e.images, 'equipment', e.equipment, 'primary_muscles', e.primary_muscles))
      from health.exercises e
      where p.id is not null and e.id in (select x->>'exercise_id' from jsonb_array_elements(p.plan) x)), '{}'),
    'sets', coalesce((select jsonb_agg(to_jsonb(s) order by s.exercise_id, s.set_no) from health.workout_sets s where s.day = d), '[]'),
    'last', coalesce((
      -- последний раз, когда делали эти упражнения: для подсказки веса
      select jsonb_object_agg(x.exercise_id, x.info) from (
        select distinct on (s.exercise_id) s.exercise_id,
               jsonb_build_object('day', s.day, 'weight_kg', max(s.weight_kg) over (partition by s.exercise_id, s.day), 'reps', s.reps) info
        from health.workout_sets s
        where s.day < d and p.id is not null and s.exercise_id in (select x->>'exercise_id' from jsonb_array_elements(p.plan) x)
        order by s.exercise_id, s.day desc) x), '{}'));
end $$;

create or replace function public.hl_set_log(plan_id bigint, d date, ex_id text, set_no int, reps int, weight_kg numeric, rpe numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into health.workout_sets (plan_id, day, exercise_id, set_no, reps, weight_kg, rpe)
  values (plan_id, d, ex_id, set_no, reps, weight_kg, rpe)
  on conflict (day, exercise_id, set_no) do update
    set reps = excluded.reps, weight_kg = excluded.weight_kg, rpe = excluded.rpe, done_at = now();
  update health.workout_plans set status = 'in_progress' where id = plan_id and status = 'planned';
end $$;


create or replace function public.hl_plan_status(plan_id bigint, st text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.workout_plans set status = st where id = plan_id;
end $$;

-- История тренировок: дни, фокус, объём (кг × повторы).
create or replace function public.hl_workouts(lim int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.day desc) from (
    select p.day, p.id, p.title, p.focus, p.status, p.readiness,
           (select count(*) from health.workout_sets s where s.day = p.day) as sets,
           (select coalesce(sum(s.reps * coalesce(s.weight_kg, 0)), 0) from health.workout_sets s where s.day = p.day) as volume_kg
    from health.workout_plans p order by p.day desc limit least(greatest(lim, 1), 365)) x), '[]');
end $$;


-- Сохранить план дня, собранный в приложении. Заменяет прошлый план этого дня, если по нему ещё нет подходов.
create or replace function public.hl_plan_save(d date, title text, focus text, readiness numeric, acwr numeric, plan jsonb, rationale text)
returns bigint language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare new_id bigint;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from health.workout_plans p where p.day = d
    and not exists (select 1 from health.workout_sets s where s.plan_id = p.id);
  insert into health.workout_plans (day, title, focus, readiness, acwr, plan, rationale)
  values (d, hl_plan_save.title, hl_plan_save.focus, hl_plan_save.readiness, hl_plan_save.acwr, hl_plan_save.plan, hl_plan_save.rationale)
  on conflict (day, title) do update set focus = excluded.focus, plan = excluded.plan, rationale = excluded.rationale,
    readiness = excluded.readiness, acwr = excluded.acwr
  returning id into new_id;
  return new_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.hl_gym()', 'public.hl_gym_toggle(text, boolean)', 'public.hl_gym_add_photo(text)',
    'public.hl_plan(date)', 'public.hl_set_log(bigint, date, text, int, int, numeric, numeric)',
    'public.hl_plan_status(bigint, text)', 'public.hl_workouts(int)',
    'public.hl_plan_save(date, text, text, numeric, numeric, jsonb, text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
