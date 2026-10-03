# Pre-start helper for the AnonTweet live-server.
# Ensures the coturn TURN relay (running inside WSL2) is up before launching
# the Node live-server, so WebRTC voice/video relay works end-to-end.
#
# Run via: npm run start  (see package.json "start" script)

$ErrorActionPreference = "Continue"

# 1) Make sure the WSL distro is running.
$turnReady = $false
try {
    $distro = wsl -l -q 2>$null | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1
    if (-not $distro) {
        # This used to be a yellow note and then carry on. WSL is frequently not
        # installed at all, and starting live-server with no TURN relay looks fine
        # until calls fail behind a restrictive firewall, corporate network or VPN,
        # where there is no peer-to-peer path to fall back to. Make it loud.
        Write-Host "[start] ERROR: no WSL distribution, so coturn cannot start." -ForegroundColor Red
        Write-Host "[start] The TURN relay will be MISSING and calls/voice will fail" -ForegroundColor Red
        Write-Host "[start] on restrictive networks. Start anyway? (y/N)" -ForegroundColor Red
        $go = Read-Host
        if ($go -notmatch '^(y|yes)$') { exit 1 }
        Write-Host "[start] Continuing without a TURN relay, as requested." -ForegroundColor Yellow
    } else {
        # 2) Ensure coturn is running inside WSL (systemd-managed, idempotent).
        $status = wsl -u root bash -c "systemctl is-active coturn 2>/dev/null" 2>$null
        if ($status -ne "active") {
            Write-Host "[start] Starting coturn (TURN relay) in WSL..." -ForegroundColor Cyan
            wsl -u root bash -c "systemctl start coturn 2>&1; sleep 2; systemctl is-active coturn" 2>$null
        } else {
            Write-Host "[start] coturn already active in WSL." -ForegroundColor Green
        }

        # Quick reachability check of the TURN TLS port.
        $ok = wsl -u root bash -c "turnutils_uclient -p 8443 -u anonturn -w I_hateyou2 -y 127.0.0.1 >/dev/null 2>&1 && echo OK || echo FAIL" 2>$null
        if ($ok -match "OK") {
            Write-Host "[start] TURN relay verified reachable on :8443." -ForegroundColor Green
            $turnReady = $true
        } else {
            Write-Host "[start] WARNING: TURN relay self-test failed. Check 'wsl -u root systemctl status coturn'." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[start] Could not manage coturn in WSL: $_" -ForegroundColor Yellow
}

if (-not $turnReady) {
    Write-Host "[start] TURN relay is NOT ready. Direct peer-to-peer calls still work on" -ForegroundColor Yellow
    Write-Host "[start] ordinary networks; calls will fail where UDP is blocked." -ForegroundColor Yellow
}

# 3) Launch the Node live-server in the foreground.
Write-Host "[start] Launching live-server (node server.js)..." -ForegroundColor Cyan

# Resolve this script's own directory instead of a hardcoded path from another
# machine, so `npm start` works wherever the repo is checked out.
$serverDir = $PSScriptRoot
if (-not $serverDir) { $serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not (Test-Path -LiteralPath (Join-Path $serverDir "server.js"))) {
    Write-Host "[start] ERROR: server.js not found in $serverDir" -ForegroundColor Red
    exit 1
}

Push-Location -LiteralPath $serverDir
try {
    & node server.js
} finally {
    Pop-Location
}
