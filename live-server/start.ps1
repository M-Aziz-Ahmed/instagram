# Pre-start helper for the AnonTweet live-server.
#
# Verifies that a WebRTC TURN relay is reachable BEFORE launching the Node
# live-server, because a missing relay is the single most common cause of
# "calls work for me but not for my users". Direct peer-to-peer connectivity
# succeeds on an ordinary network via STUN, so the problem only shows up for
# people behind a symmetric NAT, a corporate firewall, a mobile carrier or any
# network that blocks UDP — which is precisely the population you hear about.
#
# The relay is whatever the client is actually configured to use. Historically
# that was a coturn process inside WSL2, which made this check fail on any
# machine where WSL2 cannot start (virtualization disabled in firmware) and,
# worse, meant the check only ever validated the self-hosted relay — a hosted
# one configured via NEXT_PUBLIC_TURN_URLS was never verified at all.
#
# Run via: npm run start  (see package.json "start" script)

$ErrorActionPreference = "Continue"

# Read the same env the client bundle was built from, so this reports on the
# relay users will actually try rather than on an assumption.
function Get-RelayConfig {
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    $vals = @{}
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in Get-Content -LiteralPath $envFile) {
            if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
                # An already-exported variable wins, as it does for Next.js.
                if (-not $vals.ContainsKey($Matches[1])) { $vals[$Matches[1]] = $Matches[2].Trim('"', "'") }
            }
        }
    }
    foreach ($k in @("NEXT_PUBLIC_TURN_URL","NEXT_PUBLIC_TURN_URLS","NEXT_PUBLIC_TURN_USER","NEXT_PUBLIC_TURN_CRED")) {
        $live = [Environment]::GetEnvironmentVariable($k)
        if ($live) { $vals[$k] = $live }
    }
    $urls = @()
    foreach ($k in @("NEXT_PUBLIC_TURN_URLS","NEXT_PUBLIC_TURN_URL")) {
        if ($vals[$k]) {
            $urls += $vals[$k] -split '[,\s]+' | Where-Object { $_ -and $_ -ne "change-me-in-env" }
        }
    }
    return @{
        Urls  = @($urls | Select-Object -Unique)
        User  = $vals["NEXT_PUBLIC_TURN_USER"]
        Cred  = $vals["NEXT_PUBLIC_TURN_CRED"]
    }
}

# Test a `turns:host:port` / `turn:host:port` URL from Windows, with no WSL and
# no coturn tooling. A TLS handshake succeeding proves the relay is up AND
# serving a certificate; a connect succeeding proves only that the port is open.
function Test-RelayEndpoint {
    param([string]$Url)
    $m = [regex]::Match($Url, '^(turns?|stuns?):(?:[^@]+@)?([^:/]+)(?::(\d+))?')
    if (-not $m.Success) { return $false }
    $hostName = $m.Groups[2].Value
    $port = if ($m.Groups[3].Value) { [int]$m.Groups[3].Value } elseif ($m.Groups[1].Value -like '*s') { 5349 } else { 3478 }
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $task = $c.ConnectAsync($hostName, $port)
        if (-not $task.Wait(4000)) { $c.Close(); return $false }
        if (-not $c.Connected) { $c.Close(); return $false }
        $c.Close()
        return $true
    } catch {
        return $false
    }
}

$turnReady = $false
$relay = Get-RelayConfig

if ($relay.Urls.Count -eq 0) {
    Write-Host "[start] WARNING: no TURN relay is configured (NEXT_PUBLIC_TURN_URLS is empty)." -ForegroundColor Yellow
    Write-Host "[start] Calls and voice will work on ordinary networks but FAIL where UDP is" -ForegroundColor Yellow
    Write-Host "[start] blocked. Set NEXT_PUBLIC_TURN_URLS to a hosted relay to fix it." -ForegroundColor Yellow
} else {
    Write-Host "[start] Checking $($relay.Urls.Count) configured TURN relay endpoint(s)..." -ForegroundColor Cyan
    $up = @($relay.Urls | Where-Object { Test-RelayEndpoint $_ })
    if ($up.Count -gt 0) {
        $turnReady = $true
        foreach ($u in $up) { Write-Host "[start] TURN reachable: $u" -ForegroundColor Green }
        foreach ($u in ($relay.Urls | Where-Object { $up -notcontains $_ })) {
            Write-Host "[start] TURN UNREACHABLE: $u" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[start] ERROR: every configured TURN relay is unreachable:" -ForegroundColor Red
        foreach ($u in $relay.Urls) { Write-Host "[start]   - $u" -ForegroundColor Red }
        Write-Host "[start] Users behind a firewall or symmetric NAT will not be able to" -ForegroundColor Red
        Write-Host "[start] connect. Start anyway? (y/N)" -ForegroundColor Red
        if ((Read-Host) -notmatch '^(y|yes)$') { exit 1 }
        Write-Host "[start] Continuing without a working TURN relay, as requested." -ForegroundColor Yellow
    }
}

# Local coturn inside WSL is no longer a hard requirement. It is still started
# when it is genuinely available, because a relay on the same box as the
# signalling server is the cheapest one to run — but its absence is a note, not
# a failure, since the client may be pointed at a hosted relay instead.
try {
    $distro = wsl -l -q 2>$null | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1
    if (-not $distro) {
        Write-Host "[start] No WSL distribution; skipping the local coturn service." -ForegroundColor Yellow
    } else {
        $status = (wsl -u root bash -c "systemctl is-active coturn 2>/dev/null" 2>$null | Out-String).Trim()
        if ($status -notmatch '^active$') {
            Write-Host "[start] Starting coturn (TURN relay) in WSL..." -ForegroundColor Cyan
            wsl -u root bash -c "systemctl start coturn 2>&1" 2>$null | Out-Null
            $status = (wsl -u root bash -c "systemctl is-active coturn 2>/dev/null" 2>$null | Out-String).Trim()
        }
        # WSL reports a missing hypervisor as a multi-paragraph block on stdout
        # even with stderr discarded, so only the first line is echoed. Dumping
        # the whole thing buries the useful startup output.
        $first = ($status -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
        if ($first -and $first -ne "active") {
            Write-Host "[start] Local coturn in WSL unavailable: $first" -ForegroundColor Yellow
        } else {
            Write-Host "[start] Local coturn in WSL: active" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "[start] Could not manage coturn in WSL: $($_.Exception.Message)" -ForegroundColor Yellow
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
