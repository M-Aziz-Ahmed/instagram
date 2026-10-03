# Git Pull Force - Automatically handles build artifact conflicts
# This script will discard local changes to build artifacts and pull latest code

Write-Host "Forcing Git Pull..." -ForegroundColor Cyan

# Discard changes to artifacts and logs
Write-Host "Discarding build artifact changes..." -ForegroundColor Yellow
git checkout -- "_artifacts/" 2>$null
git checkout -- "live-server/logs/" 2>$null

# Remove any untracked artifact files
Write-Host "Cleaning untracked files..." -ForegroundColor Yellow
git clean -fd "_artifacts/" 2>$null

# Reset any staged changes to artifacts
git reset HEAD "_artifacts/" 2>$null

# Pull latest changes
Write-Host "Pulling latest changes..." -ForegroundColor Green
git pull

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully pulled latest changes!" -ForegroundColor Green
} else {
    Write-Host "Pull failed. Trying hard reset..." -ForegroundColor Red
    git fetch origin
    git reset --hard origin/master
    Write-Host "Force synced with origin/master!" -ForegroundColor Green
}

Write-Host ""
git status --short
