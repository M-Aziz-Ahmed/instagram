#!/usr/bin/env bash
#
# One-shot provisioning for a fresh Linux host: Node, the live-server, Redis and
# Caddy, with the app on a dedicated unprivileged user.
#
#   sudo ./bootstrap.sh <your-domain>
#   sudo ./bootstrap.sh anontweet.duckdns.org
#
# Safe to re-run: every step is idempotent.

set -euo pipefail

DOMAIN="${1:-}"
APP_DIR=/opt/anontweet-live-server
APP_USER=anontweet
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mxx  %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo $0 <domain>"
[ -n "$DOMAIN" ] || die "usage: sudo $0 <your-domain>"
command -v node >/dev/null || true

# ── Node 20 LTS ───────────────────────────────────────────────────────────────
log "Node.js 20 LTS"
if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "already installed: $(node --version)"
fi
node --version

# ── Caddy ─────────────────────────────────────────────────────────────────────
log "Caddy"
if ! command -v caddy >/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
else
    echo "already installed"
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
log "Redis"
if ! command -v redis-server >/dev/null; then
    apt-get install -y redis-server
fi
install -m 644 "$SOURCE_DIR/deploy/redis.conf" /etc/redis/redis.conf
install -m 644 "$SOURCE_DIR/deploy/redis-live-server.service" /etc/systemd/system/
log "Set a password before starting Redis"
warn "edit /etc/redis/redis.conf -> requirepass CHANGE_ME_STRONG_PASSWORD"
warn "edit /etc/redis/redis.conf -> bind <this host's LAN address>"
systemctl daemon-reload
systemctl enable --now redis-live-server || warn "redis failed to start; fix requirepass then: systemctl restart redis-live-server"

# ── Application user + files ──────────────────────────────────────────────────
log "Application user and files"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"

# Copy the code but never the local secrets, logs, TLS keys or the Windows proxy.
# node_modules is excluded so it is resolved for this platform rather than shipped.
log "Copying live-server source"
rsync -a --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'logs/' \
    --exclude '*.pem' \
    --exclude 'caddy.exe' \
    --exclude 'duckdns.env' --exclude 'duckdns.ini' --exclude 'duckdns.log' \
    --exclude 'certbot-output.txt' \
    "$SOURCE_DIR"/ "$APP_DIR"/

log "Installing production dependencies"
( cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund )

if [ ! -f "$APP_DIR/.env" ]; then
    install -o "$APP_USER" -g "$APP_USER" -m 600 "$SOURCE_DIR/deploy/env.example" "$APP_DIR/.env"
    warn "created $APP_DIR/.env - fill in JWT_SECRET, MONGODB_URI and MEDIA_VAULT_SECRET"
    warn "generate secrets with: openssl rand -hex 32"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── Services ──────────────────────────────────────────────────────────────────
log "Services"
install -m 644 "$SOURCE_DIR/deploy/live-server.service" /etc/systemd/system/

# Substitute the domain into a copy rather than editing the repo's Caddyfile in
# place, so re-running from a clean checkout is predictable.
CADDY_TMP="$(mktemp)"
sed "s/anontweet\.duckdns\.org/$DOMAIN/g" "$SOURCE_DIR/deploy/Caddyfile" > "$CADDY_TMP"
install -m 644 "$CADDY_TMP" /etc/caddy/Caddyfile
rm -f "$CADDY_TMP"
caddy validate --config /etc/caddy/Caddyfile || die "Caddyfile is invalid for domain $DOMAIN"

# The bundled Caddy is Windows-only; never let the server spawn it on Linux.
log "Confirming the local proxy is disabled"
grep -q 'NO_LOCAL_PROXY' /etc/systemd/system/live-server.service \
    || warn "live-server.service is missing NO_LOCAL_PROXY=1; server.js may try to spawn caddy.exe"

systemctl daemon-reload
systemctl enable --now live-server
systemctl enable --now caddy

# ── Verify ────────────────────────────────────────────────────────────────────
log "Waiting for the server to accept connections"
for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
        echo "live-server is healthy"
        break
    fi
    sleep 2
done

log "Next steps"
cat <<EOF
  1. Fill in $APP_DIR/.env  (JWT_SECRET, MONGODB_URI, MEDIA_VAULT_SECRET)
  2. systemctl restart live-server
  3. Confirm:  curl https://$DOMAIN/health
  4. Caddy needs ports 80/443 reachable from the internet for TLS.
     If this host is behind a router, forward 80 and 443 to it.
  5. Desktop builds read the backend from NEXT_PUBLIC_LIVE_SERVER_URL at build time,
     so point that at https://$DOMAIN and rebuild:
       set NEXT_PUBLIC_LIVE_SERVER_URL=https://$DOMAIN
       npm run desktop:prepare
EOF
