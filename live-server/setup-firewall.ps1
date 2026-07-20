#Requires -RunAsAdministrator
# Open Windows Firewall for live-server port 3001 (inbound)

$port = 3001
$ruleName = "AnonTweet Live Server (Port $port)"

# Remove old rule if exists
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Add inbound rule
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -Action Allow `
    -Profile Any `
    -Description "Allows inbound HTTPS traffic for AnonTweet live server" `
    -Enabled True

Write-Host "Firewall rule created: Allow TCP $port inbound" -ForegroundColor Green
Write-Host "  Rule: $ruleName" -ForegroundColor Gray
Write-Host "  Verify: Get-NetFirewallRule -DisplayName '$ruleName'" -ForegroundColor Gray
