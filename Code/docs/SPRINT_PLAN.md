# Campus-Sense — 3-Week Sprint Plan

This plan turns the Project Book into an executable 3-week schedule, adapted to a
**laptop + webcam** development environment (no Raspberry Pi, no physical Sonoff relay).
Where the book assumes hardware, we substitute a **simulated relay** and the **laptop
webcam** so the full software pipeline still runs and demos end-to-end.

> The original book proposed 8 sprints (Appendix A). We compress them into 3 focused
> weekly sprints, keeping the same architecture (edge → server → clients) and the same
> functional/non-functional requirements (FR1–FR7, NFR1–NFR7).

## Target architecture (from the book, Ch. 4 & 5)

```
 Edge (Python)                Server                          Clients (React)
 ─────────────                ──────────────────────────      ──────────────────
 webcam + YOLOv8n   ──MQTT──▶ Mosquitto broker                Manager dashboard
 anomaly classifier          Decision engine (Python)         Cleaner mobile view
 simulated relay    ◀──MQTT── REST API (Node/Express+Socket.IO)Student QR form
                             PostgreSQL
```

## How the book's stack maps to this laptop build

| Book component        | This build                                            |
|-----------------------|-------------------------------------------------------|
| Raspberry Pi 4        | Your laptop (`edge/` runs locally)                    |
| USB camera            | Laptop webcam (`cv2.VideoCapture(0)`)                 |
| Sonoff S31 relay      | **Simulated relay** (logs + MQTT state echo)          |
| Mosquitto MQTT        | Mosquitto in Docker (`docker-compose`)                |
| PostgreSQL 15         | PostgreSQL in Docker                                  |
| Node/Express+Socket.IO| `server/api/`                                         |
| Python decision engine| `server/decision-engine/`                             |
| React/Tailwind/Recharts| `client/` (Vite)                                     |

---

## Sprint 1 — Foundation & the occupancy vertical slice
**Goal:** one complete flow works end-to-end: *webcam counts people → MQTT → decision
engine → DB + WebSocket → live React map shows the room going Empty → Power-Off.*

Covers book: §4.1–4.3, §5.2.1, §5.3, §5.6.3, Use Case A, FR1/FR2/FR3, NFR2.

- [ ] Monorepo scaffold (`edge/ server/ client/ db/ models/ docs/`) + `docker-compose.yml`
- [ ] `docker-compose`: Mosquitto + PostgreSQL running locally
- [ ] DB schema: `rooms, events, tickets, users, schedules, roles` (§4.6)
- [ ] Edge: webcam capture loop + YOLOv8n person counting + publish `occupancy` over MQTT
- [ ] Edge: subscribe to `relay` topic + **simulated relay** that echoes state back
- [ ] API: Express + Socket.IO, `GET /rooms`, `GET /rooms/:id/history`, DB pool
- [ ] Decision engine: subscribe to all room topics, persist events, per-room state machine
      (`OCCUPIED → RECENTLY_EMPTY → EMPTY_POWER_OFF`), publish relay-off command
- [ ] Client: React+Vite+Tailwind app, `/map` page, live markers via WebSocket
- **Deliverable:** empty-room auto power-off visible live on the dashboard.

## Sprint 2 — Maintenance, tickets & reporting
**Goal:** the maintenance half of the "super-sensor": *anomaly detected → ticket created →
cleaner notified*, plus the *QR student reporting* flow and the ticket board.

Covers book: §5.2.2, §5.4.2, §5.4.3 (board), §5.5, Use Cases B & C, FR4/FR5/FR6 (tickets).

- [~] Edge: anomaly pipeline + MobileNetV3-small classifier scaffolding done
      (`train_anomaly.py`, dataset structure, two-consecutive-frame filter). Detection
      stays **disabled until real weights are trained** — no false-positive guessing.
- [x] Decision engine: route anomalies → create ticket; **one ticket per hazard episode**
      (dedup on alert transition)
- [x] API: `GET/POST /tickets`, `PATCH /tickets/:id` (assign/resolve/note) — exercised end-to-end
- [x] Client: `/tickets` Kanban board (Open / In Progress / Resolved) with drag-and-drop
      (`@hello-pangea/dnd`, the maintained React-18 fork of react-beautiful-dnd)
- [x] Client: cleaner mobile view (list + "mark done") + **in-app browser notifications**
      (full offline Web Push/VAPID deferred to hardening)
- [x] Client: student QR form (`/report?room=...`), 3-tap submit, no login (NFR5)
- [x] Generate per-room QR codes (`scripts/make_qr.py` → `qr/*.png`)
- **Deliverable:** spill → cleaner notification + ticket on board; QR scan → ticket in seconds.
      (anomaly trigger needs trained weights; manual QR + MQTT anomaly both verified)

## Sprint 3 — Auth, analytics, hardening & demo
**Goal:** make it a presentable prototype: secured, measured, tested, packaged.

Covers book: §5.3.2 (JWT), §5.4.3 (analytics), §5.7 (tests), §5.1 (Docker/CI), FR7/NFR1/NFR4/NFR7.

- [ ] API: JWT + bcrypt auth, roles (operations_manager / it_admin / cleaner), `POST /auth/login`
- [ ] API: `GET /analytics/energy` (kWh-saved estimate from EMPTY_POWER_OFF time × rated power)
- [ ] Client: `/analytics` screen with Recharts (energy saved/week, avg response time)
- [ ] Schedule integration: read class schedule (config/DB) and respect it in energy rule (FR2)
- [ ] Tests: pytest (state machine, validators), Jest (front-end helpers), API integration tests
- [ ] CI: GitHub Actions workflow running the test suites
- [ ] Dockerize edge/api/engine/client; one-command `docker-compose up`
- [ ] README + demo script (the 10-minute flow from §5.8)
- **Deliverable:** full guided demo; FR1–FR7 and NFR targets reviewed against §5.7.4.

---

## Requirements traceability (where each is delivered)

| Req  | Description                          | Sprint |
|------|--------------------------------------|:------:|
| FR1  | Occupancy detection ≤30s             | 1 |
| FR2  | Schedule integration                 | 1/3 |
| FR3  | Automatic appliance control (relay)  | 1 |
| FR4  | Hazard detection + alert             | 2 |
| FR5  | QR manual reporting                  | 2 |
| FR6  | Management dashboard                 | 1–3 |
| FR7  | Authentication + roles               | 3 |
| NFR1 | ≥95% person-count accuracy           | 3 (eval) |
| NFR2 | ≤30s end-to-end latency              | 1 |
| NFR3 | Raw frames never leave the edge      | 1 (by design) |
| NFR4 | ≤1 false positive / camera / day     | 2/3 |
| NFR5 | ≤30s / ≤3 taps reporting             | 2 |
| NFR6 | Browser compatibility                | 2/3 |
| NFR7 | 99% server availability              | 3 |

## Notes / deviations from the book

- **No physical hardware** → the Sonoff relay is simulated; "power off" is logged and
  reflected on the dashboard rather than cutting a real circuit (mirrors the book's own
  demo, §5.8, which used a desk lamp stand-in).
- **Privacy (NFR3):** the edge processes frames in memory and publishes only numbers/flags;
  no frame is written to disk or sent to the server — same as the book.
- The existing `campus_vision.py` (Haar-cascade + Firebase) and `index.html` are the
  earlier proof-of-concept; they are kept under `legacy/` for reference and superseded by
  the `edge/` + `client/` modules.
