# ufw rules for a shared Redis event bus.
#
#   sudo ./redis-firewall.sh <lan-cidr>          e.g. 192.168.1.0/24
#
# Redis speaks plain TCP and carries the session-adjacent fan-out for calls, voice
# and games, so it must be reachable by every desktop instance and by nothing else.
# Restricting it to the LAN CIDR keeps it off the public internet, where an
# unauthenticated or weakly-authenticated Redis is a remote-code-execution risk.

set -euo pipefail

LAN_CIDR="${1:-}"
REDIS_PORT=6379

if [ -z "$LAN_CIDR" ]; then
    echo "usage: $0 <lan-cidr>   e.g. $0 192.168.1.0/24" >&2
    exit 1
fi

echo "Restricting redis:${REDIS_PORT} to ${LAN_CIDR}"

sudo ufw allow from "$LAN_CIDR" to any port "$REDIS_PORT" proto tcp comment 'AnonTweet redis bus'
sudo ufw deny "$REDIS_PORT"/tcp comment 'AnonTweet redis bus - deny the rest'

echo
echo "Verify the rules that apply:"
sudo ufw status numbered | grep -E "^$REDIS_PORT|redis" || true
