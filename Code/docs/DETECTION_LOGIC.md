# Campus-Sense — Behaviour & Detection Logic

How the system decides things. Read this to **predict how it will react** to a given
situation (a bag left behind, a spill, a class starting, people coming and going).

Values here are the current defaults; every number is a tunable env var (see
[§6 Tunable knobs](#6-tunable-knobs)). Deeper detail lives in the code paths linked
throughout.

---

## 1. Two halves: the *camera server* and the *dashboard*

The system is deliberately split into two independent halves that talk **only** over
MQTT, one direction for data:

```
  CAMERA SERVER (the "reporter")                      DASHBOARD (the "decider")
  edge/campus_edge.py                                 server/ + client/
  ─────────────────────────────                       ─────────────────────────────
  • watches the webcam                    ──MQTT──▶   • decision engine (business rules)
  • decides WHAT it sees & when to say it              • API + DB (tasks, rooms, schedule)
  • never reads task/dashboard state                   • React dashboard (live over WebSocket)
  • only receives relay ON/OFF commands  ◀──MQTT──     • turns reports into tasks
```

**Golden rule of the split:**

- The **camera server reports observations** ("a bag has been here 10 s", "a spill",
  "1 person"). It has its **own** debouncing so it never spams the same thing every
  frame, and it **never needs to know** what happened to a task.
- The **dashboard owns all task/business logic** — whether a report becomes a task,
  is de-duplicated, auto-closed, or ignored (e.g. during a class).

So a line in the **camera terminal** (e.g. `forgotten item cleared`) does **not**
necessarily change a task — the dashboard applies its own rules. That's expected.

MQTT topics: `campus/{building}/{room}/{leaf}` where leaf ∈
`occupancy | forgotten | anomaly | relay | heartbeat`.

---

## 2. What the camera reports (edge signals)

The edge processes each webcam frame through two YOLO models and emits a signal only
when its debounce/hysteresis says so.

### 2.1 Occupancy (people counting)
- Model: `yolov8n.pt` (COCO "person"), confidence ≥ `PERSON_CONF_THRESHOLD` (0.5).
- A new count is published only after it holds for `OCCUPANCY_CONFIRM_FRAMES` (3)
  consecutive frames — filters single-frame flicker.
- Topic: `occupancy` → `{"count": N}`.

### 2.2 Forgotten item (Use Case D)
- Model: `yolov8n.pt` (COCO bag / handbag / suitcase / bottle / laptop / phone / book).
  **Not** the spill model.
- Runs **every frame** (regardless of occupancy) so the "is it still there?" timer is
  independent of people being present.
- **Reports `present:true` once** when **all** hold:
  1. an item has been visible for `FORGOTTEN_APPEAR_SECONDS` (2 s), and
  2. the room has had **no person for `FORGOTTEN_EMPTY_SECONDS` (10 s)** — a settle
     timer *after the room empties* (an item is only "forgotten" once people are gone).
- **Reports `present:false` once** when the item has **not been seen for
  `FORGOTTEN_CLEAR_SECONDS` (30 s)** — checked **regardless of occupancy** (a person
  standing in the room does not freeze this).
- Topic: `forgotten` → `{"item":"backpack","conf":0.78,"present":true}` / `{"present":false}`.

### 2.3 Spill (anomaly)
- Model: `spill_yolo.pt` (your trained detector). A detection counts only if
  confidence ≥ `ANOMALY_CONF_THRESHOLD` (**0.70**); below that it is ignored entirely.
- **Reports `anomaly` once** when a spill has been visible for
  `ANOMALY_APPEAR_SECONDS` (1.5 s). It will not report the same spill again until it
  has been unseen for `ANOMALY_CLEAR_SECONDS` (15 s) and re-appears (re-arm).
- **The edge NEVER sends a "spill gone" signal.** On clear it only logs locally.
- Topic: `anomaly` → `{"class":"liquid_spill","conf":0.82}`.

### 2.4 Preview window (`--preview`)
Colour-coded boxes of what the camera sees (local debug only, never transmitted):
🟩 green = people · 🟧 amber = personal items · 🟥 red = spills.

---

## 3. How the dashboard turns reports into tasks

Tickets = tasks. Type ∈ `projector | ac | lights | spill | lost_item | other`.
Source ∈ `qr` (a student's QR report) or `anomaly` (auto-detected). Status ∈
`open → in_progress → resolved`.

### 3.1 De-duplication (the "protector") — status-based, not time-based
- **Forgotten (`lost_item`):** a new one is created **only if there is no open OR
  in-progress `lost_item` task for that room**. (Server: `POST /internal/lost-item`.)
- **Spill / any auto ticket:** created **only if there is no open OR in-progress task
  of the same (room, type)**. (Server: `POST /tickets`, `source:"anomaly"`.)
- **Student QR reports are never de-duplicated** — a person reporting is intentional.

### 3.2 Forgotten-item task lifecycle
| Trigger | Result |
|---|---|
| edge `present:true`, **no class scheduled now**, no live task | **create** an open `lost_item` task |
| edge `present:true`, **a class is scheduled in that room now** | **skip** (a bag during a lesson is a student's) |
| edge `present:true`, a live task already exists | **de-duped** (no second task) |
| edge `present:false` (item gone ~30 s) | the still-**open** task is **DELETED** (not moved to Done); an `in_progress` one is left for the cleaner |
| a person re-enters the room | **nothing happens to the task** (only the room's energy hold releases) |

### 3.3 Spill task lifecycle
| Trigger | Result |
|---|---|
| edge `anomaly`, no live spill task for the room | **create** an open `spill` task |
| edge `anomaly`, a live spill task exists | **de-duped** |
| spill no longer detected | **nothing** — the edge sends no "gone" signal |
| — | **A spill task is NEVER auto-closed or deleted.** It only changes by a human. |

### 3.4 Who can change a task (manual actions)
- **Drag** a card between columns, or **"Mark as done"** (cleaner) → sets status
  (`PATCH /tickets/:id`, login required).
- **"Clear Done"** button → permanently deletes all `resolved` tasks
  (`DELETE /tickets/resolved`, login required).
- The cleaner mobile view shows open `spill` + `lost_item` tasks.

### 3.5 Live updates
Dashboards update instantly over WebSocket (`ticket:new`, `ticket:update`,
`room:update`), plus a **silent refresh every 8 s** and on tab focus as a backstop.

---

## 4. Energy / power decisions (decision engine state machine)

Per-room state ∈ `OCCUPIED | RECENTLY_EMPTY | EMPTY_POWER_OFF | ALERT_ACTIVE |
FORGOTTEN_ITEM` (`server/decision-engine/state_machine.py`). The UI shows friendly
labels (e.g. `EMPTY_POWER_OFF` → "Empty · saving") via `client/src/labels.js`.

A room is **powered off** only when **all** hold:
1. occupancy has been 0 for ≥ `EMPTY_MINUTES_BEFORE_OFF` (10 min; demo often uses 0),
2. no class is active now, **and** none starts within `SCHEDULE_LOOKAHEAD_MINUTES` (15),
3. the room is not in an alert (spill),
4. the room is not holding a forgotten item, and
5. the room is not whitelisted (e.g. `kirya-H1`, a hall on a fixed timetable).

People returning (`occupancy > 0`) instantly powers systems back on and clears the
room's live alert/forgotten **hold** (this is the room's live status — it does **not**
close the maintenance task, see §3.2/§3.3).

---

## 5. Camera → room assignment (Live Map dropdown)

One physical camera can be pointed at any room from the **Live Map** dropdown.
The edge keeps publishing under its own identity; the **engine remaps** that camera's
events to the selected room from that moment on (refreshed every ~3 s). So new events
open on the chosen class. Set via `PUT /rooms/cameras/:cameraId`; the engine reads
`GET /internal/cameras`.

---

## 6. Tunable knobs

Edge (`edge/config.py`, overridable via `.env`):

| Var | Default | Meaning |
|---|---|---|
| `PERSON_CONF_THRESHOLD` | 0.5 | min confidence to count a person |
| `OCCUPANCY_CONFIRM_FRAMES` | 3 | frames a new count must hold before publishing |
| `FORGOTTEN_CONF_THRESHOLD` | 0.4 | min confidence to consider an item |
| `FORGOTTEN_APPEAR_SECONDS` | 2 | item must be visible this long before reporting |
| `FORGOTTEN_EMPTY_SECONDS` | 10 | room must be empty (no person) this long before a report |
| `FORGOTTEN_CLEAR_SECONDS` | 30 | item unseen this long → report gone (ignores occupancy) |
| `ANOMALY_CONF_THRESHOLD` | 0.70 | min confidence to accept a spill; below = ignored |
| `ANOMALY_APPEAR_SECONDS` | 1.5 | spill visible this long before one alert |
| `ANOMALY_CLEAR_SECONDS` | 15 | spill unseen this long before the edge re-arms |
| `YOLO_DEVICE` | auto | `auto` → Apple-Silicon GPU (mps), else cpu |

Server: `TICKET_COOLDOWN_MINUTES` is no longer used (dedup is status-based).
Engine: `EMPTY_MINUTES_BEFORE_OFF`, `SCHEDULE_LOOKAHEAD_MINUTES`, `CAMPUS_TZ`.

---

## 7. Use-case walkthroughs (predict the reaction)

1. **A student leaves a backpack and walks out.**
   Room empties → after 10 s of no person, and the bag visible ≥2 s → edge reports
   `present:true` → (no class now, no existing task) → **one `lost_item` task opens**.
   The camera preview shows an amber box on the bag.

2. **The backpack sits there for an hour.**
   Edge keeps seeing it → `last_seen` stays fresh → **no "gone" report** → the task
   **stays open** the whole time. No duplicates (dedup).

3. **Someone walks back in to grab the bag.**
   `occupancy > 0` → the room's energy hold releases, but the **task is untouched**.
   They pick up the bag and leave → the bag is no longer seen → 30 s later the edge
   reports `present:false` → the still-open task is **deleted** (not moved to Done).

4. **The bag is briefly hidden (a person stands in front of it for 8 s).**
   Unseen < 30 s → **no clear**. Nothing changes. (Only ≥30 s unseen clears it.)

5. **A bag is on the floor during a scheduled class.**
   The room isn't empty (or a class is scheduled now) → **no task is created**. If the
   room briefly empties mid-class, the server still **skips** creation because a class
   is active.

6. **A puddle that looks like a spill, detector confidence 0.63.**
   0.63 < 0.70 → **ignored**, no alert, no task.

7. **A real spill, confidence 0.85.**
   Visible ≥1.5 s → **one spill task opens**. It flickers in the model? Still **one**
   task (dedup + hysteresis). The spill is mopped and no longer detected → **the task
   stays open** — a human must mark it done. "Clear Done" later removes it.

8. **Two spills reported in the same room minutes apart.**
   First opens a task. Second is **de-duped** while the first is still open/in-progress.
   Resolve the first, and a later spill can open a new one.

9. **Operator points the Live-Map camera at "Kirya H2".**
   From then on the camera's occupancy/forgotten/spill events **open on Kirya H2**.

10. **An object is simply *always* in the room** (e.g. a fixture the model reads as a
    "suitcase"), room empty. Creation only needs the room empty for 10 s — **not** a
    person having just left — so it **will open a task** ~10 s after the room is seen
    empty (the empty-settle timer starts at boot). If that's undesirable, raise
    `FORGOTTEN_CONF_THRESHOLD` or drop that class from `PERSONAL_ITEM_CLASSES`
    (`edge/pipelines.py`).

---

## 8. Quick reference — "if this, then that"

- Spill < 0.70 confidence → **ignored**.
- Spill ≥ 0.70 → **one task**, **never auto-closed** (manual only).
- Forgotten item → task **only** after room empty 10 s, item visible 2 s, no class now.
- Forgotten item gone 30 s (even if people are present) → open task **deleted**.
- Any auto task (spill or forgotten) → **at most one live task per room/type** at a time.
- Person returns → room powers on, holds release, **tasks untouched**.
- Student QR report → always creates a task (never de-duped).
- "Clear Done" → permanently deletes resolved tasks.
