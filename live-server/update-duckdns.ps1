# DuckDNS IP Updater - PowerShell version
# Runs on startup to update anontweet.duckdns.org with current public IP

param(
    [string]$ConfigPath = "$PSScriptRoot\duckdns.env"
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
    $response = Invoke-RestMethod -Uri "https://api.ipify.org" -UseBasicParsing
    $currentIP = $response.Trim()
} catch {
    $currentIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content.Trim()
}

# Update DuckDNS
$updateUrl = "https://www.duckdns.org/update?domains=$domain&token=$token&ip=$currentIP"
$result = Invoke-WebRequest -Uri $updateUrl -UseBasicParsing

# Log
$logEntry = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Updated $domain.duckdns.org to $currentIP - Response: $($result.Content)"
$logEntry | Out-File -FilePath "$PSScriptRoot\duckdns.log" -Append

Write-Host $logEntry
