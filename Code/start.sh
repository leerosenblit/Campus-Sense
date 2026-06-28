#!/usr/bin/env bash
# ============================================================
#  Campus-Sense launcher (macOS / Linux)
#  Brings up infra, then opens each service in its own window.
#  Run ./setup.sh FIRST (once) to install deps + seed data.
#
#  Usage:
#    ./start.sh            - edge unit runs with a real webcam
#    ./start.sh --simulate - edge unit publishes synthetic data (no webcam)
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

EDGE_ARGS="--room 301 --building ficus"
if [ "${1:-}" = "--simulate" ]; then
    EDGE_ARGS="$EDGE_ARGS --simulate"
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
        echo "Start your Docker daemon and re-run."
    fi
    echo "Waiting for the engine to come up (up to ~120s)..."
    for _ in $(seq 1 60); do
        if docker info >/dev/null 2>&1; then
            echo "Docker engine is running."
            return 0
        fi
        sleep 2
    done
    echo "ERROR: Docker engine did not come up in time. Start it and re-run."
    return 1
}

echo "Starting infrastructure (Mosquitto + Postgres)..."
ensure_docker
docker compose up -d mosquitto postgres

# Service command lines (paths single-quoted so spaces in ROOT are safe).
API_CMD="cd '$ROOT/server/api' && npm run dev"
ENGINE_CMD="cd '$ROOT/server/decision-engine' && source .venv/bin/activate && python engine.py"
EDGE_CMD="cd '$ROOT/edge' && source .venv/bin/activate && python campus_edge.py $EDGE_ARGS"
CLIENT_CMD="cd '$ROOT/client' && npm run dev"

if [ "$(uname)" = "Darwin" ]; then
    # macOS: open each service in its own Terminal.app window.
    launch() {
        local esc=${1//\\/\\\\}   # escape backslashes for the AppleScript string
        esc=${esc//\"/\\\"}       # escape double quotes
        osascript -e "tell application \"Terminal\" to do script \"$esc\"" >/dev/null
    }
    echo "Launching services in separate Terminal windows..."
    launch "$API_CMD"
    launch "$ENGINE_CMD"
    launch "$EDGE_CMD"
    launch "$CLIENT_CMD"
else
    # Linux (no Terminal.app): run in the background, logs under ./logs/.
    mkdir -p "$ROOT/logs"
    echo "Launching services in the background (logs in ./logs/)..."
    nohup bash -c "$API_CMD"    >"$ROOT/logs/api.log"    2>&1 &
    nohup bash -c "$ENGINE_CMD" >"$ROOT/logs/engine.log" 2>&1 &
    nohup bash -c "$EDGE_CMD"   >"$ROOT/logs/edge.log"   2>&1 &
    nohup bash -c "$CLIENT_CMD" >"$ROOT/logs/client.log" 2>&1 &
    echo "PIDs: $(jobs -p | tr '\n' ' ')"
fi

echo
echo "All services launched:"
echo "  API        -> http://localhost:4000"
echo "  Dashboard  -> http://localhost:5173"
echo "  Edge args  -> $EDGE_ARGS"
echo
echo "macOS: close each Terminal window to stop that service."
echo "Linux: 'pkill -f campus_edge.py' etc., or 'kill' the PIDs above."
echo "Run 'docker compose down' to stop the broker + database."
