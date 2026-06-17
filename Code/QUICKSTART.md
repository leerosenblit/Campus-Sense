# Quick Start (Windows / PowerShell)

## Easiest: one-click launcher ✅

From the `Code` folder, just run:

```powershell
./start.ps1 -DemoFast      # demo mode: rooms power off immediately when empty
# or
./start.ps1                # normal mode: real 10-minute empty-room rule
```

It starts the database, broker, API, decision engine, and dashboard (each in its own
window), then opens **http://localhost:5173**. Log in with **manager@afeka.ac.il** /
**campus123**.

Then, to feed it data, open **one more** terminal and run either:

```powershell
python scripts\demo_occupancy.py ficus-302 4            # no camera
python edge\campus_edge.py --building ficus --room 301  # real webcam
```

To stop: `./stop.ps1` (and close the service windows).

> If PowerShell blocks the script with an execution-policy error, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## Manual way (4 terminals)

Prefer to start each piece yourself (e.g. to read each service's logs)? Do this instead.
Each service runs in its own terminal and stays open while you use the app.

> Everything is already installed on this machine. These steps just *start* things.

---

## One-time: start the database + message broker (Terminal 1)

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code"
docker compose up -d mosquitto postgres
```

Then create a login (only needed once):

```powershell
cd server\api
node scripts\create_user.js manager@afeka.ac.il campus123 operations_manager
```

You should see: `user manager@afeka.ac.il (operations_manager) created/updated`.

---

## Terminal 1 — API server

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\server\api"
node src\index.js
```

Expect: `Campus-Sense API on :4000`. **Leave this terminal running.**

---

## Terminal 2 — Decision engine (the brain)

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\server\decision-engine"
$env:EMPTY_MINUTES_BEFORE_OFF = "0"   # demo: power off immediately when empty
python engine.py
```

Expect: `decision engine started ...` and `connected to broker`. **Leave it running.**

> Remove the `$env:EMPTY_MINUTES_BEFORE_OFF` line to use the real 10-minute rule.

---

## Terminal 3 — Dashboard (the website)

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\client"
npm run dev
```

Open **http://localhost:5173** in your browser.
Log in with **manager@afeka.ac.il** / **campus123**.
You'll see the live room map. **Leave it running.**

---

## Terminal 4 — Make something happen

You have two ways to feed the system. Pick one.

### Option A — Simulate (no camera needed) ✅ easiest

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code"
python scripts\demo_occupancy.py ficus-302 4
```

Watch the dashboard: **Room 302** turns green (4 people), then blue
(`EMPTY_POWER_OFF`) within ~10 seconds — no page refresh needed.

### Option B — Use your real webcam 📷

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\edge"
python campus_edge.py --building ficus --room 301
```

It opens the webcam and counts people with YOLO (~2 frames/sec). Room **301** on
the dashboard shows the live count and turns green when it sees you.

> First run downloads the YOLO model (a few seconds). Press `Ctrl+C` to stop.
> Note: a laptop webcam undercounts a *full* classroom vs the intended ceiling
> camera, and the spill/anomaly part is not reliable yet (see chat notes).

---

## Other views to try

- **Cleaner phone view:** http://localhost:5173/cleaner
- **Student QR report form:** http://localhost:5173/report?room=ficus-301
- **Tickets board:** log in → "Tickets" tab
- **Analytics:** log in → "Analytics" tab

---

## Stopping everything

- In Terminals 1–4: press `Ctrl+C`.
- Stop the database/broker:
  ```powershell
  cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code"
  docker compose down
  ```
  (Your data is kept. Add `-v` to also wipe the database.)

## If something doesn't work

- **Dashboard empty / "log in" fails:** is Terminal 1 (API) running? Did you create the user?
- **Room never turns blue:** is Terminal 2 (engine) running?
- **`docker compose` errors:** open Docker Desktop and wait until it says "running".
- **Port 5432 in use:** that's fine — we use host port **5433** for Postgres on purpose.
