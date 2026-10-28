// src/client/ui/logic.ts — pure, DOM-free helpers for the inspection UI layer
// (spec 04 §8). Everything here is testable without a browser: task-column
// derivation, feed filtering, time formatting and settings validation.
// React components and tests both import from this module; nothing here may
// touch window/document at module scope (localStorage helpers guard for it).

import {
  AGENT_IDS,
  type AgentId,
  type NormalizedEvent,
  type WorkEventKind
} from '../../shared/events'
import type { SceneSettings } from '../office/bridge'

// ---- task board (spec 04 §3) --------------------------------------------------

export type TaskColumn =
  | 'queued'
  | 'planning'
  | 'in-progress'
  | 'testing'
  | 'review'
  | 'done'
  | 'blocked'

export const TASK_COLUMNS: readonly TaskColumn[] = [
  'queued',
  'planning',
  'in-progress',
  'testing',
  'review',
  'done',
  'blocked'
]

export const COLUMN_LABELS: Record<TaskColumn, string> = {
  queued: 'Queued',
  planning: 'Planning',
  'in-progress': 'In Progress',
  testing: 'Testing',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked'
}

/**
 * Event kind -> board column. This map IS the whole mapping (spec 04 §3):
 * a stage is never inferred from the agent's role, so a tester running
 * task.started lands in "In Progress", not "Testing". Kinds that ground a
 * card but do not move it (task.assigned) are absent.
 */
const COLUMN_BY_KIND: Partial<Record<WorkEventKind, TaskColumn>> = {
  'task.created': 'queued',
  'agent.delegated': 'planning',
  'task.started': 'in-progress',
  'test.started': 'testing',
  'review.started': 'review',
  'task.completed': 'done',
  'task.failed': 'blocked',
  'task.blocked': 'blocked'
}

/** Kinds recorded as mini-steps on a task card (the mapping kinds + outcomes). */
const STEP_KINDS: ReadonlySet<string> = new Set([
  'task.created',
  'task.assigned',
  'agent.delegated',
  'task.started',
  'test.started',
  'test.completed',
  'review.started',
  'task.completed',
  'task.failed',
  'task.blocked'
])

export interface TaskStep {
  kind: WorkEventKind
  at: string
  label: string
}

export interface TaskCard {
  taskId: string
  column: TaskColumn
  title: string
  agentId?: AgentId
  steps: TaskStep[]
  lastAt: string
}

/**
 * Derive kanban cards purely from task-grounded events, replayed in ingest
 * order; the last mapping event for a taskId wins the column. Events that
 * merely mention a taskId (tool.*, file.*) never create or move cards.
 */
export function deriveTaskCards(events: readonly NormalizedEvent[]): TaskCard[] {
  const cards = new Map<string, TaskCard>()
  const ordered = [...events].sort((a, b) => a.ingestSeq - b.ingestSeq)
  for (const ev of ordered) {
    if (!ev.taskId) continue
    const column = COLUMN_BY_KIND[ev.kind]
    const isStep = STEP_KINDS.has(ev.kind)
    if (column === undefined && !isStep) continue
    let card = cards.get(ev.taskId)
    if (!card) {
      card = {
        taskId: ev.taskId,
        column: column ?? 'queued',
        title: truncate(ev.publicSummary, 120),
        steps: [],
        lastAt: eventTime(ev)
      }
      cards.set(ev.taskId, card)
    }
    if (column !== undefined) card.column = column
    if (ev.agentId) card.agentId = ev.agentId
    if (isStep) {
      card.steps.push({ kind: ev.kind, at: eventTime(ev), label: ev.publicSummary })
      card.lastAt = eventTime(ev)
    }
  }
  return [...cards.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

// ---- event feed filtering (spec 04 §2/§6) --------------------------------------

export interface FeedFilter {
  /** Empty/omitted = all kinds. */
  kinds?: readonly string[]
  severities?: readonly string[]
  sources?: readonly string[]
  /** Case-insensitive substring; capped at 100 chars (spec 04 §2). */
  text?: string
}

export const TEXT_CAP = 100

export function filterEvents(
  events: readonly NormalizedEvent[],
  filter: FeedFilter
): NormalizedEvent[] {
  const kinds = filter.kinds && filter.kinds.length > 0 ? new Set(filter.kinds) : null
  const severities =
    filter.severities && filter.severities.length > 0 ? new Set(filter.severities) : null
  const sources = filter.sources && filter.sources.length > 0 ? new Set(filter.sources) : null
  const needle = capText(filter.text ?? '').toLowerCase()
  return events.filter((ev) => {
    if (kinds && !kinds.has(ev.kind)) return false
    if (severities && !(ev.severity !== undefined && severities.has(ev.severity))) return false
    if (sources && !sources.has(ev.source)) return false
    if (needle) {
      const hay = `${ev.publicSummary} ${ev.kind} ${ev.taskId ?? ''} ${ev.nativeEventType}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

function capText(text: string): string {
  return text.length > TEXT_CAP ? text.slice(0, TEXT_CAP) : text
}

// ---- time formatting (spec 04 §2) ----------------------------------------------

/** occurredAt when known, else receivedAt — the honest display timestamp. */
export function eventTime(ev: NormalizedEvent): string {
  return ev.occurredAt && ev.occurredAt !== '' ? ev.occurredAt : ev.receivedAt
}

/** "just now" / "45s ago" / "3m ago" / "2h ago" / "5d ago"; unknown when invalid. */
export function formatRelative(
  iso: string | null | undefined,
  now: number = Date.now()
): string {
  if (!iso) return 'unknown'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'unknown'
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(then).toLocaleDateString()
}

/** Local HH:MM:SS for an ISO string; '—' when missing/invalid. */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '—'
  return new Date(then).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// ---- honest test summaries (spec 04 §2, brief §11.2) ---------------------------

export interface TestCounts {
  passed?: number
  failed?: number
  total?: number
}

export interface TestRow {
  eventId: string
  at: string
  phase: 'started' | 'completed'
  status?: 'started' | 'succeeded' | 'failed' | 'interrupted'
  summary: string
  /** Present only when the event carried parseable counts; never fabricated. */
  counts: TestCounts | null
}

/**
 * Collect test.started/completed events. Counts are surfaced ONLY from
 * numeric safeDetails fields; a summary that merely mentions numbers in prose
 * is "result only" (brief §11.2: no fake pass counters).
 */
export function summarizeTestEvents(events: readonly NormalizedEvent[]): TestRow[] {
  const rows: TestRow[] = []
  for (const ev of events) {
    if (ev.kind !== 'test.started' && ev.kind !== 'test.completed') continue
    const counts = parseTestCounts(ev)
    rows.push({
      eventId: ev.eventId,
      at: eventTime(ev),
      phase: ev.kind === 'test.started' ? 'started' : 'completed',
      status: ev.status,
      summary: ev.publicSummary,
      counts
    })
  }
  return rows
}

function parseTestCounts(ev: NormalizedEvent): TestCounts | null {
  const details = ev.safeDetails
  if (!details) return null
  const num = (key: string): number | undefined => {
    const v = details[key]
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
  }
  const passed = num('passed')
  const failed = num('failed')
  const total = num('total')
  if (passed === undefined && failed === undefined && total === undefined) return null
  return { passed, failed, total }
}

// ---- settings (spec 04 §4) -----------------------------------------------------

export type MischiefLevel = 'calm' | 'normal' | 'chaos'
export type EffectsQuality = 'low' | 'medium' | 'high'
export type ModePref = 'auto' | 'demo'

export interface AudioLevels {
  master: number
  ambience: number
  ui: number
  cats: number
}

export interface UiSettings extends SceneSettings {
  /** auto = whatever the server reports; demo pins the demo fixture view. */
  mode: ModePref
  audio: AudioLevels
  muted: boolean
}

export const SETTINGS_STORAGE_KEY = 'agenthq.settings'

export const DEFAULT_SETTINGS: UiSettings = {
  mode: 'auto',
  ambience: 'auto',
  weather: 'none',
  catsEnabled: true,
  mischiefLevel: 'normal',
  peacefulMode: false,
  pettingEnabled: true,
  fpsCap: 60,
  particles: true,
  effectsQuality: 'medium',
  reducedMotion: false,
  audio: { master: 0.7, ambience: 0.6, ui: 0.6, cats: 0.7 },
  muted: true // master gate: the app starts muted until the user unmutes
}

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function pickNum<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'number' && (allowed as readonly number[]).includes(value)
    ? (value as T)
    : fallback
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Coerce untrusted (localStorage) input into a complete UiSettings.
 * Unknown fields are dropped, bad values fall back to defaults, audio levels
 * are clamped to 0..1. Always returns a fully-populated object.
 */
export function validateSettings(raw: unknown): UiSettings {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const audioSrc = (typeof src.audio === 'object' && src.audio !== null ? src.audio : {}) as Record<string, unknown>
  return {
    mode: pick(src.mode, ['auto', 'demo'] as const, DEFAULT_SETTINGS.mode),
    ambience: pick(src.ambience, ['day', 'evening', 'night', 'auto'] as const, DEFAULT_SETTINGS.ambience),
    weather: pick(src.weather, ['none', 'rain'] as const, DEFAULT_SETTINGS.weather),
    catsEnabled: pickBool(src.catsEnabled, DEFAULT_SETTINGS.catsEnabled),
    mischiefLevel: pick(src.mischiefLevel, ['calm', 'normal', 'chaos'] as const, DEFAULT_SETTINGS.mischiefLevel),
    peacefulMode: pickBool(src.peacefulMode, DEFAULT_SETTINGS.peacefulMode),
    pettingEnabled: pickBool(src.pettingEnabled, DEFAULT_SETTINGS.pettingEnabled),
    fpsCap: pickNum(src.fpsCap, [30, 60] as const, DEFAULT_SETTINGS.fpsCap),
    particles: pickBool(src.particles, DEFAULT_SETTINGS.particles),
    effectsQuality: pick(src.effectsQuality, ['low', 'medium', 'high'] as const, DEFAULT_SETTINGS.effectsQuality),
    reducedMotion: pickBool(src.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    audio: {
      master: clamp01(audioSrc.master, DEFAULT_SETTINGS.audio.master),
      ambience: clamp01(audioSrc.ambience, DEFAULT_SETTINGS.audio.ambience),
      ui: clamp01(audioSrc.ui, DEFAULT_SETTINGS.audio.ui),
      cats: clamp01(audioSrc.cats, DEFAULT_SETTINGS.audio.cats)
    },
    muted: pickBool(src.muted, DEFAULT_SETTINGS.muted)
  }
}

/** localStorage load/save; both no-op safely when storage is unavailable. */
export function loadSettings(): UiSettings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS }
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return validateSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: UiSettings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* private mode / quota: settings stay session-only */
  }
}

// ---- presentation lookups --------------------------------------------------------

/** Monochrome text glyphs per event kind (no emoji; pixel-HUD friendly). */
const KIND_GLYPHS: Partial<Record<WorkEventKind, string>> = {
  'session.started': '◌',
  'session.ended': '◌',
  'agent.started': '●',
  'agent.stopped': '◎',
  'agent.delegated': '⇄',
  'task.created': '✚',
  'task.assigned': '➤',
  'task.started': '▶',
  'task.completed': '✔',
  'task.failed': '✘',
  'task.blocked': '⊘',
  'tool.started': '▸',
  'tool.completed': '◂',
  'tool.failed': '✘',
  'file.changed': '▤',
  'test.started': '⚑',
  'test.completed': '⚑',
  'review.started': '✦',
  'review.finding': '❋',
  'permission.requested': '…',
  'permission.resolved': '·',
  'status.changed': '↺',
  'integration.connected': '⇡',
  'integration.disconnected': '⇣',
  'integration.gap': '⇣',
  'artifact.created': '▤',
  'diagnostic.recorded': '※'
}

export function kindGlyph(kind: WorkEventKind): string {
  return KIND_GLYPHS[kind] ?? '·'
}

export const SOURCE_COLORS: Record<string, string> = {
  hermes: '#9b5de5',
  opencode: '#5ad0c8',
  system: '#8b87a8',
  demo: '#f5c66b',
  replay: '#eb6c8a'
}

export const SEVERITY_COLORS: Record<string, string> = {
  info: '#5ad0c8',
  warning: '#f5c66b',
  error: '#d65656'
}

/** All events for one agent, oldest first (store order is already ascending). */
export function eventsForAgent(
  events: readonly NormalizedEvent[],
  agentId: AgentId
): NormalizedEvent[] {
  return events.filter((ev) => ev.agentId === agentId)
}

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Clipboard with a graceful failure (non-secure contexts, denied permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
