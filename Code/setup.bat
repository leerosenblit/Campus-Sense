@echo off
REM ============================================================
REM  Campus-Sense one-time setup
REM  Installs all dependencies, creates Python venvs, starts the
REM  infrastructure containers, and seeds the demo database.
REM  Run this ONCE (or again any time to reset). Then use start.bat.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo === [1/6] Creating .env (if missing) ===
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created .env from .env.example
) else (
    echo .env already exists - leaving it alone
)

echo.
echo === [2/6] Starting infrastructure (Mosquitto + Postgres) ===
call :ensure_docker
if errorlevel 1 exit /b 1
docker compose up -d mosquitto postgres
if errorlevel 1 (
    echo.
    echo ERROR: docker compose failed even though the engine is up. See output above.
    pause
    exit /b 1
)

echo.
echo === [3/6] Installing API server dependencies ===
pushd server\api
call npm install
popd

echo.
echo === [4/6] Setting up decision-engine Python venv ===
pushd server\decision-engine
if not exist ".venv" python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
deactivate
popd

echo.
echo === [5/6] Setting up edge Python venv ===
pushd edge
if not exist ".venv" python -m venv .venv
call .venv\Scripts\activate.bat
pip install -r requirements.txt
REM Best-effort: install the heavy CV stack (YOLO/torch) for real webcam
REM detection. If it fails (e.g. no torch wheel for this Python), setup still
REM succeeds and --simulate works; real detection just falls back to HOG.
echo Installing CV models (YOLO/torch) - large download, may take a few minutes...
pip install -r requirements-cv.txt
if errorlevel 1 (
    echo WARNING: CV deps failed to install. --simulate still works.
    echo          Real webcam detection will fall back to the slow HOG detector.
    echo          Retry later with: pip install -r edge\requirements-cv.txt
)
deactivate
popd

echo.
echo === [6/6] Installing client dependencies + seeding demo data ===
pushd client
call npm install
popd
REM Give Postgres a moment to finish initializing on first run before seeding.
echo Waiting 5s for Postgres to be ready...
timeout /t 5 /nobreak >nul
pushd server\api
node scripts\seed_demo.js
popd

echo.
echo ============================================================
echo  Setup complete. Now run:  start.bat
echo ============================================================
pause
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
