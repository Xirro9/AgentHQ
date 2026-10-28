import { createHash } from 'node:crypto'
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { redactText } from '../redact'
import type { NormalizedEvent, WorkEventKind } from '../../shared/events'

export type HermesEmit = (e: Omit<NormalizedEvent, 'ingestSeq'>) => void

export type HermesStatus = 'connected' | 'disconnected' | 'disabled'

export interface HermesAdapter {
  stop(): void
  status(): HermesStatus
}

const POLL_INTERVAL_MS = 2_000
// (Re)connect reads are bounded to the LAST 1000 complete lines of the file.
const MAX_REPLAY_LINES = 1000
// Per-read byte cap: initial/replay reads scan at most the last 1 MiB, and a
// poll that finds more than 1 MiB of new lines continues on the next tick.
// The same 1 MiB bounds the retained trailing partial line: a newline-free
// region beyond the bound is discarded as malformed (see poll) so ingestion
// always progresses instead of wedging behind an ever-growing partial line.
const MAX_READ_BYTES = 1 << 20

// ---- pure mapping: Hermes hook object → normalized event draft ---------------

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

function pickString(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/**
 * Stable dedupe id. The writer's `event_id` when it can survive the redaction
 * layer untouched (sanitizeEvent redacts every string, and a plain 32+ hex id
 * — the writer's actual format — would collapse to '[REDACTED]' for every
 * event, making distinct events dedupe into one). Otherwise a sha1 over the
 * raw line (or over an unsanitary writer id), base64url-encoded: 27 chars can
 * never contain a 32+ hex run, so the digest is redact-immune and replays of
 * the same line still dedupe.
 */
function stableEventId(rec: Record<string, unknown>, rawLine: string): string {
  const writerId = pickString(rec, 'event_id')
  if (writerId !== undefined && redactText(writerId) === writerId) {
    return writerId
  }
  const source = writerId !== undefined ? writerId : rawLine
  return `hermes-${createHash('sha1').update(source).digest('base64url')}`
}

/**
 * Stable pseudonym for a raw Hermes session id (`local-<64hex>` in practice).
 * sanitizeEvent's long-hex pattern would redact the hex run, collapsing EVERY
 * session to the same 'local-[REDACTED]' label (observed in live events), so
 * the raw id never reaches the event: it is replaced with 'sess-' + the first
 * 10 base64url chars of its sha256. Deterministic across restarts and lines,
 * distinct per raw id, and at 15 chars too short to ever match the 32+ char
 * redact patterns.
 */
function pseudonymizeSessionId(raw: string): string {
  return `sess-${createHash('sha256').update(raw).digest('base64url').slice(0, 10)}`
}

function integrationEvent(connected: boolean): Omit<NormalizedEvent, 'ingestSeq'> {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    eventId: `system-hermes-${connected ? 'connected' : 'disconnected'}-${now}`,
    source: 'system',
    nativeEventType: connected ? 'hq:hermes.connected' : 'hq:hermes.disconnected',
    kind: connected ? 'integration.connected' : 'integration.disconnected',
    occurredAt: now,
    receivedAt: now,
    // no file path embedded: sanitizeEvent's blob patterns would mangle long
    // absolute paths inside the summary
    publicSummary: connected
      ? 'Connected to Hermes hook-event file'
      : 'Hermes hook-event file not available — adapter disconnected',
    provenance: 'direct',
    confidence: 'high'
  }
}

/**
 * Low-confidence data-quality note for the oversized newline-free region
 * discard. The status light stays 'connected' (the file IS being read and
 * ingestion progresses) — the dropped bytes are disclosed here instead of
 * being silenced. The timestamped eventId keeps successive notes distinct;
 * summaries carry the discarded byte counts.
 */
function hermesRegionNote(summary: string): Omit<NormalizedEvent, 'ingestSeq'> {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    eventId: `system-hermes-malformed-region-${now}`,
    source: 'system',
    nativeEventType: 'hq:hermes.malformed_region',
    kind: 'status.changed',
    occurredAt: now,
    receivedAt: now,
    publicSummary: summary,
    provenance: 'direct',
    confidence: 'low'
  }
}

/**
 * Pure mapping of one verified Hermes hook object (wire format in
 * docs/INTEGRATION_AUDIT.md) onto the normalized event draft. Only whitelisted
 * scalar fields are extracted — `tool_input`, `extra`, `args` and other raw
 * payload are never copied into the event. Raw `session_id`/`parent_session_id`
 * values are replaced with stable pseudonyms before mapping (see
 * pseudonymizeSessionId). `now` (the adapter receive time,
 * used when the writer sent no `ts`) is injectable to keep the mapping
 * deterministic for tests and replays.
 */
export function mapHermesHook(
  obj: unknown,
  rawLine: string,
  now: string = new Date().toISOString()
): Omit<NormalizedEvent, 'ingestSeq'> {
  const rec = asRecord(obj)
  const hookEventName = pickString(rec, 'hook_event_name') ?? 'unknown'

  const eventId = stableEventId(rec, rawLine).slice(0, 120)

  const tsMs = Date.parse(pickString(rec, 'ts') ?? '')
  const occurredAt = Number.isNaN(tsMs) ? null : new Date(tsMs).toISOString()
  const receivedAt = occurredAt ?? now

  const cwd = pickString(rec, 'cwd')
  const cwdBase = cwd !== undefined ? basename(cwd) : undefined
  const rawSessionId = pickString(rec, 'session_id')
  const sessionId = rawSessionId !== undefined ? pseudonymizeSessionId(rawSessionId) : undefined
  const rawParentSessionId = pickString(rec, 'parent_session_id')
  const parentSessionId = rawParentSessionId !== undefined
    ? pseudonymizeSessionId(rawParentSessionId)
    : undefined
  const tool = pickString(rec, 'tool_name')
  const extra = asRecord(rec.extra)
  const isError = Boolean(extra.is_error)
  const extraTaskId = pickString(extra, 'task_id')

  let kind: WorkEventKind
  let confidence: 'high' | 'low'
  let publicSummary: string
  let taskId: string | undefined
  switch (hookEventName) {
    case 'pre_tool_call':
      kind = 'tool.started'
      confidence = 'high'
      publicSummary = tool !== undefined ? `hermes tool: ${tool}` : 'hermes tool'
      break
    case 'post_tool_call':
      kind = isError ? 'tool.failed' : 'tool.completed'
      confidence = 'high'
      publicSummary = tool !== undefined ? `hermes tool: ${tool}` : 'hermes tool'
      break
    case 'on_session_start':
    case 'new_session': // legacy writer alias for on_session_start
      kind = 'task.started'
      confidence = 'high'
      taskId = sessionId
      publicSummary = cwdBase ? `new session (${cwdBase})` : 'new session'
      break
    case 'on_session_end':
      kind = 'agent.stopped'
      confidence = 'high'
      publicSummary = 'session ended'
      break
    case 'subagent_start':
      kind = 'agent.started'
      confidence = 'high'
      publicSummary = 'subagent started'
      break
    case 'subagent_stop':
      kind = 'agent.stopped'
      confidence = 'high'
      publicSummary = 'subagent stopped'
      break
    case 'kanban_task_claimed':
      kind = 'task.started'
      confidence = 'high'
      taskId = extraTaskId
      publicSummary = 'kanban task claimed'
      break
    case 'kanban_task_completed':
      kind = 'task.completed'
      confidence = 'high'
      taskId = extraTaskId
      publicSummary = 'kanban task completed'
      break
    case 'gateway_platform_event':
      kind = 'status.changed'
      confidence = 'high'
      publicSummary = 'gateway platform event'
      break
    case 'on_skill_lifecycle':
      kind = 'status.changed'
      confidence = 'high'
      publicSummary = 'skill lifecycle'
      break
    default:
      kind = 'status.changed'
      confidence = 'low'
      publicSummary = `hermes event: ${hookEventName}`
  }

  return {
    schemaVersion: 1,
    eventId,
    source: 'hermes',
    nativeEventType: `hermes.${hookEventName}`.slice(0, 120),
    kind,
    occurredAt,
    receivedAt,
    sessionId,
    parentSessionId,
    taskId,
    projectId: cwdBase ? cwdBase.slice(0, 120) : undefined,
    agentId: 'hermes',
    publicSummary: publicSummary.slice(0, 300),
    provenance: 'direct',
    confidence
  }
}

// ---- file-tail adapter --------------------------------------------------------

interface FileGeneration {
  ino: number
  /** Next byte of this file generation to consume. */
  offset: number
  /** False until the generation's first (bounded, last-1000) replay ran. */
  primed: boolean
}

/**
 * Ingests Hermes lifecycle hook events from a JSONL file written by the
 * Hermes-side hook writer (one JSON object per line, `event_id` + `ts`
 * prepended; contract in docs/INTEGRATION_AUDIT.md). Read-only.
 *
 * Polling every 2s is the source of truth (safe on network mounts); no
 * fs.watch dependency. Tracks (inode, size, offset): an inode change or a
 * shrink reopens the file and replays from byte 0 (same last-1000 cap). A
 * trailing partial line (no `\n`) is held until the writer completes it —
 * bounded at 1 MiB: a newline-free region beyond the bound is discarded and
 * counted malformed (with a low-confidence `status.changed` note), so
 * ingestion always progresses. A missing or non-regular file (e.g. a FIFO,
 * which is never opened — openSync would block on it) means 'disconnected';
 * the adapter connects when a regular file appears.
 */
export function startHermesAdapter(emit: HermesEmit): HermesAdapter {
  const filePath = process.env.HERMES_EVENTS_FILE || 'data/hermes-events.jsonl'

  if ((process.env.HERMES_ADAPTER || '').toLowerCase() === 'off') {
    return { stop() { /* nothing running */ }, status: () => 'disabled' }
  }

  let status: Exclude<HermesStatus, 'disabled'> = 'disconnected'
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let gen: FileGeneration | null = null
  let malformedLines = 0
  // Oversized-region discard bookkeeping: one note per discard episode (not
  // one per tick) plus the episode's cumulative byte count for the resume note.
  let discardRun = false
  let discardRunBytes = 0

  function setStatus(next: 'connected' | 'disconnected') {
    if (status === next) return
    status = next
    // transition-only: no repeated integration events while the file stays missing
    emit(integrationEvent(next === 'connected'))
  }

  function processLine(line: string): void {
    const trimmed = line.trim()
    if (trimmed.length === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      malformedLines += 1
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      malformedLines += 1
      return
    }
    emit(mapHermesHook(parsed, trimmed))
  }

  function poll(): void {
    if (stopped) return
    // Stat the path BEFORE opening it: openSync can block indefinitely on a
    // FIFO, so a non-regular file at the watched path is never opened at all.
    // It is treated like a missing file — disconnected, retried on later polls.
    let regular = false
    try {
      regular = statSync(filePath).isFile()
    } catch {
      /* missing/unreadable — handled below like the open-failure path */
    }
    if (!regular) {
      gen = null // fresh generation is replayed when a regular file reappears
      setStatus('disconnected')
      return
    }

    let fd: number
    try {
      fd = openSync(filePath, 'r')
    } catch {
      gen = null // file gone/unopenable — a fresh generation is replayed when it reappears
      setStatus('disconnected')
      return
    }

    // Phase 1 — fs work only (no emit), so a downstream emit failure cannot
    // corrupt the offset bookkeeping and a transient fs error just skips the tick.
    let opened:
      | { windowStart: number; completeBytes: number; lines: string[]; discardedBytes: number }
      | null = null
    try {
      const st = fstatSync(fd)
      if (!st.isFile()) {
        gen = null
      } else {
        if (gen === null || st.ino !== gen.ino || st.size < gen.offset) {
          // first sight of the file, inode change (rotate) or shrink (truncate):
          // (re)open the generation and replay from byte 0
          gen = { ino: st.ino, offset: 0, primed: false }
          discardRun = false
          discardRunBytes = 0
        }
        const replay = !gen.primed
        const windowStart = replay ? Math.max(0, st.size - MAX_READ_BYTES) : gen.offset
        const len = st.size - windowStart
        let completeBytes = 0
        let lines: string[] = []
        let discardedBytes = 0
        if (len > 0) {
          const buf = Buffer.alloc(Math.min(len, MAX_READ_BYTES))
          const bytesRead = readSync(fd, buf, 0, buf.length, windowStart)
          const lastNl = bytesRead > 0 ? buf.lastIndexOf(0x0a, bytesRead - 1) : -1
          if (lastNl >= 0) {
            completeBytes = lastNl + 1
            let text = buf.toString('utf8', 0, completeBytes)
            if (replay && windowStart > 0) {
              // a bounded tail read may start mid-line: drop the partial first segment
              text = text.slice(text.indexOf('\n') + 1)
            }
            lines = text.split('\n')
            lines.pop() // split artifact — the consumed region always ends with '\n'
            if (replay && lines.length > MAX_REPLAY_LINES) {
              lines = lines.slice(-MAX_REPLAY_LINES)
            }
          } else if (bytesRead === MAX_READ_BYTES && windowStart + bytesRead < st.size) {
            // Oversized newline-free region: the full 1 MiB window holds no
            // '\n' and more data follows, so the pending partial line exceeds
            // the retained-partial bound. Holding it would wedge ingestion
            // forever (offset never advances while status stays 'connected').
            // Discard exactly the newline-free partial line — scan forward to
            // its terminating '\n' (or EOF), count the bytes malformed, and
            // advance the offset past them so ingestion always progresses
            // (disclosed by a low-confidence note in phase 2).
            let scanPos = windowStart + bytesRead
            let nlPos = -1
            const scanBuf = Buffer.alloc(MAX_READ_BYTES)
            while (nlPos < 0 && scanPos < st.size) {
              const n = readSync(fd, scanBuf, 0, Math.min(scanBuf.length, st.size - scanPos), scanPos)
              if (n <= 0) break
              const i = scanBuf.subarray(0, n).indexOf(0x0a)
              if (i >= 0) {
                nlPos = scanPos + i
                break
              }
              scanPos += n
            }
            const discardEnd = nlPos >= 0 ? nlPos + 1 : st.size
            discardedBytes = discardEnd - windowStart
            gen.offset = discardEnd
          }
          // else: trailing partial line (≤ bound) stays held on disk until completed
        }
        opened = { windowStart, completeBytes, lines, discardedBytes }
      }
    } catch {
      opened = null
    } finally {
      closeSync(fd)
    }

    if (opened === null || gen === null) {
      setStatus('disconnected')
      return
    }
    gen.primed = true
    if (opened.completeBytes > 0) gen.offset = opened.windowStart + opened.completeBytes
    setStatus('connected')
    if (opened.discardedBytes > 0) {
      discardRunBytes += opened.discardedBytes
      if (!discardRun) {
        discardRun = true
        emit(hermesRegionNote(
          `Discarded ${opened.discardedBytes} bytes with no newline (over the 1 MiB partial-line bound) — waiting for the next complete line`
        ))
      }
    } else if (discardRun && opened.completeBytes > 0) {
      discardRun = false
      emit(hermesRegionNote(
        `Resumed ingestion after discarding ${discardRunBytes} bytes of newline-free data`
      ))
      discardRunBytes = 0
    }
    for (const line of opened.lines) processLine(line)
  }

  try {
    poll() // initial catch-up: the existing tail is ingested immediately on boot
  } catch {
    /* the first poll must never crash boot — the interval retries */
  }
  timer = setInterval(() => {
    try {
      poll()
    } catch {
      /* adapter errors never crash the server (SECURITY_MODEL.md §4); the next tick retries */
    }
  }, POLL_INTERVAL_MS)

  return {
    stop() {
      stopped = true
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
    status: () => status
  }
}
