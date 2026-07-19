#!/bin/bash
# Run this on your live server as root/sudo
# It sets up nginx reverse proxy + free SSL for anontweet.duckdns.org
# Port 3001 stays internal, nginx exposes on 443

set -e

DOMAIN="anontweet.duckdns.org"
LIVE_PORT=3001

echo "=== Installing nginx + certbot ==="
apt update
apt install -y nginx certbot python3-certbot-nginx

echo "=== Configuring nginx ==="
cat > /etc/nginx/sites-available/anontweet <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$LIVE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/anontweet /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx

echo "=== Getting SSL certificate ==="
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

echo "=== Enabling auto-renewal ==="
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "=== DONE ==="
echo "Live server is now accessible at https://$DOMAIN"
echo "Port 3001 remains internal only"
echo "SSL auto-renews via certbot timer"
echo ""
echo "Now update your local .env:"
echo "  NEXT_PUBLIC_LIVE_SERVER_URL=https://$DOMAIN"
