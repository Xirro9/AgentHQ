# SECURITY MODEL — what AgentHQ can and cannot touch

AgentHQ is a **read-only, local-first observer**. This document is the
normative summary of how untrusted data is handled and what the system
deliberately cannot do. Code references are exact; if code and doc diverge, the
code wins and the doc must be fixed.

## 1. Network posture: loopback only

- The Fastify server binds `127.0.0.1:4310` by default (`resolveBind()` in
  `src/server/index.ts`); the vite dev server binds `127.0.0.1:5173`. The
  server bind is env-configurable (`AGENTHQ_HOST` / `AGENTHQ_PORT`, defaults
  unchanged) — an **opt-in** override documented for the Docker container
  bridge (docs/INTEGRATION_AUDIT.md, verified 2026-10-28): Docker port
  publishing forwards to the container's eth0, so the container-side bind may
  move, but the **host-side Docker publish address must stay loopback-only**
  (`-p 127.0.0.1:4310:4310`). There is **no authentication and no TLS** —
  the model is "the local user's machine is the trust boundary".
- Consequence (ops rule, docs/OPERATIONS.md): never port-forward, reverse-proxy,
  or publish the port beyond loopback on the host side. All endpoints are
  GET-only reads plus the WS stream; no endpoint mutates state outside the
  local events database.
- The only outbound connections AgentHQ ever makes are the OpenCode adapter's
  probes to `$OPENCODE_SERVER_URL` (default `http://127.0.0.1:4096`) — also a
  loopback service the user already runs.

## 2. The sanitization pipeline (every event, no exceptions)

All ingestion funnels through one function: adapters → `ingest()` →
**`sanitizeEvent(raw)`** (`src/server/redact.ts`) → SQLite insert → broadcast.
The pipeline, in order:

1. **Strip unknown keys.** Only keys present in the `NormalizedEvent` zod
   schema survive; anything else (`rawPayload`, injected fields, prototype
   garbage) is discarded.
2. **Reject oversized input.** If *any* string anywhere in the candidate is
   longer than 300 chars, the whole event is **rejected** (not truncated) —
   length cannot be masked by later redaction.
3. **Redact secrets everywhere.** Every string value *and* object key passes
   `redactText()`, which replaces these patterns with `[REDACTED]`
   (order matters — credential prefixes before greedy blob patterns):
   | Pattern | Catches |
   |---------|---------|
   | `gh[pousr]_[A-Za-z0-9]{20,}` | GitHub CLI tokens (ghp_/gho_/ghu_/ghs_/ghr_) |
   | `github_pat_[A-Za-z0-9_]{20,}` | fine-grained GitHub PATs |
   | `sk-[A-Za-z0-9]{20,}` | `sk-`-style API keys |
   | `AKIA[0-9A-Z]{16}` | AWS access key ids |
   | `Bearer\s+[A-Za-z0-9._-]{10,}` | authorization headers |
   | `[A-Za-z0-9+/]{32,}={0,2}` | long base64 blobs |
   | `[0-9a-fA-F]{32,}` | long hex blobs |
4. **Allowlist `safeDetails`.** Only primitive values (string/number/boolean/
   null) survive, each string redacted again; nested objects/arrays are
   dropped outright — raw payloads can never ride in details.
5. **Zero the sequence.** A client/adapter-supplied `ingestSeq` is overwritten
   with 0; the SQLite rowid is the only authoritative sequence.
6. **Final zod validation.** Anything that fails the shared schema is dropped
   and never stored, broadcast, or rendered.

The same discipline continues client-side: `parseServerMessage` re-validates
every `event` frame against the zod schema, and React escapes all rendered
strings (`publicSummary` is prose, never HTML).

## 3. What is never exposed

- **Raw payloads** — unknown keys are stripped; nested structures inside
  `safeDetails` are dropped; there is no field in the schema that could carry
  them.
- **Secrets** — tokens/keys/credentials matching §2 are redacted before
  storage and before any broadcast.
- **Reasoning / "thoughts"** — no reasoning-bearing kind exists in
  `WORK_EVENT_KINDS`; no adapter fabricates plans, thoughts, or summaries.
  `publicSummary` is the only prose field and adapters keep it to short factual
  labels (e.g. `OpenCode: <native type>`).
- **File contents** — `safeFileRefs` carries paths only (≤ 20 × 200 chars);
  no read-back, no diff, no contents endpoint exists.
- **Oversized anything** — oversized strings are rejected wholesale, so no
  field can smuggle a 10 KB blob.
- **Fake certainty** — confidence is capped at `medium` for the unverified
  OpenCode mapping; demo events are always `provenance: "simulation"`.

## 4. Adapter failure behavior (fail honest, fail quiet)

- The OpenCode adapter **probes** `GET /api/event` every 10s with a 3s connect
  timeout; it only consumes responses that really are event streams
  (`text/event-stream` or JSON lines). Anything else, any error, or a dropped
  stream ⇒ status `disconnected`, and **no event is synthesized** — ever.
- Integration lifecycle is reported via `system` events on *transitions only*
  (`integration.connected` / `integration.disconnected`), so a down adapter
  shows as honest `offline`/`disconnected` states, not a stream of noise.
- The demo adapter is clearly labeled (`source: "demo"`,
  `provenance: "simulation"`) and is **never mixed into a real live timeline**;
  demo events never flip the badge away from DEMO (client mode truth table).
- Adapter or stream errors never crash the server: every fetch/parse and every
  adapter timer callback is guarded, and the probe/poll loops reschedule.

## 5. Browser-side storage scope

`localStorage` holds exactly two keys, both validated/clamped on every load:

| Key | Contents | Validation |
|-----|----------|------------|
| `agenthq.settings` | UI settings (ambience, cats, performance, audio, mode preference) | `validateSettings()` — unknown fields dropped, enums coerced, audio clamped 0..1 |
| `agenthq.taskboard.notes` | manual sticky notes the user typed (local-only by design, tagged `manual`) | shape-checked on load |

No telemetry, event data, session ids, or derived states are persisted
client-side. The replay window lives in memory only and is discarded on exit.

## 6. No write-path into Hermes / OpenCode

- The adapters are **consumers**: one GET probe plus a one-way stream read.
  AgentHQ issues no POST/PUT/DELETE/PATCH to any external runtime, opens no
  shell, spawns no processes, and writes no files outside its own `data/`
  directory.
- Per brief §21: AgentHQ **never automatically restarts** GLM, Hermes,
  OpenCode, Docker, or GPU services, and never edits another service's
  configuration to make integration work.
- The cats and all office decoration are pure client-side simulation
  (`src/sim/*` is engine-free TS; nothing in it performs I/O). Cat "incidents"
  can never reach real files, terminals, or agent sessions.
- The events database is the only write target (SQLite via `node:sqlite`).
  There is no code path from the browser into the database other than the
  WebSocket `hello` message, which carries no data.

## 7. Threat model summary

| Threat | Posture |
|--------|---------|
| Malicious/compromised source runtime sends hostile events | zod schema + key stripping + 300-char rejection + redaction + details allowlist; oversized or invalid ⇒ dropped |
| Secret leaks through agent tool output | pattern redaction runs over every string, every event, before storage **and** transport |
| Malicious WS client connects | can only send `hello`; server treats it as read-only subscriber; no client-supplied `ingestSeq` is honored |
| XSS via event text | React text-node rendering only; no `innerHTML`; summaries capped at 300 chars |
| CSRF from a web page in the user's browser | all endpoints loopback + GET-only reads; no state-changing endpoints to forge; WS origin is the local page |
| Tampered `localStorage` | re-validated and clamped on every load; garbage falls back to defaults |
| Database tampering/replacement | sequence taken from rowids on read; dedupe by `eventId`; clients re-sync via snapshot on reconnect |
| Supply chain | zero runtime dependencies beyond fastify/@fastify-static/@fastify-websocket/phaser/react/zod; `node:sqlite` is built-in (no native builds); no telemetry or outbound analytics |
| AgentHQ harming the agents it watches | read-only adapters, no restarts, no config edits (§6) — the observer cannot affect the observed |
