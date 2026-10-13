-- Владелец определяется по id учётной записи, а не только по почте: база входа общая с другим приложением,
-- и чужая учётка с такой же почтой (или сменившая почту) не получит доступ.
insert into health.sync_state (key, value)
select 'owner_uid', to_jsonb(u.id::text) from auth.users u
where lower(u.email) = lower((select value #>> '{}' from health.sync_state where key = 'owner_email'))
on conflict (key) do update set value = excluded.value;

create or replace function health.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or coalesce(
    auth.uid()::text = (select value #>> '{}' from health.sync_state where key = 'owner_uid')
    and lower(auth.jwt() ->> 'email') = lower((select value #>> '{}' from health.sync_state where key = 'owner_email')),
    false)
$$;
