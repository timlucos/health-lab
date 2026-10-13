// Заряд и последняя синхронизация часов из Google Health (pairedDevices, область settings.readonly — уже выдана при входе).
// Зовёт pg_cron раз в час с x-health-key; результат кладём в health.sync_state['devices'], приложение читает через hl_devices().
// Токен доступа обновляет функция google-health (она работает каждую минуту), здесь только читаем его на сервере.
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const [k] = await sql`select value #>> '{}' as v from health.sync_state where key = 'admin_key'`;
  if (!k?.v || req.headers.get("x-health-key") !== k.v) return json({ error: "forbidden" }, 403);
  try {
    const [t] = await sql`select access_token from health.oauth_tokens where provider = 'google_health'`;
    if (!t) return json({ error: "not_connected" }, 409);
    const r = await fetch("https://health.googleapis.com/v4/users/me/pairedDevices?pageSize=20", { headers: { Authorization: `Bearer ${t.access_token}` } });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      await sql`insert into health.sync_state (key, value) values ('devices_error', ${sql.json({ status: r.status, at: new Date().toISOString(), msg: String(body?.error?.message ?? "").slice(0, 200) })})
                on conflict (key) do update set value = excluded.value, updated_at = now()`;
      return json({ error: "api", status: r.status }, 502);
    }
    // Адрес MAC не храним: для приложения он не нужен.
    const list = (body?.pairedDevices ?? []).map((d: Record<string, unknown>) => ({
      name: d.deviceVersion ?? "Часы", type: d.deviceType, battery: d.batteryLevel ?? null, status: d.batteryStatus ?? null, last_sync: d.lastSyncTime ?? null,
    }));
    await sql`insert into health.sync_state (key, value) values ('devices', ${sql.json({ list, checked_at: new Date().toISOString() })})
              on conflict (key) do update set value = excluded.value, updated_at = now()`;
    // История заряда: по ней приложение считает, на сколько часов хватит.
    for (const d of list) if (typeof d.battery === "number") await sql`insert into health.battery_log (device, level) values (${String(d.name)}, ${d.battery})`;
    return json({ devices: list.length });
  } catch (e) {
    return json({ error: "server", detail: String(e).slice(0, 200) }, 500);
  }
});
