import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, socket, logout } from "../api.js";
import { buildingLabel, ticketTypeLabel, statusInfo, timeAgo } from "../labels.js";
import {
  BellIcon, CheckIcon, CheckCircleIcon, SparkleIcon, ClipboardIcon,
  TICKET_ICON, DotsIcon, LogOutIcon, AlertIcon,
} from "../icons.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

const CLEANING_TYPES = ["spill", "lost_item"];

// Standard per-room cleaning checklist. Completion is stored locally per day, so it
// naturally resets each morning. (No backend table needed for the prototype.)
const CHECKLIST = [
  { key: "floor", label: "Floors swept & mopped" },
  { key: "desks", label: "Desks & chairs wiped" },
  { key: "board", label: "Whiteboard cleaned" },
  { key: "trash", label: "Trash emptied" },
  { key: "sanitize", label: "Surfaces sanitized" },
];

const todayKey = () => "cs-cleaning-" + new Date().toISOString().slice(0, 10);
const loadChecks = () => {
  try { return JSON.parse(localStorage.getItem(todayKey())) || {}; } catch { return {}; }
};

// ---- status pill (compact) ----
const TONE = {
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  blue:  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  red:   "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
};

function TasksTab({ tickets, rooms, resolve, notifyOn, enableNotifications }) {
  return (
    <div className="p-4 space-y-3">
      {!notifyOn && (
        <button
          onClick={enableNotifications}
          className="w-full flex items-center justify-center gap-2 text-sm bg-blue-600 text-white py-2.5 rounded-xl"
        >
          <BellIcon size={18} /> Enable alerts for new tasks
        </button>
      )}
      {tickets.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <SparkleIcon size={40} className="mx-auto mb-2 text-emerald-400" />
          <p className="font-medium text-slate-500 dark:text-slate-300">All clear!</p>
          <p className="text-sm">No cleaning tasks right now.</p>
        </div>
      )}
      {tickets.map((t) => {
        const Icon = TICKET_ICON[t.type] || DotsIcon;
        const r = rooms[t.room_id];
        return (
          <div key={t.id} className="card p-4 border-l-4 border-l-rose-500">
            <div className="flex items-center gap-2 font-semibold">
              <Icon size={18} /> {ticketTypeLabel(t.type)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              {r ? `${r.name} · ${buildingLabel(r.building)}` : t.room_id}
            </div>
            <div className="text-xs text-slate-400 mt-1">{timeAgo(t.created_at)}</div>
            <button
              onClick={() => resolve(t.id)}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-medium transition-colors"
            >
              <CheckIcon size={18} /> Mark as done
            </button>
          </div>
        );
      })}
    </div>
  );
}

function RoomChecklistCard({ room, checks, toggle }) {
  const [open, setOpen] = useState(false);
  const done = CHECKLIST.filter((c) => checks?.[c.key]).length;
  const complete = done === CHECKLIST.length;
  const { label, tone } = statusInfo(room.status);
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full p-4 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            {complete ? <CheckCircleIcon size={18} className="text-emerald-500" /> : <ClipboardIcon size={18} className="text-slate-400" />}
            {room.name}
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${TONE[tone]}`}>{label}</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{buildingLabel(room.building)}</div>
        <div className="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all ${complete ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${(done / CHECKLIST.length) * 100}%` }}
          />
        </div>
        <div className="text-xs text-slate-400 mt-1">{done}/{CHECKLIST.length} done</div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
          {CHECKLIST.map((c) => {
            const on = Boolean(checks?.[c.key]);
            return (
              <button
                key={c.key}
                onClick={() => toggle(room.id, c.key)}
                className="w-full flex items-center gap-3 py-2 text-left text-sm"
              >
                <span className={`flex items-center justify-center w-5 h-5 rounded-md border ${
                  on ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-600"
                }`}>
                  {on && <CheckIcon size={14} />}
                </span>
                <span className={on ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200"}>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoomsTab({ rooms, checks, toggle }) {
  const totalItems = rooms.length * CHECKLIST.length;
  const doneItems = rooms.reduce(
    (s, r) => s + CHECKLIST.filter((c) => checks[r.id]?.[c.key]).length, 0
  );
  return (
    <div className="p-4 space-y-3">
      {rooms.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium">Today's progress</div>
          <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-1">{doneItems}/{totalItems} checklist items</div>
        </div>
      )}
      {rooms.map((r) => (
        <RoomChecklistCard key={r.id} room={r} checks={checks[r.id]} toggle={toggle} />
      ))}
    </div>
  );
}

export default function CleanerPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("tasks");
  const [tickets, setTickets] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [checks, setChecks] = useState(loadChecks());
  const [notifyOn, setNotifyOn] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );

  const roomsById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);
  const openCount = tickets.length;

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
    apiFetch("/rooms").then(setRooms).catch(() => {});
    const onNew = (ticket) => {
      load();
      if (
        CLEANING_TYPES.includes(ticket.type) &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("New cleaning task", { body: `${ticketTypeLabel(ticket.type)} in ${ticket.room_id}` });
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

  const toggle = (roomId, itemKey) => {
    setChecks((prev) => {
      const next = { ...prev, [roomId]: { ...(prev[roomId] || {}), [itemKey]: !prev[roomId]?.[itemKey] } };
      localStorage.setItem(todayKey(), JSON.stringify(next));
      return next;
    });
  };

  const onLogout = () => { logout(); navigate("/login", { replace: true }); };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* App bar */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Logo from client/public/logo.png; hidden until that file exists. */}
          <img
            src="/logo.png"
            alt=""
            className="h-6 w-6 rounded object-contain shrink-0"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h1 className="text-lg font-bold">Cleaning</h1>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className="text-slate-500 dark:text-slate-300" />
          <button onClick={onLogout} title="Log out" className="p-2 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-300">
            <LogOutIcon size={20} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto max-w-md w-full mx-auto pb-20">
        {tab === "tasks"
          ? <TasksTab tickets={tickets} rooms={roomsById} resolve={resolve} notifyOn={notifyOn} enableNotifications={enableNotifications} />
          : <RoomsTab rooms={rooms} checks={checks} toggle={toggle} />}
      </main>

      {/* Bottom tab bar (mobile) */}
      <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex max-w-md mx-auto">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={AlertIcon} label="Tasks" badge={openCount} />
        <TabButton active={tab === "rooms"} onClick={() => setTab("rooms")} icon={ClipboardIcon} label="Checklist" />
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-medium relative ${
        active ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
      }`}
    >
      <Icon size={22} />
      {label}
      {badge > 0 && (
        <span className="absolute top-1.5 right-1/2 translate-x-4 bg-rose-500 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}
