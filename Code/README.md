# Campus-Sense

An AI-powered smart-campus management system. A single camera per room acts as a
"super-sensor": one image stream feeds two pipelines — **people counting** (for energy
management) and **anomaly detection** (for maintenance). Built for the Afeka final-year
capstone (see `docs/Campus-Sense_Project_Book.pdf`).

This repository is the software monorepo. It runs on a laptop + webcam; the Raspberry Pi,
USB camera and Sonoff relay from the book are substituted by the laptop webcam and a
**simulated relay**.

## Architecture

```
 edge/  (Python)              server/                          client/ (React)
 ──────────────              ───────────────────────────       ───────────────────
 webcam capture     ──MQTT──▶ Mosquitto broker                 Manager dashboard /map
 YOLOv8n count               decision-engine (Python)          Cleaner view  /cleaner
 anomaly classifier          api (Node/Express + Socket.IO)    Student form  /report
 simulated relay    ◀──MQTT── PostgreSQL                       Tickets /tickets, Analytics
```

Campus is modelled as three buildings — **Ficus**, **Kirya**, **Mapat Amal** — each
with several rooms (see `db/seed.sql`).

See `docs/SPRINT_PLAN.md` for the build plan and `docs/DEPLOYMENT.md` for a precise,
copy-pasteable run/deploy runbook (incl. macOS/Linux and an agent checklist).

## Repository layout

```
campus-sense/
├── edge/                 # Python service: camera + CV pipelines + MQTT (runs on laptop)
├── server/
│   ├── api/              # Node.js Express + Socket.IO REST API
│   └── decision-engine/  # Python: state machine, energy rules, anomaly routing
├── client/               # React (Vite) front-end: dashboard, cleaner view, QR form
├── db/                   # PostgreSQL schema + seed
├── models/               # Trained YOLO / MobileNet weights (gitignored)
├── infra/                # Mosquitto config, etc.
├── scripts/              # Helpers (QR generation, dataset tools)
├── legacy/               # Original Firebase/Haar-cascade proof-of-concept
├── docs/                 # Project book + sprint plan
└── docker-compose.yml    # Mosquitto + PostgreSQL (+ services)
```

## Quick start

### 1. Start infrastructure (broker + database)

```bash
cp .env.example .env
docker compose up -d mosquitto postgres
```

The schema in `db/schema.sql` is applied automatically on first Postgres start.

### 2. Run the API server + seed demo data

```bash
cd server/api
npm install
node scripts/seed_demo.js   # working logins + a week of realistic demo data
npm run dev                 # http://localhost:4000
```

Logins (all password `campus123`): `manager@afeka.ac.il`, `it@afeka.ac.il`,
`cleaner@afeka.ac.il`. The seeder is idempotent — re-run any time to reset the demo data.

### 3. Run the decision engine

```bash
cd server/decision-engine
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python engine.py
```

### 4. Run the edge unit (laptop webcam)

```bash
cd edge
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python campus_edge.py --room 301 --building ficus
# --simulate : run without a webcam (publishes synthetic occupancy)
# --preview  : open a live window showing the camera + YOLO detection boxes
```

### 5. Run the dashboard

```bash
cd client
npm install
npm run dev          # http://localhost:5173 (Vite picks the next free port if taken)
```

## Front-end features

- **Live map** — rooms grouped by building, colour-coded status with friendly labels
  (no internal codes like `EMPTY_POWER_OFF` in the UI), live over WebSocket.
- **Tickets** — drag-and-drop Kanban (Open / In progress / Done), live updates.
- **Analytics** (manager only) — KPI cards + charts: occupancy by hour, energy saved per
  room (estimate), tickets by category, avg response time.
- **Cleaner mobile view** (`/cleaner`) — open cleaning tasks + a per-classroom daily
  checklist, designed for phones.
- **Dark mode** toggle, persisted session (survives refresh), and role-based login
  (cleaners land on the mobile view).
- Flat inline-SVG icons throughout (no icon-font/CDN dependency).

## Privacy (NFR3)

The edge unit processes frames **in memory only**. It publishes numeric occupancy counts
and anomaly flags — never raw images. No frame is written to disk or sent to the server.

## Status

Full vertical slice working end-to-end: edge (YOLOv8n on webcam) → MQTT → decision engine
→ API → live dashboard, with seeded demo data, tickets, analytics, and the cleaner mobile
view. Track progress in `docs/SPRINT_PLAN.md`; deploy/run details in `docs/DEPLOYMENT.md`.
