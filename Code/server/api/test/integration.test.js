/**
 * API integration tests (book §5.7.2). Exercises whole flows against a real PostgreSQL.
 * Run with: npm test   (requires the database to be up; see README / CI).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcrypt";

import { createApp } from "../src/app.js";
import { query, pool } from "../src/db.js";

const { app } = createApp();

const MANAGER = { email: "test-manager@afeka.ac.il", password: "test1234", role: "operations_manager" };
const CLEANER = { email: "test-cleaner@afeka.ac.il", password: "test1234", role: "cleaner" };
const ROOM = "ficus-301";

// /auth/login accepts only {email, password} (Joi rejects extra keys).
const creds = (u) => ({ email: u.email, password: u.password });

let managerToken;

before(async () => {
  // Ensure roles + rooms exist (schema/seed may already have them).
  await query(
    `INSERT INTO roles (name, permissions) VALUES ('operations_manager','{}'),('cleaner','{}')
     ON CONFLICT (name) DO NOTHING`
  );
  await query(
    `INSERT INTO rooms (id, building, floor, name) VALUES ($1,'ficus',3,'Room 301')
     ON CONFLICT (id) DO NOTHING`, [ROOM]
  );
  for (const u of [MANAGER, CLEANER]) {
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO users (email, pwd_hash, role) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET pwd_hash=EXCLUDED.pwd_hash, role=EXCLUDED.role`,
      [u.email, hash, u.role]
    );
  }
});

after(async () => {
  await pool.end();
});

test("health check", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("login with valid credentials returns a token", async () => {
  const res = await request(app).post("/auth/login").send(creds(MANAGER));
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  managerToken = res.body.token;
});

test("login with wrong password is rejected", async () => {
  const res = await request(app).post("/auth/login").send({ email: MANAGER.email, password: "nope" });
  assert.equal(res.status, 401);
});

test("GET /rooms requires auth", async () => {
  assert.equal((await request(app).get("/rooms")).status, 401);
  const ok = await request(app).get("/rooms").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body));
});

test("QR ticket flow: create (no auth) -> appears -> resolve (auth)", async () => {
  const created = await request(app)
    .post("/tickets")
    .send({ room_id: ROOM, type: "projector", source: "qr", note: "test" });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const list = await request(app).get("/tickets").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.some((t) => t.id === id));

  const resolved = await request(app)
    .patch(`/tickets/${id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ status: "resolved" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, "resolved");
  assert.ok(resolved.body.resolved_at);
});

test("PATCH /tickets requires auth", async () => {
  const res = await request(app).patch("/tickets/1").send({ status: "resolved" });
  assert.equal(res.status, 401);
});

test("schedule CRUD: manager creates/edits/deletes, cleaner is blocked (FR2/FR7)", async () => {
  const klass = {
    room_id: ROOM,
    course_id: "TEST-101 Integration",
    day_of_week: 1, // Monday
    start_time: "08:00",
    end_time: "09:30",
  };

  // Reads require auth.
  assert.equal((await request(app).get("/schedules")).status, 401);

  // Cleaner cannot create (manager-only write).
  const cleaner = await request(app).post("/auth/login").send(creds(CLEANER));
  const blocked = await request(app)
    .post("/schedules")
    .set("Authorization", `Bearer ${cleaner.body.token}`)
    .send(klass);
  assert.equal(blocked.status, 403);

  // Manager creates.
  const created = await request(app)
    .post("/schedules")
    .set("Authorization", `Bearer ${managerToken}`)
    .send(klass);
  assert.equal(created.status, 201);
  const id = created.body.id;

  // Invalid time range is rejected.
  const bad = await request(app)
    .post("/schedules")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ ...klass, end_time: "07:00" });
  assert.equal(bad.status, 400);

  // Manager edits.
  const edited = await request(app)
    .put(`/schedules/${id}`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({ ...klass, course_id: "TEST-101 Edited" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.course_id, "TEST-101 Edited");

  // Manager deletes.
  const del = await request(app)
    .delete(`/schedules/${id}`)
    .set("Authorization", `Bearer ${managerToken}`);
  assert.equal(del.status, 204);
});

test("forgotten-item flow: engine event creates a lost_item ticket (Use Case D)", async () => {
  // The engine persists a 'forgotten' event and opens a lost-and-found ticket.
  const evt = await request(app)
    .post("/internal/events")
    .send({ room_id: ROOM, type: "forgotten", value: { item: "backpack", present: true } });
  assert.equal(evt.status, 201);

  const created = await request(app)
    .post("/tickets")
    .send({ room_id: ROOM, type: "lost_item", source: "anomaly", note: "Forgotten item: backpack", confidence: 0.8 });
  assert.equal(created.status, 201);
  assert.equal(created.body.type, "lost_item");

  const list = await request(app).get("/tickets?type=lost_item").set("Authorization", `Bearer ${managerToken}`);
  assert.ok(list.body.some((t) => t.id === created.body.id));
});

test("analytics is manager-only (RBAC)", async () => {
  const noTok = await request(app).get("/analytics/energy");
  assert.equal(noTok.status, 401);

  const cleaner = await request(app).post("/auth/login").send(creds(CLEANER));
  const cleanerRes = await request(app)
    .get("/analytics/energy")
    .set("Authorization", `Bearer ${cleaner.body.token}`);
  assert.equal(cleanerRes.status, 403);

  const mgr = await request(app).get("/analytics/energy").set("Authorization", `Bearer ${managerToken}`);
  assert.equal(mgr.status, 200);
});
