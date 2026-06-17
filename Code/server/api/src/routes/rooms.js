import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();

// GET /rooms — list all rooms with their current status (Table 4.1).
router.get("/", requireAuth, async (_req, res) => {
  const { rows } = await query("SELECT * FROM rooms ORDER BY building, name");
  res.json(rows);
});

// GET /rooms/:id/history?hours=24 — occupancy/energy events over a time range.
router.get("/:id/history", requireAuth, async (req, res) => {
  const { id } = req.params;
  const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 720);
  const { rows } = await query(
    `SELECT type, value, ts FROM events
     WHERE room_id = $1 AND ts >= now() - ($2 || ' hours')::interval
     ORDER BY ts ASC`,
    [id, String(hours)]
  );
  res.json(rows);
});

export default router;
