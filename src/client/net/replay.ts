// src/client/net/replay.ts — Replay Mode (spec 05 §1, brief §9.4).
//
// Two halves:
//   - ReplayTimeline: PURE, deterministic clock over a sorted event window.
//     Stepping/scrubbing advance a virtual "receivedAt" clock and report which
//     events the cursor crossed. No timers, no DOM, no store — unit-tested in
//     tests/replay.test.ts.
//   - Controller (enterReplay/leaveReplay/replayAdvance/…): the browser-side
//     wiring. It feeds events older than the virtual clock into the SAME store
//     pipeline the live socket uses (store.addEvents), with store.mode='replay'
//     so the HUD shows the REPLAY watermark chip, and reconstructs per-agent
//     work states from the emitted prefix with the virtual clock via the pure
//     server derivation (deriveAgentStates — replay reconstructs true states).
//
// Transport ownership: while replay is active the live WebSocket and the
// states/health poll are SUSPENDED (useHq subscribes via
// onReplayTransportChange). Leaving replay clears the store events, resumes
// the live transport, and the next server snapshot re-fills everything —
// dedupe by eventId keeps that free of duplicates.

import { AGENT_IDS, type AgentId, type NormalizedEvent } from '../../shared/events'
import { deriveAgentStates } from '../../server/state'
import { store, type AgentRuntimeState } from './store'

// ---- replay surface ----------------------------------------------------------

export type ReplaySpeed = 0.5 | 1 | 2 | 4
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 2, 4]

export const REPLAY_WINDOWS = [
  { ms: 5 * 60_000, label: 'last 5m' },
  { ms: 15 * 60_000, label: 'last 15m' },
  { ms: 60 * 60_000, label: 'last 1h' }
] as const
export type ReplayWindowMs = (typeof REPLAY_WINDOWS)[number]['ms']

/** Per-window fetch cap; the server clamps /api/events at MAX_LIMIT=1000. */
export function windowFetchLimit(windowMs: ReplayWindowMs): number {
  return windowMs <= 5 * 60_000 ? 250 : windowMs <= 15 * 60_000 ? 500 : 1000
}

function receivedMs(ev: NormalizedEvent): number {
  const ms = Date.parse(ev.receivedAt)
  return Number.isNaN(ms) ? 0 : ms
}

// ---- pure replay clock ---------------------------------------------------------

/**
 * Deterministic playback clock over one stored window. Events are ordered by
 * receivedAt (ties by ingestSeq). `cursor` counts how many events have been
 * emitted (events[0..cursor)); the virtual clock never runs ahead of the
 * window end and auto-pauses when it gets there.
 */
export class ReplayTimeline {
  readonly events: NormalizedEvent[]
  private cursor = 0
  private clockMs: number
  private speed: ReplaySpeed = 1
  private playing = false

  constructor(events: NormalizedEvent[]) {
    this.events = [...events].sort(
      (a, b) => receivedMs(a) - receivedMs(b) || a.ingestSeq - b.ingestSeq
    )
    this.clockMs = this.startMs
  }

  /** First event's receivedAt (0 for an empty window). */
  get startMs(): number {
    return this.events.length > 0 ? receivedMs(this.events[0]) : 0
  }

  /** Last event's receivedAt (0 for an empty window). */
  get endMs(): number {
    return this.events.length > 0 ? receivedMs(this.events[this.events.length - 1]) : 0
  }

  get virtualMs(): number {
    return this.clockMs
  }

  /** Number of events emitted so far (the prefix length). */
  get emittedCount(): number {
    return this.cursor
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get currentSpeed(): ReplaySpeed {
    return this.speed
  }

  get spanMs(): number {
    return this.endMs - this.startMs
  }

  /** 0..1 position of the virtual clock inside the window. */
  fraction(): number {
    const span = this.spanMs
    return span <= 0 ? 0 : Math.min(1, Math.max(0, (this.clockMs - this.startMs) / span))
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed
  }

  play(): void {
    if (this.cursor >= this.events.length) return // already at the end
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  /**
   * Advance the virtual clock by `realMs` of wall time scaled by the current
   * speed; returns every event whose receivedAt is now <= the virtual clock
   * (exactly once each). No-op while paused.
   */
  advance(realMs: number): NormalizedEvent[] {
    if (!this.playing || realMs <= 0) return []
    this.clockMs += realMs * this.speed
    if (this.clockMs >= this.endMs) {
      this.clockMs = this.endMs
      this.playing = false // window played out: hold at the last event
    }
    const emitted: NormalizedEvent[] = []
    while (this.cursor < this.events.length && receivedMs(this.events[this.cursor]) <= this.clockMs) {
      emitted.push(this.events[this.cursor])
      this.cursor += 1
    }
    return emitted
  }

  /**
   * Scrub the virtual clock to a fraction (0..1) of the window; returns the
   * new cursor so the caller can diff against the old one (forward = emit the
   * crossed range, backward = rebuild from the prefix). Fraction 0 is the
   * pre-start instant: nothing emitted, exactly like a fresh timeline.
   */
  scrubToFraction(fraction: number): number {
    const f = Math.min(1, Math.max(0, fraction))
    this.clockMs = this.startMs + f * this.spanMs
    this.cursor = 0
    if (f > 0) {
      while (this.cursor < this.events.length && receivedMs(this.events[this.cursor]) <= this.clockMs) {
        this.cursor += 1
      }
    }
    return this.cursor
  }

  /**
   * Step exactly one event forward: the cursor advances and the virtual clock
   * jumps to that event's receivedAt. Returns null at the end of the window.
   */
  stepForward(): NormalizedEvent | null {
    if (this.cursor >= this.events.length) return null
    const ev = this.events[this.cursor]
    this.cursor += 1
    this.clockMs = Math.max(this.clockMs, receivedMs(ev))
    return ev
  }

  /**
   * Step exactly one event back: the cursor retreats and the virtual clock
   * rewinds to the receivedAt of the new last emitted event (window start
   * when the prefix is empty).
   */
  stepBack(): void {
    if (this.cursor === 0) {
      this.clockMs = this.startMs
      return
    }
    this.cursor -= 1
    this.clockMs = this.cursor === 0 ? this.startMs : receivedMs(this.events[this.cursor - 1])
  }

  /** The emitted prefix (events[0..cursor)). */
  emittedEvents(): NormalizedEvent[] {
    return this.events.slice(0, this.cursor)
  }

  /** Events between an older cursor position and the current one. */
  eventsSince(oldCursor: number): NormalizedEvent[] {
    return this.events.slice(Math.max(0, oldCursor), this.cursor)
  }
}

// ---- controller (browser side) -------------------------------------------------

let active = false
let timeline: ReplayTimeline | null = null
const transportListeners = new Set<(active: boolean) => void>()

export function isReplayActive(): boolean {
  return active
}

export function getReplayTimeline(): ReplayTimeline | null {
  return timeline
}

/** Subscribe to transport suspension changes (used by useHq). Returns unsub. */
export function onReplayTransportChange(cb: (active: boolean) => void): () => void {
  transportListeners.add(cb)
  return () => {
    transportListeners.delete(cb)
  }
}

function notifyTransport(next: boolean): void {
  for (const cb of transportListeners) cb(next)
}

function noEvidenceStates(): Record<AgentId, AgentRuntimeState> {
  const out = {} as Record<AgentId, AgentRuntimeState>
  for (const id of AGENT_IDS) out[id] = { state: 'unknown', since: '' }
  return out
}

function syncReplayStates(): void {
  if (!timeline) return
  // Reconstruct true states from the emitted prefix against the VIRTUAL clock
  // (deriveAgentStates takes an injectable `now` precisely for this).
  store.setAgentStates(deriveAgentStates(timeline.emittedEvents(), timeline.virtualMs))
  // Cats are NEVER replayed from history: the office CatLayer keeps simulating
  // in real time (brief §9.4) — nothing here touches the sim or its sprites.
}

/**
 * Enter replay over the last `windowMs` of stored events. Fetches
 * /api/events (newest-first), reverses client-side, filters to the window
 * anchored at the newest stored event, clears the live feed and hands the
 * store to the replay clock. The transport is suspended only after the fetch
 * succeeds, so a failed entry never takes the live view down.
 */
export async function enterReplay(windowMs: ReplayWindowMs): Promise<{ events: number }> {
  const res = await fetch(`/api/events?limit=${windowFetchLimit(windowMs)}`)
  if (!res.ok) throw new Error(`replay fetch failed: HTTP ${res.status}`)
  const body = (await res.json()) as { events?: unknown }
  const newestFirst = Array.isArray(body.events) ? (body.events as NormalizedEvent[]) : []
  // Server returns newest-first; replay plays oldest→newest, so reverse.
  const ascending = [...newestFirst].reverse()
  const anchor = ascending.length > 0 ? receivedMs(ascending[ascending.length - 1]) : Date.now()
  const inWindow = ascending.filter((ev) => receivedMs(ev) >= anchor - windowMs)

  const next = new ReplayTimeline(inWindow)
  active = true
  timeline = next
  notifyTransport(true) // useHq closes the socket + pauses polling
  store.set({ mode: 'replay', events: [], agentStates: noEvidenceStates() })
  syncReplayStates()
  return { events: next.events.length }
}

/**
 * Advance the replay clock by `realMs` of wall time (called from the
 * ReplayBar's requestAnimationFrame loop; paused timelines no-op).
 */
export function replayAdvance(realMs: number): void {
  if (!active || !timeline) return
  const before = timeline.emittedCount
  const emitted = timeline.advance(realMs)
  if (timeline.emittedCount === before && emitted.length === 0) return
  if (emitted.length > 0) store.addEvents(emitted)
  syncReplayStates()
}

/** Scrub to a fraction of the window; backward scrubs rebuild the store. */
export function replayScrub(fraction: number): void {
  if (!active || !timeline) return
  const before = timeline.emittedCount
  const after = timeline.scrubToFraction(fraction)
  if (after < before) {
    store.set({ events: [] })
    store.addEvents(timeline.emittedEvents())
  } else if (after > before) {
    store.addEvents(timeline.eventsSince(before))
  }
  syncReplayStates()
}

/** Step ±1 event. Forward emits exactly the next event; back rebuilds. */
export function replayStep(delta: 1 | -1): void {
  if (!active || !timeline) return
  if (delta === 1) {
    const ev = timeline.stepForward()
    if (ev) store.addEvents([ev])
  } else {
    timeline.stepBack()
    store.set({ events: [] })
    store.addEvents(timeline.emittedEvents())
  }
  syncReplayStates()
}

export function replaySetSpeed(speed: ReplaySpeed): void {
  timeline?.setSpeed(speed)
}

export function replayPlay(): void {
  timeline?.play()
}

export function replayPause(): void {
  timeline?.pause()
}

/**
 * Leave replay: stop the clock, clear the store events (the reconnecting
 * socket's snapshot refills them — dedupe by eventId holds), reset agent
 * evidence to unknown, and resume the live transport. The mode returns to
 * whatever the server reports on the next snapshot/mode message.
 */
export function leaveReplay(): void {
  if (!active) return
  active = false
  timeline = null
  notifyTransport(false) // useHq reconnects the live socket
  store.set({ mode: 'disconnected', events: [], agentStates: noEvidenceStates() })
}
