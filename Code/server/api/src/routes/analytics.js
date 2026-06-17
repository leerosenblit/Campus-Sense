import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// Rated power assumption for the energy-saving estimate (book §5.4.3).
// Estimate only, not a measurement — the screen says so clearly.
const RATED_KW = 2.5; // HVAC + lights per room
const FUDGE = 0.85;

// GET /analytics/energy — aggregated energy-saving statistics (Table 4.1).
router.get("/energy", requireAuth, async (_req, res) => {
  // Sum the time each room spent in EMPTY_POWER_OFF over the last 7 days,
  // derived from relay 'off' -> next relay 'on' (or now) intervals.
  const { rows } = await query(`
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
    GROUP BY room_id
  `);

  const perRoom = rows.map((r) => ({
    room_id: r.room_id,
    kwh_saved: +((r.off_seconds / 3600) * RATED_KW * FUDGE).toFixed(2),
  }));
  const total = +perRoom.reduce((s, r) => s + r.kwh_saved, 0).toFixed(2);
  res.json({ total_kwh_saved: total, per_room: perRoom, estimate: true });
});

// GET /analytics/response-times — avg ticket resolution time by type.
router.get("/response-times", requireAuth, async (_req, res) => {
  const { rows } = await query(`
    SELECT type,
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))/60 AS avg_minutes,
           COUNT(*) AS resolved_count
    FROM tickets
    WHERE status = 'resolved' AND resolved_at IS NOT NULL
    GROUP BY type
  `);
  res.json(rows.map((r) => ({
    type: r.type,
    avg_minutes: r.avg_minutes ? +(+r.avg_minutes).toFixed(1) : null,
    resolved_count: +r.resolved_count,
  })));
});

export default router;
