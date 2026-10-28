import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { mapHermesHook, startHermesAdapter, type HermesEmit } from '../src/server/adapters/hermes'
import { resolveBind } from '../src/server/index'
import { sanitizeEvent } from '../src/server/redact'
import type { NormalizedEvent } from '../src/shared/events'

// ---- fixtures ----------------------------------------------------------------

const TS = '2026-10-28T10:00:00Z'
const NOW = '2026-10-28T12:00:00.000Z'

/** Fixture line in the writer's shape: event_id + ts prepended to the hook object. */
function hookLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: 'e1',
    ts: TS,
    hook_event_name: 'pre_tool_call',
    tool_name: 'terminal',
    session_id: 's-1',
    cwd: '/opt/data/projects/AgentHQ',
    extra: {},
    ...over
  })
}

function parse(line: string): unknown {
  return JSON.parse(line)
}

// ---- mapHermesHook -----------------------------------------------------------

describe('mapHermesHook', () => {
  it('maps pre_tool_call to tool.started with the tool name in the summary', () => {
    const line = hookLine()
    const e = mapHermesHook(parse(line), line, NOW)
    expect(e.kind).toBe('tool.started')
    expect(e.publicSummary).toBe('hermes tool: terminal')
    expect(e.nativeEventType).toBe('hermes.pre_tool_call')
    expect(e.agentId).toBe('hermes')
    expect(e.source).toBe('hermes')
    expect(e.provenance).toBe('direct')
    expect(e.confidence).toBe('high')
    expect(e.sessionId).toBe('sess-aoQLr12MP_') // pseudonym of 's-1' (sha256 base64url[0:10])
    expect(e.projectId).toBe('AgentHQ')
    // ts is normalized through Date (same convention as the opencode adapter)
    const iso = new Date(TS).toISOString()
    expect(e.occurredAt).toBe(iso)
    expect(e.receivedAt).toBe(iso)
    expect(sanitizeEvent(e)).not.toBeNull()
  })

  it('falls back to "hermes tool" and adapter receive time when fields are missing', () => {
    const line = JSON.stringify({ hook_event_name: 'pre_tool_call' })
    const e = mapHermesHook(parse(line), line, NOW)
    expect(e.publicSummary).toBe('hermes tool')
    expect(e.occurredAt).toBeNull()
    expect(e.receivedAt).toBe(NOW)
    expect(e.projectId).toBeUndefined()
    expect(e.sessionId).toBeUndefined()
    expect(sanitizeEvent(e)).not.toBeNull()
  })

  it('maps post_tool_call to tool.completed, or tool.failed when extra.is_error is truthy', () => {
    const ok = mapHermesHook(parse(hookLine({ hook_event_name: 'post_tool_call' })), '', NOW)
    expect(ok.kind).toBe('tool.completed')
    expect(ok.publicSummary).toBe('hermes tool: terminal')
    expect(ok.confidence).toBe('high')
    const failed = mapHermesHook(
      parse(hookLine({ hook_event_name: 'post_tool_call', extra: { is_error: true } })),
      '',
      NOW
    )
    expect(failed.kind).toBe('tool.failed')
    expect(failed.confidence).toBe('high')
  })

  it('maps new_session to task.started with taskId = pseudonymized session_id and cwd basename in the summary', () => {
    const e = mapHermesHook(parse(hookLine({ hook_event_name: 'new_session' })), '', NOW)
    expect(e.kind).toBe('task.started')
    expect(e.taskId).toBe('sess-aoQLr12MP_')
    expect(e.publicSummary).toBe('new session (AgentHQ)')
    expect(e.confidence).toBe('high')
    const bare = mapHermesHook(parse(JSON.stringify({ hook_event_name: 'new_session' })), '', NOW)
    expect(bare.publicSummary).toBe('new session')
    expect(bare.taskId).toBeUndefined()
  })

  it('maps on_session_start to task.started with taskId = pseudonymized session_id', () => {
    const e = mapHermesHook(parse(hookLine({ hook_event_name: 'on_session_start' })), '', NOW)
    expect(e.kind).toBe('task.started')
    expect(e.taskId).toBe('sess-aoQLr12MP_')
    expect(e.publicSummary).toBe('new session (AgentHQ)')
    expect(e.confidence).toBe('high')
    expect(e.nativeEventType).toBe('hermes.on_session_start')
  })

  it('maps on_session_end to agent.stopped', () => {
    const e = mapHermesHook(parse(hookLine({ hook_event_name: 'on_session_end' })), '', NOW)
    expect(e.kind).toBe('agent.stopped')
    expect(e.publicSummary).toBe('session ended')
    expect(e.confidence).toBe('high')
    expect(e.nativeEventType).toBe('hermes.on_session_end')
  })

  it('maps subagent_start to agent.started and subagent_stop to agent.stopped', () => {
    const start = mapHermesHook(parse(hookLine({ hook_event_name: 'subagent_start' })), '', NOW)
    expect(start.kind).toBe('agent.started')
    expect(start.publicSummary).toBe('subagent started')
    expect(start.confidence).toBe('high')
    expect(start.nativeEventType).toBe('hermes.subagent_start')
    const stop = mapHermesHook(parse(hookLine({ hook_event_name: 'subagent_stop' })), '', NOW)
    expect(stop.kind).toBe('agent.stopped')
    expect(stop.publicSummary).toBe('subagent stopped')
    expect(stop.confidence).toBe('high')
    expect(stop.nativeEventType).toBe('hermes.subagent_stop')
  })

  it('maps kanban_task_claimed/completed to task.started/completed with taskId = extra.task_id', () => {
    const claimed = mapHermesHook(
      parse(hookLine({ hook_event_name: 'kanban_task_claimed', extra: { task_id: 'T-42' } })),
      '',
      NOW
    )
    expect(claimed.kind).toBe('task.started')
    expect(claimed.taskId).toBe('T-42')
    expect(claimed.publicSummary).toBe('kanban task claimed')
    expect(claimed.confidence).toBe('high')
    expect(claimed.nativeEventType).toBe('hermes.kanban_task_claimed')
    const completed = mapHermesHook(
      parse(hookLine({ hook_event_name: 'kanban_task_completed', extra: { task_id: 'T-42' } })),
      '',
      NOW
    )
    expect(completed.kind).toBe('task.completed')
    expect(completed.taskId).toBe('T-42')
    expect(completed.publicSummary).toBe('kanban task completed')
    expect(completed.confidence).toBe('high')
    expect(completed.nativeEventType).toBe('hermes.kanban_task_completed')
    // no extra.task_id -> mapping still holds, taskId stays undefined
    const bare = mapHermesHook(parse(hookLine({ hook_event_name: 'kanban_task_claimed' })), '', NOW)
    expect(bare.kind).toBe('task.started')
    expect(bare.taskId).toBeUndefined()
  })

  it('pseudonymizes session ids: stable per raw id, distinct across ids, raw id never present', () => {
    // the raw id format observed live: 'local-<64hex>' — sanitizeEvent's
    // [0-9a-fA-F]{32,} pattern would redact the hex run and collapse every
    // session to 'local-[REDACTED]', so the mapping layer pseudonymizes first
    const raw = 'local-d7065182f99b17f8dfb67ce636e3481f5e635e595f56774c903c6462648cc65f'
    const line = hookLine({ hook_event_name: 'on_session_start', session_id: raw })
    const a = mapHermesHook(parse(line), line, NOW)
    const b = mapHermesHook(parse(hookLine({ session_id: raw })), '', NOW) // different hook/line
    // stable across lines (and restarts — pure hash, no state)
    expect(a.sessionId).toBe(b.sessionId)
    expect(a.sessionId).toBe(`sess-${createHash('sha256').update(raw).digest('base64url').slice(0, 10)}`)
    expect(a.sessionId).toMatch(/^sess-[A-Za-z0-9_-]{10}$/)
    // distinct raw ids stay distinct (the redaction collapse did not)
    const other = mapHermesHook(
      parse(hookLine({ session_id: 'local-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })),
      '',
      NOW
    )
    expect(other.sessionId).not.toBe(a.sessionId)
    // the raw id appears nowhere in the event, before or after sanitization,
    // and the pseudonym survives the long-hex redaction untouched
    const sanitized = sanitizeEvent(a)
    expect(sanitized).not.toBeNull()
    expect(JSON.stringify(a)).not.toContain(raw)
    expect(JSON.stringify(sanitized)).not.toContain(raw)
    expect(sanitized?.sessionId).toBe(a.sessionId)
    expect(sanitized?.sessionId).not.toContain('[REDACTED]')
  })

  it('maps gateway_platform_event and on_skill_lifecycle to status.changed', () => {
    const gw = mapHermesHook(parse(hookLine({ hook_event_name: 'gateway_platform_event' })), '', NOW)
    expect(gw.kind).toBe('status.changed')
    expect(gw.publicSummary).toBe('gateway platform event')
    expect(gw.confidence).toBe('high')
    expect(gw.nativeEventType).toBe('hermes.gateway_platform_event')
    const skill = mapHermesHook(parse(hookLine({ hook_event_name: 'on_skill_lifecycle' })), '', NOW)
    expect(skill.kind).toBe('status.changed')
    expect(skill.publicSummary).toBe('skill lifecycle')
    expect(skill.confidence).toBe('high')
    expect(skill.nativeEventType).toBe('hermes.on_skill_lifecycle')
  })

  it('falls back to low-confidence status.changed with the native label for unknown hooks', () => {
    const e = mapHermesHook(parse(hookLine({ hook_event_name: 'some_future_hook' })), '', NOW)
    expect(e.kind).toBe('status.changed')
    expect(e.confidence).toBe('low')
    expect(e.nativeEventType).toBe('hermes.some_future_hook')
    expect(e.agentId).toBe('hermes')
    expect(sanitizeEvent(e)).not.toBeNull()
  })

  it('uses event_id when present, else the sha1 of the raw line — stable across replays', () => {
    expect(mapHermesHook(parse(hookLine()), hookLine(), NOW).eventId).toBe('e1')
    const line = hookLine({ event_id: undefined }) // stringify drops the key
    const a = mapHermesHook(parse(line), line, NOW)
    const b = mapHermesHook(parse(line), line, NOW)
    expect(a.eventId).toBe(`hermes-${createHash('sha1').update(line).digest('base64url')}`)
    expect(b.eventId).toBe(a.eventId)
  })

  it('hashes a plain 32-hex writer event_id into a redact-immune stable id', () => {
    // the real Hermes writer emits 32-hex-char ids, which sanitizeEvent's
    // long-hex redact pattern would otherwise mangle into '[REDACTED]' for
    // EVERY event — distinct events must not share one dedupe key, so the id
    // is deterministically re-hashed into a 27-char redact-immune form
    const idA = '0314709c008c4f5bb2caa8e932ee92d7'
    const lineA = hookLine({ event_id: idA })
    const lineB = hookLine({ event_id: 'a6a805e15c8946e2b66fb7b04d9765a8' })
    const a = sanitizeEvent(mapHermesHook(parse(lineA), lineA, NOW))
    const b = sanitizeEvent(mapHermesHook(parse(lineB), lineB, NOW))
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a?.eventId).toBe(`hermes-${createHash('sha1').update(idA).digest('base64url')}`)
    expect(a?.eventId).not.toContain('[REDACTED]')
    expect(a?.eventId).not.toBe(b?.eventId)
    // replay of the same writer id (even on a different raw line) still dedupes
    expect(mapHermesHook(parse(lineA), hookLine({ event_id: idA, tool_name: 'other' }), NOW).eventId)
      .toBe(a?.eventId)
  })

  it('gives distinct id-less lines distinct sanitized eventIds (no [REDACTED] collisions)', () => {
    const lineA = hookLine({ event_id: undefined, tool_name: 'terminal' })
    const lineB = hookLine({ event_id: undefined, tool_name: 'edit' })
    const a = sanitizeEvent(mapHermesHook(parse(lineA), lineA, NOW))
    const b = sanitizeEvent(mapHermesHook(parse(lineB), lineB, NOW))
    expect(a?.eventId).not.toBe(b?.eventId)
    expect(a?.eventId).not.toContain('[REDACTED]')
    expect(b?.eventId).not.toContain('[REDACTED]')
  })

  it('never copies raw payload fields into the event', () => {
    const line = hookLine({
      tool_input: { command: 'rm -rf /', secret_token: 'ghp_AAAABBBBCCCCDDDDEEEEFFFF' },
      extra: { is_error: false, inner: { hidden: 'raw-payload' } },
      args: ['secret-arg'],
      parent_session_id: 'p-1'
    })
    const e = mapHermesHook(parse(line), line, NOW)
    expect(e).not.toHaveProperty('tool_input')
    expect(e).not.toHaveProperty('extra')
    expect(e).not.toHaveProperty('args')
    const json = JSON.stringify(e)
    expect(json).not.toContain('rm -rf')
    expect(json).not.toContain('raw-payload')
    expect(json).not.toContain('secret-arg')
    expect(json).not.toContain('ghp_')
    expect(e.parentSessionId).toBe('sess-He5uPsZ9yA') // pseudonymized 'p-1'
    expect(sanitizeEvent(e)).not.toBeNull()
  })
})

// ---- file-tail adapter (fake timers: the production interval is 2s) ----------

describe('hermes file-tail adapter', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agenthq-hermes-'))
    filePath = join(dir, 'hermes-events.jsonl')
    process.env.HERMES_EVENTS_FILE = filePath
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.HERMES_EVENTS_FILE
    delete process.env.HERMES_ADAPTER
    rmSync(dir, { recursive: true, force: true })
  })

  function start(): { adapter: ReturnType<typeof startHermesAdapter>; emitted: NormalizedEvent[] } {
    const emitted: NormalizedEvent[] = []
    const emit: HermesEmit = (e) => emitted.push(e as NormalizedEvent)
    return { adapter: startHermesAdapter(emit), emitted }
  }

  function hermesIds(emitted: NormalizedEvent[]): string[] {
    return emitted.filter((e) => e.source === 'hermes').map((e) => e.eventId)
  }

  it('connects when the file appears and ingests complete lines, skipping malformed ones', async () => {
    const { adapter, emitted } = start()
    expect(adapter.status()).toBe('disconnected')
    expect(emitted).toHaveLength(0) // missing file → no transition event yet

    appendFileSync(filePath, hookLine({ event_id: 'a1' }) + '\n')
    appendFileSync(filePath, 'not-json-at-all\n')
    appendFileSync(filePath, hookLine({ event_id: 'a2', hook_event_name: 'new_session' }) + '\n')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(adapter.status()).toBe('connected')
    expect(hermesIds(emitted)).toEqual(['a1', 'a2'])
    expect(emitted.some((e) => e.kind === 'integration.connected')).toBe(true)
    for (const e of emitted) expect(sanitizeEvent(e)).not.toBeNull()
    adapter.stop()
  })

  it('holds a trailing partial line until the writer completes it', async () => {
    writeFileSync(filePath, hookLine({ event_id: 'p1' }) + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toEqual(['p1']) // initial catch-up is synchronous

    appendFileSync(filePath, hookLine({ event_id: 'p2' })) // no trailing newline yet
    await vi.advanceTimersByTimeAsync(2_000)
    expect(hermesIds(emitted)).toEqual(['p1'])

    appendFileSync(filePath, '\n') // writer completes the line
    await vi.advanceTimersByTimeAsync(2_000)
    expect(hermesIds(emitted)).toEqual(['p1', 'p2'])
    adapter.stop()
  })

  it('discards a >1 MiB newline-free region as malformed and keeps ingesting later lines', async () => {
    writeFileSync(filePath, hookLine({ event_id: 'w1' }) + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toEqual(['w1'])

    // >1 MiB with no newline: without the bound this wedged ingestion forever
    // while the status light stayed 'connected' (offset never advanced)
    appendFileSync(filePath, Buffer.alloc(1_600_000, 0x78)) // 1.6 MiB of 'x'
    await vi.advanceTimersByTimeAsync(2_000) // the poll that observes the oversized region
    expect(adapter.status()).toBe('connected') // connected AND progressing — no lie
    expect(hermesIds(emitted)).toEqual(['w1'])
    // the drop is surfaced honestly: one low-confidence status.changed note
    const notes = emitted.filter((e) => e.nativeEventType === 'hq:hermes.malformed_region')
    expect(notes).toHaveLength(1)
    expect(notes[0].kind).toBe('status.changed')
    expect(notes[0].confidence).toBe('low')
    expect(notes[0].publicSummary).toContain('1600000')
    for (const e of emitted) expect(sanitizeEvent(e)).not.toBeNull()

    appendFileSync(filePath, hookLine({ event_id: 'w2' }) + '\n')
    await vi.advanceTimersByTimeAsync(4_000) // a few ticks — ingestion must have progressed
    expect(adapter.status()).toBe('connected')
    expect(hermesIds(emitted)).toEqual(['w1', 'w2'])
    // resume note discloses the episode's total discarded bytes
    const notesAfter = emitted.filter((e) => e.nativeEventType === 'hq:hermes.malformed_region')
    expect(notesAfter).toHaveLength(2)
    expect(notesAfter[1].publicSummary).toContain('1600000')
    adapter.stop()
  })

  it('reopens and replays from zero after a truncate without crashing', async () => {
    writeFileSync(filePath, hookLine({ event_id: 't1' }) + '\n' + hookLine({ event_id: 't2' }) + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toEqual(['t1', 't2'])

    writeFileSync(filePath, hookLine({ event_id: 't3' }) + '\n') // truncate + rewrite, smaller
    await vi.advanceTimersByTimeAsync(2_000)
    expect(adapter.status()).toBe('connected')
    expect(hermesIds(emitted)).toEqual(['t1', 't2', 't3'])
    adapter.stop()
  })

  it('replays from zero when the file is rotated (inode change)', async () => {
    writeFileSync(filePath, hookLine({ event_id: 'r1' }) + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toEqual(['r1'])

    const replacement = join(dir, 'rotated.jsonl')
    writeFileSync(replacement, hookLine({ event_id: 'r2' }) + '\n')
    renameSync(replacement, filePath) // fresh inode at the watched path
    await vi.advanceTimersByTimeAsync(2_000)
    expect(hermesIds(emitted)).toEqual(['r1', 'r2'])
    adapter.stop()
  })

  it('announces integration.disconnected when the file disappears', async () => {
    writeFileSync(filePath, hookLine({ event_id: 'd1' }) + '\n')
    const { adapter, emitted } = start()
    expect(adapter.status()).toBe('connected')

    rmSync(filePath)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(adapter.status()).toBe('disconnected')
    expect(emitted.some((e) => e.kind === 'integration.connected')).toBe(true)
    expect(emitted.some((e) => e.kind === 'integration.disconnected')).toBe(true)
    adapter.stop()
  })

  it('never opens a non-regular file (real FIFO): disconnected, retries, then recovers', async () => {
    const fifoPath = join(dir, 'hermes-events.fifo')
    const mk = spawnSync('mkfifo', [fifoPath])
    expect(mk.status).toBe(0)
    process.env.HERMES_EVENTS_FILE = fifoPath

    const { adapter, emitted } = start()
    expect(adapter.status()).toBe('disconnected')
    // if the adapter ever called openSync on the FIFO, the poll would block
    // the event loop forever and this suite would hang instead of passing
    await vi.advanceTimersByTimeAsync(6_000)
    expect(adapter.status()).toBe('disconnected')
    expect(hermesIds(emitted)).toEqual([])

    rmSync(fifoPath) // swap a regular file in at the same path: later polls retry
    writeFileSync(fifoPath, hookLine({ event_id: 'f1' }) + '\n')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(adapter.status()).toBe('connected')
    expect(hermesIds(emitted)).toEqual(['f1'])
    adapter.stop()
  })

  it('bounds the initial catch-up to the last 1000 complete lines', () => {
    const lines: string[] = []
    for (let i = 0; i < 1005; i++) lines.push(hookLine({ event_id: `n${i}` }))
    writeFileSync(filePath, lines.join('\n') + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toHaveLength(1000)
    expect(hermesIds(emitted)[0]).toBe('n5')
    expect(hermesIds(emitted)[999]).toBe('n1004')
    adapter.stop()
  })

  it('stops polling after stop()', async () => {
    writeFileSync(filePath, hookLine({ event_id: 's1' }) + '\n')
    const { adapter, emitted } = start()
    expect(hermesIds(emitted)).toEqual(['s1'])
    adapter.stop()

    appendFileSync(filePath, hookLine({ event_id: 's2' }) + '\n')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(hermesIds(emitted)).toEqual(['s1'])
  })

  it('keeps polling after an emit failure in the interval (adapter errors never crash the server)', async () => {
    writeFileSync(filePath, hookLine({ event_id: 'x1' }) + '\n')
    const emitted: NormalizedEvent[] = []
    const adapter = startHermesAdapter((e) => {
      if (e.eventId === 'x2') throw new Error('sink exploded')
      emitted.push(e as NormalizedEvent)
    })
    expect(hermesIds(emitted)).toEqual(['x1']) // boot poll unaffected

    // the interval tick ingests x2 and the broken sink throws: an unguarded
    // interval callback would blow up the whole run right here (SECURITY_MODEL.md §4)
    appendFileSync(filePath, hookLine({ event_id: 'x2' }) + '\n')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(adapter.status()).toBe('connected')

    // the server is still alive: later lines still flow
    appendFileSync(filePath, hookLine({ event_id: 'x3' }) + '\n')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(hermesIds(emitted)).toEqual(['x1', 'x3'])
    adapter.stop()
  })

  it('reports disabled and never polls when HERMES_ADAPTER=off', async () => {
    process.env.HERMES_ADAPTER = 'off'
    const { adapter, emitted } = start()
    expect(adapter.status()).toBe('disabled')

    appendFileSync(filePath, hookLine({ event_id: 'off1' }) + '\n')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(emitted).toHaveLength(0)
  })
})

// ---- server bind env parsing ---------------------------------------------------

describe('resolveBind (AGENTHQ_HOST / AGENTHQ_PORT)', () => {
  it('defaults to the former hard-coded loopback bind', () => {
    expect(resolveBind({})).toEqual({ host: '127.0.0.1', port: 4310 })
  })

  it('respects AGENTHQ_HOST and AGENTHQ_PORT', () => {
    expect(resolveBind({ AGENTHQ_HOST: '0.0.0.0', AGENTHQ_PORT: '4311' }))
      .toEqual({ host: '0.0.0.0', port: 4311 })
  })

  it('falls back to defaults on a missing or non-numeric port', () => {
    expect(resolveBind({ AGENTHQ_PORT: 'abc' })).toEqual({ host: '127.0.0.1', port: 4310 })
    expect(resolveBind({ AGENTHQ_PORT: '' })).toEqual({ host: '127.0.0.1', port: 4310 })
    expect(resolveBind({ AGENTHQ_HOST: '' })).toEqual({ host: '127.0.0.1', port: 4310 })
  })
})
