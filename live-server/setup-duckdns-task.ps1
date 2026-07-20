# Setup DuckDNS auto-updater to run on Windows startup
# Run this script once as Administrator

$scriptPath = "$PSScriptRoot\update-duckdns.ps1"
$taskName = "DuckDNS-AutoUpdater"

# Create the task action
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# Create trigger - on startup
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Remove existing task if it exists
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Register the task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Updates DuckDNS IP on startup" -Force

Write-Host "Task '$taskName' created successfully!" -ForegroundColor Green
Write-Host "The DuckDNS updater will now run automatically on every startup." -ForegroundColor Yellow

# Run it once now
& $scriptPath
