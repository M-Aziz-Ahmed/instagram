# TURN server (coturn) — startup & recovery notes

This is the AnonFeed/Instagram-style app's WebRTC relay. coturn runs inside
WSL2 Ubuntu and shares the host's IP via mirrored networking
(`C:\Users\munee\.wslconfig` → `networkingMode=mirrored`).

## What's configured
- coturn 4.6.1, managed by systemd (`systemctl enable coturn`) → auto-starts on WSL boot.
- Config: `/etc/turnserver.conf` (inside WSL).
  - listening-port=3478 (UDP/TCP), tls-listening-port=8443 (TLS)
  - cert/pkey → `live-server/cert.pem` + `key.pem`
  - user=anonturn:I_hateyou2  (long-term credential; there is NO static-user/static-password directive)
  - realm=anontweet.duckdns.org
- App env (`.env`): NEXT_PUBLIC_TURN_URL=turns:anontweet.duckdns.org:8443,
  NEXT_PUBLIC_TURN_USER=anonturn, NEXT_PUBLIC_TURN_CRED=I_hateyou2

## After a Windows reboot
WSL stops on reboot, so coturn is down until WSL starts. To bring it back:
1. Open a normal PowerShell and run `wsl` (or any wsl command) to start the distro.
   systemd will auto-start coturn. Verify:
   `wsl -u root systemctl status coturn`
2. If it didn't start: `wsl -u root systemctl start coturn`

## Firewall (Windows, run ONCE as Administrator PowerShell)
Inbound allow for both UDP+TCP on 3478 and 8443:
```
New-NetFirewallRule -DisplayName "TURN UDP 3478" -Direction Inbound -Protocol UDP -LocalPort 3478 -Action Allow
New-NetFirewallRule -DisplayName "TURN TCP 3478" -Direction Inbound -Protocol TCP -LocalPort 3478 -Action Allow
New-NetFirewallRule -DisplayName "TURN TCP 8443" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
New-NetFirewallRule -DisplayName "TURN UDP 8443" -Direction Inbound -Protocol UDP -LocalPort 8443 -Action Allow
```

## Router
Forward UDP+TCP 3478 and 8443 to this PC's LAN IP (check `ipconfig` / `hostname -I`
inside WSL — with mirrored mode it's the host LAN IP, e.g. 192.168.100.5).

## Verify externally
```
turnutils_uclient -p 8443 -u anonturn -w I_hateyou2 anontweet.duckdns.org
```
You should see relay candidates and 0% packet loss.

## Don't use these (invalid coturn directives)
- `static-user=` / `static-password=` → NOT valid. Use `user=name:pass`.
- `use-auth-secret` + plain `-w password` from uclient won't work; either use
  `user=` (done here) or compute the HMAC credential.
