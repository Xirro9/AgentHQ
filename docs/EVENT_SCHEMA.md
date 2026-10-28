# EVENT SCHEMA — the normalized event contract (reference)

Hand-written reference for `src/shared/events.ts` (verified against the code —
if this file and the code disagree, the code wins and this doc is stale).
Everything that is stored, transported, or displayed passes through the
`NormalizedEvent` shape below; adapters translate their native streams *into*
it, and the UI never sees anything else.

## 1. Vocabularies

### Event sources (`EVENT_SOURCES`)

| Source | Meaning |
|--------|---------|
| `hermes` | events observed from the Hermes manager runtime (adapter deferred — reserved) |
| `opencode` | events observed from the OpenCode event stream (experimental adapter) |
| `system` | AgentHQ's own integration lifecycle events (`integration.*`) |
| `demo` | the scripted demo fixture — never mixed into a real live timeline |
| `replay` | reserved label for replay-originated rendering (playback re-uses stored events in the client) |

### Work event kinds (`WORK_EVENT_KINDS`, 27)

`session.started` · `session.ended` · `agent.started` · `agent.stopped` ·
`task.created` · `task.assigned` · `task.started` · `task.completed` ·
`task.failed` · `task.blocked` · `agent.delegated` · `tool.started` ·
`tool.completed` · `tool.failed` · `file.changed` · `test.started` ·
`test.completed` · `review.started` · `review.finding` ·
`permission.requested` · `permission.resolved` · `status.changed` ·
`integration.connected` · `integration.disconnected` · `integration.gap` ·
`artifact.created` · `diagnostic.recorded`

### Work states (`WORK_STATES`, 12) — the desk pips

`unknown` · `offline` · `idle` · `assigned` · `planning` · `working` ·
`waiting` · `testing` · `reviewing` · `failed` · `completed` · `stale`

### Agents (`AGENT_IDS`, 7)

`hermes` (Manager) · `architect` (Planner) · `implementation` (Builder) ·
`frontend` (Designer) · `tester` (QA) · `debugger` (Detective) ·
`security` (Guardian)

## 2. `NormalizedEvent` fields (zod schema, `schemaVersion: 1`)

| Field | Type | Constraints / notes |
|-------|------|---------------------|
| `schemaVersion` | `1` (literal) | contract version |
| `eventId` | string | **stable identity, dedupe key** (unique index in SQLite); min length 1 |
| `ingestSeq` | int ≥ 0 | **server-assigned**, gap-free (SQLite rowid). Client-provided values are zeroed by `sanitizeEvent` |
| `source` | enum | one of `EVENT_SOURCES` |
| `nativeEventType` | string ≤ 120 | inspectable original label (e.g. `demo:task.started`, `session.created`) |
| `kind` | enum | one of `WORK_EVENT_KINDS` — the only field the UI logic branches on |
| `occurredAt` | string · null | ISO UTC from the source when it declares one, else `null` |
| `receivedAt` | string | ISO UTC at ingest — the authoritative ordering timestamp for replay |
| `sessionId` | string ≤ 120 · optional | |
| `parentSessionId` | string ≤ 120 · optional | delegation chains |
| `taskId` | string ≤ 120 · optional | grounds task-board cards |
| `projectId` | string ≤ 120 · optional | demo fixture uses `demo-fixture` |
| `agentId` | enum · optional | one of `AGENT_IDS`; unattributed events never move a desk |
| `toolCallId` | string ≤ 120 · optional | |
| `status` | enum · optional | `started` \| `succeeded` \| `failed` \| `interrupted` |
| `publicSummary` | string ≤ 300 | sanitized, display-safe prose — the only "content" field the UI shows |
| `safeFileRefs` | string[] ≤ 20 · optional | paths only (each ≤ 200 chars), **never file contents** |
| `severity` | enum · optional | `info` \| `warning` \| `error` |
| `provenance` | enum | `direct` (observed) \| `derived` (computed) \| `simulation` (demo) — rendered as trust labels |
| `confidence` | enum · optional | `high` \| `medium` \| `low` |
| `safeDetails` | record · optional | **allowlisted primitives only** (string/number/boolean/null); nested objects and arrays are dropped by the sanitizer |

Any string over 300 chars anywhere in the candidate event ⇒ the event is
**rejected** (not truncated) before storage. Unknown keys are stripped.

## 3. Kind → desk-state mapping (`src/server/state.ts`)

Applied in `ingestSeq` order; the newest mapping event per agent wins; terminal
states (`completed`/`failed`/`idle`) are sticky until a newer event. Afterwards:
an `integration.disconnected` newer than an agent's last evidence puts active
states to `offline`; active states quiet for > 60s become `stale`.

| Kind | State effect |
|------|--------------|
| `session.started` | `working` |
| `session.ended` | `idle` |
| `agent.started` | `assigned` (with `taskId`) / `planning` (without) |
| `agent.stopped` | `idle` |
| `task.created`, `task.assigned` | `assigned` |
| `task.started` | `working` |
| `task.completed` | `completed` (terminal) |
| `task.failed`, `tool.failed` | `failed` |
| `task.blocked` | `waiting` |
| `agent.delegated` | `working` |
| `tool.started`, `tool.completed`, `file.changed`, `artifact.created`, `diagnostic.recorded` | `working` |
| `test.started` | `testing` |
| `test.completed` | `working`, or `failed` when `status: "failed"` / `severity: "error"` |
| `review.started`, `review.finding` | `reviewing` |
| `permission.requested` | `waiting` |
| `permission.resolved` | `working` |
| `status.changed`, `integration.*` | no state change |

Replay Mode (spec 05) runs the **same** derivation over the emitted prefix with
the *virtual* clock as `now`, so desks reconstruct true historical states.

## 4. Transport messages (WS + snapshots)

Client → server:

```ts
{ type: 'hello'; lastSeq: number; mode?: 'live' | 'replay' }
```

Server → client (one JSON object per frame):

| Message | Payload | Meaning |
|---------|---------|---------|
| `snapshot` | `{ events: NormalizedEvent[], seq, mode }` | catch-up after hello; `mode` is the server's honest mode |
| `event` | `{ event: NormalizedEvent }` | one newly ingested event (zod-validated again client-side by `parseServerMessage`) |
| `mode` | `{ mode: string }` | server mode changed |
| `gap` | `{ fromSeq, toSeq }` | events in this seq range are no longer retained — cannot be replayed |
| `ping` | `{ t: number }` | heartbeat every 15s |

Malformed frames (bad JSON, schema-invalid `event`) are dropped silently by
`parseServerMessage` → the client never renders unvalidated data.

## 5. Native demo beats → kinds (`src/server/adapters/demo.ts`)

The scripted fixture emits one "beat" every ~2.5s (8s pause before looping);
`nativeEventType` keeps the inspectable original label:

| Native label | Kind (status/severity) | Beat |
|--------------|------------------------|------|
| `demo:task.created` | `task.created` | 1 — Hermes takes "Refactor combat engine" |
| `demo:agent.started` | `agent.started` | 2 · 5 · 7 |
| `demo:task.started` | `task.started` (`started`) | 2 · 4 |
| `demo:agent.delegated` | `agent.delegated` | 3 |
| `demo:tool.started` | `tool.started` | 4 · 7 |
| `demo:file.changed` | `file.changed` (safeFileRefs) | 4 |
| `demo:tool.completed` | `tool.completed` (`succeeded`) | 4 · 7 |
| `demo:review.started` | `review.started` | 5 |
| `demo:artifact.created` | `artifact.created` (safeFileRefs) | 5 |
| `demo:test.started` | `test.started` (`started`) | 6 · 9 |
| `demo:test.failed` | **`test.completed`** (`status: failed`, `severity: error`) | 6 — honest: the *kind* records the phase, `status` records the outcome |
| `demo:review.finding` | `review.finding` (`severity: warning`) | 8 |
| `demo:test.completed` | `test.completed` (`succeeded`) | 9 |
| `demo:task.completed` | `task.completed` (`succeeded`) | 10 |
| `demo:agent.stopped` | `agent.stopped` | 11 — all six involved agents |

All demo events carry `source: "demo"`, `provenance: "simulation"`,
`confidence: "high"`, `projectId: "demo-fixture"`, and eventIds
`demo-<beat>-<seed+counter>` (seed per process boot so restarts never collide
with persisted rows via dedup).

### OpenCode native → kind (experimental, `src/server/adapters/opencode.ts`)

Best-effort regex mapping; every mapped event keeps `provenance: "direct"` but
confidence is capped at `medium` until the adapter is verified
(INTEGRATION_AUDIT.md); unknown natives fall back to `status.changed` with
`low` confidence and the native label preserved:

| Native (lowercased, regex) | Kind |
|----------------------------|------|
| `session.execution.started` | `session.started` |
| `session.execution.succeeded` | `task.completed` |
| `session.execution.failed` | `task.failed` |
| `session.created|started` | `session.started` |
| `session.deleted|ended|error` | `session.ended` |
| `session.idle|status|compacted` | `status.changed` |
| `tool.called|started|input` | `tool.started` |
| `tool.success|completed` | `tool.completed` |
| `tool.failed|error` | `tool.failed` |
| `permission.asked|requested|updated` | `permission.requested` |
| `permission.resolved` | `permission.resolved` |
| `file.changed|edited|saved` | `file.changed` |
| `message.updated|part.updated|received` | `status.changed` |

System lifecycle events (`source: "system"`, `provenance: "direct"`,
`confidence: "high"`): `hq:opencode.connected` → `integration.connected`,
`hq:opencode.disconnected` → `integration.disconnected` (emitted on *transitions*
only, never on every failed probe).

## 6. Ordering, reconnect, and gap semantics

- **Ordering.** `ingestSeq` is a SQLite `AUTOINCREMENT` rowid — monotonic,
  gap-free per server process lifetime. Clients sort by `ingestSeq`; the store
  keeps the newest 500. `receivedAt` orders playback (replay clock); `occurredAt`
  is display-only and never trusted for ordering.
- **Dedup.** `eventId` has a UNIQUE index server-side; a re-ingested duplicate
  returns the stored row and is **not re-broadcast**. The client additionally
  dedupes by `eventId` when merging (`store.addEvents`), so reconnect
  snapshots can never double-render.
- **Reconnect.** On every (re)open the client sends `hello` with `lastSeq: 0`
  and receives a fresh snapshot of the newest 500 events; dedup makes the
  refill idempotent. Backoff is exponential (1s → 15s cap) with ≤ 250ms jitter.
- **Gaps.** The server retains everything and never deletes, so gaps should not
  occur; the guard still exists: when a client is more than 150 events behind
  **and** its `lastSeq` predates the oldest retained row, the server sends
  `{type:"gap", fromSeq, toSeq}` for the un-replayable range. The client
  currently treats a `gap` marker as informational (badge/health stay honest;
  nothing is fabricated for the missing range — unknown gaps stay unknown).
- **Replay.** `GET /api/events?limit=N` returns events **newest-first**; the
  client reverses them and walks the window with a virtual clock, feeding each
  crossed event into the same store pipeline under the `REPLAY` badge
  (spec 05, docs/OPERATIONS.md).
