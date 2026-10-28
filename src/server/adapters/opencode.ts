import { AGENT_IDS, type AgentId, type NormalizedEvent, type WorkEventKind } from '../../shared/events'

export type OpencodeEmit = (e: Omit<NormalizedEvent, 'ingestSeq'>) => void

export type OpencodeStatus = 'connected' | 'disconnected' | 'disabled'

export interface OpencodeAdapter {
  stop(): void
  status(): OpencodeStatus
}

const PROBE_INTERVAL_MS = 10_000
const PROBE_TIMEOUT_MS = 3_000

/**
 * Best-effort mapping of native OpenCode event names onto the normalized kinds.
 * The exact v2.2.0 event names are unverified (see docs/INTEGRATION_AUDIT.md), so
 * every mapping keeps the native label, carries provenance 'direct' and only
 * medium confidence. Unknown names fall back to status.changed with low confidence.
 */
export function mapNative(nativeEventType: string): { kind: WorkEventKind; confidence: 'medium' | 'low' } {
  const n = nativeEventType.toLowerCase()
  const rules: Array<[RegExp, WorkEventKind]> = [
    [/session\.execution\.started/, 'session.started'],
    [/session\.execution\.succeeded/, 'task.completed'],
    [/session\.execution\.failed/, 'task.failed'],
    [/session\.(created|started)/, 'session.started'],
    [/session\.(deleted|ended|error)/, 'session.ended'],
    [/session\.(idle|status|compacted)/, 'status.changed'],
    [/tool\.(called|started|input)/, 'tool.started'],
    [/tool\.(success|completed)/, 'tool.completed'],
    [/tool\.(failed|error)/, 'tool.failed'],
    [/permission\.(asked|requested|updated)/, 'permission.requested'],
    [/permission\.resolved/, 'permission.resolved'],
    [/file\.(changed|edited|saved)/, 'file.changed'],
    [/message\.(updated|part\.updated|received)/, 'status.changed']
  ]
  for (const [re, kind] of rules) {
    if (re.test(n)) return { kind, confidence: 'medium' }
  }
  return { kind: 'status.changed', confidence: 'low' }
}

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (typeof obj !== 'object' || obj === null) return undefined
  const rec = obj as Record<string, unknown>
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.length > 0) return v.slice(0, 120)
  }
  return undefined
}

function pickAgentId(obj: unknown): AgentId | undefined {
  const raw = pickString(obj, ['agent', 'agentId', 'agentName'])
  return AGENT_IDS.find((id) => id === raw)
}

/** Small deterministic hash so id-less payloads still get a stable, dedupable eventId. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function integrationEvent(connected: boolean, url: string): Omit<NormalizedEvent, 'ingestSeq'> {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    eventId: `system-opencode-${connected ? 'connected' : 'disconnected'}-${now}`,
    source: 'system',
    nativeEventType: connected ? 'hq:opencode.connected' : 'hq:opencode.disconnected',
    kind: connected ? 'integration.connected' : 'integration.disconnected',
    occurredAt: now,
    receivedAt: now,
    publicSummary: connected
      ? `Connected to OpenCode event stream at ${url}`
      : 'OpenCode event stream not available — adapter disconnected',
    provenance: 'direct',
    confidence: 'high'
  }
}

/**
 * Experimental read-only adapter for the OpenCode v2 event stream.
 * Probes GET /api/event every 10s (3s header timeout). Consumes the stream only
 * when the response really is an event stream (text/event-stream or JSON lines);
 * otherwise it stays disconnected. Disconnected is the expected state in this
 * environment and the adapter NEVER synthesizes opencode events.
 */
export function startOpencodeAdapter(emit: OpencodeEmit): OpencodeAdapter {
  const url = process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096'
  const disabled = ['off', 'disabled', 'false', '0'].includes(
    (process.env.OPENCODE_ADAPTER || '').toLowerCase()
  )

  if (disabled) {
    return { stop() { /* nothing running */ }, status: () => 'disabled' }
  }

  let status: Exclude<OpencodeStatus, 'disabled'> = 'disconnected'
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let abort: AbortController | undefined

  function setStatus(next: 'connected' | 'disconnected') {
    if (status === next) return
    status = next
    // transition-only: avoid spamming integration.disconnected every 10s while down
    emit(integrationEvent(next === 'connected', url))
  }

  function scheduleProbe() {
    if (stopped) return
    timer = setTimeout(() => void probe(), PROBE_INTERVAL_MS)
  }

  function handleLine(line: string, sse: boolean) {
    const trimmed = line.trim()
    const done = String.fromCharCode(91, 68, 79, 78, 69, 93) // "[DONE]" sentinel
    if (trimmed.length === 0 || trimmed === done) return
    let payload = trimmed
    if (sse) {
      if (!payload.startsWith('data:')) return // event:/id:/comment lines are ignored
      payload = payload.slice(5).trim()
      if (payload.length === 0) return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      return // not JSON — not an event stream line we understand; never invent events
    }
    const body = typeof parsed === 'object' && parsed !== null && 'event' in parsed
      ? (parsed as Record<string, unknown>).event
      : parsed
    const native = pickString(body, ['type', 'eventType', 'name']) ?? 'unknown'
    const { kind, confidence } = mapNative(native)
    const occurredRaw = pickString(body, ['timestamp', 'time', 'createdAt'])
    const occurredMs = occurredRaw ? Date.parse(occurredRaw) : NaN
    const now = new Date().toISOString()
    emit({
      schemaVersion: 1,
      eventId: `opencode-${pickString(body, ['id', 'eventID', 'eventId']) ?? fnv1a(payload)}`,
      source: 'opencode',
      nativeEventType: native.slice(0, 120),
      kind,
      occurredAt: Number.isNaN(occurredMs) ? null : new Date(occurredMs).toISOString(),
      receivedAt: now,
      sessionId: pickString(body, ['sessionID', 'sessionId', 'sessionId_']),
      agentId: pickAgentId(body),
      publicSummary: `OpenCode: ${native.slice(0, 120)}`,
      provenance: 'direct',
      confidence
    })
  }

  async function consume(body: ReadableStream<Uint8Array>, sse: boolean): Promise<void> {
    const decoder = new TextDecoder()
    const reader = body.getReader()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, '')
          buffer = buffer.slice(nl + 1)
          handleLine(line, sse)
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async function probe(): Promise<void> {
    if (stopped) return
    abort = new AbortController()
    // 3s timeout applies to establishing the probe; cleared once headers arrive so
    // an accepted event stream is not killed mid-consumption.
    const timeout = setTimeout(() => abort?.abort(new Error('probe timeout')), PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(new URL('/api/event', url), {
        signal: abort.signal,
        headers: { accept: 'text/event-stream, application/x-ndjson, application/json' }
      })
      clearTimeout(timeout)
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const contentType = res.headers.get('content-type') ?? ''
      const sse = contentType.includes('text/event-stream')
      const jsonLines = /application\/(x-ndjson|json)/.test(contentType)
      if (!sse && !jsonLines) throw new Error(`unexpected content-type: ${contentType}`)
      setStatus('connected')
      await consume(res.body, sse)
    } catch {
      // probe failure, non-stream response, or stream ended — handled below
    } finally {
      clearTimeout(timeout)
    }
    if (stopped) return
    setStatus('disconnected')
    scheduleProbe()
  }

  scheduleProbe()

  return {
    stop() {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      abort?.abort(new Error('adapter stopped'))
    },
    status: () => status
  }
}
