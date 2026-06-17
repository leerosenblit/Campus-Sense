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
