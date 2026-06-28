import { useEffect, useMemo, useState } from "react";
import { apiFetch, getRole } from "../api.js";
import { buildingLabel } from "../labels.js";
import { CalendarIcon, TrashIcon, PencilIcon } from "../icons.jsx";

// Class-schedule management (FR2). A schedule is a PERMANENT weekly recurrence: the
// same course, room, weekday and time every week. Managers add/edit/remove classes
// here; the decision engine reads them to avoid powering a room off during or just
// before a class. Non-managers see the timetable read-only.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LOOKAHEAD_MIN = 15; // mirrors SCHEDULE_LOOKAHEAD_MINUTES (display only)

const hm = (t) => (t || "").slice(0, 5);            // "HH:MM:SS" -> "HH:MM"
const toMin = (t) => { const [h, m] = hm(t).split(":"); return +h * 60 + +m; };

function emptyForm() {
  return { id: null, room_id: "", course_id: "", day_of_week: String(new Date().getDay()),
    start: "08:30", end: "10:00" };
}

export default function SchedulePage() {
  const isManager = getRole() === "operations_manager";
  const [rooms, setRooms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    apiFetch("/schedules").then(setClasses).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    apiFetch("/rooms")
      .then((rs) => setRooms(rs.slice().sort((a, b) =>
        (a.building + a.name).localeCompare(b.building + b.name))))
      .catch(() => {});
  }, []);

  // Group classes by weekday (0..6) for a timetable layout, days in week order.
  const byDay = useMemo(() => {
    const groups = new Map();
    for (const c of classes) {
      if (!groups.has(c.day_of_week)) groups.set(c.day_of_week, []);
      groups.get(c.day_of_week).push(c);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [classes]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const resetForm = () => { setForm(emptyForm()); setError(""); };

  const startEdit = (c) => {
    setError("");
    setForm({
      id: c.id,
      room_id: c.room_id,
      course_id: c.course_id || "",
      day_of_week: String(c.day_of_week),
      start: hm(c.start_time),
      end: hm(c.end_time),
    });
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setError("");
    if (!form.room_id) return setError("Please choose a room.");
    if (!(form.end > form.start)) return setError("End time must be after the start time.");

    const body = JSON.stringify({
      room_id: form.room_id,
      course_id: form.course_id.trim(),
      day_of_week: Number(form.day_of_week),
      start_time: form.start,
      end_time: form.end,
    });
    setSaving(true);
    try {
      if (form.id) await apiFetch(`/schedules/${form.id}`, { method: "PUT", body });
      else await apiFetch("/schedules", { method: "POST", body });
      resetForm();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.course_id || "this class"}?`)) return;
    try {
      await apiFetch(`/schedules/${c.id}`, { method: "DELETE" });
      if (form.id === c.id) resetForm();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Live "in session / starting soon" badge, computed against the browser's local
  // clock (campus-local for on-site users; the engine uses CAMPUS_TZ server-side).
  const nowDow = new Date().getDay();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const statusOf = (c) => {
    if (c.day_of_week !== nowDow) return "";
    const s = toMin(c.start_time), e = toMin(c.end_time);
    if (nowMin >= s && nowMin < e) return "active";
    if (s > nowMin && s - nowMin <= LOOKAHEAD_MIN) return "soon";
    return "";
  };

  const inputCls =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <CalendarIcon size={22} /> Class Schedule
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        A permanent weekly timetable — each class repeats the same day and time every
        week. The energy rule never powers a room off during a class, or within{" "}
        {LOOKAHEAD_MIN} minutes before one starts.
        {!isManager && " (Read-only — managers can edit.)"}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {isManager && (
        <form onSubmit={submit} className="card p-4 mb-6">
          <h3 className="font-semibold mb-3">
            {form.id ? "Edit class" : "Add a class"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="text-sm">
              <span className="block mb-1 text-slate-500 dark:text-slate-400">Room</span>
              <select className={inputCls} value={form.room_id}
                onChange={(e) => set("room_id", e.target.value)}>
                <option value="">Select room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {buildingLabel(r.building)} · {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm lg:col-span-2">
              <span className="block mb-1 text-slate-500 dark:text-slate-400">Course</span>
              <input className={inputCls} type="text" placeholder="e.g. SWE-301 Software Engineering"
                value={form.course_id} onChange={(e) => set("course_id", e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-slate-500 dark:text-slate-400">Day</span>
              <select className={inputCls} value={form.day_of_week}
                onChange={(e) => set("day_of_week", e.target.value)}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="block mb-1 text-slate-500 dark:text-slate-400">Start</span>
                <input className={inputCls} type="time" value={form.start}
                  onChange={(e) => set("start", e.target.value)} required />
              </label>
              <label className="text-sm">
                <span className="block mb-1 text-slate-500 dark:text-slate-400">End</span>
                <input className={inputCls} type="time" value={form.end}
                  onChange={(e) => set("end", e.target.value)} required />
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving ? "Saving…" : form.id ? "Save changes" : "Add class"}
            </button>
            {form.id && (
              <button type="button" onClick={resetForm}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {byDay.length === 0 && (
        <p className="text-sm text-slate-400">No classes scheduled.</p>
      )}

      <div className="space-y-6">
        {byDay.map(([dow, items]) => (
          <div key={dow}>
            <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2">
              {DAYS[dow]}
            </h3>
            <div className="space-y-2">
              {items.map((c) => {
                const st = statusOf(c);
                return (
                  <div key={c.id}
                    className={`card p-3 flex items-center gap-4 border-l-4 ${
                      st === "active" ? "border-l-emerald-500"
                        : st === "soon" ? "border-l-amber-500"
                        : "border-l-slate-300 dark:border-l-slate-700"
                    }`}>
                    <div className="w-32 shrink-0 text-sm tabular-nums">
                      {hm(c.start_time)} – {hm(c.end_time)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {c.course_id || "Class"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {buildingLabel(c.building)} · {c.room_name}
                      </div>
                    </div>
                    {st === "active" && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">In session</span>
                    )}
                    {st === "soon" && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Starting soon</span>
                    )}
                    {isManager && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(c)} title="Edit"
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                          <PencilIcon size={16} />
                        </button>
                        <button onClick={() => remove(c)} title="Delete"
                          className="p-2 rounded-lg text-slate-500 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/10 transition-colors">
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
