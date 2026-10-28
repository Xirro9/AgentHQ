import { AGENT_IDS, type AgentId, type NormalizedEvent, type WorkState } from '../shared/events'

export interface AgentState {
  state: WorkState
  /** receivedAt of the event that set the current state ('' when no evidence). */
  since: string
  lastEventId?: string
}

const STALE_AFTER_MS = 60_000

// States that imply ongoing work and therefore go stale/offline without fresh evidence.
const ACTIVE_STATES: ReadonlySet<WorkState> = new Set([
  'assigned', 'planning', 'working', 'waiting', 'testing', 'reviewing'
])

/** Map one event to the state it sets for its agent; null = no state change. */
function stateForEvent(ev: NormalizedEvent): WorkState | null {
  switch (ev.kind) {
    case 'session.started': return 'working'
    case 'session.ended': return 'idle'
    case 'agent.started': return ev.taskId ? 'assigned' : 'planning'
    case 'agent.stopped': return 'idle'
    case 'task.created':
    case 'task.assigned': return 'assigned'
    case 'task.started': return 'working'
    case 'task.completed': return 'completed'
    case 'task.failed': return 'failed'
    case 'task.blocked': return 'waiting'
    case 'agent.delegated': return 'working'
    case 'tool.started':
    case 'tool.completed': return 'working'
    case 'tool.failed': return 'failed'
    case 'file.changed': return 'working'
    case 'test.started': return 'testing'
    case 'test.completed':
      return ev.status === 'failed' || ev.severity === 'error' ? 'failed' : 'working'
    case 'review.started':
    case 'review.finding': return 'reviewing'
    case 'permission.requested': return 'waiting'
    case 'permission.resolved': return 'working'
    case 'artifact.created':
    case 'diagnostic.recorded': return 'working'
    default:
      return null // status.changed / integration.* / unknown kinds do not move the state
  }
}

function receivedMs(ev: NormalizedEvent): number {
  const ms = Date.parse(ev.receivedAt)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Pure derivation of brief §6.2: per-agent externally grounded work states.
 *
 * Events are applied in ingestSeq order. Each agent starts with no evidence →
 * 'idle'. The most recent event wins; terminal states (completed/failed/idle)
 * are sticky until a newer event changes them. Afterwards:
 *  - adapter down → agents whose last evidence predates an integration.disconnected
 *    event and are still in an active state become 'offline';
 *  - events stale >60s → active states become 'stale'.
 *
 * `now` defaults to Date.now() and is injectable for deterministic tests.
 */
export function deriveAgentStates(
  events: NormalizedEvent[],
  now: number = Date.now()
): Record<AgentId, AgentState> {
  const result = {} as Record<AgentId, AgentState>
  for (const id of AGENT_IDS) result[id] = { state: 'idle', since: '' }

  const lastActivity = new Map<AgentId, number>()
  let adapterDownAt = 0

  const ordered = [...events].sort((a, b) => a.ingestSeq - b.ingestSeq)

  for (const ev of ordered) {
    if (ev.kind === 'integration.disconnected') adapterDownAt = receivedMs(ev)
    else if (ev.kind === 'integration.connected') adapterDownAt = 0

    const agentId = ev.agentId
    if (!agentId || !(agentId in result)) continue // unattributed events never touch a desk

    const current = result[agentId]
    const next = stateForEvent(ev)
    if (next !== null && next !== current.state) {
      current.state = next
      current.since = ev.receivedAt
    }
    current.lastEventId = ev.eventId
    lastActivity.set(agentId, receivedMs(ev))
  }

  for (const id of AGENT_IDS) {
    const agent = result[id]
    const lastAct = lastActivity.get(id)
    if (lastAct === undefined) continue // no evidence at all → stays idle

    // adapter down: source cannot be contacted, no fresher evidence arrived
    if (adapterDownAt > 0 && lastAct < adapterDownAt && ACTIVE_STATES.has(agent.state)) {
      agent.state = 'offline'
      continue
    }
    // telemetry went quiet while the agent looked busy
    if (ACTIVE_STATES.has(agent.state) && now - lastAct > STALE_AFTER_MS) {
      agent.state = 'stale'
    }
  }

  return result
}
