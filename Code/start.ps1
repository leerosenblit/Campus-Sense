# Campus-Sense one-click launcher (development / demo).
#
#   Right-click -> "Run with PowerShell", or in a terminal:
#       ./start.ps1            # normal mode (10-minute empty-room rule)
#       ./start.ps1 -DemoFast  # demo mode (rooms power off immediately when empty)
#
# It starts the database + broker, the API, the decision engine, and the dashboard,
# each in its own window, then opens the browser. No manual terminal juggling.
param([switch]$DemoFast)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Write-Host "=== Campus-Sense launcher ===" -ForegroundColor Cyan

# 1) Database + MQTT broker (Docker)
Write-Host "Starting database + broker (Docker)..."
docker compose -f "$root\docker-compose.yml" up -d mosquitto postgres | Out-Null

Write-Host "Waiting for PostgreSQL to be ready..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker exec campus-postgres pg_isready -U campus -d campus_sense *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { Write-Host "PostgreSQL did not become ready. Is Docker Desktop running?" -ForegroundColor Red; exit 1 }

# Ensure a login exists (idempotent upsert; safe to run every time).
Write-Host "Ensuring demo login exists (manager@afeka.ac.il / campus123)..."
node "$root\server\api\scripts\create_user.js" manager@afeka.ac.il campus123 operations_manager 2>$null

$emptyMin = if ($DemoFast) { "0" } else { "10" }

# 2) API server (new window)
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$root\server\api'; Write-Host 'API SERVER' -ForegroundColor Cyan; node src/index.js"

# 3) Decision engine (new window)
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$root\server\decision-engine'; `$env:MQTT_HOST='localhost'; `$env:EMPTY_MINUTES_BEFORE_OFF='$emptyMin'; Write-Host 'DECISION ENGINE' -ForegroundColor Cyan; python engine.py"

# 4) Dashboard (new window)
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$root\client'; Write-Host 'DASHBOARD' -ForegroundColor Cyan; npm run dev"

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "All services launched in separate windows." -ForegroundColor Green
Write-Host "Dashboard:  http://localhost:5173   (manager@afeka.ac.il / campus123)"
Write-Host ""
Write-Host "To feed it data, in ANOTHER terminal run one of:"
Write-Host "  python scripts\demo_occupancy.py ficus-302 4          (no camera)"
Write-Host "  python edge\campus_edge.py --building ficus --room 301 (real webcam)"
Write-Host ""
Write-Host "To stop everything later:  ./stop.ps1"
