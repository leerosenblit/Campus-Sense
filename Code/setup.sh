#!/usr/bin/env bash
# ============================================================
#  Campus-Sense one-time setup (macOS / Linux)
#  Installs all dependencies, creates Python venvs, starts the
#  infrastructure containers, and seeds the demo database.
#  Run this ONCE (or again any time to reset). Then use ./start.sh.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

# Prefer python3, fall back to python.
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
    echo "ERROR: Python 3 not found on PATH. Install it and re-run."
    exit 1
fi

ensure_docker() {
    if docker info >/dev/null 2>&1; then
        echo "Docker engine is running."
        return 0
    fi
    echo "Docker engine not responding - launching Docker Desktop..."
    if [ "$(uname)" = "Darwin" ]; then
        open -a Docker || true
    else
        echo "Start your Docker daemon (e.g. 'sudo systemctl start docker') and re-run."
    fi
    echo "Waiting for the engine to come up (up to ~120s)..."
    for _ in $(seq 1 60); do
        if docker info >/dev/null 2>&1; then
            echo "Docker engine is running."
            return 0
        fi
        sleep 2
    done
    echo
    echo "ERROR: Docker engine did not come up in time."
    echo "Start Docker, wait until it is ready, then re-run this script."
    return 1
}

echo
echo "=== [1/6] Creating .env (if missing) ==="
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
else
    echo ".env already exists - leaving it alone"
fi

echo
echo "=== [2/6] Starting infrastructure (Mosquitto + Postgres) ==="
ensure_docker
docker compose up -d mosquitto postgres

echo
echo "=== [3/6] Installing API server dependencies ==="
( cd server/api && npm install )

echo
echo "=== [4/6] Setting up decision-engine Python venv ==="
(
    cd server/decision-engine
    [ -d .venv ] || "$PY" -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -r requirements.txt
    deactivate
)

echo
echo "=== [5/6] Setting up edge Python venv ==="
(
    cd edge
    [ -d .venv ] || "$PY" -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -r requirements.txt
    # Best-effort: install the heavy CV stack (YOLO/torch) for real webcam
    # detection. If it fails (e.g. no torch wheel for this Python), setup still
    # succeeds and --simulate works; real detection just falls back to HOG.
    echo "Installing CV models (YOLO/torch) - large download, may take a few minutes..."
    if ! pip install -r requirements-cv.txt; then
        echo "WARNING: CV deps failed to install. --simulate still works."
        echo "         Real webcam detection will fall back to the slow HOG detector."
        echo "         Retry later with: pip install -r edge/requirements-cv.txt"
    fi
    deactivate
)

echo
echo "=== [6/6] Installing client dependencies + seeding demo data ==="
( cd client && npm install )
echo "Waiting 5s for Postgres to be ready..."
sleep 5
( cd server/api && node scripts/seed_demo.js )

echo
echo "============================================================"
echo " Setup complete. Now run:  ./start.sh"
echo "============================================================"
