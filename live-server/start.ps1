# Pre-start helper for the AnonFeed live-server.
# Ensures the coturn TURN relay (running inside WSL2) is up before launching
# the Node live-server, so WebRTC voice/video relay works end-to-end.
#
# Run via: npm run start  (see package.json "start" script)

$ErrorActionPreference = "Continue"

# 1) Make sure the WSL distro is running.
try {
    $distro = wsl -l -q 2>$null | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1
    if (-not $distro) {
        Write-Host "[start] No WSL distribution found. Skipping coturn start." -ForegroundColor Yellow
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
        } else {
            Write-Host "[start] WARNING: TURN relay self-test failed. Check 'wsl -u root systemctl status coturn'." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[start] Could not manage coturn in WSL: $_" -ForegroundColor Yellow
}

# 3) Launch the Node live-server in the foreground.
Write-Host "[start] Launching live-server (node server.js)..." -ForegroundColor Cyan
& node server.js
