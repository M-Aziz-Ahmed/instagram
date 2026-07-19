# How to install & run coturn on the LIVE-SERVER machine
# (the box that runs live-server and is reachable at anontweet.duckdns.org)
#
# This is NOT run on your dev machine — run it on the server host.

## 1) Install coturn
# --- Linux (Debian/Ubuntu) ---
sudo apt update && sudo apt install -y coturn

# --- Windows (the live-server is Windows) ---
# Download the coturn Windows build or run it under WSL2 Ubuntu:
#   wsl --install
#   (then inside WSL: sudo apt install -y coturn)
# Or use the prebuilt Windows binary from:
#   https://github.com/coturn/coturn/releases

## 2) Place this config
# Copy turn/coturn.conf to the server and edit the cert/pkey paths to point
# at your duckdns cert.pem / key.pem (the same files live-server uses).
# Also set a strong static-password and keep it in sync with
# NEXT_PUBLIC_TURN_CRED in .env.

## 3) Run it
# --- Linux / WSL ---
sudo turnserver -c /path/to/coturn.conf

# To run in background / on boot:
sudo systemctl enable coturn
sudo systemctl start coturn

## 4) Open the firewall / port-forward
# - TCP + UDP 8443 (TURN-over-TLS — China-friendly, avoids Caddy's :443)
# - UDP 3478       (plain TURN, optional)
# Make sure your router forwards these to the live-server machine.

## 5) Verify
# From any machine:
#   turnutils_uclient -v -p 8443 -u anonturn -w '<PASSWORD>' anontweet.duckdns.org
# or use the online tester at https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
# You should see a 'relay' candidate appear.

## 6) Update the app
# Set in .env (already added):
#   NEXT_PUBLIC_TURN_URL=turns:anontweet.duckdns.org:8443
#   NEXT_PUBLIC_TURN_USER=anonturn
#   NEXT_PUBLIC_TURN_CRED=<same password as static-password above>
# Restart the Next.js app so it picks up the new env vars.
