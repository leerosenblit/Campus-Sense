import { Router } from "express";
import Joi from "joi";
import { query } from "../db.js";

// Internal endpoint used by the decision engine to push events + room-state changes
// into the database and broadcast them live to dashboards (book Table 4.1, §5.3.3).
export default function internalRoutes(io) {
  const router = Router();

  const eventSchema = Joi.object({
    room_id: Joi.string().required(),
    type: Joi.string().valid("occupancy", "anomaly", "relay", "heartbeat").required(),
    value: Joi.object().required(),
  });

  router.post("/events", async (req, res) => {
    const { error, value } = eventSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    await query(
      "INSERT INTO events (room_id, type, value) VALUES ($1,$2,$3)",
      [value.room_id, value.type, value.value]
    );
    res.status(201).json({ ok: true });
  });

  const stateSchema = Joi.object({
    room_id: Joi.string().required(),
    status: Joi.string().required(),
    occupancy: Joi.number().integer().min(0),
    systems_on: Joi.boolean(),
  });

  // Schedule status for the energy rule (FR2). Tells the engine whether a class is
  // currently active in the room, or starting within `lookahead` minutes.
  router.get("/schedule/:roomId", async (req, res) => {
    const { roomId } = req.params;
    const lookahead = Math.min(Math.max(parseInt(req.query.lookahead, 10) || 15, 0), 240);
    const { rows } = await query(
      `SELECT
         EXISTS (SELECT 1 FROM schedules
                 WHERE room_id = $1 AND now() BETWEEN start_ts AND end_ts) AS class_active,
         EXISTS (SELECT 1 FROM schedules
                 WHERE room_id = $1
                   AND start_ts BETWEEN now() AND now() + ($2 || ' minutes')::interval) AS class_soon`,
      [roomId, String(lookahead)]
    );
    res.json({ class_active: rows[0].class_active, class_soon: rows[0].class_soon });
  });

  // The engine reports the new room state; we persist it and broadcast over WebSocket.
  router.post("/room-state", async (req, res) => {
    const { error, value } = stateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { rows } = await query(
      `UPDATE rooms SET status=$2,
              occupancy=COALESCE($3, occupancy),
              systems_on=COALESCE($4, systems_on),
              updated_at=now()
       WHERE id=$1 RETURNING *`,
      [value.room_id, value.status, value.occupancy ?? null, value.systems_on ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: "unknown room" });
    io.emit("room:update", rows[0]); // live map update (book §5.3.3)
    res.json(rows[0]);
  });

  return router;
}
