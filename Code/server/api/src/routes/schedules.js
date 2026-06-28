import { Router } from "express";
import Joi from "joi";
import { query } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

// Class-schedule CRUD (FR2). A schedule is a PERMANENT weekly recurrence: the same
// course runs in the same room on the same weekday at the same time every week. The
// decision engine reads these to avoid powering a room off during/just before a
// class; this router lets a manager maintain them from the dashboard. Reads are open
// to any authenticated staff; writes are manager-only (FR7).
export default function scheduleRoutes() {
  const router = Router();

  // GET /schedules?room_id= — list the weekly timetable, joined with room info.
  router.get("/", requireAuth, async (req, res) => {
    const params = [];
    let where = "";
    if (req.query.room_id) {
      params.push(req.query.room_id);
      where = `WHERE s.room_id = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT s.id, s.room_id, s.course_id, s.day_of_week, s.start_time, s.end_time,
              r.name AS room_name, r.building
         FROM schedules s
         JOIN rooms r ON r.id = s.room_id
         ${where}
        ORDER BY s.day_of_week, s.start_time, r.building, r.name`,
      params
    );
    res.json(rows);
  });

  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/; // 24-hour "HH:MM"
  const upsertSchema = Joi.object({
    room_id: Joi.string().required(),
    course_id: Joi.string().allow("").max(120),
    day_of_week: Joi.number().integer().min(0).max(6).required(), // 0 = Sunday
    start_time: Joi.string().pattern(HHMM).required(),
    end_time: Joi.string().pattern(HHMM).required(),
  });

  // Validate the body, the time order, and that the room exists. Returns the cleaned
  // value, or sends the error response and returns null.
  async function validateClass(req, res) {
    const { error, value } = upsertSchema.validate(req.body);
    if (error) { res.status(400).json({ error: error.message }); return null; }
    if (value.end_time <= value.start_time) { // zero-padded "HH:MM" compares lexically
      res.status(400).json({ error: "end_time must be after start_time" }); return null;
    }
    const room = await query("SELECT 1 FROM rooms WHERE id = $1", [value.room_id]);
    if (!room.rows[0]) { res.status(400).json({ error: "unknown room" }); return null; }
    return value;
  }

  // POST /schedules — add a weekly class. Manager only.
  router.post("/", requireAuth, requireRole("operations_manager"), async (req, res) => {
    const value = await validateClass(req, res);
    if (!value) return;
    const { rows } = await query(
      `INSERT INTO schedules (room_id, course_id, day_of_week, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [value.room_id, value.course_id || null, value.day_of_week, value.start_time, value.end_time]
    );
    res.status(201).json(rows[0]);
  });

  // PUT /schedules/:id — edit a weekly class. Manager only.
  router.put("/:id", requireAuth, requireRole("operations_manager"), async (req, res) => {
    const value = await validateClass(req, res);
    if (!value) return;
    const { rows } = await query(
      `UPDATE schedules SET room_id=$1, course_id=$2, day_of_week=$3, start_time=$4, end_time=$5
       WHERE id=$6 RETURNING *`,
      [value.room_id, value.course_id || null, value.day_of_week, value.start_time, value.end_time, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  });

  // DELETE /schedules/:id — remove a weekly class. Manager only.
  router.delete("/:id", requireAuth, requireRole("operations_manager"), async (req, res) => {
    const { rowCount } = await query("DELETE FROM schedules WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  });

  return router;
}
