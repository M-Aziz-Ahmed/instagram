@echo off
REM Git Pull Force - Windows Batch version
echo.
echo Forcing Git Pull...
echo.

REM Discard artifact changes
git checkout -- _artifacts/ >nul 2>&1
git checkout -- live-server/logs/ >nul 2>&1

REM Clean untracked files
git clean -fd _artifacts/ >nul 2>&1

REM Pull
git pull

if errorlevel 1 (
    echo Pull failed, trying hard reset...
    git fetch origin
    git reset --hard origin/master
)

echo.
echo Done!
git status --short
