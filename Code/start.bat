@echo off
REM ============================================================
REM  Campus-Sense launcher
REM  Brings up infra, then opens each service in its own window.
REM  Run setup.bat FIRST (once) to install deps + seed data.
REM
REM  Usage:
REM    start.bat            - edge unit runs with a real webcam
REM    start.bat --simulate - edge unit publishes synthetic data (no webcam)
REM ============================================================
setlocal
cd /d "%~dp0"

set "EDGE_ARGS=--room 301 --building ficus"
if /i "%~1"=="--simulate" set "EDGE_ARGS=%EDGE_ARGS% --simulate"

echo Starting infrastructure (Mosquitto + Postgres)...
call :ensure_docker
if errorlevel 1 exit /b 1
docker compose up -d mosquitto postgres
if errorlevel 1 (
    echo ERROR: docker compose failed even though the engine is up. See output above.
    pause
    exit /b 1
)

echo Launching services in separate windows...

start "Campus-Sense API"             cmd /k "cd /d "%~dp0server\api" && npm run dev"
start "Campus-Sense Decision Engine" cmd /k "cd /d "%~dp0server\decision-engine" && .venv\Scripts\activate.bat && python engine.py"
start "Campus-Sense Edge"            cmd /k "cd /d "%~dp0edge" && .venv\Scripts\activate.bat && python campus_edge.py %EDGE_ARGS%"
start "Campus-Sense Client"          cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo All services launched:
echo   API        -^> http://localhost:4000
echo   Dashboard  -^> http://localhost:5173
echo   Edge args  -^> %EDGE_ARGS%
echo.
echo Close each window to stop that service.
echo Run "docker compose down" to stop the broker + database.
exit /b 0

REM ------------------------------------------------------------
REM  Ensure the Docker engine is running; launch Desktop and wait.
REM ------------------------------------------------------------
:ensure_docker
docker info >nul 2>&1
if not errorlevel 1 (
    echo Docker engine is running.
    exit /b 0
)
echo Docker engine not responding - launching Docker Desktop...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
echo Waiting for the engine to come up (up to ~120s)...
for /l %%i in (1,1,60) do (
    docker info >nul 2>&1
    if not errorlevel 1 (
        echo Docker engine is running.
        exit /b 0
    )
    timeout /t 2 /nobreak >nul
)
echo.
echo ERROR: Docker engine did not come up in time.
echo Start Docker Desktop manually, wait for "Engine running", then re-run this script.
pause
exit /b 1
