import { z } from 'zod'

// ---- canonical vocabularies (brief §8.4, §6.2) -----------------------------

export const EVENT_SOURCES = ['hermes', 'opencode', 'system', 'demo', 'replay'] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

export const WORK_EVENT_KINDS = [
  'session.started', 'session.ended', 'agent.started', 'agent.stopped',
  'task.created', 'task.assigned', 'task.started', 'task.completed',
  'task.failed', 'task.blocked', 'agent.delegated',
  'tool.started', 'tool.completed', 'tool.failed',
  'file.changed', 'test.started', 'test.completed',
  'review.started', 'review.finding',
  'permission.requested', 'permission.resolved',
  'status.changed', 'integration.connected',
  'integration.disconnected', 'integration.gap',
  'artifact.created', 'diagnostic.recorded'
] as const
export type WorkEventKind = (typeof WORK_EVENT_KINDS)[number]

export const WORK_STATES = [
  'unknown', 'offline', 'idle', 'assigned', 'planning', 'working',
  'waiting', 'testing', 'reviewing', 'failed', 'completed', 'stale'
] as const
export type WorkState = (typeof WORK_STATES)[number]

export const AGENT_IDS = [
  'hermes', 'architect', 'implementation', 'frontend', 'tester', 'debugger', 'security'
] as const
export type AgentId = (typeof AGENT_IDS)[number]

// ---- the normalized event contract -----------------------------------------

export const NormalizedEvent = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().min(1),                 // stable ID for dedup
  ingestSeq: z.number().int().nonnegative(),  // server-assigned, gap-free per server
  source: z.enum(EVENT_SOURCES),
  nativeEventType: z.string().max(120),       // inspectable original label
  kind: z.enum(WORK_EVENT_KINDS),
  occurredAt: z.string().nullable(),          // ISO UTC from source, if known
  receivedAt: z.string(),                     // ISO UTC at ingest
  sessionId: z.string().max(120).optional(),
  parentSessionId: z.string().max(120).optional(),
  taskId: z.string().max(120).optional(),
  projectId: z.string().max(120).optional(),
  agentId: z.enum(AGENT_IDS).optional(),
  toolCallId: z.string().max(120).optional(),
  status: z.enum(['started', 'succeeded', 'failed', 'interrupted']).optional(),
  publicSummary: z.string().max(300),         // sanitized, display-safe
  safeFileRefs: z.array(z.string().max(200)).max(20).optional(),
  severity: z.enum(['info', 'warning', 'error']).optional(),
  provenance: z.enum(['direct', 'derived', 'simulation']),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  safeDetails: z.record(z.string(), z.unknown()).optional() // allowlisted only
})
export type NormalizedEvent = z.infer<typeof NormalizedEvent>

// ---- UI catalog (presentation-layer only; telemetry joins by agentId) ------

export const AGENTS: Record<AgentId, { label: string; role: string; color: string }> = {
  hermes:         { label: 'Hermes',         role: 'Manager',   color: '#9b5de5' },
  architect:      { label: 'Architect',      role: 'Planner',   color: '#78b4dc' },
  implementation: { label: 'Implementation', role: 'Builder',   color: '#3e9e9a' },
  frontend:       { label: 'Frontend',       role: 'Designer',  color: '#eb6c8a' },
  tester:         { label: 'Tester',         role: 'QA',        color: '#f5c66b' },
  debugger:       { label: 'Debugger',       role: 'Detective', color: '#c98d5e' },
  security:       { label: 'Security',       role: 'Guardian',  color: '#6bd0da' }
}

// ---- server <-> client transport messages ----------------------------------

export type ClientHello = { type: 'hello'; lastSeq: number; mode?: 'live' | 'replay' }
export type ServerMessage =
  | { type: 'snapshot'; events: NormalizedEvent[]; seq: number; mode: string }
  | { type: 'event'; event: NormalizedEvent }
  | { type: 'gap'; fromSeq: number; toSeq: number }
  | { type: 'mode'; mode: string }
  | { type: 'ping'; t: number }

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const obj: unknown = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null || !('type' in obj)) return null
    const m = obj as Record<string, unknown>
    if (m.type === 'event') {
      const parsed = NormalizedEvent.safeParse(m.event)
      if (!parsed.success) return null
      return { type: 'event', event: parsed.data }
    }
    return obj as ServerMessage
  } catch {
    return null
  }
}
