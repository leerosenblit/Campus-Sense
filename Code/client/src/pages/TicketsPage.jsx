import { useEffect, useState } from "react";
import { apiFetch, socket } from "../api.js";

const COLUMNS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

// Kanban board (book §4.4.1, §5.4.2). Drag-and-drop (react-beautiful-dnd) is a
// Sprint-2 enhancement; this skeleton uses status buttons to move cards.
export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);

  const load = () => apiFetch("/tickets").then(setTickets).catch(() => {});
  useEffect(() => {
    load();
    const onChange = () => load();
    socket.on("ticket:new", onChange);
    socket.on("ticket:update", onChange);
    return () => {
      socket.off("ticket:new", onChange);
      socket.off("ticket:update", onChange);
    };
  }, []);

  const move = (id, status) =>
    apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(load);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Maintenance Tickets</h2>
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="bg-slate-50 rounded-lg p-3">
            <h3 className="font-semibold mb-3">{col.label}</h3>
            {tickets
              .filter((t) => t.status === col.key)
              .map((t) => (
                <div key={t.id} className="bg-white rounded shadow p-3 mb-2 text-sm">
                  <div className="font-medium">
                    {t.type} · {t.room_id}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t.source}{t.confidence ? ` (${Math.round(t.confidence * 100)}%)` : ""}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                      <button
                        key={c.key}
                        onClick={() => move(t.id, c.key)}
                        className="text-xs px-2 py-1 bg-slate-200 rounded hover:bg-slate-300"
                      >
                        → {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
