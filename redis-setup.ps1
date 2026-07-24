"""
Redis Setup Script for anontweet.duckdns.org VPS

This PowerShell script automates Redis installation and setup.
Run this script from PowerShell AS ADMINISTRATOR on your Windows machine.

NOTE: This script should run on the machine that hosts the live-server
(anontweet.duckdns.org). If you're running on a different machine,
adjust the VPS address accordingly.
"""

Write-Host "=== Redis Setup for anontweet.duckdns.org ===" -ForegroundColor Green
Write-Host ""

# Function to execute command with error handling
function Execute-Command {
    param (
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "Installing: $Description..." -ForegroundColor Yellow
    $result = Execute-NonPrivilegedCommand $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to execute: $Description" -ForegroundColor Red
        Write-Host "Command: $Command" -ForegroundColor Red
        Write-Host "Exit Code: $LASTEXITCODE" -ForegroundColor Red
        return $false
    }
    return $true
}

# Function to execute non-privileged commands (from WSL/cmd)
function Execute-NonPrivilegedCommand {
    # Try to run via WSL first (if available)
    try {
        $result = wsl -c $ExecutionContext.SessionState.InvokeCommand.BaseCommand $Command
        return $result.ExitCode
    } catch {
        Write-Host "WSL attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    # Fallback to regular Windows command execution
    try {
        $result = [System.Diagnostics.Process]::Start(
            new-object System.Diagnostics.ProcessStartInfo(
                Name: "cmd",
                Arguments: "/c $Command",
                UseShellExecute: $false,
                RedirectStandardOutput: $true,
                RedirectStandardError: $true,
                Verb: "runas"
            )
        )
        $result.WaitForExit()
        return $result.ExitCode
    } catch {
        Write-Host "Command execution failed: $($_.Exception.Message)" -ForegroundColor Red
        return -1
    }
}

# Main installation process
Write-Host "Starting Redis installation..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Redis
$redisInstall = @"
sudo apt update
sudo apt install redis-server -y
"@"

if (-not Execute-Command $redisInstall "Redis Package") {
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
$redisConfigure = @"
sudo systemctl enable --now redis-server
"@"

if (-not Execute-Command $redisConfigure "Redis Service Configuration") {
    Write-Host "Please configure Redis service manually." -ForegroundColor Red
    return
}

# Step 3: Verify Redis installation
$redisVerify = @"
redis-cli ping
"@"

if (Execute-Command $redisVerify "Redis Verification") {
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