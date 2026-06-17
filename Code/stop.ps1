# Stop Campus-Sense services started by start.ps1.
#
#   ./stop.ps1        # stop the database + broker (keeps your data)
#   ./stop.ps1 -Wipe  # also delete the database volume (fresh start next time)
#
# Note: the API / engine / dashboard run in their own windows — close those with
# Ctrl+C (or just close the windows). This script stops the Docker containers.
param([switch]$Wipe)

$root = $PSScriptRoot
if ($Wipe) {
    docker compose -f "$root\docker-compose.yml" down -v
    Write-Host "Stopped and wiped the database. Next start re-seeds rooms." -ForegroundColor Yellow
} else {
    docker compose -f "$root\docker-compose.yml" down
    Write-Host "Stopped database + broker. Your data is kept." -ForegroundColor Green
}
Write-Host "Close the API / engine / dashboard windows manually (Ctrl+C) if still open."
