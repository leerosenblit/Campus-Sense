import { Router } from "express";
import { query } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

const router = Router();

// Analytics are for the operations manager (book §3.2, FR7). Lock the whole router.
router.use(requireAuth, requireRole("operations_manager"));

// Rated power assumption for the energy-saving estimate (book §5.4.3).
// Estimate only, not a measurement — the screen says so clearly.
const RATED_KW = 2.5; // HVAC + lights per room
const FUDGE = 0.85;
const PRICE_PER_KWH = 0.55; // ILS, rough campus tariff — for an indicative cost figure
const CAMPUS_TZ = process.env.CAMPUS_TZ || "Asia/Jerusalem"; // for local-hour analytics

// Sum of seconds each room spent powered off in the last 7 days (relay off -> next on).
const OFF_SECONDS_SQL = `
  WITH relay AS (
    SELECT room_id, ts,
           (value->>'state') AS state,
           LEAD(ts) OVER (PARTITION BY room_id ORDER BY ts) AS next_ts
    FROM events
    WHERE type = 'relay' AND ts >= now() - interval '7 days'
  )
  SELECT room_id,
         SUM(EXTRACT(EPOCH FROM (COALESCE(next_ts, now()) - ts))) AS off_seconds
  FROM relay
  WHERE state = 'off'
  GROUP BY room_id`;

// GET /analytics/energy — per-room energy-saving estimate (Table 4.1).
router.get("/energy", async (_req, res) => {
  const { rows } = await query(OFF_SECONDS_SQL);
  const perRoom = rows
    .map((r) => ({
      room_id: r.room_id,
      kwh_saved: +((r.off_seconds / 3600) * RATED_KW * FUDGE).toFixed(2),
    }))
    .sort((a, b) => b.kwh_saved - a.kwh_saved);
  const total = +perRoom.reduce((s, r) => s + r.kwh_saved, 0).toFixed(2);
  res.json({
    total_kwh_saved: total,
    estimated_cost_saved: +(total * PRICE_PER_KWH).toFixed(2),
    per_room: perRoom,
    estimate: true,
  });
});

// GET /analytics/response-times — avg ticket resolution time by type.
router.get("/response-times", async (_req, res) => {
  const { rows } = await query(`
    SELECT type,
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))/60 AS avg_minutes,
           COUNT(*) AS resolved_count
    FROM tickets
    WHERE status = 'resolved' AND resolved_at IS NOT NULL
    GROUP BY type
    ORDER BY avg_minutes DESC NULLS LAST`);
  res.json(rows.map((r) => ({
    type: r.type,
    avg_minutes: r.avg_minutes ? +(+r.avg_minutes).toFixed(1) : null,
    resolved_count: +r.resolved_count,
  })));
});

// GET /analytics/occupancy-by-hour — average occupancy per hour of day (7 days).
// Useful to see when the campus is busy. Returns all 24 hours (zero-filled).
router.get("/occupancy-by-hour", async (_req, res) => {
  // Extract the hour in the campus' local timezone so the curve reads as wall-clock
  // hours (07:00–21:00) rather than UTC.
  const { rows } = await query(`
    SELECT EXTRACT(HOUR FROM ts AT TIME ZONE '${CAMPUS_TZ}')::int AS hour,
           AVG((value->>'count')::float) AS avg_occ
    FROM events
    WHERE type = 'occupancy' AND ts >= now() - interval '7 days'
    GROUP BY hour`);
  const byHour = Object.fromEntries(rows.map((r) => [r.hour, +(+r.avg_occ).toFixed(1)]));
  const series = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    avg_occupancy: byHour[h] ?? 0,
  }));
  res.json(series);
});

// GET /analytics/tickets-by-type — counts by category (with open subset).
router.get("/tickets-by-type", async (_req, res) => {
  const { rows } = await query(`
    SELECT type,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status <> 'resolved')::int AS open
    FROM tickets
    GROUP BY type
    ORDER BY total DESC`);
  res.json(rows);
});

// GET /analytics/summary — headline KPIs for the dashboard cards.
router.get("/summary", async (_req, res) => {
  const [{ rows: r1 }, { rows: r2 }, { rows: r3 }] = await Promise.all([
    query(`
      SELECT COUNT(*)::int AS rooms,
             COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int AS occupied,
             COUNT(*) FILTER (WHERE status = 'ALERT_ACTIVE')::int AS alerts,
             COUNT(*) FILTER (WHERE NOT systems_on)::int AS saving
      FROM rooms`),
    query(`
      SELECT COUNT(*) FILTER (WHERE status <> 'resolved')::int AS open_tickets,
             COUNT(*) FILTER (WHERE status = 'resolved'
                              AND resolved_at >= now() - interval '7 days')::int AS resolved_7d,
             AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))/60 AS avg_minutes
      FROM tickets`),
    query(OFF_SECONDS_SQL),
  ]);
  const kwh = +r3
    .reduce((s, r) => s + (r.off_seconds / 3600) * RATED_KW * FUDGE, 0)
    .toFixed(1);
  res.json({
    rooms: r1[0].rooms,
    occupied: r1[0].occupied,
    alerts: r1[0].alerts,
    saving: r1[0].saving,
    open_tickets: r2[0].open_tickets,
    resolved_7d: r2[0].resolved_7d,
    avg_response_min: r2[0].avg_minutes ? +(+r2[0].avg_minutes).toFixed(0) : null,
    kwh_saved_7d: kwh,
    cost_saved_7d: +(kwh * PRICE_PER_KWH).toFixed(0),
  });
});

export default router;
