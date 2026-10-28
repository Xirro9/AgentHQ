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

// ---- demo yield (live sources take precedence) -------------------------------

/**
 * Truthy `AGENTHQ_DEMO` (`1`/`true`/`yes`/`on`, case-insensitive) forces the
 * demo to run regardless of yield requests — a dev/QA override to exercise the
 * demo path while a live adapter is connected.
 */
export function demoForcedByEnv(
  env: Partial<Pick<NodeJS.ProcessEnv, 'AGENTHQ_DEMO'>> = process.env
): boolean {
  return ['1', 'true', 'yes', 'on'].includes((env.AGENTHQ_DEMO ?? '').trim().toLowerCase())
}

// Yield state is process-global: the demo adapter is a per-process singleton
// (one server = one scripted scenario), so the server toggles it via
// setDemoYielded() and the running instance reacts through onYieldChange.
let yielded = false
let onYieldChange: ((y: boolean) => void) | null = null

/**
 * Pause/resume demo emission. While yielded, the running demo adapter stops
 * emitting within one beat and freezes its beat chain on the next un-emitted
 * beat; on resume it continues exactly there — the chain never replays old
 * beats and eventIds stay unique. A truthy AGENTHQ_DEMO env override makes the
 * running adapter ignore yield requests entirely.
 */
export function setDemoYielded(y: boolean): void {
  if (yielded === y) return
  yielded = y
  onYieldChange?.(y)
}

/**
 * Deterministic scripted scenario, one beat every ~2.5s with an 8s pause before
 * looping. Uses a single self-rescheduling timer (no leaked timers); the returned
 * stop function cancels the pending beat.
 *
 * Yield (setDemoYielded): when a live adapter is connected the server yields
 * the demo — the pending timer is cancelled and the chain freezes on the next
 * un-emitted beat (`pendingIndex`); on resume that beat fires immediately, so
 * the scenario continues without replaying or corrupting the beat chain. An
 * adapter started while already yielded stays silent until resumed.
 */
export function startDemoAdapter(emit: DemoEmit): () => void {
  const forced = demoForcedByEnv()
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  // Next beat to fire; frozen here while yielded so a resume continues the
  // chain exactly where emission stopped (never replaying emitted beats).
  let pendingIndex = 0

  const delayFor = (upcoming: number): number => (upcoming === 0 ? PAUSE_MS : BEAT_MS)

  function fireBeat(index: number) {
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
  }

  function schedule(index: number, delay: number) {
    pendingIndex = index
    timer = setTimeout(() => {
      timer = undefined
      if (stopped || (yielded && !forced)) return // frozen; resume() re-schedules pendingIndex
      fireBeat(index)
      const next = (index + 1) % BEATS.length
      schedule(next, delayFor(next))
    }, delay)
  }

  function applyYield(y: boolean) {
    if (stopped || forced) return
    if (y) {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      // pendingIndex already names the next un-emitted beat
    } else if (timer === undefined) {
      schedule(pendingIndex, 0) // resume: continue the chain immediately
    }
  }

  onYieldChange = applyYield
  schedule(0, 0) // first beat fires immediately, as before

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (onYieldChange === applyYield) onYieldChange = null
  }
}
