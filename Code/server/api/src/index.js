import "dotenv/config";
import { createApp } from "./app.js";
import { query } from "./db.js";

const { httpServer, io } = createApp();
const PORT = process.env.API_PORT || 4000;

// ---- schedule-driven map simulation -------------------------------------------------
// Keeps each room's status/occupancy in sync with the class schedule (the schedules
// table — so dashboard edits are reflected), for rooms WITHOUT a live edge feed. Rooms
// a real edge unit is reporting (recent events) are left alone, as are any rooms listed
// in SIM_EXCLUDE_ROOMS (default: the demo edge room, ficus-301). This is what makes the
// map "breathe" with the timetable when there's no hardware; with every edge unit
// running it does nothing (all rooms are live).
const CAMPUS_TZ = process.env.CAMPUS_TZ || "Asia/Jerusalem";
const EMPTY_MIN = Number(process.env.EMPTY_MINUTES_BEFORE_OFF || 10);
const EXCLUDE = new Set(
  (process.env.SIM_EXCLUDE_ROOMS ?? "ficus-301").split(",").map((s) => s.trim()).filter(Boolean)
);

// Stable, plausible head-count per room (the rooms table has no capacity column).
function headcount(roomId) {
  let h = 0;
  for (const c of roomId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 12 + (h % 24); // 12..35
}

async function syncRoomsFromSchedule() {
  try {
    const { rows: live } = await query(
      "SELECT DISTINCT room_id FROM events WHERE ts > now() - interval '2 minutes'"
    );
    const liveSet = new Set(live.map((r) => r.room_id));

    const { rows: cls } = await query(
      `WITH t AS (SELECT (now() AT TIME ZONE $1) AS lt)
       SELECT s.room_id,
              bool_or(t.lt::time BETWEEN s.start_time AND s.end_time) AS active,
              bool_or(t.lt::time > s.end_time
                      AND t.lt::time <= s.end_time + ($2 || ' minutes')::interval) AS ended
         FROM schedules s, t
        WHERE s.day_of_week = EXTRACT(DOW FROM t.lt)
        GROUP BY s.room_id`,
      [CAMPUS_TZ, String(EMPTY_MIN)]
    );
    const byRoom = Object.fromEntries(cls.map((r) => [r.room_id, r]));

    const { rows: rooms } = await query(
      "SELECT id, status, occupancy, systems_on, is_whitelisted FROM rooms"
    );
    for (const r of rooms) {
      if (liveSet.has(r.id) || EXCLUDE.has(r.id)) continue; // live edge / excluded rooms own themselves
      const c = byRoom[r.id];
      let status, occ = 0, on = false;
      if (c && c.active) { status = "OCCUPIED"; occ = headcount(r.id); on = true; }
      else if (c && c.ended) { status = "RECENTLY_EMPTY"; on = true; }
      else if (r.is_whitelisted) { status = "RECENTLY_EMPTY"; on = true; }
      else { status = "EMPTY_POWER_OFF"; on = false; }

      // Only write + broadcast when something actually changed (avoids socket spam).
      if (status !== r.status || occ !== r.occupancy || on !== r.systems_on) {
        const { rows: updated } = await query(
          `UPDATE rooms SET status=$2, occupancy=$3, systems_on=$4, updated_at=now()
           WHERE id=$1 RETURNING *`,
          [r.id, status, occ, on]
        );
        io.emit("room:update", updated[0]);
      }
    }
  } catch (e) {
    console.error("schedule->map sync failed:", e.message);
  }
}

httpServer.listen(PORT, () => {
  console.log(`Campus-Sense API on :${PORT}`);
  syncRoomsFromSchedule();                    // once at startup
  setInterval(syncRoomsFromSchedule, 30_000); // and every 30s
});
