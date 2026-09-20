# Setup DuckDNS auto-updater to run on Windows startup AND every 15 minutes
# Run this script once as Administrator

param(
    [int]$EveryMinutes = 15
)

$scriptPath = "$PSScriptRoot\update-duckdns.ps1"
$taskName = "DuckDNS-AutoUpdater"

# Create the task action
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# Create triggers - on startup + repeating every $EveryMinutes indefinitely
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration ([TimeSpan]::FromDays(999))

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Remove existing task if it exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register the task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($startupTrigger, $repeatTrigger) -Settings $settings -Description "Keeps anontweet.duckdns.org pointed at the current home IP (every $EveryMinutes min)" -Force

Write-Host "Task '$taskName' created successfully!" -ForegroundColor Green
Write-Host "The DuckDNS updater will now run on startup and every $EveryMinutes minutes." -ForegroundColor Yellow

# Run it once now
& $scriptPath
