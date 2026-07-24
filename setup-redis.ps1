# Redis Setup Script for anontweet.duckdns.org VPS

# This script should be run on the VPS via SSH:
# ssh root@anontweet.duckdns.org

# Install Redis
sudo apt update && sudo apt install redis-server -y

# Start and enable Redis on boot
sudo systemctl enable --now redis-server

# Verify Redis is running
redis-cli ping
# Expected output: PONG

# Check Redis status
sudo systemctl status redis-server

Write-Host "Redis setup complete! The rate limiter will now use Redis at redis://localhost:6379"
Write-Host "Note: No .env changes required - defaults work correctly."
