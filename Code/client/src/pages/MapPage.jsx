import { useEffect, useState } from "react";
import { apiFetch, socket } from "../api.js";

// Colours from book §4.4.1: green=occupied, grey=empty, blue=empty+off, red=alert.
const STATUS_STYLE = {
  OCCUPIED: "bg-green-100 border-green-500",
  RECENTLY_EMPTY: "bg-slate-100 border-slate-300",
  EMPTY_POWER_OFF: "bg-blue-100 border-blue-500",
  ALERT_ACTIVE: "bg-red-100 border-red-500 animate-pulse",
  unknown: "bg-white border-slate-200",
};

export default function MapPage() {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    apiFetch("/rooms").then(setRooms).catch(() => {});
    const onUpdate = (room) =>
      setRooms((prev) => prev.map((r) => (r.id === room.id ? room : r)));
    socket.on("room:update", onUpdate);
    return () => socket.off("room:update", onUpdate);
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Campus Overview</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {rooms.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border-2 p-5 ${STATUS_STYLE[r.status] || STATUS_STYLE.unknown}`}
          >
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-slate-500 uppercase">{r.building}</div>
            <div className="mt-3 text-sm">
              👤 {r.occupancy} · {r.systems_on ? "Systems ON" : "Saving Mode"}
            </div>
            <div className="mt-1 text-xs text-slate-500">{r.status}</div>
          </div>
        ))}
        {rooms.length === 0 && (
          <p className="text-slate-500">No rooms yet — log in and start the edge unit.</p>
        )}
      </div>
    </div>
  );
}
