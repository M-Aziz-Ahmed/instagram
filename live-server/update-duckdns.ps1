# IP Updater - Runs on startup
# 1. Updates anontweet.duckdns.org with current public IP
# 2. Updates mongobg_uri in .env with the new IP

param(
    [string]$ConfigPath = "$PSScriptRoot\duckdns.env",
    [string]$RootEnvPath = "$PSScriptRoot\..\.env"
)

# PowerShell 5.1 ships with TLS 1.0 only, but api.ipify.org / duckdns.org require
# TLS 1.2+. Without this, every HTTPS call fails with "Could not create SSL/TLS
# secure channel" and DuckDNS never gets updated.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# Load configuration
$envVars = @{}
Get-Content $ConfigPath | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
        $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$domain = $envVars['DUCKDNS_DOMAIN']
$token = $envVars['DUCKDNS_TOKEN']

if (-not $domain -or -not $token) {
    Write-Host "[ERROR] DuckDNS config missing (domain/token) in $ConfigPath"
    exit 1
}

# Get current public IP
try {
    $ipResult = Invoke-RestMethod -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 30
    $currentIP = "$ipResult".Trim()
} catch {
    try {
        $currentIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing -TimeoutSec 30).Content.Trim()
    } catch {
        Write-Host "[ERROR] Could not fetch public IP: $($_.Exception.Message)"
        exit 1
    }
}

if ($currentIP -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Write-Host "[ERROR] Got invalid IP from ipify: '$currentIP'"
    exit 1
}

# Update DuckDNS
$updateUrl = "https://www.duckdns.org/update?domains=$domain&token=$token&ip=$currentIP"
$result = Invoke-WebRequest -Uri $updateUrl -UseBasicParsing -TimeoutSec 30

# PS 5.1 returns the body as a byte[] for text/plain without a charset — decode it.
if ($result.Content -is [byte[]]) {
    $response = [System.Text.Encoding]::UTF8.GetString($result.Content)
} else {
    $response = "$($result.Content)"
}
$response = $response.Trim()

# DuckDNS returns "OK" on success and "KO" on failure
if ($response -match 'KO') {
    Write-Host "[WARN] DuckDNS returned KO for '$domain'. Verify token/domain in $ConfigPath"
}

# Update root .env - replace old IP in mongobg_uri
if (Test-Path $RootEnvPath) {
    $envContent = Get-Content $RootEnvPath -Raw

    # Match any IP in the mongodb URI and replace with current IP
    $newContent = $envContent -replace '(mongobg_uri=mongodb://[^@]+@)\d+\.\d+\.\d+\.\d+(:27017)', "`${1}${currentIP}`$2"

    if ($newContent -ne $envContent) {
        Set-Content -Path $RootEnvPath -Value $newContent -NoNewline
        Write-Host "[ENV] Updated mongobg_uri IP to $currentIP"
    } else {
        Write-Host "[ENV] mongobg_uri already has correct IP"
    }
} else {
    Write-Host "[WARN] Root .env not found at $RootEnvPath - mongobg_uri not updated"
}

# Log
$logEntry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] IP=$currentIP | DuckDNS=$domain.duckdns.org | Response=$response"
$logEntry | Out-File -FilePath "$PSScriptRoot\duckdns.log" -Append

Write-Host $logEntry