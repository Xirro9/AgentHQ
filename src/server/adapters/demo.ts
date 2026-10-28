import type { NormalizedEvent } from '../../shared/events'

export type DemoEmit = (e: Omit<NormalizedEvent, 'ingestSeq'>) => void

type EventDraft = Omit<NormalizedEvent, 'ingestSeq' | 'schemaVersion' | 'source' | 'provenance' | 'projectId' | 'eventId' | 'occurredAt' | 'receivedAt'>

const BEAT_MS = 2_500
const PAUSE_MS = 8_000

// Monotonic emission counter backing the `demo-<beat>-<n>` eventIds, seeded once
// per process: ids are stable while the server runs (WS reconnects dedupe by
// eventId) and never collide across restarts, so a persisted db never silences
// the looping scenario via dedup.
const BOOT_SEED = Date.now() % 1e9
let emissionCounter = 0

const INVOLVED_AGENTS = ['hermes', 'implementation', 'frontend', 'tester', 'debugger', 'security'] as const

const BEATS: Array<() => EventDraft[]> = [
  // 1 — the manager takes on a task
  () => [
    { kind: 'task.created', agentId: 'hermes', taskId: 'task-001', nativeEventType: 'demo:task.created', publicSummary: 'Refactor combat engine' }
  ],
  // 2 — hermes starts working it
  () => [
    { kind: 'agent.started', agentId: 'hermes', taskId: 'task-001', nativeEventType: 'demo:agent.started', publicSummary: 'Hermes picked up task-001' },
    { kind: 'task.started', agentId: 'hermes', taskId: 'task-001', status: 'started', nativeEventType: 'demo:task.started', publicSummary: 'Hermes started Refactor combat engine' }
  ],
  // 3 — delegation to the builder
  () => [
    { kind: 'agent.delegated', agentId: 'hermes', taskId: 'task-001', nativeEventType: 'demo:agent.delegated', publicSummary: 'Hermes delegated task-001 to Implementation', safeDetails: { to: 'implementation' } }
  ],
  // 4 — implementation edits the combat engine
  () => [
    { kind: 'task.started', agentId: 'implementation', taskId: 'task-001', status: 'started', nativeEventType: 'demo:task.started', publicSummary: 'Implementation started task-001' },
    { kind: 'tool.started', agentId: 'implementation', taskId: 'task-001', nativeEventType: 'demo:tool.started', publicSummary: 'Implementation started edit on src/combatEngine.ts', safeDetails: { tool: 'edit' } },
    { kind: 'file.changed', agentId: 'implementation', taskId: 'task-001', safeFileRefs: ['src/combatEngine.ts'], nativeEventType: 'demo:file.changed', publicSummary: 'Implementation edited src/combatEngine.ts' },
    { kind: 'tool.completed', agentId: 'implementation', taskId: 'task-001', status: 'succeeded', nativeEventType: 'demo:tool.completed', publicSummary: 'Implementation finished edit', safeDetails: { tool: 'edit' } }
  ],
  // 5 — frontend joins, reviews, ships a mockup
  () => [
    { kind: 'agent.started', agentId: 'frontend', taskId: 'task-001', nativeEventType: 'demo:agent.started', publicSummary: 'Frontend joined task-001' },
    { kind: 'review.started', agentId: 'frontend', taskId: 'task-001', nativeEventType: 'demo:review.started', publicSummary: 'Frontend started design review' },
    { kind: 'artifact.created', agentId: 'frontend', taskId: 'task-001', safeFileRefs: ['mockup.png'], nativeEventType: 'demo:artifact.created', publicSummary: 'Frontend produced mockup.png' }
  ],
  // 6 — first test run fails
  () => [
    { kind: 'test.started', agentId: 'tester', taskId: 'task-001', status: 'started', nativeEventType: 'demo:test.started', publicSummary: 'Tester started test run' },
    { kind: 'test.completed', agentId: 'tester', taskId: 'task-001', status: 'failed', severity: 'error', nativeEventType: 'demo:test.failed', publicSummary: 'Tester: 2 tests failed in combat loop' }
  ],
  // 7 — debugger investigates with a shell tool
  () => [
    { kind: 'agent.started', agentId: 'debugger', taskId: 'task-001', nativeEventType: 'demo:agent.started', publicSummary: 'Debugger joined task-001' },
    { kind: 'tool.started', agentId: 'debugger', taskId: 'task-001', nativeEventType: 'demo:tool.started', publicSummary: 'Debugger ran a shell command', safeDetails: { tool: 'shell' } },
    { kind: 'tool.completed', agentId: 'debugger', taskId: 'task-001', status: 'succeeded', nativeEventType: 'demo:tool.completed', publicSummary: 'Debugger shell command finished', safeDetails: { tool: 'shell' } }
  ],
  // 8 — security raises a warning-level finding
  () => [
    { kind: 'review.finding', agentId: 'security', taskId: 'task-001', severity: 'warning', nativeEventType: 'demo:review.finding', publicSummary: 'Security flagged input validation in combat loop' }
  ],
  // 9 — second test run passes
  () => [
    { kind: 'test.started', agentId: 'tester', taskId: 'task-001', status: 'started', nativeEventType: 'demo:test.started', publicSummary: 'Tester re-ran the test suite' },
    { kind: 'test.completed', agentId: 'tester', taskId: 'task-001', status: 'succeeded', nativeEventType: 'demo:test.completed', publicSummary: 'Tester: all tests passed' }
  ],
  // 10 — the task completes
  () => [
    { kind: 'task.completed', agentId: 'implementation', taskId: 'task-001', status: 'succeeded', nativeEventType: 'demo:task.completed', publicSummary: 'Implementation completed task-001' }
  ],
  // 11 — everyone clocks out
  () => INVOLVED_AGENTS.map((agentId) => ({
    kind: 'agent.stopped' as const,
    agentId,
    nativeEventType: 'demo:agent.stopped',
    occurredAt: '',
    publicSummary: `${agentId} stopped`
  }))
]

/**
 * Deterministic scripted scenario, one beat every ~2.5s with an 8s pause before
 * looping. Uses a single self-rescheduling timer (no leaked timers); the returned
 * stop function cancels the pending beat.
 */
export function startDemoAdapter(emit: DemoEmit): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  function runBeat(index: number) {
    if (stopped) return
    const now = new Date().toISOString()
    for (const draft of BEATS[index]()) {
      emissionCounter += 1
      const event: Omit<NormalizedEvent, 'ingestSeq'> = {
        ...draft,
        schemaVersion: 1,
        eventId: `demo-${index + 1}-${BOOT_SEED + emissionCounter}`,
        source: 'demo',
        provenance: 'simulation',
        projectId: 'demo-fixture',
        confidence: 'high',
        occurredAt: now,
        receivedAt: now
      }
      emit(event)
    }
    const next = (index + 1) % BEATS.length
    timer = setTimeout(() => runBeat(next), next === 0 ? PAUSE_MS : BEAT_MS)
  }

  timer = setTimeout(() => runBeat(0), 0)

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
}
