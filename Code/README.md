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
 YOLOv5n count               decision-engine (Python)          Cleaner view  /cleaner
 anomaly classifier          api (Node/Express + Socket.IO)    Student form  /report
 simulated relay    ◀──MQTT── PostgreSQL                       Tickets /tickets, Analytics
```

See `docs/SPRINT_PLAN.md` for the 3-week build plan and requirements traceability.

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

### 2. Run the API server

```bash
cd server/api
npm install
npm run dev          # http://localhost:4000
```

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
python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt
python campus_edge.py --room 301 --building ficus
# Add --simulate to run without a webcam (publishes synthetic occupancy)
```

### 5. Run the dashboard

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

## Privacy (NFR3)

The edge unit processes frames **in memory only**. It publishes numeric occupancy counts
and anomaly flags — never raw images. No frame is written to disk or sent to the server.

## Status

Scaffold + Sprint 1 skeleton in place. Track progress in `docs/SPRINT_PLAN.md`.
