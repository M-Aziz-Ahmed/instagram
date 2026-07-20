#Requires -RunAsAdministrator
# Setup live-server as a Windows service that starts on boot
# Uses NSSM (Non-Sucking Service Manager) - installs it automatically if missing

$serviceName = "AnonTweet-LiveServer"
$nodePath = (Get-Command node).Source
$scriptPath = "D:\Work\instagram-clone\live-server\server.js"
$workingDir = "D:\Work\instagram-clone\live-server"
$logFile = "$workingDir\service.log"

# Check for NSSM
$nssmPath = "$env:LOCALAPPDATA\nssm\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "Downloading NSSM..." -ForegroundColor Yellow
    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm" -Force
    $arch = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
    New-Item -ItemType Directory -Path "$env:LOCALAPPDATA\nssm" -Force | Out-Null
    Copy-Item "$env:TEMP\nssm\nssm-2.24\$arch\nssm.exe" $nssmPath
    Remove-Item $zipPath -Force
    Remove-Item "$env:TEMP\nssm" -Recurse -Force
    Write-Host "NSSM installed to $nssmPath" -ForegroundColor Green
}

# Remove existing service if present
& $nssmPath stop $serviceName 2>$null
& $nssmPath remove $serviceName confirm 2>$null

# Install service
& $nssmPath install $serviceName $nodePath "`"$scriptPath`""
& $nssmPath set $serviceName AppDirectory $workingDir
& $nssmPath set $serviceName DisplayName "AnonTweet Live Server"
& $nssmPath set $serviceName Description "Express + Socket.IO backend for AnonTweet"
& $nssmPath set $serviceName Start SERVICE_AUTO_START
& $nssmPath set $serviceName AppStdout $logFile
& $nssmPath set $serviceName AppStderr "$workingDir\service-error.log"
& $nssmPath set $serviceName AppRotateFiles 1
& $nssmPath set $serviceName AppRotateBytes 10485760

# Restart MongoDB service too
$mongoService = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
if ($mongoService) {
    Write-Host "MongoDB service found: $($mongoService.Status)" -ForegroundColor Cyan
} else {
    Write-Host "WARNING: MongoDB service not found. Make sure MongoDB runs as a service." -ForegroundColor Red
    Write-Host "  Run: mongod --install --serviceName MongoDB" -ForegroundColor Yellow
}

# Start the service
& $nssmPath start $serviceName

Write-Host ""
Write-Host "Service '$serviceName' installed and started!" -ForegroundColor Green
Write-Host "  Logs: $logFile" -ForegroundColor Gray
Write-Host "  Start: net start $serviceName" -ForegroundColor Gray
Write-Host "  Stop:  net stop $serviceName" -ForegroundColor Gray
Write-Host "  Remove: nssm remove $serviceName confirm" -ForegroundColor Gray
