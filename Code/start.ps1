# Campus-Sense one-click launcher (development / demo).
#
#   Right-click -> "Run with PowerShell", or in a terminal:
#       ./start.ps1            # normal mode (10-minute empty-room rule), real webcam
#       ./start.ps1 -DemoFast  # demo mode (rooms power off immediately when empty)
#       ./start.ps1 -Simulate  # edge publishes synthetic occupancy (no webcam needed)
#
# It starts the database + broker, the API, the decision engine, the dashboard, and the
# edge unit, each in its own window, then opens the browser. No manual terminal juggling.
# (First time only: run setup.bat to install dependencies and seed demo data.)
param([switch]$DemoFast, [switch]$Simulate)

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

# 5) Edge unit (new window) — real webcam by default, synthetic data with -Simulate.
$edgeArgs = "--building ficus --room 301"
if ($Simulate) { $edgeArgs += " --simulate" }
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$root\edge'; Write-Host 'EDGE UNIT' -ForegroundColor Cyan; & .\.venv\Scripts\python.exe campus_edge.py $edgeArgs"

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "All services launched in separate windows." -ForegroundColor Green
Write-Host "Dashboard:  http://localhost:5173   (manager@afeka.ac.il / campus123)"
Write-Host "Edge unit:  ficus/301  ($edgeArgs)"
Write-Host ""
Write-Host "Tips:"
Write-Host "  -Simulate                                  edge without a webcam (synthetic occupancy)"
Write-Host "  python scripts\demo_occupancy.py ficus-302 4   feed another room (no camera)"
Write-Host ""
Write-Host "To stop everything later:  ./stop.ps1  (then close the service windows)"
