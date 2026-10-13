"use client";

import { Card } from "./ui";
import { useDevices } from "@/lib/data";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 60 ? `${Math.max(1, m)} мин назад` : m < 48 * 60 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн. назад`;
};

/** Заряд часов: процент, когда синхронизировались и на сколько примерно хватит. Обновляется раз в час. */
export function BatteryCard() {
  const dev = useDevices();
  const d = dev.data?.list.find((x) => x.type !== "SCALE") ?? dev.data?.list[0];
  if (!d || d.battery == null) return null;
  const rate = dev.data?.drain_per_hour;
  const hours = rate && rate > 0 ? Math.floor(d.battery / rate) : null;
  const low = d.battery <= 25 || d.status === "Low" || d.status === "Empty";
  const color = d.battery <= 15 ? "bad" : low ? "warn" : "ok";
  return (
    <Card title="Заряд часов" color={color} right={<span className="muted small">{d.name}</span>}>
      <div className="row-between">
        <div className="val m" style={{ color: `var(--${color})` }}>{d.battery}<small>%</small></div>
        <div className="battery" aria-hidden><i style={{ width: `${d.battery}%`, background: `var(--${color})` }} /></div>
      </div>
      <p className="note">
        {low ? "Поставьте на зарядку сегодня, чтобы не потерять ночной сон и пульс. " : ""}
        {hours != null ? `Хватит примерно на ${hours >= 48 ? `${Math.round(hours / 24)} дн.` : `${hours} ч`}. ` : ""}
        {d.last_sync ? `Синхронизация ${ago(d.last_sync)}.` : ""}
      </p>
    </Card>
  );
}
