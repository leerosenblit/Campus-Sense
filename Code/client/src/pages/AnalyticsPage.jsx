import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Cell,
} from "recharts";
import { apiFetch } from "../api.js";
import { ticketTypeLabel, buildingLabel } from "../labels.js";
import { BoltIcon, TicketIcon, ClockIcon, AlertIcon } from "../icons.jsx";

const axisTick = { fill: "currentColor", fontSize: 12 };
const tooltipStyle = {
  background: "rgba(15,23,42,0.95)", border: "none", borderRadius: 8,
  color: "#fff", fontSize: 12,
};
const BAR_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];

function Kpi({ icon: Icon, label, value, sub, tone = "blue" }) {
  const tones = {
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="card p-5">
      <div className={`flex items-center gap-2 text-sm ${tones[tone]}`}>
        <Icon size={18} /> {label}
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mb-2">{subtitle}</p>}
      <div className="mt-3 text-slate-500 dark:text-slate-400">{children}</div>
    </div>
  );
}

// "ficus-301" -> "301 · Ficus"
const roomShort = (id) => {
  const [b, ...rest] = id.split("-");
  return `${rest.join("-")} · ${buildingLabel(b)}`;
};

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [energy, setEnergy] = useState(null);
  const [byHour, setByHour] = useState([]);
  const [byType, setByType] = useState([]);
  const [times, setTimes] = useState([]);

  useEffect(() => {
    apiFetch("/analytics/summary").then(setSummary).catch(() => {});
    apiFetch("/analytics/energy").then(setEnergy).catch(() => {});
    apiFetch("/analytics/occupancy-by-hour").then(setByHour).catch(() => {});
    apiFetch("/analytics/tickets-by-type").then(setByType).catch(() => {});
    apiFetch("/analytics/response-times").then(setTimes).catch(() => {});
  }, []);

  const energyData = (energy?.per_room || []).map((r) => ({ ...r, name: roomShort(r.room_id) }));
  const typeData = byType.map((t) => ({ ...t, name: ticketTypeLabel(t.type) }));
  const timeData = times.filter((t) => t.avg_minutes != null).map((t) => ({ ...t, name: ticketTypeLabel(t.type) }));

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Analytics</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Last 7 days. Energy and cost are <strong>estimates</strong> (power-off time × rated
        appliance power), not direct meter readings.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={BoltIcon} tone="emerald" label="Energy saved"
             value={summary ? `${summary.kwh_saved_7d} kWh` : "—"}
             sub={summary ? `≈ ₪${summary.cost_saved_7d} saved` : ""} />
        <Kpi icon={TicketIcon} tone="blue" label="Open tickets"
             value={summary?.open_tickets ?? "—"}
             sub={summary ? `${summary.resolved_7d} resolved this week` : ""} />
        <Kpi icon={ClockIcon} tone="amber" label="Avg response"
             value={summary?.avg_response_min != null ? `${summary.avg_response_min} min` : "—"}
             sub="time to resolve a ticket" />
        <Kpi icon={AlertIcon} tone="rose" label="Rooms"
             value={summary ? `${summary.occupied}/${summary.rooms}` : "—"}
             sub={summary ? `${summary.alerts} alert(s) · ${summary.saving} in saving` : ""} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Campus occupancy by hour" subtitle="Average people detected per hour of day">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={byHour} margin={{ left: -20 }}>
              <defs>
                <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis dataKey="hour" tick={axisTick} interval={2} />
              <YAxis tick={axisTick} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="avg_occupancy" stroke="#2563eb" fill="url(#occ)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Energy saved by room" subtitle={energy ? `Total ${energy.total_kwh_saved} kWh` : ""}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={energyData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis dataKey="name" tick={axisTick} hide={energyData.length > 8} />
              <YAxis tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="kwh_saved" radius={[4, 4, 0, 0]}>
                {energyData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Tickets by category" subtitle="All-time totals">
          {typeData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={90} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                  {typeData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm">No tickets yet.</p>}
        </Panel>

        <Panel title="Avg response time by category" subtitle="Minutes from report to resolved">
          {timeData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={timeData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="name" tick={axisTick} />
                <YAxis tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avg_minutes" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm">No resolved tickets yet.</p>}
        </Panel>
      </div>
    </div>
  );
}
