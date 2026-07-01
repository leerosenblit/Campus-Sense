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

// Weekly class timetable — the single source of truth for both the schedules table
// and the realistic, class-aligned occupancy generated below.
// Grid entry: [dow, startHour, startMin, durationMin, roomId, course]. dow 0=Sunday.
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

const TICKET_TYPES = ["projector", "ac", "lights", "spill", "lost_item", "other"];
// Relative likelihood of each ticket category (equipment issues dominate in practice).
const TYPE_WEIGHTS = [["projector", 3], ["ac", 3], ["lights", 2], ["spill", 2], ["lost_item", 2], ["other", 1]];
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

// Headcount if a class is scheduled in this room at this minute-of-day, else null.
function classHeadcount(roomId, dow, minOfDay, cap) {
  for (const [d, sh, sm, dur, rid] of TIMETABLE) {
    if (rid !== roomId || d !== dow) continue;
    const s = sh * 60 + sm, e = s + dur;
    if (minOfDay >= s && minOfDay < e) {
      const intoClass = (minOfDay - s) / dur; // fills up then thins out near the end
      const frac = intoClass < 0.15 ? 0.5 : intoClass > 0.85 ? 0.55 : 0.75 + Math.random() * 0.2;
      return Math.max(1, Math.round(cap * frac));
    }
  }
  return null;
}

// Realistic occupancy: full during scheduled classes, light ambient traffic otherwise.
function occupancyAt(roomId, dow, minOfDay, cap) {
  const head = classHeadcount(roomId, dow, minOfDay, cap);
  if (head != null) return head;
  if (dow === 5 || dow === 6) return Math.random() < 0.08 ? 1 : 0;       // Fri/Sat: nearly empty
  if (minOfDay < 8 * 60 || minOfDay >= 18 * 60) return 0;                 // before/after the day
  const r = Math.random();                                               // a few people passing through
  return r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.96 ? 2 : 3;
}

// Pick a ticket type by weighted likelihood (see TYPE_WEIGHTS).
function weightedType() {
  const total = TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of TYPE_WEIGHTS) if ((r -= w) < 0) return t;
  return "other";
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
    // Each room follows its own daily power schedule -> different energy saved.
    const onHour = 7 + (ri % 3);   // systems come on 07:00–09:00
    const offHour = 17 + (ri % 5); // and go off 17:00–21:00
    for (let d = 6; d >= 0; d--) {
      const day = new Date(now);
      day.setDate(now.getDate() - d);
      const dow = day.getDay();
      const weekend = dow === 5 || dow === 6;
      // occupancy, sampled every half hour and aligned to the class timetable so each
      // room is busy at ITS class times (drives a realistic, diverse by-hour curve).
      for (let m = 7 * 60; m <= 21 * 60; m += 30) {
        const ts = new Date(day); ts.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (ts > now) continue;
        pushEvt(occRows, id, "occupancy", { count: occupancyAt(id, dow, m, cap) }, ts);
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

  // ---- tickets (diverse mix of types / statuses / ages over the last 2 weeks) ----
  // resolution speed (minutes) by type — hazards get cleared fast, equipment slower.
  const RESOLVE_MIN = { spill: [8, 25], lost_item: [15, 90], ac: [60, 240],
    projector: [30, 180], lights: [45, 200], other: [60, 300] };
  const ticketRows = [];
  const N_TICKETS = 46;
  for (let i = 0; i < N_TICKETS; i++) {
    const type = weightedType();
    const [roomId] = rand(ROOMS);
    const source = type === "lost_item" ? "anomaly"
      : (type === "spill" && Math.random() < 0.5 ? "anomaly" : "qr");
    const createdAgoMin = rint(30, 14 * 24 * 60); // spread over the last 14 days
    const created = new Date(now.getTime() - createdAgoMin * 60000);
    // Older tickets are far more likely to be resolved; fresh ones tend to be open.
    const ageDays = createdAgoMin / (24 * 60);
    const pResolved = ageDays > 3 ? 0.85 : ageDays > 1 ? 0.55 : 0.25;
    const roll = Math.random();
    let status = "open", resolvedAt = null;
    if (roll < pResolved) {
      status = "resolved";
      const [lo, hi] = RESOLVE_MIN[type] || [30, 120];
      resolvedAt = new Date(created.getTime() + rint(lo, hi) * 60000);
      if (resolvedAt > now) resolvedAt = new Date(now.getTime() - rint(1, 30) * 60000);
    } else if (roll < pResolved + 0.18) {
      status = "in_progress";
    }
    ticketRows.push([
      roomId, type, source, status,
      Math.random() < 0.65 ? rand(NOTES[type]) : null,
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

  // ---- schedules: persist the weekly timetable (FR2). TIMETABLE is defined at the
  // top of this file and shared with the occupancy generation above.
  const pad = (n) => String(n).padStart(2, "0");
  const hhmmss = (mins) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}:00`;
  const sched = TIMETABLE.map(([dow, sh, sm, dur, roomId, course]) => {
    const startMin = sh * 60 + sm;
    return [roomId, course, dow, hhmmss(startMin), hhmmss(startMin + dur)];
  });
  // Ensure the schedules table exists in the weekly-recurrence shape, then seed the
  // demo timetable ONLY if the table is empty — so classes you add in the dashboard
  // survive re-seeding. We drop/recreate only when migrating from the old
  // start_ts/end_ts shape, or when RESET_SCHEDULES=1 forces the demo timetable back.
  const resetSchedules = process.env.RESET_SCHEDULES === "1";
  const reg = await query("SELECT to_regclass('public.schedules') AS tbl");
  let needsCreate = reg.rows[0].tbl === null;
  if (!needsCreate) {
    const cols = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'schedules'"
    );
    const oldShape = cols.rows.some((c) => c.column_name === "start_ts"); // pre-migration
    if (oldShape || resetSchedules) {
      await query("DROP TABLE IF EXISTS schedules CASCADE");
      needsCreate = true;
    }
  }
  if (needsCreate) {
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
  }
  const have = await query("SELECT count(*)::int AS n FROM schedules");
  if (have.rows[0].n === 0) {
    await insertRows("schedules", ["room_id", "course_id", "day_of_week", "start_time", "end_time"], sched);
  } else {
    console.log(`schedules: kept ${have.rows[0].n} existing rows (RESET_SCHEDULES=1 to rebuild the demo timetable)`);
  }

  // ---- live snapshot so the map looks alive even with no edge unit running ----
  // Status + occupancy are driven PURELY by the class schedule for the current time:
  // a room with a class on now is in use (with a realistic head-count); a room whose
  // class just ended is cooling down; everything else is empty and powered off. So the
  // map always agrees with the Class Schedule page. The edge unit's own room
  // (ficus-301) and any room with a live edge feed are left untouched — the real
  // sensor owns those, and the simulation never fights live data.
  const EDGE_ROOM = "ficus-301";  // matches the edge args: --building ficus --room 301
  const nowDow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const EMPTY_MIN = Number(process.env.EMPTY_MINUTES_BEFORE_OFF || 10);
  const capOf = Object.fromEntries(ROOMS.map((r) => [r[0], r[4]]));

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
    if (liveRooms.has(id) || id === EDGE_ROOM) continue; // live edge owns these
    let status, occ = 0, on = false;
    if (activeNow[id] != null) {
      status = "OCCUPIED"; occ = activeNow[id]; on = true;     // class in session
    } else if (endedAgo[id] != null) {
      status = "RECENTLY_EMPTY"; on = true;                    // class just ended, cooling down
    } else if (wl) {
      status = "RECENTLY_EMPTY"; on = true;                    // whitelisted hall: never auto-off
    } else {
      status = "EMPTY_POWER_OFF"; on = false;                  // no class -> empty + saving
    }
    await query(
      "UPDATE rooms SET status=$2, occupancy=$3, systems_on=$4, updated_at=now() WHERE id=$1",
      [id, status, occ, on]
    );
  }

  const schedTotal = (await query("SELECT count(*)::int AS n FROM schedules")).rows[0].n;
  console.log(`Done. ${occRows.length} occupancy + ${relayRows.length} relay events, ` +
    `${ticketRows.length} tickets, ${schedTotal} schedules, ${ROOMS.length} rooms.`);
  console.log("Logins (password campus123): manager@afeka.ac.il, it@afeka.ac.il, cleaner@afeka.ac.il");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
