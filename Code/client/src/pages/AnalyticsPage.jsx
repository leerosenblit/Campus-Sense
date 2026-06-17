import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { apiFetch } from "../api.js";

// Analytics screen (book §5.4.3). The kWh figure is an ESTIMATE, not a measurement.
export default function AnalyticsPage() {
  const [energy, setEnergy] = useState(null);
  const [times, setTimes] = useState([]);

  useEffect(() => {
    apiFetch("/analytics/energy").then(setEnergy).catch(() => {});
    apiFetch("/analytics/response-times").then(setTimes).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Analytics</h2>
      <p className="text-sm text-slate-500 mb-6">
        Energy figures are estimated from power-off time × rated appliance power — not a
        direct measurement.
      </p>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h3 className="font-semibold mb-1">Estimated energy saved (7 days)</h3>
        <div className="text-3xl font-bold text-blue-600">
          {energy ? `${energy.total_kwh_saved} kWh` : "—"}
        </div>
        {energy && (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={energy.per_room}>
              <XAxis dataKey="room_id" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="kwh_saved" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-3">Avg response time by ticket type (min)</h3>
        {times.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={times}>
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avg_minutes" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm">No resolved tickets yet.</p>
        )}
      </div>
    </div>
  );
}
