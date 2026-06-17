import { useEffect, useState } from "react";
import { apiFetch, socket } from "../api.js";

// Cleaner mobile view (book §4.4.2): chronological open cleaning tickets + "mark done".
// Push notifications via the Web Push API are a Sprint-2 enhancement.
export default function CleanerPage() {
  const [tickets, setTickets] = useState([]);

  const load = () =>
    apiFetch("/tickets?status=open")
      .then((all) => setTickets(all.filter((t) => ["spill", "fallen_object"].includes(t.type))))
      .catch(() => {});

  useEffect(() => {
    load();
    socket.on("ticket:new", load);
    socket.on("ticket:update", load);
    return () => {
      socket.off("ticket:new", load);
      socket.off("ticket:update", load);
    };
  }, []);

  const resolve = (id) =>
    apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) }).then(load);

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Cleaning Tasks</h1>
      {tickets.length === 0 && <p className="text-slate-500">No open tasks 🎉</p>}
      {tickets.map((t) => (
        <div key={t.id} className="bg-white rounded-lg shadow p-4 mb-3 border-l-4 border-red-500">
          <div className="font-semibold capitalize">{t.type.replace("_", " ")}</div>
          <div className="text-sm text-slate-600">{t.room_id}</div>
          <button
            onClick={() => resolve(t.id)}
            className="mt-3 w-full bg-green-600 text-white py-2 rounded font-medium"
          >
            Mark as done
          </button>
        </div>
      ))}
    </div>
  );
}
