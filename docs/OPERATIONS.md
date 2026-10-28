# OPERATIONS — running, health, data, and limits

Everything in AgentHQ runs **on loopback** in a single npm package. There is no
auth layer by design; the security model (docs/SECURITY_MODEL.md) therefore
depends on the loopback binding — never expose these ports.

## Launch

### Development (two processes, one command)

```bash
npm run dev
```

Runs via `concurrently -k` (Ctrl+C stops both; `-k` kills the sibling):

| Process | Command | Binds |
|---------|---------|-------|
| `web`   | `vite`  | `127.0.0.1:5173` — dev UI; proxies `/api/*` and `/ws` to the backend |
| `server`| `tsx watch src/server/index.ts` | `127.0.0.1:4310` — Fastify API + WebSocket + static assets contract |

Open **http://127.0.0.1:5173/**. The server auto-creates `data/agenthq.db`.

### Production (single process)

```bash
npm run build     # vite build → dist/
npm start         # tsx src/server/index.ts --production
```

Serves the built app **and** the API from `127.0.0.1:4310`. Non-API routes get
the SPA fallback (`index.html`); unknown `/api/*` or `/ws` paths get a 404.

### Pre-flight

```bash
npm run doctor    # toolchain, art manifest, data/ writability, ports, adapter target
```

## Stop

- **Dev:** Ctrl+C in the `npm run dev` terminal (concurrent kill of both).
- **Production:** send `SIGINT`/`SIGTERM`. The server shuts down gracefully:
  heartbeat timer cleared, demo + OpenCode adapters stopped, WebSocket clients
  closed, Fastify closed, SQLite database closed (`SIGINT`/`SIGTERM` handlers
  in `src/server/index.ts`). Kill -9 is never required and may leave WAL files
  behind (harmless — SQLite recovers, but see backup notes below).

## Health & data endpoints (all GET, loopback only)

| Endpoint | Returns |
|----------|---------|
| `GET /api/health` | `{ ok: true, mode: "live"\|"demo", adapters: { demo, opencode }, latestSeq }` — `mode` is honest: `demo` unless the OpenCode adapter is actually connected |
| `GET /api/snapshot?since=SEQ` | `{ events: NormalizedEvent[], seq }` — ascending events after `SEQ` (cap 500) |
| `GET /api/events?agentId=&kind=&beforeSeq=&limit=` | filtered events, **newest first** (limit default 200, max 1000) — this is what Replay Mode consumes |
| `GET /api/states` | per-agent derived work states (from the last 200 events) |
| `WS /ws` | client sends `{type:"hello", lastSeq}` → `{type:"snapshot", events, seq, mode}`; then `event`/`mode`/`gap`/`ping` (15s heartbeat). See docs/EVENT_SCHEMA.md |

`mode` truth: `live` only when the OpenCode adapter reports `connected`;
otherwise `demo`. The UI badge mirrors exactly what the server reports.

## Data: location, reset, backup, restore

- **Location:** `data/agenthq.db` (SQLite, WAL journal mode). Side files
  `data/agenthq.db-wal` / `-shm` exist while the server runs.
- **Reset (full data wipe):**
  ```bash
  # stop the server first (Ctrl+C / SIGTERM), then:
  rm -f data/agenthq.db data/agenthq.db-wal data/agenthq.db-shm
  npm run dev   # or npm start — the db is recreated empty
  ```
  After a reset the demo adapter repopulates the timeline within seconds.
- **Backup:** stop the server, then copy the file:
  ```bash
  cp data/agenthq.db backup/agenthq-$(date +%F).db
  ```
  Stopping first matters: copying a live WAL database can catch a
  mid-checkpoint state. For a hot backup instead, use `sqlite3
  data/agenthq.db ".backup 'backup/agenthq-hot.db'"`.
- **Restore:** stop the server, replace `data/agenthq.db`, delete any stale
  `-wal`/`-shm` side files from the *old* database, restart. On next boot the
  clients reconnect and dedupe by `eventId`, so already-seen events are not
  re-broadcast as new.

There is no retention/TTL yet (see limitations): the database grows as long as
the server runs. Reset or restore is the pruning mechanism.

## Ports & loopback notes

| Port | Who | Binding |
|------|-----|---------|
| 4310 | Fastify API + WS (dev and prod) | `127.0.0.1` only — hardcoded `HOST` in `src/server/index.ts` |
| 5173 | vite dev server | `127.0.0.1` (`vite.config.ts`) |
| 4096 | OpenCode server (external, optional) | adapter target, not opened by AgentHQ |

- Do **not** port-forward, reverse-proxy publicly, or run with `--host 0.0.0.0`:
  there is no authentication, and the event stream is meant for the local user.
- The vite proxy hardcodes the API target `127.0.0.1:4310`; if you must move
  the web port (e.g. `npx vite --port 5199`), the API port stays put.
- If :4310 is already in use the server exits — check for an already-running
  instance with `ss -ltnp | grep 4310` instead of killing it blindly.

## Adapters

| Adapter | Status | Notes |
|---------|--------|-------|
| `demo` | always available | scripted scenario, one beat every ~2.5s (8s pause between loops); clearly watermarked `DEMO` |
| `opencode` | **experimental** | probes `GET $OPENCODE_SERVER_URL/api/event` every 10s (3s connect timeout); consumes only verified event streams; `disconnected` is the expected state when no OpenCode server runs. Never synthesizes events. See docs/INTEGRATION_AUDIT.md |
| `hermes` | **deferred** | no verified structured-hook source in this environment; intentionally not faked |

Environment: `OPENCODE_SERVER_URL` (default `http://127.0.0.1:4096`),
`OPENCODE_ADAPTER=off|disabled|false|0` to disable the adapter entirely.

## Known limitations

1. **No authentication / TLS** — acceptable only because everything binds to
   loopback. Do not expose the ports.
2. **No retention/TTL** on the events table; the SQLite file grows until reset.
3. **Client feed cap**: the HUD store keeps the newest 500 events
   (`EVENT_CAP`), snapshots are capped at 500, queries at 1000 — replay of a
   very dense hour may see the store-side cap while the replay clock itself
   walks the full fetched window (≤1000 events).
4. **OpenCode adapter is experimental** until its event API is verified
   against the installed binary (INTEGRATION_AUDIT.md); mapping confidence is
   capped at `medium` accordingly.
5. **Hermes adapter deferred**; no manager-plan or "thought" data is
   fabricated to fill the gap (honest-status rule, brief §1.1).
6. **Desktop packaging (Tauri) is a later phase** (brief Phase 7).

## Verification & E2E

```bash
npx tsc -p tsconfig.json --noEmit   # type check (strict)
npm test                            # vitest unit suites
npm run build                       # production bundle
npx tsx tests/e2e/run.ts            # browser E2E — see scripts/e2e.md
```
