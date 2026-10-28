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
import { emitSettings } from '../office/bridge'
import {
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  validateSettings,
  type UiSettings
} from '../ui/logic'

export type Mode = 'live' | 'demo' | 'replay' | 'disconnected'
export type Ambience = 'day' | 'evening' | 'night' | 'auto'

/** Externally grounded work state + the receivedAt that set it (server shape). */
export interface AgentRuntimeState {
  state: WorkState
  since: string
}

/**
 * Full user settings (spec 04 §4), validated on load and on every patch.
 * `ambience` is mirrored onto the top-level store field the scene already
 * reads; `updateSettings` keeps both in sync.
 */
export type HqSettings = UiSettings

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
  const settings = loadSettings()
  return {
    mode: 'disconnected',
    events: [],
    agentStates: initialAgentStates(),
    selected: null,
    ambience: settings.ambience,
    // Fresh sessions honor the OS reduced-motion preference; a persisted
    // explicit choice (true or false) wins over the media query.
    settings: restoreReducedMotion(settings)
  }
}

function restoreReducedMotion(settings: HqSettings): HqSettings {
  if (localStorageAvailable() && localStorage.getItem(SETTINGS_STORAGE_KEY) !== null) {
    return settings // persisted explicit value
  }
  return { ...settings, reducedMotion: settings.reducedMotion || prefersReducedMotion() }
}

function localStorageAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
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
  },

  /**
   * Merge a validated settings patch (spec 04 §4): persists to localStorage,
   * mirrors `ambience` onto the top-level store field, and dispatches the
   * `agenthq:settings` CustomEvent the office scene listens to.
   */
  updateSettings(patch: Partial<HqSettings>): void {
    const next = validateSettings({ ...state.settings, ...patch })
    const ambienceChanged = next.ambience !== state.ambience
    const settingsChanged = JSON.stringify(next) !== JSON.stringify(state.settings)
    if (!settingsChanged && !ambienceChanged) return
    state = {
      ...state,
      ambience: next.ambience,
      settings: next
    }
    saveSettings(next)
    emit()
    emitSettings(next)
  }
}
