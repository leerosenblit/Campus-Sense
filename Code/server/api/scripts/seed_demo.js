/**
 * Seed realistic demo data for Campus-Sense.
 *
 *   cd server/api && node scripts/seed_demo.js
 *
 * Creates working logins, the full room list (Ficus / Kirya / Mapat Amal), a week of
 * occupancy + relay history (so Analytics has curves and energy numbers), a spread of
 * maintenance tickets, and class schedules. Idempotent: re-running resets the history.
 *
 * Logins (all password `campus123`):
 *   manager@afeka.ac.il   operations_manager
 *   it@afeka.ac.il        it_admin
 *   cleaner@afeka.ac.il   cleaner
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { query, pool } from "../src/db.js";

const PASSWORD = "campus123";

// ---- rooms (id, building, floor, name, capacity, whitelisted) ----
const ROOMS = [
  ["ficus-101", "ficus", 1, "Room 101", 30, false],
  ["ficus-102", "ficus", 1, "Room 102", 30, false],
  ["ficus-201", "ficus", 2, "Room 201", 32, false],
  ["ficus-301", "ficus", 3, "Room 301", 28, false],
  ["ficus-302", "ficus", 3, "Room 302", 28, false],
  ["kirya-H1", "kirya", 1, "Hall H1", 60, true], // lecture hall: timetable-driven, never auto-off
  ["kirya-H2", "kirya", 1, "Hall H2", 55, false],
  ["kirya-Z1", "kirya", 2, "Room Z1", 24, false],
  ["kirya-Z2", "kirya", 2, "Room Z2", 24, false],
  ["mapat-Tamar", "mapat", 1, "Tamar", 20, false],
  ["mapat-Gefen", "mapat", 1, "Gefen", 20, false],
  ["mapat-Oren", "mapat", 1, "Oren", 22, false],
];

const TICKET_TYPES = ["projector", "ac", "lights", "spill", "fallen_object", "other"];
const NOTES = {
  projector: ["No signal from HDMI", "Bulb flickering", "Remote not working"],
  ac: ["Room too warm", "AC dripping water", "Loud rattling noise"],
  lights: ["Back row lights out", "Lights won't turn on", "Flickering near board"],
  spill: ["Coffee spilled near entrance", "Water on the floor", "Sticky drink spill"],
  fallen_object: ["Chair blocking aisle", "Box left in walkway", "Fallen poster"],
  other: ["Door handle loose", "Window won't close", "Whiteboard marker dried out"],
};
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Average occupancy fraction for a given hour of a weekday.
function occFraction(hour, dow) {
  if (dow === 5 || dow === 6) return hour >= 9 && hour < 14 ? 0.12 : 0; // Fri/Sat: quiet
  if (hour < 7 || hour >= 21) return 0;
  if (hour >= 9 && hour < 12) return 0.85;
  if (hour >= 14 && hour < 17) return 0.8;
  if (hour === 12 || hour === 13) return 0.35; // lunch dip
  return 0.3;
}

// Chunked multi-row insert to keep it fast.
async function insertRows(table, cols, rows) {
  if (!rows.length) return;
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const params = [];
    const values = slice
      .map((r) => {
        const ph = r.map((_, j) => `$${params.length + j + 1}`);
        params.push(...r);
        return `(${ph.join(",")})`;
      })
      .join(",");
    await query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values}`, params);
  }
}

async function main() {
  console.log("Seeding Campus-Sense demo data…");

  // Roles + logins
  await query(`
    INSERT INTO roles (name, permissions) VALUES
      ('operations_manager', ARRAY['rooms:read','rooms:control','tickets:read','tickets:write','analytics:read']),
      ('it_admin',           ARRAY['rooms:read','tickets:read','tickets:write','users:write']),
      ('cleaner',            ARRAY['tickets:read','tickets:resolve'])
    ON CONFLICT (name) DO NOTHING`);
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [email, role] of [
    ["manager@afeka.ac.il", "operations_manager"],
    ["it@afeka.ac.il", "it_admin"],
    ["cleaner@afeka.ac.il", "cleaner"],
  ]) {
    await query(
      `INSERT INTO users (email, pwd_hash, role) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET pwd_hash = EXCLUDED.pwd_hash, role = EXCLUDED.role`,
      [email, hash, role]
    );
  }

  // Rooms
  for (const [id, building, floor, name, , wl] of ROOMS) {
    await query(
      `INSERT INTO rooms (id, building, floor, name, is_whitelisted) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET building=EXCLUDED.building, floor=EXCLUDED.floor,
                                      name=EXCLUDED.name, is_whitelisted=EXCLUDED.is_whitelisted`,
      [id, building, floor, name, wl]
    );
  }

  // Reset history (idempotent)
  await query("TRUNCATE events, tickets, schedules RESTART IDENTITY");

  // Drop any rooms that aren't part of the current campus (e.g. legacy oren-lab10,
  // ficus-hall2). Safe now that the child tables above are empty.
  await query("DELETE FROM rooms WHERE id <> ALL($1)", [ROOMS.map((r) => r[0])]);

  // ---- a week of occupancy + relay events ----
  const occRows = [];
  const relayRows = [];
  const now = new Date();
  const pushEvt = (arr, id, type, val, ts) =>
    arr.push([id, type, JSON.stringify(val), ts.toISOString()]);
  ROOMS.forEach(([id, , , , cap, wl], ri) => {
    // Per-room character so analytics isn't uniform: popularity scales occupancy,
    // and each room follows its own daily power schedule -> different energy saved.
    const popularity = 0.65 + (ri % 5) * 0.12;
    const onHour = 7 + (ri % 3);   // systems come on 07:00–09:00
    const offHour = 17 + (ri % 5); // and go off 17:00–21:00
    for (let d = 6; d >= 0; d--) {
      const day = new Date(now);
      day.setDate(now.getDate() - d);
      const dow = day.getDay();
      const weekend = dow === 5 || dow === 6;
      // occupancy curve (drives the by-hour chart)
      for (let h = 7; h <= 21; h++) {
        const ts = new Date(day); ts.setHours(h, 0, 0, 0);
        if (ts > now) continue;
        const count = Math.max(0, Math.round((occFraction(h, dow) * popularity + (Math.random() - 0.5) * 0.18) * cap));
        pushEvt(occRows, id, "occupancy", { count }, ts);
      }
      // power schedule (drives energy-saved). Whitelisted halls stay on.
      if (wl) continue;
      const onTs = new Date(day); onTs.setHours(onHour, 0, 0, 0);
      const offTs = new Date(day); offTs.setHours(offHour, 0, 0, 0);
      // Weekends stay powered off all day (big, but uniform, savings).
      if (!weekend && onTs <= now) pushEvt(relayRows, id, "relay", { state: "on" }, onTs);
      if (offTs <= now && Math.random() > 0.1) pushEvt(relayRows, id, "relay", { state: "off" }, offTs);
    }
  });
  await insertRows("events", ["room_id", "type", "value", "ts"], occRows);
  await insertRows("events", ["room_id", "type", "value", "ts"], relayRows);

  // ---- tickets (mix of types / statuses / ages) ----
  // resolution speed (minutes) by type — hazards get cleared fast.
  const RESOLVE_MIN = { spill: [8, 25], fallen_object: [10, 40], ac: [60, 240],
    projector: [30, 180], lights: [45, 200], other: [60, 300] };
  const ticketRows = [];
  for (let i = 0; i < 24; i++) {
    const type = rand(TICKET_TYPES);
    const [roomId] = rand(ROOMS);
    const source = (type === "spill" || type === "fallen_object") && Math.random() < 0.5 ? "anomaly" : "qr";
    const createdAgoMin = rint(20, 7 * 24 * 60); // up to 7 days ago
    const created = new Date(now.getTime() - createdAgoMin * 60000);
    // 45% resolved, 20% in progress, rest open
    const roll = Math.random();
    let status = "open", resolvedAt = null;
    if (roll < 0.45) {
      status = "resolved";
      const [lo, hi] = RESOLVE_MIN[type] || [30, 120];
      resolvedAt = new Date(created.getTime() + rint(lo, hi) * 60000);
      if (resolvedAt > now) resolvedAt = new Date(now.getTime() - rint(1, 30) * 60000);
    } else if (roll < 0.65) {
      status = "in_progress";
    }
    ticketRows.push([
      roomId, type, source, status,
      Math.random() < 0.6 ? rand(NOTES[type]) : null,
      source === "anomaly" ? +(0.6 + Math.random() * 0.39).toFixed(2) : null,
      created.toISOString(),
      resolvedAt ? resolvedAt.toISOString() : null,
    ]);
  }
  // Guarantee a couple of fresh open cleaning tasks so the cleaner view isn't empty.
  for (const t of ["spill", "fallen_object"]) {
    ticketRows.push([
      rand(ROOMS)[0], t, "anomaly", "open", rand(NOTES[t]),
      +(0.7 + Math.random() * 0.25).toFixed(2),
      new Date(now.getTime() - rint(3, 40) * 60000).toISOString(), null,
    ]);
  }
  await insertRows(
    "tickets",
    ["room_id", "type", "source", "status", "note", "confidence", "created_at", "resolved_at"],
    ticketRows
  );

  // ---- schedules: a class active now, one starting soon, plus this week ----
  const sched = [];
  const at = (offsetMin, durMin, roomId, course) => {
    const s = new Date(now.getTime() + offsetMin * 60000);
    const e = new Date(s.getTime() + durMin * 60000);
    sched.push([roomId, course, s.toISOString(), e.toISOString()]);
  };
  at(-30, 90, "ficus-301", "SWE-301 Software Engineering"); // active now
  at(10, 90, "kirya-H1", "MATH-101 Calculus");              // starts in 10 min
  at(120, 90, "ficus-201", "DB-210 Databases");
  at(-3 * 24 * 60, 90, "kirya-H2", "PHY-110 Physics");      // earlier this week
  at(2 * 24 * 60, 120, "mapat-Tamar", "AI-410 Deep Learning");
  await insertRows("schedules", ["room_id", "course_id", "start_ts", "end_ts"], sched);

  // ---- live snapshot so the map looks alive even with no edge unit running ----
  const snapshot = [
    ["ficus-301", "OCCUPIED", 22, true],
    ["ficus-302", "RECENTLY_EMPTY", 0, true],
    ["ficus-101", "EMPTY_POWER_OFF", 0, false],
    ["ficus-102", "OCCUPIED", 18, true],
    ["ficus-201", "OCCUPIED", 25, true],
    ["kirya-H1", "OCCUPIED", 41, true],
    ["kirya-H2", "EMPTY_POWER_OFF", 0, false],
    ["kirya-Z1", "ALERT_ACTIVE", 3, true],
    ["kirya-Z2", "EMPTY_POWER_OFF", 0, false],
    ["mapat-Tamar", "OCCUPIED", 12, true],
    ["mapat-Gefen", "RECENTLY_EMPTY", 0, true],
    ["mapat-Oren", "EMPTY_POWER_OFF", 0, false],
  ];
  for (const [id, status, occ, on] of snapshot) {
    await query(
      "UPDATE rooms SET status=$2, occupancy=$3, systems_on=$4, updated_at=now() WHERE id=$1",
      [id, status, occ, on]
    );
  }
  // Make sure the alerting room has a matching open spill ticket.
  await query(
    `INSERT INTO tickets (room_id, type, source, status, note, confidence)
     VALUES ('kirya-Z1','spill','anomaly','open','Detected liquid spill near front row', 0.88)`
  );

  console.log(`Done. ${occRows.length} occupancy + ${relayRows.length} relay events, ` +
    `${ticketRows.length + 1} tickets, ${sched.length} schedules, ${ROOMS.length} rooms.`);
  console.log("Logins (password campus123): manager@afeka.ac.il, it@afeka.ac.il, cleaner@afeka.ac.il");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
