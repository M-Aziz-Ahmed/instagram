# Deploying the live-server to an always-on host

Goal: get live-server off your laptop so the machine can be shut down. The public
entry point stays the same (`anontweet.duckdns.org`), so the desktop app and the web
app need **no code changes** — only a rebuild after the hostname or path changes.

## What this does and does not solve

**Solves:** your laptop can be off. One host runs live-server 24/7.

**Does not solve:** calls and voice behind restrictive networks still need a publicly
reachable TURN relay. WebRTC media is peer-to-peer, but when a direct path fails the
relay carries it, and a TURN server on a home connection is not reachable from outside.
`coturn` belongs on this host too, or use a hosted provider.

## Quick start

On the target host (Ubuntu 22.04 / Debian 12):

```bash
git clone <your-repo> anontweet-src
cd anontweet-src/live-server
sudo ./deploy/bootstrap.sh anontweet.duckdns.org
```

Then fill in the secrets it flags and start the service:

```bash
sudo nano /opt/anontweet-live-server/.env
sudo systemctl restart live-server
curl https://anontweet.duckdns.org/health
```

`bootstrap.sh` is idempotent — re-run it after a `git pull` to redeploy.

## Files

| File | Purpose |
|---|---|
| `bootstrap.sh` | Installs Node, Caddy, Redis, the app user, and both service units |
| `live-server.service` | systemd unit for the Node process, with hardening |
| `Caddyfile` | TLS reverse proxy with WebSocket-friendly timeouts |
| `redis.conf` | Redis with `requirepass`, LAN bind, `noeviction` |
| `redis-live-server.service` | systemd unit for Redis |
| `env.example` | Every variable, with generation commands |
| `redis-firewall.sh` | Restricts the Redis port to a LAN CIDR |

## Notes on each piece

**Why Redis at all?** A single instance needs nothing. Redis becomes required once
there is more than one, because Socket.IO rooms live only in the emitting process's
memory — a call offer from one instance is invisible to a socket held by another.
Redis also moves rate-limit counters off each process, which otherwise multiply the
configured limits by the instance count.

Set `REDIS_URL` in `.env` to match the password you chose in `redis.conf`.

**Why `NO_LOCAL_PROXY=1`?** `server.js` will spawn the bundled Windows `caddy.exe`
if it finds one. On Linux the system Caddy does that job instead.

**Firewall.** Open 22, 80, 443 inbound. Redis should *not* be open to the internet —
use `redis-firewall.sh` to restrict it to the LAN, or leave it bound to `127.0.0.1` if
nothing else on the network needs it.

**Behind a router?** Forward 80 and 443 to this host, and point DuckDNS at the
router's public address.

**TLS is terminated by Caddy, not by live-server.** `server.js` only enables HTTPS
itself when `key.pem` and `cert.pem` sit next to it, and `bootstrap.sh` deliberately
excludes `*.pem` from the copy. If you would rather have live-server terminate TLS,
drop your certificate in `/opt/anontweet-live-server/` and switch the `reverse_proxy`
to `https://127.0.0.1:3001` with `transport http { tls_insecure_skip_verify }`.

## After the move

1. Stop the old instance once the new one answers `/health`.
2. Rebuild the desktop app so it picks up the new `NEXT_PUBLIC_LIVE_SERVER_URL`:

   ```powershell
   $env:NEXT_PUBLIC_LIVE_SERVER_URL = "https://anontweet.duckdns.org"
   npm run desktop:prepare
   cd desktop; .\release.ps1 -Version 0.2.71
   ```

3. Set the same `JWT_SECRET` on the new host and anywhere else that verifies tokens
   (the Vercel project, and each desktop bundle). All three must match or sessions
   will read as signed out.
4. Move `MEDIA_VAULT_SECRET` across unchanged. It encrypts stored Google Drive
   tokens; changing it orphans every linked account.

## Rolling back

```bash
sudo systemctl stop live-server
# start the old instance
```

The database is untouched by a move — both instances point at the same Mongo.
