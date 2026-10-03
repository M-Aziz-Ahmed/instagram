# Live server

Express + Socket.IO + Mongoose. Owns auth, messaging, communities, live streams,
voice/call signaling, the 8 multiplayer games, media moderation and push.

## Running more than one instance

A single process needs nothing extra. Several instances (the desktop app ships its
own) need shared Redis, because Socket.IO rooms otherwise live only in the memory of
whichever process emitted an event: Alice's call offer would be emitted into her
instance while Bob's socket hangs off his, so he would never receive it. Mongo would
still store the conversation — the delivery is what breaks.

With `REDIS_URL` set, `@socket.io/redis-adapter` merges every instance into one
logical cluster, so calls, voice, games and live streams work across users. Without
it the server still runs correctly as a single instance.

Rate-limit counters also move to Redis when it is available. They are otherwise
per-process, so N instances would grant N times the configured limit.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | — | **Required.** The server refuses to start without it. |
| `JWT_SECRET` | — | **Required.** Signs every session. No default, by design. |
| `MEDIA_VAULT_SECRET` | `JWT_SECRET` | Encrypts stored Google Drive tokens. Set it explicitly so rotating `JWT_SECRET` cannot orphan them. |
| `PORT` | `3001` | |
| `REDIS_URL` | `redis://localhost:6379` | Optional, but required for >1 instance. |
| `REDIS_RESP` | `2` | Set `3` to negotiate RESP3. RESP2 works with every Redis release; RESP3 needs Redis ≥ 6.0. |
| `MONGO_POOL_MAX` | `50` central, `5` sidecar | Pool is per process, so it multiplies by instance count. |
| `MONGO_POOL_MIN` | `10` central, `0` sidecar | |
| `SIDECAR_MODE` | unset | `1` for a desktop-bundled instance: no local reverse proxy, no scheduled/bot post publishers, no WarEra tracker. |

### `SIDECAR_MODE`

A desktop instance shares Mongo and Redis with the central server but must not act
like an operator's machine. Left enabled it would bind :80/:443 from every install,
publish every scheduled post once per user, and point a third-party site tracker at
its API from every install.

## Singleton jobs

`publishScheduledPosts()` and `runBotPosts()` have per-instance side effects, so they
run on exactly one process, arbitrated by a Redis lock (`SET NX` with a TTL) that is
released automatically if the holder dies. With Redis down there is one process and
the jobs simply run locally.

## Deploying Redis

`deploy/` holds a hardened `redis.conf`, a systemd unit and a ufw script for the box
that already hosts Mongo. Set `requirepass`, bind the LAN interface rather than
`0.0.0.0`, and restrict the port with the firewall script — an unauthenticated Redis
reachable by clients is a remote-code-execution risk.

## Tests

```bash
node lib/socketAdapter.test.js   # proves a broadcast crosses instances with the adapter
node lib/singleton.test.js       # proves only one instance runs the schedulers
```

Both skip cleanly when Redis is unavailable.

## Known pre-existing issues

- `FIREBASE_SERVICE_ACCOUNT` fails to parse at boot ("Expected property name or '}'"),
  disabling native-app push via FCM. Web push is unaffected.
- Socket identity is a claim, not a credential: only chess re-derives the player from
  the verified JWT. The other games, voice and streams trust `socket.data.username`
  from the unauthenticated handshake query.
- CORS computes an allowlist and then allows every origin anyway.
- `/api/logs` and `/api/debug/*` are unauthenticated.
- `/api/posts` is mounted with no rate limiter.
