import { Router } from "express";
import Joi from "joi";
import { query } from "../db.js";
import { allAssignments } from "../cameraStore.js";

// Internal endpoint used by the decision engine to push events + room-state changes
// into the database and broadcast them live to dashboards (book Table 4.1, §5.3.3).
export default function internalRoutes(io) {
  const router = Router();

  // Current camera→room assignments, read by the engine to remap a camera's events
  // to the room it's currently pointed at (set from the Live Map dropdown).
  router.get("/cameras", (_req, res) => res.json(allAssignments()));

  const eventSchema = Joi.object({
    room_id: Joi.string().required(),
    type: Joi.string().valid("occupancy", "anomaly", "forgotten", "relay", "heartbeat").required(),
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
  //
  // Schedules are a weekly recurrence (day-of-week + wall-clock time), so we compare
  // against the campus-local wall clock: `now() AT TIME ZONE CAMPUS_TZ` yields the
  // local timestamp, from which we take the weekday and time-of-day. EXTRACT(DOW)
  // returns 0=Sunday, matching the day_of_week column.
  const CAMPUS_TZ = process.env.CAMPUS_TZ || "Asia/Jerusalem";
  router.get("/schedule/:roomId", async (req, res) => {
    const { roomId } = req.params;
    const lookahead = Math.min(Math.max(parseInt(req.query.lookahead, 10) || 15, 0), 240);
    const { rows } = await query(
      `WITH t AS (SELECT (now() AT TIME ZONE $3) AS local_ts)
       SELECT
         EXISTS (
           SELECT 1 FROM schedules s, t
            WHERE s.room_id = $1
              AND s.day_of_week = EXTRACT(DOW FROM t.local_ts)
              AND t.local_ts::time BETWEEN s.start_time AND s.end_time
         ) AS class_active,
         EXISTS (
           SELECT 1 FROM schedules s, t
            WHERE s.room_id = $1
              AND s.day_of_week = EXTRACT(DOW FROM t.local_ts)
              AND s.start_time > t.local_ts::time
              AND s.start_time <= (t.local_ts + ($2 || ' minutes')::interval)::time
         ) AS class_soon`,
      [roomId, String(lookahead), CAMPUS_TZ]
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

  // Lost-and-found lifecycle (Use Case D). The edge reports a forgotten item as
  // present / gone. We keep exactly ONE open "lost_item" task per room while the item
  // is being seen; the edge reports "gone" only once it hasn't been seen for ~2 min,
  // at which point we auto-close the task. Never creates duplicates.
  const lostSchema = Joi.object({
    room_id: Joi.string().required(),
    present: Joi.boolean().required(),
    item: Joi.string().allow("", null),
    conf: Joi.number().min(0).max(1).allow(null),
  });
  router.post("/lost-item", async (req, res) => {
    const { error, value } = lostSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    // "Gone" (item unseen for ~2 min): DELETE the still-open task(s) for the room — a
    // never-actioned auto-detected item just disappears, it does NOT clutter "Done".
    // We only remove untouched 'open' ones; a task a cleaner moved to 'in_progress' is
    // left for them to finish (and will land in Done when they complete it).
    if (!value.present) {
      const { rows } = await query(
        `DELETE FROM tickets
          WHERE room_id = $1 AND type = 'lost_item' AND status = 'open'
          RETURNING id`,
        [value.room_id]
      );
      if (rows.length) io.emit("ticket:update", { removed: rows.map((r) => r.id), room_id: value.room_id });
      return res.json({ ok: true, deleted: rows.length });
    }

    // Don't raise a forgotten-item task while a class is scheduled in this room right
    // now — an item on the floor during a lesson belongs to someone present.
    const active = await query(
      `WITH t AS (SELECT (now() AT TIME ZONE $2) AS local_ts)
       SELECT EXISTS (
         SELECT 1 FROM schedules s, t
          WHERE s.room_id = $1
            AND s.day_of_week = EXTRACT(DOW FROM t.local_ts)
            AND t.local_ts::time BETWEEN s.start_time AND s.end_time
       ) AS class_active`,
      [value.room_id, CAMPUS_TZ]
    );
    if (active.rows[0].class_active) return res.json({ ok: true, skipped: "class-active" });

    // De-duplicate on the LIVE queue: while an open OR in-progress lost_item task
    // exists for this room, a re-detected item never creates a second one.
    const note = value.item ? `Forgotten item: ${value.item}` : "Forgotten item left behind";
    const { rows } = await query(
      `INSERT INTO tickets (room_id, type, source, note, confidence)
       SELECT $1, 'lost_item', 'anomaly', $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM tickets
          WHERE room_id = $1 AND type = 'lost_item' AND status <> 'resolved'
       )
       RETURNING *`,
      [value.room_id, note, value.conf ?? null]
    );
    if (rows[0]) {
      io.emit("ticket:new", rows[0]); // live push to dashboards + cleaner view
      return res.status(201).json(rows[0]);
    }
    return res.json({ ok: true, deduped: true }); // a live task already exists
  });

  return router;
}
