import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sanitizeEvent, redactText } from '../src/server/redact'
import { openEventsDb, type EventsDb } from '../src/server/db'
import { deriveAgentStates } from '../src/server/state'
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
