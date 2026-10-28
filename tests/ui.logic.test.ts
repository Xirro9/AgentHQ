import { describe, expect, it } from 'vitest'
import type { NormalizedEvent, WorkEventKind } from '../src/shared/events'
import {
  DEFAULT_SETTINGS,
  deriveTaskCards,
  filterEvents,
  formatClock,
  formatRelative,
  summarizeTestEvents,
  validateSettings
} from '../src/client/ui/logic'

// ---- helpers ----------------------------------------------------------------

let seq = 0

interface EventSpec {
  kind: WorkEventKind
  agentId?: string
  taskId?: string
  summary?: string
  source?: NormalizedEvent['source']
  severity?: NormalizedEvent['severity']
  status?: NormalizedEvent['status']
  provenance?: NormalizedEvent['provenance']
  safeDetails?: Record<string, unknown>
  safeFileRefs?: string[]
  receivedAt?: string
}

/** Minimal valid NormalizedEvent with increasing ingestSeq. */
function mk(spec: EventSpec): NormalizedEvent {
  seq += 1
  return {
    schemaVersion: 1,
    eventId: `test-${seq}`,
    ingestSeq: seq,
    source: spec.source ?? 'demo',
    nativeEventType: `test:${spec.kind}`,
    kind: spec.kind,
    occurredAt: spec.receivedAt ?? '2026-10-28T10:00:00.000Z',
    receivedAt: spec.receivedAt ?? '2026-10-28T10:00:00.000Z',
    sessionId: undefined,
    taskId: spec.taskId,
    projectId: 'proj-1',
    agentId: spec.agentId as NormalizedEvent['agentId'],
    status: spec.status,
    publicSummary: spec.summary ?? `${spec.kind} happened`,
    safeFileRefs: spec.safeFileRefs,
    severity: spec.severity,
    provenance: spec.provenance ?? 'simulation',
    safeDetails: spec.safeDetails
  }
}

// ---- task column derivation (spec 04 §3) --------------------------------------

describe('task column derivation', () => {
  it('moves a card through the full demo lifecycle, ending in Done', () => {
    const events = [
      mk({ kind: 'task.created', agentId: 'hermes', taskId: 'task-001', summary: 'Refactor combat engine' }),
      mk({ kind: 'task.started', agentId: 'hermes', taskId: 'task-001' }),
      mk({ kind: 'agent.delegated', agentId: 'hermes', taskId: 'task-001' }),
      mk({ kind: 'task.started', agentId: 'implementation', taskId: 'task-001' }),
      mk({ kind: 'test.started', agentId: 'tester', taskId: 'task-001' }),
      mk({ kind: 'test.completed', agentId: 'tester', taskId: 'task-001' }),
      mk({ kind: 'task.completed', agentId: 'implementation', taskId: 'task-001' })
    ]
    const cards = deriveTaskCards(events)
    expect(cards).toHaveLength(1)
    const card = cards[0]
    expect(card.taskId).toBe('task-001')
    expect(card.column).toBe('done')
    expect(card.title).toBe('Refactor combat engine')
    // mini-steps: created, started, delegated, started, test.started,
    // test.completed, completed — every mapping kind is recorded
    expect(card.steps.map((s) => s.kind)).toEqual([
      'task.created',
      'task.started',
      'agent.delegated',
      'task.started',
      'test.started',
      'test.completed',
      'task.completed'
    ])
  })

  it('a tester role never implies the Testing stage: task.started lands in In Progress', () => {
    const events = [
      mk({ kind: 'task.created', agentId: 'hermes', taskId: 'task-002' }),
      mk({ kind: 'task.started', agentId: 'tester', taskId: 'task-002' })
    ]
    const card = deriveTaskCards(events)[0]
    expect(card.agentId).toBe('tester')
    expect(card.column).toBe('in-progress')
    expect(card.column).not.toBe('testing')
  })

  it('only the test.started event kind maps to Testing (never the agent)', () => {
    const events = [
      mk({ kind: 'task.started', agentId: 'tester', taskId: 'task-003' }),
      mk({ kind: 'test.started', agentId: 'tester', taskId: 'task-003' })
    ]
    expect(deriveTaskCards(events)[0].column).toBe('testing')
  })

  it('failures and blocks land in Blocked; the last mapping event wins', () => {
    const events = [
      mk({ kind: 'task.created', taskId: 'task-004' }),
      mk({ kind: 'task.started', taskId: 'task-004' }),
      mk({ kind: 'task.failed', taskId: 'task-004' })
    ]
    expect(deriveTaskCards(events)[0].column).toBe('blocked')

    const recovered = [
      ...events,
      mk({ kind: 'task.started', taskId: 'task-004' })
    ]
    expect(deriveTaskCards(recovered)[0].column).toBe('in-progress')
  })

  it('non-task events never create cards, even when they carry a taskId', () => {
    const events = [
      mk({ kind: 'tool.started', taskId: 'task-005', summary: 'ran shell' }),
      mk({ kind: 'file.changed', taskId: 'task-005', safeFileRefs: ['src/x.ts'] })
    ]
    expect(deriveTaskCards(events)).toEqual([])
  })

  it('task.assigned grounds a card in Queued but does not move it', () => {
    const events = [
      mk({ kind: 'task.assigned', taskId: 'task-006' }),
      mk({ kind: 'task.started', taskId: 'task-006' })
    ]
    const card = deriveTaskCards(events)[0]
    expect(card.column).toBe('in-progress')
    expect(card.steps.map((s) => s.kind)).toEqual(['task.assigned', 'task.started'])
  })

  it('orders cards by most recent activity, newest first', () => {
    const a = mk({ kind: 'task.created', taskId: 'task-a' })
    const b = mk({ kind: 'task.created', taskId: 'task-b' })
    b.ingestSeq = a.ingestSeq + 5
    const cards = deriveTaskCards([b, a])
    expect(cards.map((c) => c.taskId)).toEqual(['task-b', 'task-a'])
  })
})

// ---- feed filter ----------------------------------------------------------------

describe('event feed filter', () => {
  const events = [
    mk({ kind: 'task.created', taskId: 'task-1', summary: 'Refactor the combat engine', severity: 'info' }),
    mk({ kind: 'tool.started', taskId: 'task-1', summary: 'Implementation started edit', severity: 'info' }),
    mk({ kind: 'test.completed', summary: 'Tester: 2 tests failed', severity: 'error' }),
    mk({ kind: 'review.finding', summary: 'Security flagged input validation', severity: 'warning', source: 'opencode' })
  ]

  it('filters by exact kind', () => {
    expect(filterEvents(events, { kinds: ['test.completed'] })).toHaveLength(1)
  })

  it('filters by severity and keeps events without severity out', () => {
    const errors = filterEvents(events, { severities: ['error'] })
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
  })

  it('filters by source', () => {
    const oc = filterEvents(events, { sources: ['opencode'] })
    expect(oc).toHaveLength(1)
    expect(oc[0].kind).toBe('review.finding')
  })

  it('matches text case-insensitively across summary and kind', () => {
    expect(filterEvents(events, { text: 'COMBAT' })).toHaveLength(1)
    expect(filterEvents(events, { text: 'test.completed' })).toHaveLength(1)
  })

  it('caps the search needle at 100 characters', () => {
    // A 120-char summary; a query longer than 100 chars still matches through
    // its capped (first-100) prefix, and never matches unrelated text.
    const longSummary = 'Refactor the combat engine'.padEnd(120, 'k')
    const mine = [mk({ kind: 'task.created', taskId: 'task-9', summary: longSummary })]
    const query = `${longSummary}trailing garbage` // 136 chars
    expect(filterEvents(mine, { text: query })).toHaveLength(1)
    expect(filterEvents(events, { text: query })).toHaveLength(0)
  })

  it('combines filters and returns nothing when nothing matches', () => {
    expect(filterEvents(events, { kinds: ['task.created'], severities: ['error'] })).toEqual([])
    expect(filterEvents(events, { text: 'no such thing anywhere' })).toEqual([])
  })
})

// ---- relative time ---------------------------------------------------------------

describe('relative-time formatter', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z')

  it('formats the required buckets', () => {
    const at = (s: number): string => new Date(now - s * 1000).toISOString()
    expect(formatRelative(at(2), now)).toBe('just now')
    expect(formatRelative(at(45), now)).toBe('45s ago')
    expect(formatRelative(at(90), now)).toBe('1m ago')
    expect(formatRelative(at(5 * 60), now)).toBe('5m ago')
    expect(formatRelative(at(3 * 3600), now)).toBe('3h ago')
    expect(formatRelative(at(2 * 86400), now)).toBe('2d ago')
  })

  it('is honest about missing or invalid input', () => {
    expect(formatRelative(null, now)).toBe('unknown')
    expect(formatRelative('', now)).toBe('unknown')
    expect(formatRelative('not a timestamp', now)).toBe('unknown')
  })
})

describe('clock formatter', () => {
  it('renders local HH:MM:SS for valid timestamps', () => {
    expect(formatClock('2026-10-28T10:11:12.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(formatClock('2026-10-28T10:11:12.000Z')).not.toBe('—')
  })

  it('renders a dash for missing or invalid timestamps', () => {
    expect(formatClock(null)).toBe('—')
    expect(formatClock('garbage')).toBe('—')
  })
})

// ---- honest test summaries ---------------------------------------------------------

describe('test summaries', () => {
  it('shows "result only" when no parseable counts exist (demo shape)', () => {
    const rows = summarizeTestEvents([
      mk({ kind: 'test.started', summary: 'Tester started test run' }),
      mk({ kind: 'test.completed', summary: 'Tester: 2 tests failed in combat loop', severity: 'error', status: 'failed' })
    ])
    expect(rows).toHaveLength(2)
    expect(rows[1].counts).toBeNull() // numbers in prose are NOT counts
    expect(rows[1].status).toBe('failed')
  })

  it('surfaces counts only from numeric safeDetails fields', () => {
    const rows = summarizeTestEvents([
      mk({ kind: 'test.completed', safeDetails: { passed: 18, failed: 2, total: 20 } }),
      mk({ kind: 'test.completed', safeDetails: { passed: 'many' } })
    ])
    expect(rows[0].counts).toEqual({ passed: 18, failed: 2, total: 20 })
    expect(rows[1].counts).toBeNull()
  })

  it('ignores every non-test event', () => {
    expect(summarizeTestEvents([mk({ kind: 'tool.started' }), mk({ kind: 'task.completed' })])).toEqual([])
  })
})

// ---- settings validation ------------------------------------------------------------

describe('settings validation', () => {
  it('returns complete defaults for garbage input', () => {
    for (const garbage of [null, undefined, 42, 'nope', {}, { audio: 'loud' }]) {
      const s = validateSettings(garbage)
      expect(s).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('keeps valid values and fills the rest from defaults', () => {
    const s = validateSettings({ mischiefLevel: 'chaos', weather: 'rain', fpsCap: 30 })
    expect(s.mischiefLevel).toBe('chaos')
    expect(s.weather).toBe('rain')
    expect(s.fpsCap).toBe(30)
    expect(s.mode).toBe(DEFAULT_SETTINGS.mode)
    expect(s.audio).toEqual(DEFAULT_SETTINGS.audio)
  })

  it('clamps audio levels into 0..1 and rejects NaN', () => {
    const s = validateSettings({ audio: { master: 1.7, ui: -0.5, ambience: Number.NaN, cats: 0.4 } })
    expect(s.audio.master).toBe(1)
    expect(s.audio.ui).toBe(0)
    expect(s.audio.ambience).toBe(DEFAULT_SETTINGS.audio.ambience)
    expect(s.audio.cats).toBe(0.4)
  })

  it('rejects unknown enum values with the safe default', () => {
    const s = validateSettings({
      mode: 'live', // not a client choice: auto | demo only
      ambience: 'twilight',
      mischiefLevel: 'maximum',
      effectsQuality: 'ultra',
      fpsCap: 144
    })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, mode: 'auto', ambience: 'auto', mischiefLevel: 'normal', effectsQuality: 'medium', fpsCap: 60 })
  })

  it('defaults to muted (master gate) even when storage claims otherwise', () => {
    const s = validateSettings({ muted: false, catsEnabled: false })
    expect(s.muted).toBe(false) // explicit user choice is honored…
    expect(s.catsEnabled).toBe(false)
    expect(validateSettings({}).muted).toBe(true) // …but the default gate is on
  })
})
