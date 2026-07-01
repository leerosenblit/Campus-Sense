import { Router } from "express";
import Joi from "joi";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";
import { allAssignments, setAssignment, DEFAULT_CAMERA_ID } from "../cameraStore.js";

const router = Router();

// GET /rooms — list all rooms with their current status (Table 4.1).
router.get("/", requireAuth, async (_req, res) => {
  const { rows } = await query("SELECT * FROM rooms ORDER BY building, name");
  res.json(rows);
});

// GET /rooms/cameras — current camera→room assignments (for the Live Map dropdown).
router.get("/cameras", requireAuth, (_req, res) => {
  const map = allAssignments();
  res.json(Object.entries(map).map(([camera_id, room_id]) => ({ camera_id, room_id })));
});

const assignSchema = Joi.object({ room_id: Joi.string().required() });

// PUT /rooms/cameras/:cameraId — point a camera at a room. Takes effect immediately:
// the engine attributes that camera's next events to the chosen room.
router.put("/cameras/:cameraId", requireAuth, async (req, res) => {
  const { error, value } = assignSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { rows } = await query("SELECT 1 FROM rooms WHERE id = $1", [value.room_id]);
  if (!rows.length) return res.status(404).json({ error: "unknown room" });
  const cameraId = req.params.cameraId || DEFAULT_CAMERA_ID;
  setAssignment(cameraId, value.room_id);
  res.json({ camera_id: cameraId, room_id: value.room_id });
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
