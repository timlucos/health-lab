-- Заряд часов: функция devices раз в час читает Google Health pairedDevices, пишет в sync_state['devices'] и историю.
create table if not exists health.battery_log (
  id bigint generated always as identity primary key,
  device text not null,
  level int not null,
  at timestamptz not null default now()
);
create index if not exists battery_log_at on health.battery_log (at desc);
alter table health.battery_log enable row level security;

-- Заряд, время синхронизации и прогноз: скорость разряда по замерам после последней зарядки (уровень рос — значит заряжали).
create or replace function public.hl_devices() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  dev jsonb := (select value from health.sync_state where key = 'devices');
  since timestamptz;
  rate numeric;
begin
  if not health.is_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(max(b.at), now() - interval '7 days') into since from health.battery_log b
  where b.level > coalesce((select p.level from health.battery_log p where p.device = b.device and p.at < b.at order by p.at desc limit 1), 999);
  select case when extract(epoch from max(at) - min(at)) > 3 * 3600 and max(level) > min(level)
              then (max(level) - min(level))::numeric / (extract(epoch from max(at) - min(at)) / 3600) end
    into rate from health.battery_log where at >= since;
  return jsonb_build_object('list', coalesce(dev->'list', '[]'), 'checked_at', dev->'checked_at', 'drain_per_hour', round(rate, 2));
end $$;
revoke all on function public.hl_devices() from public, anon;
grant execute on function public.hl_devices() to authenticated;

select cron.schedule('health-devices', '12 * * * *', $cron$
  select net.http_post(url := 'https://yfdaldpzbfyzoancmywn.supabase.co/functions/v1/devices',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-health-key', (select value #>> '{}' from health.sync_state where key = 'admin_key')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cron$);
