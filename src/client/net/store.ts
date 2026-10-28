// src/client/net/store.ts — framework-free reactive store for the AgentHQ shell.
// Pure pub/sub (no React, no Phaser): React subscribes via useHq, the office
// scene subscribes directly. State updates are immutable so subscribers can
// compare references.
//
// Spec 03 §1: mode | events (cap 500, dedupe by eventId) | agentStates |
// selected | ambience | settings.

import {
  AGENT_IDS,
  WORK_STATES,
  type AgentId,
  type NormalizedEvent,
  type WorkState
} from '../../shared/events'

export type Mode = 'live' | 'demo' | 'replay' | 'disconnected'
export type Ambience = 'day' | 'evening' | 'night' | 'auto'

/** Externally grounded work state + the receivedAt that set it (server shape). */
export interface AgentRuntimeState {
  state: WorkState
  since: string
}

export interface HqSettings {
  /** Honors prefers-reduced-motion; the office freezes idle loops/tweens. */
  reducedMotion: boolean
}

export interface HqState {
  mode: Mode
  events: NormalizedEvent[]
  agentStates: Record<AgentId, AgentRuntimeState>
  selected: AgentId | null
  ambience: Ambience
  settings: HqSettings
}

const EVENT_CAP = 500

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function initialAgentStates(): Record<AgentId, AgentRuntimeState> {
  const states = {} as Record<AgentId, AgentRuntimeState>
  for (const id of AGENT_IDS) states[id] = { state: 'unknown', since: '' }
  return states
}

function initialState(): HqState {
  return {
    mode: 'disconnected',
    events: [],
    agentStates: initialAgentStates(),
    selected: null,
    ambience: 'auto',
    settings: { reducedMotion: prefersReducedMotion() }
  }
}

let state: HqState = initialState()
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** Coerce an untrusted value into a WorkState ('unknown' when unrecognized). */
export function asWorkState(value: unknown): WorkState {
  return typeof value === 'string' && (WORK_STATES as readonly string[]).includes(value)
    ? (value as WorkState)
    : 'unknown'
}

export const store = {
  get(): HqState {
    return state
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },

  set(patch: Partial<HqState>): void {
    state = { ...state, ...patch }
    emit()
  },

  /** Select (or deselect) an agent desk. Pure UI state — no telemetry impact. */
  select(agentId: AgentId | null): void {
    if (state.selected === agentId) return
    state = { ...state, selected: agentId }
    emit()
  },

  /**
   * Merge events, dedupe by stable eventId, sort by ingestSeq and keep the
   * newest EVENT_CAP (spec 03 §1). No-op when nothing changes after the merge.
   */
  addEvents(events: NormalizedEvent[]): void {
    if (events.length === 0) return
    const byId = new Map<string, NormalizedEvent>()
    for (const ev of state.events) byId.set(ev.eventId, ev)
    for (const ev of events) byId.set(ev.eventId, ev)
    const merged = [...byId.values()].sort((a, b) => a.ingestSeq - b.ingestSeq)
    const capped = merged.slice(Math.max(0, merged.length - EVENT_CAP))
    if (capped.length === state.events.length && capped[capped.length - 1] === state.events[state.events.length - 1]) {
      return
    }
    state = { ...state, events: capped }
    emit()
  },

  /** Replace the per-agent work states (from /api/states polling). */
  setAgentStates(states: Record<AgentId, AgentRuntimeState>): void {
    state = { ...state, agentStates: states }
    emit()
  }
}
