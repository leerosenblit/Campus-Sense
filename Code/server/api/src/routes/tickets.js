import { Router } from "express";
import Joi from "joi";
import { query } from "../db.js";
import { requireAuth } from "../auth.js";

export default function ticketRoutes(io) {
  const router = Router();

  // GET /tickets?status=&room=&type= — list tickets with filters (Table 4.1).
  router.get("/", requireAuth, async (req, res) => {
    const clauses = [];
    const params = [];
    for (const key of ["status", "room_id", "type"]) {
      if (req.query[key]) {
        params.push(req.query[key]);
        clauses.push(`${key} = $${params.length}`);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const { rows } = await query(
      `SELECT * FROM tickets ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  });

  const createSchema = Joi.object({
    room_id: Joi.string().required(),
    type: Joi.string().valid("projector", "ac", "lights", "spill", "fallen_object", "other").required(),
    source: Joi.string().valid("qr", "anomaly").default("qr"),
    note: Joi.string().allow("").max(500),
    confidence: Joi.number().min(0).max(1).optional(),
    thumbnail: Joi.string().optional(),
  });

  // POST /tickets — create a ticket. Used by the QR form and the anomaly handler.
  // No auth: the student QR form is intentionally unauthenticated (book §4.5.3).
  router.post("/", async (req, res) => {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { rows } = await query(
      `INSERT INTO tickets (room_id, type, source, note, confidence, thumbnail)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [value.room_id, value.type, value.source, value.note || null,
       value.confidence ?? null, value.thumbnail || null]
    );
    const ticket = rows[0];
    io.emit("ticket:new", ticket); // live push to dashboards + cleaner view
    res.status(201).json(ticket);
  });

  const patchSchema = Joi.object({
    status: Joi.string().valid("open", "in_progress", "resolved"),
    assignee: Joi.number().integer(),
    note: Joi.string().allow("").max(500),
  }).min(1);

  // PATCH /tickets/:id — assign, resolve, or add a note (Table 4.1).
  router.patch("/:id", requireAuth, async (req, res) => {
    const { error, value } = patchSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(value)) {
      params.push(v);
      sets.push(`${k} = $${params.length}`);
    }
    if (value.status === "resolved") sets.push("resolved_at = now()");
    params.push(req.params.id);

    const { rows } = await query(
      `UPDATE tickets SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    io.emit("ticket:update", rows[0]);
    res.json(rows[0]);
  });

  return router;
}
