# Diagnose the AnonTweet backend on this machine.
#
#   powershell -ExecutionPolicy Bypass -File live-server\scripts\doctor.ps1
#
# Read-only: it starts and stops nothing. Paste the output back when something is
# not working - it is far faster to diagnose from this than by guessing.

$ErrorActionPreference = "Continue"
$ok = 0; $warn = 0; $bad = 0

function Section($t) { Write-Host "`n$t" -ForegroundColor Cyan; Write-Host ("-" * 62) }
function Ok($m)    { Write-Host "  [ok]   $m" -ForegroundColor Green;  $script:ok++ }
function Warn($m)  { Write-Host "  [warn] $m" -ForegroundColor Yellow; $script:warn++ }
function Bad($m)   { Write-Host "  [BAD]  $m" -ForegroundColor Red;    $script:bad++ }

function Test-Port([int]$Port, [string]$What, [string]$ExpectHost = "127.0.0.1") {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.ReceiveTimeout = 3000
        $c.Connect("127.0.0.1", $Port)
        $c.Close()
        Ok "$What listening on 127.0.0.1:$Port"
        return $true
    } catch {
        Bad "$What NOT listening on 127.0.0.1:$Port"
        return $false
    }
}

Write-Host "AnonTweet backend doctor" -ForegroundColor White
Write-Host "machine: $env:COMPUTERNAME   user: $env:USERNAME   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# ── Processes ─────────────────────────────────────────────────────────────────
Section "Processes"
foreach ($p in @(
    @{ Name = "mongod";       Proc = "mongod";       Why = "the shared database" },
    @{ Name = "node";         Proc = "node";         Why = "live-server (only while serving)" },
    @{ Name = "redis";        Proc = "redis-server"; Why = "optional unless running >1 instance" },
    @{ Name = "caddy";        Proc = "caddy";        Why = "TLS in front of live-server" },
    @{ Name = "turnserver";   Proc = "turnserver";   Why = "TURN relay for WebRTC fallback" }
)) {
    $running = Get-Process $p.Proc -ErrorAction SilentlyContinue
    if ($running) { Ok "$($p.Name) running (pids $($running.Id -join ',')) - $($p.Why)" }
    else { Warn "$($p.Name) not running - $($p.Why)" }
}

# ── Ports ─────────────────────────────────────────────────────────────────────
Section "Ports"
$mongoUp  = Test-Port 27017 "MongoDB"
$redisUp  = Test-Port 6379  "Redis"
$liveUp   = Test-Port 3001  "live-server"
$httpUp   = Test-Port 80    "Caddy (http)"
$httpsUp  = Test-Port 443   "Caddy (https)"
$turnUp   = Test-Port 8443  "coturn (TURN/TLS)"

# ── Services ──────────────────────────────────────────────────────────────────
Section "Registered services (auto-start)"
$svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "mongo|redis|caddy|live|anon" }
if ($svc) {
    foreach ($s in $svc) {
        $st = if ($s.Status -eq "Running") { "running" } else { "STOPPED" }
        $at = if ($s.StartType -eq "Automatic") { "automatic" } else { $s.StartType }
        if ($s.Status -eq "Running") { Ok "$($s.Name): $st, $at" }
        else { Warn "$($s.Name): $st, $at  <- will not come back after a reboot" }
    }
} else {
    Bad "no Mongo/Redis/Caddy/live-server service registered - nothing auto-starts"
    Warn "see live-server/setup-service.ps1 (NSSM) to register live-server on boot"
}

# ── WSL / coturn ──────────────────────────────────────────────────────────────
Section "TURN relay"
if (-not $turnUp) {
    Warn "coturn is not listening on 8443."
    $wsl = $null
    try { $wsl = (wsl -l -q 2>$null | Where-Object { $_.Trim() -ne "" } | Select-Object -First 1) } catch {}
    if (-not $wsl) {
        Bad "WSL is not installed, so start.ps1 cannot start coturn."
        Warn "start.ps1 skips it silently and live-server starts with no TURN relay."
        Warn "Effect: calls and voice work on ordinary networks (peer-to-peer) but"
        Warn "FAIL behind restrictive firewalls, corporate networks, VPNs and in China,"
        Warn "because there is no relay to fall back to. Fix: wsl --install, then"
        Warn "wsl -u root bash -c 'apt-get install -y coturn' and configure it for :8443."
    } else {
        Ok "WSL distro present: $wsl"
        Warn "but coturn is not running inside it:"
        Warn "  wsl -u root bash -c 'systemctl status coturn'"
    }
}

# ── Public reachability ───────────────────────────────────────────────────────
Section "Public reachability"
try {
    $r = Invoke-WebRequest "https://anontweet.duckdns.org/health" -UseBasicParsing -TimeoutSec 15
    $j = $r.Content | ConvertFrom-Json
    Ok "backend reachable, uptime $([math]::Round($j.uptime/3600,1)) h via https://anontweet.duckdns.org"
    if ($j.uptime -lt 900) { Warn "uptime under 15 min - it restarted recently. A laptop that sleeps will do this." }
} catch {
    Bad "https://anontweet.duckdns.org/health failed: $($_.Exception.Message)"
    Warn "check the router port forwards for 80/443 and whether this machine is awake"
}

# ── Mongo exposure ────────────────────────────────────────────────────────────
Section "Security"
$wan = $null
try { $wan = (Invoke-WebRequest "https://api.ipify.org" -UseBasicParsing -TimeoutSec 8).Content } catch {}
Write-Host "  your public IP: $wan"
if ($mongoUp) {
    Warn "MongoDB is listening. If the router forwards its port from the WAN, anyone"
    Warn "on the internet can attempt to reach it. Remove that mapping, or restrict"
    Warn "the source address - nothing outside needs raw database access."
}

# ── Secrets hygiene ───────────────────────────────────────────────────────────
Section "Secrets"
Push-Location (Join-Path $PSScriptRoot "..\..")
try {
    $tracked = git ls-files 2>$null
    foreach ($bad_path in @("live-server/duckdns.env", "live-server/node_modules", "live-server/caddy.exe")) {
        if ($tracked -contains $bad_path) { Bad "$bad_path is committed to git" }
    }
    $logs = @($tracked | Where-Object { $_ -like "live-server/logs/*" })
    if ($logs.Count -gt 0) { Warn "$($logs.Count) log files committed (they contain real client IPs)" }
} catch {}
Pop-Location

# ── Summary ───────────────────────────────────────────────────────────────────
Section "Summary"
Write-Host "  ok: $ok   warn: $warn   bad: $bad"
if ($bad -eq 0 -and $warn -eq 0) { Write-Host "  All good." -ForegroundColor Green }
else { Write-Host "  Work through the [BAD] lines first, then the [warn] lines." -ForegroundColor Yellow }
