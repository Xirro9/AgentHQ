# Spec 01 — telemetry backend core + demo adapter

You are implementing the AgentHQ local telemetry backend. Work ONLY inside this repo. Do not modify files outside the paths listed below. TypeScript strict mode. No new dependencies beyond package.json (fastify, @fastify/websocket, @fastify/static, zod are already installed). Node 26 — use built-in `node:sqlite` (DatabaseSync), NOT better-sqlite3.

## Read first
- `src/shared/events.ts` — the event contract. Import from it; NEVER redefine or duplicate schema types. Do not modify this file.
- `docs/INTEGRATION_AUDIT.md`, `AGENT_HQ_MASTER_BRIEF.md` §8 (telemetry rules), §2 (product rules).

## Files to create
1. `src/server/redact.ts`
   - `redactText(s: string): string` — replace matches of: `gh[pousr]_[A-Za-z0-9]{20,}`, `github_pat_[A-Za-z0-9_]{20,}`, `sk-[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `Bearer\s+[A-Za-z0-9._-]{10,}`, long base64/hex blobs (>=32 chars) with `[REDACTED]`.
   - `sanitizeEvent(input: unknown): NormalizedEvent | null` — validate with the zod schema from shared/events; reject (return null) on: unknown oversized fields (any string >300 chars except publicSummary rule), keys not in the schema (strip them), null/undefined. Never forward raw payloads.
2. `src/server/db.ts`
   - SQLite at `data/agenthq.db` (mkdir data). WAL mode. Table `events`: `ingest_seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE, agent_id TEXT, kind TEXT, json TEXT NOT NULL, received_at TEXT`.
   - `insertEvent(e: Omit<NormalizedEvent,'ingestSeq'>): NormalizedEvent | null` — assigns ingestSeq, dedupes on eventId (return existing row's event instead), stores full JSON.
   - `getSnapshot(sinceSeq: number, limit = 500): NormalizedEvent[]` ordered by ingestSeq.
   - `queryEvents(f: {agentId?, kind?, beforeSeq?, limit?}): NormalizedEvent[]` newest-first.
   - `latestSeq(): number`.
3. `src/server/adapters/demo.ts`
   - Deterministic scripted scenario looping forever, tagged `source:'demo'`, `provenance:'simulation'`, `projectId:'demo-fixture'`. Scenario beats (in order, ~2.5s apart, then 8s pause and loop):
     1. task.created (hermes, taskId task-001, summary "Refactor combat engine")
     2. agent.started hermes → task.started hermes
     3. agent.delegated hermes→implementation
     4. task.started implementation; tool.started "edit"; file.changed src/combatEngine.ts; tool.completed
     5. agent.started frontend; review.started; artifact.created mockup.png
     6. test.started tester; test.failed tester (severity error)
     7. agent.started debugger; tool.started "shell"; tool.completed
     8. review.finding security (severity warning)
     9. test.started tester; test.completed succeeded
     10. task.completed implementation
     11. agent.stopped all involved
   - Stable eventIds: `demo-<beat>-<n>` so reconnect dedup works. Expose `startDemoAdapter(emit: (e) => void): () => void` returning a stop function. Use one interval chain, no leaked timers.
4. `src/server/adapters/opencode.ts`
   - `startOpencodeAdapter(emit): {stop(), status(): 'connected'|'disconnected'|'disabled'}`
   - Reads `OPENCODE_SERVER_URL` (default `http://127.0.0.1:4096`). Every 10s probes `GET /api/event` with 3s timeout. On connection: emit integration.connected events for opencode; consume the stream ONLY if it is actually an event stream (verify content-type text/event-stream or JSON lines) — otherwise stay disconnected. On any event received: map to kinds via a small `mapNative()` function (best-effort, `nativeEventType` preserved, `provenance:'direct'`, unknown names → kind `status.changed`, confidence 'low'). NEVER synthesize opencode events. Mark `integration.disconnected` on failure. This adapter is experimental — disconnected is the expected state in this environment.
5. `src/server/state.ts`
   - `deriveAgentStates(events: NormalizedEvent[]): Record<agentId, {state: WorkState, since: string, lastEventId?: string}>` — pure function implementing brief §6.2 (task.started→working, test.started→testing, review→reviewing, tool.failed/test failed→failed, task.completed→completed, agent.started without task→planning, no evidence→idle, adapter down→offline, events stale >60s→stale). Unit-test this heavily.
6. `src/server/index.ts`
   - Fastify, bound to `127.0.0.1:4310`. Routes:
     - `GET /api/health` → `{ok:true, mode, adapters:{demo:'running', opencode:<status>}, latestSeq}`
     - `GET /api/snapshot?since=N` → `{events:[...], seq}` (cap 500)
     - `GET /api/events?agentId=&kind=&beforeSeq=&limit=` → `{events:[...]}` via queryEvents
     - `GET /api/states` → deriveAgentStates over the last 200 events
     - `GET /ws` (websocket). On connect client sends `{type:'hello', lastSeq}`. Reply `snapshot` (events after lastSeq, max 500) + `mode`. Then push every new event as `{type:'event', event}`. Heartbeat `{type:'ping'}` every 15s. If a client's lastSeq is >150 behind latest, send snapshot then a single `{type:'gap', fromSeq, toSeq}` marker... (send gap ONLY if sinceSeq is older than the oldest retained event; we keep all events so gaps should not occur — implement the check anyway).
   - Start demo adapter on boot. All events pass through sanitizeEvent before insertEvent; insert then broadcast.
   - `--production` flag: serve `dist/` with @fastify/static and SPA fallback to index.html.
   - Graceful shutdown on SIGINT/SIGTERM (stop adapters, close db).
7. `tests/server.test.ts` (vitest)
   - sanitizeEvent: strips unknown keys, redacts tokens in strings, rejects >300-char summaries, passes a valid event.
   - db: insert → dedup same eventId → snapshot ordering → queryEvents filter.
   - deriveAgentStates: at least 6 assertions covering working/testing/failed/completed/idle/stale.

## Acceptance criteria (all must pass — run them)
1. `npx tsc -p tsconfig.json --noEmit` → exit 0
2. `npm test` → all green
3. `timeout 12 npx tsx src/server/index.ts &` then within it: `curl -s 127.0.0.1:4310/api/health` shows ok + demo running; `curl -s "127.0.0.1:4310/api/snapshot?since=0"` returns demo events with ingestSeq increasing; a `node --input-type=module` WS client receives `snapshot` then `event` messages.
4. No file outside the listed paths modified. No secrets, no absolute personal paths.

Report: files created, test output tail, health/snapshot curl output excerpts.
