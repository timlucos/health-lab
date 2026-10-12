-- Новые виды отчётов ИИ: совет на день и глубокий разбор здоровья. Редактирование цели.
alter table health.ai_reports drop constraint ai_reports_kind_check,
  add constraint ai_reports_kind_check check (kind in ('workout','weekly','chat','daily','health'));

create or replace function public.hl_goal_save(r jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  update health.goals g set
    title = coalesce(nullif(r->>'title',''), g.title),
    end_day = coalesce((r->>'end_day')::date, g.end_day),
    details = g.details || coalesce(r->'details', '{}'::jsonb)
  where g.id = (select id from health.goals where active order by created_at desc limit 1);
end $$;
revoke all on function public.hl_goal_save(jsonb) from public, anon;
grant execute on function public.hl_goal_save(jsonb) to authenticated;
