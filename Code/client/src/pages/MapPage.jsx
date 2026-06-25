import { useEffect, useMemo, useState } from "react";
import { apiFetch, socket } from "../api.js";
import { buildingLabel, statusInfo } from "../labels.js";
import { UsersIcon, BoltIcon, AlertIcon, PowerIcon } from "../icons.jsx";

// Status pill colours (book §4.4.1). Tone -> tailwind classes, dark-mode aware.
const TONE = {
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  blue:  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  red:   "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
};
const CARD_ACCENT = {
  green: "border-l-green-500",
  amber: "border-l-amber-500",
  blue:  "border-l-blue-500",
  red:   "border-l-red-500 ring-1 ring-red-300 dark:ring-red-500/40",
  slate: "border-l-slate-300 dark:border-l-slate-700",
};

function StatusPill({ status }) {
  const { label, tone } = statusInfo(status);
  // Pulse only the pill for alerts (drawing the eye) — never the whole card, which
  // would also fade the room's text.
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TONE[tone]} ${
      tone === "red" ? "animate-pulse" : ""
    }`}>{label}</span>
  );
}

function RoomCard({ r }) {
  const { tone } = statusInfo(r.status);
  return (
    <div className={`card border-l-4 ${CARD_ACCENT[tone]} p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{r.name}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{buildingLabel(r.building)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusPill status={r.status} />
          {r.is_whitelisted && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Always on</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <UsersIcon size={16} /> {r.occupancy}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {r.systems_on ? <BoltIcon size={16} /> : <PowerIcon size={16} />}
          {r.systems_on ? "Power on" : "Saving"}
        </span>
      </div>
    </div>
  );
}

export default function MapPage() {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    apiFetch("/rooms").then(setRooms).catch(() => {});
    const onUpdate = (room) =>
      setRooms((prev) => {
        const exists = prev.some((r) => r.id === room.id);
        return exists ? prev.map((r) => (r.id === room.id ? room : r)) : [...prev, room];
      });
    socket.on("room:update", onUpdate);
    return () => socket.off("room:update", onUpdate);
  }, []);

  // Group rooms by building for a tidier overview.
  const byBuilding = useMemo(() => {
    const groups = {};
    for (const r of rooms) (groups[r.building] ||= []).push(r);
    return Object.entries(groups);
  }, [rooms]);

  const alerts = rooms.filter((r) => r.status === "ALERT_ACTIVE").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-2xl font-bold">Campus Overview</h2>
        {alerts > 0 && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
            <AlertIcon size={18} /> {alerts} room{alerts > 1 ? "s" : ""} need{alerts > 1 ? "" : "s"} attention
          </span>
        )}
      </div>

      {rooms.length === 0 && (
        <p className="text-slate-500">No rooms yet — run the seeder or start an edge unit.</p>
      )}

      {byBuilding.map(([building, list]) => (
        <section key={building} className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
            {buildingLabel(building)}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {list.map((r) => <RoomCard key={r.id} r={r} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
