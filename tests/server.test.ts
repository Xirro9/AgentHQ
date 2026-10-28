import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sanitizeEvent, redactText } from '../src/server/redact'
import { openEventsDb, type EventsDb } from '../src/server/db'
import { deriveAgentStates } from '../src/server/state'
import { buildServer, type RunningServer } from '../src/server/index'
import { startDemoAdapter, setDemoYielded, demoForcedByEnv } from '../src/server/adapters/demo'
import type { AgentId, NormalizedEvent, WorkEventKind } from '../src/shared/events'

// ---- helpers ----------------------------------------------------------------

let seq = 0

function makeEvent(over: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'kind'>): Omit<NormalizedEvent, 'ingestSeq'> {
  seq += 1
  const base = {
    schemaVersion: 1,
    eventId: `test-${seq}`,
    source: 'demo',
    nativeEventType: 'test:native',
    kind: over.kind,
    occurredAt: null,
    receivedAt: new Date().toISOString(),
    publicSummary: 'test event',
    provenance: 'simulation'
  }
  return { ...base, ...over } as Omit<NormalizedEvent, 'ingestSeq'>
}

function storedEvent(over: Partial<NormalizedEvent> & Pick<NormalizedEvent, 'kind'>): NormalizedEvent {
  return { ...makeEvent(over), ingestSeq: seq }
}

// ---- sanitizeEvent ----------------------------------------------------------

describe('sanitizeEvent', () => {
  it('passes a valid event through', () => {
    const valid = makeEvent({ kind: 'task.started', agentId: 'implementation', taskId: 'task-001' })
    const out = sanitizeEvent(valid)
    expect(out).not.toBeNull()
    expect(out?.kind).toBe('task.started')
    expect(out?.agentId).toBe('implementation')
    expect(out?.taskId).toBe('task-001')
    expect(out?.provenance).toBe('simulation')
  })

  it('strips keys that are not in the schema', () => {
    const dirty = {
      ...makeEvent({ kind: 'tool.started' }),
      rawPayload: { everything: 'sensitive' },
      hijacked: 'nope'
    }
    const out = sanitizeEvent(dirty)
    expect(out).not.toBeNull()
    expect(out).not.toHaveProperty('rawPayload')
    expect(out).not.toHaveProperty('hijacked')
    expect(out?.kind).toBe('tool.started')
  })

  it('redacts secret tokens inside strings', () => {
    const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3' // 27 chars after prefix
    const out = sanitizeEvent(makeEvent({ kind: 'tool.started', publicSummary: `ran with ${token} ok` }))
    expect(out?.publicSummary).toBe('ran with [REDACTED] ok')
    expect(out?.publicSummary).not.toContain('ghp_')
    expect(redactText('Bearer abcdef.ghijkl-123456 and sk-' + 'x'.repeat(25))).toBe('[REDACTED] and [REDACTED]')
    expect(redactText('key AKIAIOSFODNN7EXAMPLE end')).toBe('key [REDACTED] end')
  })

  it('rejects a publicSummary over 300 chars', () => {
    const out = sanitizeEvent(makeEvent({ kind: 'status.changed', publicSummary: 'x'.repeat(301) }))
    expect(out).toBeNull()
  })

  it('rejects any other string field over 300 chars', () => {
    const out = sanitizeEvent(makeEvent({ kind: 'status.changed', nativeEventType: 'y'.repeat(301) }))
    expect(out).toBeNull()
  })

  it('rejects null/undefined and non-objects', () => {
    expect(sanitizeEvent(null)).toBeNull()
    expect(sanitizeEvent(undefined)).toBeNull()
    expect(sanitizeEvent('task.started')).toBeNull()
    expect(sanitizeEvent(42)).toBeNull()
  })

  it('rejects events failing schema validation (bad kind, missing summary)', () => {
    expect(sanitizeEvent({ kind: 'not.a.kind', publicSummary: 'x' })).toBeNull()
    expect(sanitizeEvent({ kind: 'task.started' })).toBeNull()
  })

  it('allowlists safeDetails to primitive values only', () => {
    const out = sanitizeEvent(
      makeEvent({ kind: 'tool.started', safeDetails: { tool: 'edit', tries: 2, nested: { raw: 'payload' }, list: [1, 2] } })
    )
    expect(out?.safeDetails).toEqual({ tool: 'edit', tries: 2 })
  })

  it('never trusts a client-provided ingestSeq', () => {
    const out = sanitizeEvent({ ...makeEvent({ kind: 'task.started' }), ingestSeq: 999 })
    expect(out?.ingestSeq).toBe(0)
  })
})

// ---- db ---------------------------------------------------------------------

describe('events db', () => {
  let dir: string
  let db: EventsDb

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agenthq-db-'))
    db = openEventsDb(join(dir, 'data', 'agenthq.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('inserts, assigns increasing ingestSeq and dedupes on eventId', () => {
    const a = db.insertEvent(makeEvent({ eventId: 'evt-a', kind: 'task.created', agentId: 'hermes' }))
    const b = db.insertEvent(makeEvent({ eventId: 'evt-b', kind: 'task.started', agentId: 'hermes' }))
    expect(a?.ingestSeq).toBe(1)
    expect(b?.ingestSeq).toBe(2)
    expect(db.latestSeq()).toBe(2)

    const dup = db.insertEvent(makeEvent({ eventId: 'evt-a', kind: 'task.created', agentId: 'hermes' }))
    expect(dup?.ingestSeq).toBe(1) // existing row returned instead
    expect(db.latestSeq()).toBe(2) // nothing new inserted
  })

  it('returns snapshots in ascending order after a given seq', () => {
    for (const id of ['s1', 's2', 's3', 's4']) {
      db.insertEvent(makeEvent({ eventId: id, kind: 'status.changed' }))
    }
    const all = db.getSnapshot(0)
    expect(all.map((e) => e.eventId)).toEqual(['s1', 's2', 's3', 's4'])
    expect(all.map((e) => e.ingestSeq)).toEqual([1, 2, 3, 4])
    const afterTwo = db.getSnapshot(2)
    expect(afterTwo.map((e) => e.eventId)).toEqual(['s3', 's4'])
    const capped = db.getSnapshot(0, 2)
    expect(capped.map((e) => e.eventId)).toEqual(['s1', 's2'])
  })

  it('queryEvents filters by agentId and kind, newest first, with beforeSeq and limit', () => {
    const rows = [
      makeEvent({ eventId: 'q1', kind: 'task.started', agentId: 'implementation' }),
      makeEvent({ eventId: 'q2', kind: 'file.changed', agentId: 'implementation' }),
      makeEvent({ eventId: 'q3', kind: 'file.changed', agentId: 'tester' }),
      makeEvent({ eventId: 'q4', kind: 'file.changed', agentId: 'implementation' })
    ]
    for (const r of rows) db.insertEvent(r)

    const byAgent = db.queryEvents({ agentId: 'implementation' })
    expect(byAgent.map((e) => e.eventId)).toEqual(['q4', 'q2', 'q1']) // newest first

    const byKind = db.queryEvents({ kind: 'task.started' })
    expect(byKind.map((e) => e.eventId)).toEqual(['q1'])

    const before = db.queryEvents({ beforeSeq: 3, kind: 'file.changed' })
    expect(before.map((e) => e.eventId)).toEqual(['q2'])

    const limited = db.queryEvents({ agentId: 'implementation', limit: 1 })
    expect(limited.map((e) => e.eventId)).toEqual(['q4'])
  })
})

// ---- deriveAgentStates ------------------------------------------------------

describe('deriveAgentStates', () => {
  it('reports idle for agents with no evidence', () => {
    const states = deriveAgentStates([])
    expect(states.architect.state).toBe('idle')
  })

  it('derives working from task.started and tool activity', () => {
    const states = deriveAgentStates([storedEvent({ kind: 'task.started', agentId: 'implementation' })])
    expect(states.implementation.state).toBe('working')
    expect(states.implementation.since).toBeTruthy()
    expect(states.implementation.lastEventId).toBeTruthy()
  })

  it('derives testing from test.started', () => {
    const states = deriveAgentStates([storedEvent({ kind: 'test.started', agentId: 'tester' })])
    expect(states.tester.state).toBe('testing')
  })

  it('derives failed from a failed test and from tool.failed', () => {
    const failedTest = deriveAgentStates([
      storedEvent({ kind: 'test.completed', agentId: 'tester', status: 'failed', severity: 'error' })
    ])
    expect(failedTest.tester.state).toBe('failed')

    const failedTool = deriveAgentStates([
      storedEvent({ kind: 'tool.failed', agentId: 'implementation' })
    ])
    expect(failedTool.implementation.state).toBe('failed')
  })

  it('derives completed from task.completed and keeps it terminal', () => {
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'implementation' }),
      storedEvent({ kind: 'task.completed', agentId: 'implementation', status: 'succeeded' })
    ])
    expect(states.implementation.state).toBe('completed')
  })

  it('derives idle from agent.stopped', () => {
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'tester' }),
      storedEvent({ kind: 'agent.stopped', agentId: 'tester' })
    ])
    expect(states.tester.state).toBe('idle')
  })

  it('derives planning (agent.started without task) and assigned (task.created)', () => {
    const planning = deriveAgentStates([storedEvent({ kind: 'agent.started', agentId: 'debugger' })])
    expect(planning.debugger.state).toBe('planning')

    const assigned = deriveAgentStates([storedEvent({ kind: 'task.created', agentId: 'hermes', taskId: 'task-001' })])
    expect(assigned.hermes.state).toBe('assigned')
  })

  it('derives reviewing and waiting', () => {
    const reviewing = deriveAgentStates([storedEvent({ kind: 'review.started', agentId: 'frontend' })])
    expect(reviewing.frontend.state).toBe('reviewing')

    const waiting = deriveAgentStates([storedEvent({ kind: 'permission.requested', agentId: 'implementation' })])
    expect(waiting.implementation.state).toBe('waiting')
  })

  it('marks active states stale when events are older than 60s', () => {
    const old = new Date(Date.now() - 61_000).toISOString()
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'implementation', receivedAt: old })
    ])
    expect(states.implementation.state).toBe('stale')
  })

  it('does not mark terminal or recent states stale', () => {
    const old = new Date(Date.now() - 61_000).toISOString()
    const completed = deriveAgentStates([
      storedEvent({ kind: 'task.completed', agentId: 'implementation', receivedAt: old })
    ])
    expect(completed.implementation.state).toBe('completed')

    const fresh = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'implementation', receivedAt: new Date().toISOString() })
    ])
    expect(fresh.implementation.state).toBe('working')
  })

  it('marks agents offline when the adapter disconnected after their last evidence', () => {
    const t0 = new Date().toISOString()
    const t1 = new Date(Date.parse(t0) + 5_000).toISOString()
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'implementation', receivedAt: t0, ingestSeq: 1 }),
      storedEvent({ kind: 'integration.disconnected', receivedAt: t1, ingestSeq: 2, agentId: undefined })
    ])
    expect(states.implementation.state).toBe('offline')
  })

  it('later events win regardless of input order', () => {
    const t0 = new Date().toISOString()
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.completed', agentId: 'tester', ingestSeq: 1, receivedAt: t0 }),
      storedEvent({ kind: 'test.started', agentId: 'tester', ingestSeq: 2, receivedAt: t0 })
    ])
    expect(states.tester.state).toBe('testing')
  })

  it('ignores events with unknown agent ids', () => {
    const states = deriveAgentStates([
      storedEvent({ kind: 'task.started', agentId: 'root' as AgentId })
    ])
    expect(states.implementation.state).toBe('idle')
  })
})

// ---- demo adapter yield (live sources take precedence) -----------------------

describe('demo adapter yield', () => {
  let stops: Array<() => void>

  beforeEach(() => {
    vi.useFakeTimers()
    delete process.env.AGENTHQ_DEMO
    stops = []
  })

  afterEach(() => {
    for (const stop of stops) stop()
    setDemoYielded(false) // reset the process-global yield flag
    delete process.env.AGENTHQ_DEMO
    vi.useRealTimers()
  })

  function start(): { emitted: NormalizedEvent[]; stop: () => void } {
    const emitted: NormalizedEvent[] = []
    const stop = startDemoAdapter((e) => emitted.push(e as NormalizedEvent))
    stops.push(stop)
    return { emitted, stop }
  }

  it('stays silent while yielded and resumes from the NEXT beat (no replay, no duplicate ids)', async () => {
    const { emitted } = start()
    await vi.advanceTimersByTimeAsync(2_600) // beat 1 (t=0, 1 event) + beat 2 (t=2.5s, 2 events)
    const before = emitted.map((e) => e.eventId)
    expect(before).toHaveLength(3)
    expect(before[0]?.startsWith('demo-1-')).toBe(true)
    expect(before[2]?.startsWith('demo-2-')).toBe(true)

    setDemoYielded(true) // a live adapter connected
    await vi.advanceTimersByTimeAsync(10_000) // several would-be beats
    expect(emitted.map((e) => e.eventId)).toEqual(before) // silence during yield

    setDemoYielded(false) // all live adapters disconnected again
    await vi.advanceTimersByTimeAsync(100) // the pending beat fires immediately on resume
    const after = emitted.map((e) => e.eventId)
    expect(after).toHaveLength(4)
    // the chain continues at beat 3 (delegation) — beats 1-2 are never replayed
    expect(after[3]?.startsWith('demo-3-')).toBe(true)
    expect(emitted[3]?.nativeEventType).toBe('demo:agent.delegated')
    expect(new Set(after).size).toBe(after.length) // no duplicate eventIds

    await vi.advanceTimersByTimeAsync(2_600) // and the rhythm continues (beat 4 = 4 events)
    expect(emitted).toHaveLength(8)
  })

  it('an adapter started while yielded stays silent and starts at beat 1 on resume', async () => {
    setDemoYielded(true)
    const { emitted } = start()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(emitted).toHaveLength(0)
    setDemoYielded(false)
    await vi.advanceTimersByTimeAsync(100)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.eventId.startsWith('demo-1-')).toBe(true)
  })

  it('AGENTHQ_DEMO=on forces emission despite a yield request', async () => {
    process.env.AGENTHQ_DEMO = 'on'
    const { emitted } = start()
    setDemoYielded(true) // ignored: the env override wins
    await vi.advanceTimersByTimeAsync(5_100) // beats 1-3 fire regardless
    expect(emitted).toHaveLength(4)
    for (const e of emitted) expect(e.provenance).toBe('simulation')
  })

  it('demoForcedByEnv accepts 1/true/yes/on case-insensitively and rejects everything else', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'ON', 'True', 'YES', ' On ']) {
      expect(demoForcedByEnv({ AGENTHQ_DEMO: v })).toBe(true)
    }
    for (const v of ['', '0', 'false', 'off', 'no', ' maybe ']) {
      expect(demoForcedByEnv({ AGENTHQ_DEMO: v })).toBe(false)
    }
    expect(demoForcedByEnv({})).toBe(false)
  })

  it('stop() while yielded keeps the demo stopped (a later resume does not resurrect it)', async () => {
    const { emitted, stop } = start()
    await vi.advanceTimersByTimeAsync(2_600)
    setDemoYielded(true)
    stop()
    setDemoYielded(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(emitted).toHaveLength(3) // beats 1+2 only
  })
})

// ---- server mode truth: hermes OR opencode connected => live ------------------

describe('server mode truth (demo yields to live sources)', () => {
  let workDir: string
  let prevCwd: string
  let hermesFile: string
  let savedEnv: Record<string, string | undefined>

  function setEnv(key: string, value: string | undefined): void {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  beforeEach(() => {
    savedEnv = {}
    workDir = mkdtempSync(join(tmpdir(), 'agenthq-mode-'))
    prevCwd = process.cwd()
    process.chdir(workDir) // buildServer's default db path (data/agenthq.db) lands in the scratch dir
    hermesFile = join(workDir, 'hermes-events.jsonl')
    setEnv('HERMES_EVENTS_FILE', hermesFile)
    setEnv('HERMES_ADAPTER', undefined)
    setEnv('OPENCODE_ADAPTER', 'off')
    setEnv('OPENCODE_SERVER_URL', undefined)
    setEnv('AGENTHQ_DEMO', undefined)
  })

  afterEach(() => {
    process.chdir(prevCwd)
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(workDir, { recursive: true, force: true })
  })

  /** One line in the Hermes writer's shape (event_id + ts prepended hook object). */
  function hermesLine(eventId: string): string {
    return JSON.stringify({
      event_id: eventId,
      ts: '2026-10-28T10:00:00Z',
      hook_event_name: 'pre_tool_call',
      tool_name: 'terminal',
      cwd: workDir,
      extra: {}
    })
  }

  async function healthOf(server: RunningServer): Promise<{ mode: string; adapters: Record<string, string> }> {
    const res = await server.app.inject({ method: 'GET', url: '/api/health' })
    return res.json() as { mode: string; adapters: Record<string, string> }
  }

  it("hermes connected → mode 'live' (opencode off)", async () => {
    writeFileSync(hermesFile, hermesLine('m1') + '\n') // present at boot → the synchronous first poll connects
    const server = await buildServer()
    try {
      const body = await healthOf(server)
      expect(body.mode).toBe('live')
      expect(body.adapters.hermes).toBe('connected')
      expect(body.adapters.opencode).toBe('disabled')
    } finally {
      await server.stop()
    }
  })

  it('demo stays silent while hermes is connected (live data takes precedence)', async () => {
    writeFileSync(hermesFile, hermesLine('y1') + '\n') // present at boot → the synchronous first poll connects
    const server = await buildServer()
    try {
      const body = await healthOf(server)
      expect(body.mode).toBe('live')
      // Several demo beat slots pass (the scenario cadence is ~2.5s): not one
      // simulation event may appear while a live source is connected.
      await new Promise<void>((resolve) => setTimeout(resolve, 6000))
      const res = await server.app.inject({ method: 'GET', url: '/api/events?limit=100' })
      const events = (res.json() as { events: Array<{ provenance?: string }> }).events
      const sim = events.filter((e) => e.provenance === 'simulation')
      expect(sim, `demo emitted ${sim.length} simulation events while live`).toHaveLength(0)
      expect(events.length).toBeGreaterThan(0) // the real hermes event is there
    } finally {
      await server.stop()
    }
  }, 15_000)

  it("hermes disconnected + opencode off → mode 'demo'", async () => {
    const server = await buildServer()
    try {
      const body = await healthOf(server)
      expect(body.mode).toBe('demo')
      expect(body.adapters.hermes).toBe('disconnected')
      expect(body.adapters.opencode).toBe('disabled')
    } finally {
      await server.stop()
    }
  })

  it("opencode connected → mode 'live' (existing opencode behavior preserved)", async () => {
    const realSetTimeout = setTimeout // captured before fake timers install
    vi.useFakeTimers()
    let sseServer: Server | undefined
    let server: RunningServer | undefined
    try {
      // Minimal stand-in for the OpenCode event stream: a never-ending SSE body.
      sseServer = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: {"type":"session.started","sessionID":"sess-x"}\n\n')
      })
      await new Promise<void>((resolve) => sseServer!.listen(0, '127.0.0.1', resolve))
      setEnv('OPENCODE_ADAPTER', undefined) // enable the adapter for this test
      setEnv('OPENCODE_SERVER_URL', `http://127.0.0.1:${(sseServer!.address() as AddressInfo).port}`)
      server = await buildServer()

      expect((await healthOf(server)).mode).toBe('demo') // first probe is 10s out
      await vi.advanceTimersByTimeAsync(10_000) // fires the first probe
      // the probe's fetch completes via real loopback I/O; poll with real sleeps
      let body = await healthOf(server)
      for (let i = 0; i < 250 && body.mode !== 'live'; i++) {
        await new Promise<void>((resolve) => realSetTimeout(resolve, 20))
        body = await healthOf(server)
      }
      expect(body.mode).toBe('live')
      expect(body.adapters.opencode).toBe('connected')
    } finally {
      if (server) await server.stop()
      sseServer?.closeAllConnections()
      await new Promise<void>((resolve) => sseServer!.close(() => resolve()))
      vi.useRealTimers()
    }
  })

  it('pushes a WS {type:"mode"} message when hermes connects mid-run', async () => {
    const server = await buildServer() // hermes file absent: boots as 'demo'
    await server.app.listen({ port: 0, host: '127.0.0.1' })
    const ws = new WebSocket(`ws://127.0.0.1:${(server.app.server.address() as AddressInfo).port}/ws`)
    const messages: Array<Record<string, unknown>> = []
    ws.addEventListener('message', (ev) => {
      messages.push(JSON.parse(String(ev.data)) as Record<string, unknown>)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve())
        ws.addEventListener('error', () => reject(new Error('ws connect failed')))
      })
      ws.send(JSON.stringify({ type: 'hello', lastSeq: 0 }))

      const waitUntil = async (pred: () => boolean, what: string): Promise<void> => {
        for (let i = 0; i < 100 && !pred(); i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, 50))
        }
        expect(pred(), what).toBe(true)
      }
      await waitUntil(() => messages.some((m) => m.type === 'snapshot'), 'snapshot after hello')
      const snapshot = messages.find((m) => m.type === 'snapshot')
      expect(snapshot?.mode).toBe('demo')

      writeFileSync(hermesFile, hermesLine('ws1') + '\n') // hermes connects within its 2s poll
      await waitUntil(() => messages.some((m) => m.type === 'mode'), 'mode push after hermes connect')
      const modePushes = messages.filter((m) => m.type === 'mode')
      expect(modePushes).toHaveLength(1)
      expect(modePushes[0]?.mode).toBe('live')
    } finally {
      ws.close()
      await server.stop()
    }
  })
})
