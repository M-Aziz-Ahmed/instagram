# This is the simplified redis-setup.ps1 script for Windows:

function Execute-Command {
    param (
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "Executing: $Description..." -ForegroundColor Yellow
    $exitCode = Execute-NonPrivilegedCommand $Command
    if ($exitCode -ne 0) {
        Write-Host "ERROR: Failed to execute: $Description" -ForegroundColor Red
        Write-Host "Command: $Command" -ForegroundColor Red
        Write-Host "Exit Code: $exitCode" -ForegroundColor Red
        return $false
    }
    return $true
}

function Execute-NonPrivilegedCommand {
    param (
        [string]$Command
    )
    
    try {
        $result = wsl -c "$Command"
        return $LASTEXITCODE
    } catch {
        Write-Host "WSL attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    try {
        $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $Command" -NoNewWindow -RedirectStandardOutput "tmp_output.txt" -RedirectStandardError "tmp_error.txt" -Wait
        $exitCode = $LASTEXITCODE
        if (Test-Path "tmp_output.txt") { Get-Content "tmp_output.txt" }
        if (Test-Path "tmp_error.txt") { Get-Content "tmp_error.txt" }
        Remove-Item "tmp_output.txt" "tmp_error.txt" -ErrorAction SilentlyContinue
        return $exitCode
    } catch {
        Write-Host "Command execution failed: $($_.Exception.Message)" -ForegroundColor Red
        return -1
    }
}

Write-Host "=== Redis Setup for anontweet.duckdns.org ===" -ForegroundColor Green
Write-Host ""

Write-Host "Starting Redis installation..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Redis
if (-not (Execute-Command "sudo apt update; sudo apt install redis-server -y" "Redis Package")) {
    Write-Host "Please install Redis manually using WSL or SSH command." -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual commands:" -ForegroundColor Yellow
    Write-Host "ssh user@anontweet.duckdns.org" -ForegroundColor Gray
    Write-Host "sudo apt update && sudo apt install redis-server -y" -ForegroundColor Gray
    Write-Host "sudo systemctl enable --now redis-server" -ForegroundColor Gray
    Write-Host "redis-cli ping" -ForegroundColor Gray
    return
}

# Step 2: Enable and start Redis service
if (-not (Execute-Command "sudo systemctl enable --now redis-server" "Redis Service Configuration")) {
    Write-Host "Please configure Redis service manually." -ForegroundColor Red
    return
}

# Step 3: Verify Redis installation
if (Execute-Command "redis-cli ping" "Redis Verification") {
    Write-Host ""
    Write-Host "Redis installation successful!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Redis is now running on: redis://localhost:6379" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:". -ForegroundColor Yellow
    Write-Host "- Rate limiter: Using Redis for state persistence" -ForegroundColor Green
    Write-Host "- Multiple servers: Can sync across load balancers" -ForegroundColor Green
    Write-Host "- Performance: Faster than memory-based storage" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "Redis verification failed." -ForegroundColor Red
    Write-Host "Please check if Redis is running with:" -ForegroundColor Yellow
    Write-Host "redis-cli ping" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Cyan
