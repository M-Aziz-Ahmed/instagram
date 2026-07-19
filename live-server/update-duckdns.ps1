# IP Updater - Runs on startup
# 1. Updates anontweet.duckdns.org with current public IP
# 2. Updates mongobg_uri in .env with the new IP

param(
    [string]$ConfigPath = "$PSScriptRoot\duckdns.env",
    [string]$RootEnvPath = "$PSScriptRoot\..\..\.env"
)

# Load configuration
$envVars = @{}
Get-Content $ConfigPath | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
        $envVars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$domain = $envVars['DUCKDNS_DOMAIN']
$token = $envVars['DUCKDNS_TOKEN']

# Get current public IP
try {
    $currentIP = (Invoke-RestMethod -Uri "https://api.ipify.org" -UseBasicParsing).Trim()
} catch {
    $currentIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content.Trim()
}

# Update DuckDNS
$updateUrl = "https://www.duckdns.org/update?domains=$domain&token=$token&ip=$currentIP"
$result = Invoke-WebRequest -Uri $updateUrl -UseBasicParsing

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
}

# Log
$logEntry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] IP=$currentIP | DuckDNS=$domain.duckdns.org | Response=$($result.Content)"
$logEntry | Out-File -FilePath "$PSScriptRoot\duckdns.log" -Append

Write-Host $logEntry
