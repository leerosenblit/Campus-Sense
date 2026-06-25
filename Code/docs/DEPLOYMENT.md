# Deployment & Run Notes

A precise, copy-pasteable runbook for bringing Campus-Sense up — written so a human
**or an automation/AI agent** can follow it headlessly. Paths are relative to `Code/`.

---

## 1. Services & ports

| Service | Tech | Port | How it runs |
|---|---|---|---|
| PostgreSQL | postgres:15 (Docker) | **5433** (host) → 5432 | `docker compose up -d postgres` |
| MQTT broker | eclipse-mosquitto:2 (Docker) | **1883** (+9001 ws) | `docker compose up -d mosquitto` |
| API + WebSocket | Node/Express + Socket.IO | **4000** | `node server/api/src/index.js` |
| Decision engine | Python (paho + apscheduler) | — (MQTT client) | `python server/decision-engine/engine.py` |
| Dashboard | React + Vite | **5173** (auto-bumps if busy) | `npm --prefix client run dev` |
| Edge unit | Python (OpenCV + YOLOv8n) | — (MQTT client) | `python edge/campus_edge.py …` |

Data flow: **edge → MQTT → engine → API (`/internal`) → Postgres + Socket.IO → dashboard**.

## 2. Prerequisites

- Docker Desktop (running), Node.js 18+, Python 3.11+.
- Two Python virtualenvs (kept out of git): `edge/.venv` and `server/decision-engine/.venv`.
- Model weights auto-download on first edge run into `models/` (git-ignored).

## 3. Environment

`cp .env.example .env`. Key variables (all have sane defaults):

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | postgres://campus:campus@localhost:5433/campus_sense | API + seeder |
| `MQTT_HOST` / `MQTT_PORT` | localhost / 1883 | engine + edge |
| `API_PORT` | 4000 | API |
| `JWT_SECRET` | change-me-in-production | **set a real secret in prod** |
| `EMPTY_MINUTES_BEFORE_OFF` | 10 | engine; set `0` for a snappy demo |
| `CAMPUS_TZ` | Asia/Jerusalem | API analytics local-hour bucketing |
| `YOLO_DEVICE` | auto | edge; `auto` → MPS on Apple Silicon, else CPU |

## 4. Bring-up (macOS / Linux)

```bash
cd Code
cp .env.example .env 2>/dev/null || true
docker compose up -d mosquitto postgres            # 1. infra

# 2. API + demo data
npm --prefix server/api install
node server/api/scripts/seed_demo.js               # idempotent; resets demo data
node server/api/src/index.js &                      # leave running

# 3. decision engine
cd server/decision-engine
python3 -m venv .venv 2>/dev/null; . .venv/bin/activate
pip install -q -r requirements.txt
EMPTY_MINUTES_BEFORE_OFF=0 python engine.py &        # demo mode
deactivate; cd ../..

# 4. dashboard
npm --prefix client install
npm --prefix client run dev                          # note the URL it prints

# 5. (optional) real webcam
cd edge
python3 -m venv .venv 2>/dev/null; . .venv/bin/activate
pip install -q -r requirements.txt
python campus_edge.py --building ficus --room 301 --preview
```

Windows: use `./start.ps1 -DemoFast` from `Code/` (one-click), or the same steps with
`.venv\Scripts\Activate.ps1`.

## 5. Verify (health checks)

```bash
# infra
docker ps --format '{{.Names}} {{.Status}}' | grep campus-
lsof -iTCP:4000 -sTCP:LISTEN >/dev/null && echo "API up"

# login + an authenticated read
TOKEN=$(curl -s localhost:4000/auth/login -H 'content-type: application/json' \
  -d '{"email":"manager@afeka.ac.il","password":"campus123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:4000/rooms -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)),"rooms")'   # → 12 rooms
curl -s localhost:4000/analytics/summary -H "Authorization: Bearer $TOKEN"

# data path (publish occupancy, expect the room row to update)
python edge/.venv/bin/python - <<'PY'
import paho.mqtt.client as m, json, time
c=m.Client(); c.connect('localhost',1883); c.loop_start()
c.publish('campus/ficus/301/occupancy', json.dumps({'count':5})); time.sleep(1)
PY
```

## 6. Teardown

```bash
pkill -f "node src/index.js"; pkill -f engine.py; pkill -f campus_edge.py
docker compose down            # add -v to wipe the database volume
```

## 7. Troubleshooting (known gotchas)

| Symptom | Cause / fix |
|---|---|
| Edge logs `people=hog` (slow, laggy) | YOLO failed to load. Ensure `ultralytics>=8.3` in `edge/.venv` (older versions can't load weights under PyTorch ≥2.6). |
| Map count doesn't track reality | The **decision engine** isn't running, or a relay message storm. The edge only acts on `{"on":…}` relay commands, never its own `{"state":…}` echoes — don't reintroduce that loop. |
| Dashboard empty / login fails | API not running, or seeder not run. `node server/api/scripts/seed_demo.js`. |
| Vite not on 5173 | Port busy; Vite auto-bumps. Use the URL it prints. |
| Analytics occupancy hours look shifted | `CAMPUS_TZ` controls local-hour bucketing (default Asia/Jerusalem). |
| “OREN” / unexpected rooms appear | Stale rows. Re-run the seeder — it deletes rooms not in its list. |

## 8. Agent checklist (headless)

For an automation agent, run in order and assert the check before proceeding:

1. `docker compose up -d mosquitto postgres` → assert `docker ps` shows both `campus-*` healthy.
2. `node server/api/scripts/seed_demo.js` → assert exit 0 and "Done." line.
3. Start API (`node server/api/src/index.js`) → assert log line `Campus-Sense API on :4000`.
4. Start engine → assert log `connected to broker`.
5. Start dashboard → capture the actual URL from Vite stdout (don't assume 5173).
6. Verify via §5 (login → `/rooms` returns 12 → `/analytics/summary` non-empty).
7. Tests: `cd server/api && node --test` (7 pass) and `npm --prefix client run build` (compiles).
8. Edge GUI (`--preview`) requires a real display + camera permission — run it in a user
   session, not a headless context.
