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

const TICKET_TYPES = ["projector", "ac", "lights", "spill", "lost_item", "other"];
const NOTES = {
  projector: ["No signal from HDMI", "Bulb flickering", "Remote not working"],
  ac: ["Room too warm", "AC dripping water", "Loud rattling noise"],
  lights: ["Back row lights out", "Lights won't turn on", "Flickering near board"],
  spill: ["Coffee spilled near entrance", "Water on the floor", "Sticky drink spill"],
  lost_item: ["Forgotten item: backpack", "Forgotten item: laptop", "Forgotten item: water bottle"],
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

  // Detect rooms currently fed by a LIVE edge unit, so re-seeding never stomps real
  // data. A room counts as live if it produced any event (heartbeat/occupancy/…) in
  // the last 2 minutes. Their status + recent events are preserved below.
  const liveRes = await query(
    "SELECT DISTINCT room_id FROM events WHERE ts > now() - interval '2 minutes'"
  );
  const liveRooms = new Set(liveRes.rows.map((r) => r.room_id));
  if (liveRooms.size)
    console.log(`Live edge units detected — preserving: ${[...liveRooms].join(", ")}`);

  // Reset history (idempotent). schedules is handled separately below (it may need a
  // shape migration), so it is not truncated here. We DELETE rather than TRUNCATE
  // events so the last 2 minutes (a running edge unit's live stream) survive; the
  // synthetic week and everything older is cleared and re-seeded. Tickets are demo
  // data and fully reset.
  await query("DELETE FROM events WHERE ts < now() - interval '2 minutes'");
  await query("TRUNCATE tickets RESTART IDENTITY");

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
  const RESOLVE_MIN = { spill: [8, 25], lost_item: [15, 90], ac: [60, 240],
    projector: [30, 180], lights: [45, 200], other: [60, 300] };
  const ticketRows = [];
  for (let i = 0; i < 24; i++) {
    const type = rand(TICKET_TYPES);
    const [roomId] = rand(ROOMS);
    const source = type === "lost_item" ? "anomaly"
      : (type === "spill" && Math.random() < 0.5 ? "anomaly" : "qr");
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
  for (const t of ["spill", "lost_item"]) {
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

  // ---- schedules: a permanent weekly timetable (FR2) ----
  // Each row is a recurring weekly class: same course, same room, same weekday and
  // time every week. day_of_week: 0=Sunday..6=Saturday. The Israel academic week
  // runs Sunday(0)-Thursday(4); Fri/Sat are off.
  // Grid entry: [dow, startHour, startMin, durationMin, roomId, course]
  const TIMETABLE = [
    // Sunday
    [0, 8, 30, 90, "ficus-101", "SWE-301 Software Engineering"],
    [0, 10, 15, 90, "ficus-201", "DB-210 Databases"],
    [0, 10, 0, 120, "kirya-H1", "MATH-101 Calculus I"],
    [0, 13, 0, 90, "kirya-Z1", "ENG-150 Technical English"],
    [0, 14, 30, 90, "mapat-Gefen", "UX-220 Human-Computer Interaction"],
    // Monday
    [1, 9, 0, 120, "kirya-H1", "PHY-110 Physics I"],
    [1, 9, 0, 90, "ficus-102", "ALG-201 Algorithms"],
    [1, 11, 0, 90, "ficus-301", "SWE-301 Software Engineering"],
    [1, 13, 30, 90, "kirya-H2", "OS-310 Operating Systems"],
    [1, 15, 0, 120, "mapat-Tamar", "AI-410 Deep Learning"],
    // Tuesday
    [2, 8, 30, 90, "ficus-201", "DB-210 Databases"],
    [2, 10, 15, 90, "ficus-302", "NET-330 Computer Networks"],
    [2, 11, 0, 120, "kirya-H1", "MATH-101 Calculus I"],
    [2, 14, 0, 90, "kirya-Z2", "STAT-205 Probability"],
    [2, 16, 0, 90, "mapat-Oren", "SEC-420 Cyber Security"],
    // Wednesday
    [3, 9, 0, 90, "ficus-101", "ALG-201 Algorithms"],
    [3, 10, 30, 120, "kirya-H2", "OS-310 Operating Systems"],
    [3, 11, 0, 90, "ficus-301", "SWE-340 Software Architecture"],
    [3, 13, 0, 90, "kirya-Z1", "ENG-150 Technical English"],
    [3, 14, 30, 120, "mapat-Tamar", "AI-410 Deep Learning"],
    // Thursday
    [4, 9, 0, 90, "ficus-102", "NET-330 Computer Networks"],
    [4, 10, 30, 120, "kirya-H1", "PHY-110 Physics I"],
    [4, 11, 0, 90, "ficus-201", "DB-260 Advanced Databases"],
    [4, 13, 0, 90, "kirya-Z2", "STAT-205 Probability"],
    [4, 14, 30, 90, "mapat-Gefen", "UX-220 Human-Computer Interaction"],
  ];
  const pad = (n) => String(n).padStart(2, "0");
  const hhmmss = (mins) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}:00`;
  const sched = TIMETABLE.map(([dow, sh, sm, dur, roomId, course]) => {
    const startMin = sh * 60 + sm;
    return [roomId, course, dow, hhmmss(startMin), hhmmss(startMin + dur)];
  });
  // Migrate the table to the weekly-recurrence shape, then load the timetable. We
  // drop/recreate (rather than truncate) so an existing DB created with the old
  // start_ts/end_ts columns is converted; schema.sql carries the same DDL for fresh
  // installs. No other table references schedules, so this is safe.
  await query("DROP TABLE IF EXISTS schedules CASCADE");
  await query(`
    CREATE TABLE schedules (
      id          SERIAL PRIMARY KEY,
      room_id     TEXT NOT NULL REFERENCES rooms(id),
      course_id   TEXT,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time  TIME NOT NULL,
      end_time    TIME NOT NULL,
      CHECK (end_time > start_time)
    )`);
  await query("CREATE INDEX idx_schedules_room_dow ON schedules (room_id, day_of_week)");
  await insertRows("schedules", ["room_id", "course_id", "day_of_week", "start_time", "end_time"], sched);

  // ---- live snapshot so the map looks alive even with no edge unit running ----
  // Computed against the weekly timetable for the CURRENT time, so the map is
  // realistic the moment it loads: a room with a class on now is in use; a room
  // whose class ended within the power-off window is cooling down; everything else
  // is empty and powered off (e.g. an evening with no classes = a dark, saving
  // campus). One room is forced into an alert (Use Case B) and one into a forgotten-
  // item hold (Use Case D) so both flows + the cleaner view demo without hardware.
  // Rooms with a live edge unit are skipped entirely — their real status stands.
  const nowDow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const EMPTY_MIN = Number(process.env.EMPTY_MINUTES_BEFORE_OFF || 10);
  const capOf = Object.fromEntries(ROOMS.map((r) => [r[0], r[4]]));
  const ALERT_ROOM = "kirya-Z1";     // alerting room (spill) for the demo + cleaner view
  const FORGOTTEN_ROOM = "ficus-302"; // empty room holding a forgotten item (Use Case D)

  // Per room: occupancy if a class is on now, else minutes since the last class ended today.
  const activeNow = {};
  const endedAgo = {};
  for (const [dow, sh, sm, dur, roomId] of TIMETABLE) {
    if (dow !== nowDow) continue;
    const s = sh * 60 + sm, e = s + dur;
    if (nowMin >= s && nowMin < e) {
      activeNow[roomId] = rint(Math.round(capOf[roomId] * 0.6), capOf[roomId]);
    } else if (nowMin >= e && nowMin - e <= EMPTY_MIN) {
      endedAgo[roomId] = Math.min(endedAgo[roomId] ?? Infinity, nowMin - e);
    }
  }

  for (const [id, , , , , wl] of ROOMS) {
    if (liveRooms.has(id)) continue; // a live edge unit owns this room's status
    let status, occ = 0, on = false;
    if (id === ALERT_ROOM) {
      status = "ALERT_ACTIVE"; occ = activeNow[id] || 0; on = true;
    } else if (id === FORGOTTEN_ROOM) {
      status = "FORGOTTEN_ITEM"; on = true;   // empty but held on until the item is collected
    } else if (activeNow[id] != null) {
      status = "OCCUPIED"; occ = activeNow[id]; on = true;
    } else if (endedAgo[id] != null) {
      status = "RECENTLY_EMPTY"; on = true;          // class just finished, cooling down
    } else if (wl) {
      status = "RECENTLY_EMPTY"; on = true;          // whitelisted hall: never auto-off
    } else {
      status = "EMPTY_POWER_OFF"; on = false;        // empty + saving
    }
    await query(
      "UPDATE rooms SET status=$2, occupancy=$3, systems_on=$4, updated_at=now() WHERE id=$1",
      [id, status, occ, on]
    );
  }
  // Make sure the alerting room has a matching open spill ticket, and the forgotten-
  // item room a matching lost-and-found ticket (skip if a live edge unit owns the
  // room — we didn't force its state in that case).
  if (!liveRooms.has(ALERT_ROOM)) {
    await query(
      `INSERT INTO tickets (room_id, type, source, status, note, confidence)
       VALUES ('${ALERT_ROOM}','spill','anomaly','open','Detected liquid spill near front row', 0.88)`
    );
  }
  if (!liveRooms.has(FORGOTTEN_ROOM)) {
    await query(
      `INSERT INTO tickets (room_id, type, source, status, note, confidence)
       VALUES ('${FORGOTTEN_ROOM}','lost_item','anomaly','open','Forgotten item: backpack', 0.79)`
    );
  }

  console.log(`Done. ${occRows.length} occupancy + ${relayRows.length} relay events, ` +
    `${ticketRows.length + 1} tickets, ${sched.length} schedules, ${ROOMS.length} rooms.`);
  console.log("Logins (password campus123): manager@afeka.ac.il, it@afeka.ac.il, cleaner@afeka.ac.il");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
