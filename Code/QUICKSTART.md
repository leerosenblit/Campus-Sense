# Quick Start

Get the whole system running and log into the dashboard. For the exhaustive
runbook (env vars, troubleshooting, agent checklist) see `docs/DEPLOYMENT.md`.

> Prerequisites: Docker Desktop, Node.js 18+, Python 3.11+. Everything is already
> installed on the dev machine — these steps just *start* things.

You need 4–5 terminals (or use the Windows one-click launcher at the bottom).

---

## 1. Infrastructure: database + MQTT broker

```bash
cd Code
cp .env.example .env            # first time only
docker compose up -d mosquitto postgres
```

## 2. API server + demo data

```bash
cd server/api
npm install                     # first time only
node scripts/seed_demo.js       # working logins + a week of realistic data
node src/index.js               # → "Campus-Sense API on :4000"  (leave running)
```

Logins (password **`campus123`**):

| Email | Role | Lands on |
|---|---|---|
| manager@afeka.ac.il | Operations Manager | Live Map |
| it@afeka.ac.il | IT Admin | Live Map |
| cleaner@afeka.ac.il | Cleaner | Mobile cleaning view |

## 3. Decision engine (the "brain")

```bash
cd server/decision-engine
python3 -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt                   # first time only
EMPTY_MINUTES_BEFORE_OFF=0 python engine.py        # demo: power off the moment a room empties
# (omit the env var for the realistic 10-minute rule)
```

## 4. Dashboard

```bash
cd client
npm install                     # first time only
npm run dev                     # → http://localhost:5173 (or next free port)
```

Open the URL Vite prints, log in as the manager, and you'll see the live map across
**Ficus**, **Kirya** and **Mapat Amal**. Toggle dark mode from the sidebar.

## 5. Feed it data (pick one)

**A — simulate (no camera):**
```bash
cd Code
python scripts/demo_occupancy.py ficus-301 5     # 5 people walk into Room 301, then leave
```

**B — real webcam:**
```bash
cd edge
python3 -m venv .venv && . .venv/bin/activate     # first time
pip install -r requirements.txt                   # first time
python campus_edge.py --building ficus --room 301 --preview
```
`--preview` opens a window with the live camera + YOLO boxes. Watch **Room 301** on the
map turn green ("In use"), then blue ("Empty · saving") when you leave.

---

## Other views

- **Cleaner mobile view:** http://localhost:5173/cleaner (log in as the cleaner) — open
  cleaning tasks + a daily per-classroom checklist.
- **Student QR report:** http://localhost:5173/report?room=ficus-301 (no login).
- **Tickets** and **Analytics**: tabs in the manager dashboard.

## Stopping

- Ctrl-C each terminal.
- `docker compose down` (add `-v` to also wipe the database).

## Troubleshooting

- **Dashboard empty / login fails:** is the API (step 2) running? Did you run the seeder?
- **Room never turns blue:** is the decision engine (step 3) running?
- **Map count doesn't track the webcam:** the engine must be running; the edge unit needs
  the broker. See `docs/DEPLOYMENT.md` § Troubleshooting.
- **Port 5173/4000/5433 in use:** Vite auto-bumps the UI port; for the others, stop the
  other process or change ports in `.env`.

---

## Windows one-click launcher

From the `Code` folder in PowerShell:

```powershell
./start.ps1 -DemoFast      # demo mode: rooms power off immediately when empty
./start.ps1                # normal mode: real 10-minute empty-room rule
./stop.ps1                 # stop everything
```

> If PowerShell blocks the script: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
