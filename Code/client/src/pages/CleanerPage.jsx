import { useEffect, useState } from "react";
import { apiFetch, socket } from "../api.js";

const CLEANING_TYPES = ["spill", "fallen_object"];

// Cleaner mobile view (book §4.4.2): chronological open cleaning tickets + "mark done",
// with live browser notifications when a new task arrives.
//
// Note: this is a FOREGROUND notification (Web Notifications API) shown while the page
// is open. Full offline push (Web Push API + service worker + VAPID keys) is a further
// hardening step; the in-app notification already covers the "alert the cleaner" goal
// while they have the view open.
export default function CleanerPage() {
  const [tickets, setTickets] = useState([]);
  const [notifyOn, setNotifyOn] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );

  const load = () =>
    apiFetch("/tickets?status=open")
      .then((all) => setTickets(all.filter((t) => CLEANING_TYPES.includes(t.type))))
      .catch(() => {});

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifyOn(perm === "granted");
  };

  useEffect(() => {
    load();
    const onNew = (ticket) => {
      load();
      if (
        CLEANING_TYPES.includes(ticket.type) &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("New cleaning task", {
          body: `${ticket.type.replace("_", " ")} in ${ticket.room_id}`,
        });
      }
    };
    socket.on("ticket:new", onNew);
    socket.on("ticket:update", load);
    return () => {
      socket.off("ticket:new", onNew);
      socket.off("ticket:update", load);
    };
  }, []);

  const resolve = (id) =>
    apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) }).then(load);

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Cleaning Tasks</h1>
        {!notifyOn && (
          <button
            onClick={enableNotifications}
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded"
          >
            🔔 Enable alerts
          </button>
        )}
      </div>
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
