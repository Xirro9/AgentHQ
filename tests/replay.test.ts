import { describe, expect, it } from 'vitest'
import {
  REPLAY_SPEEDS,
  ReplayTimeline,
  windowFetchLimit
} from '../src/client/net/replay'
import type { NormalizedEvent } from '../src/shared/events'

// ---- helpers ----------------------------------------------------------------

let seq = 0

/** Deterministic event at a fixed receivedAt (ISO), ascending ingestSeq. */
function mk(receivedAt: string, over: Partial<NormalizedEvent> = {}): NormalizedEvent {
  seq += 1
  return {
    schemaVersion: 1,
    eventId: `replay-${seq}`,
    ingestSeq: seq,
    source: 'demo',
    nativeEventType: 'test:native',
    kind: 'status.changed',
    occurredAt: null,
    receivedAt,
    publicSummary: 'replay fixture',
    provenance: 'simulation',
    ...over
  }
}

const T0 = Date.parse('2026-10-28T10:00:00.000Z')
const at = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString()

/** A 6-event window at t+0s, +1s, +2s, +3s, +4s, +5s. */
function window6(): NormalizedEvent[] {
  return [0, 1000, 2000, 3000, 4000, 5000].map((offset) => mk(at(offset)))
}

// ---- timeline construction -----------------------------------------------------

describe('ReplayTimeline construction', () => {
  it('sorts the window ascending by receivedAt regardless of input order', () => {
    const tl = new ReplayTimeline([mk(at(3000), { eventId: 'c' }), mk(at(1000), { eventId: 'a' }), mk(at(2000), { eventId: 'b' })])
    expect(tl.events.map((e) => e.eventId)).toEqual(['a', 'b', 'c'])
    expect(tl.startMs).toBe(T0 + 1000)
    expect(tl.endMs).toBe(T0 + 3000)
    expect(tl.emittedCount).toBe(0)
  })

  it('breaks receivedAt ties by ingestSeq for a deterministic order', () => {
    const a = mk(at(1000), { eventId: 'late-seq' })
    const b = mk(at(1000), { eventId: 'early-seq' })
    a.ingestSeq = 9
    b.ingestSeq = 4
    const tl = new ReplayTimeline([a, b])
    expect(tl.events.map((e) => e.eventId)).toEqual(['early-seq', 'late-seq'])
  })

  it('handles an empty window honestly (zero span, nothing to emit)', () => {
    const tl = new ReplayTimeline([])
    expect(tl.startMs).toBe(0)
    expect(tl.endMs).toBe(0)
    expect(tl.spanMs).toBe(0)
    expect(tl.fraction()).toBe(0)
    expect(tl.advance(1000)).toEqual([])
    expect(tl.stepForward()).toBeNull()
  })
})

// ---- play / advance -------------------------------------------------------------

describe('ReplayTimeline advance', () => {
  it('emits nothing while paused and does not move the virtual clock', () => {
    const tl = new ReplayTimeline(window6())
    expect(tl.advance(10_000)).toEqual([])
    expect(tl.virtualMs).toBe(T0)
    expect(tl.emittedCount).toBe(0)
  })

  it('at 1x, advancing 2.5s emits exactly the events at or before the clock', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    const emitted = tl.advance(2500)
    // clock = t0 + 2500 → events at +0s, +1s, +2s crossed (+3s has not)
    expect(emitted.map((e) => e.eventId)).toEqual(tl.events.slice(0, 3).map((e) => e.eventId))
    expect(tl.virtualMs).toBe(T0 + 2500)
    expect(tl.emittedCount).toBe(3)
  })

  it('includes an event whose receivedAt equals the virtual clock exactly', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    const emitted = tl.advance(2000) // clock lands exactly on the 3rd event
    expect(emitted).toHaveLength(3)
  })

  it('never emits the same event twice across consecutive advances', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    const first = tl.advance(1500) // clock t+1.5s → events at +0s, +1s
    const second = tl.advance(1500) // clock t+3s → events at +2s, +3s
    const ids = [...first, ...second].map((e) => e.eventId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(tl.emittedCount).toBe(4)
  })

  it('scales virtual time by speed: 4x covers 4s of window per real second', () => {
    const tl = new ReplayTimeline(window6())
    tl.setSpeed(4)
    tl.play()
    const emitted = tl.advance(1000) // → virtual +4s
    expect(emitted).toHaveLength(5) // events at 0..4s
    expect(tl.virtualMs).toBe(T0 + 4000)
  })

  it('at 0.5x one real second advances the clock only 500ms', () => {
    const tl = new ReplayTimeline(window6())
    tl.setSpeed(0.5)
    tl.play()
    tl.advance(1000)
    expect(tl.virtualMs).toBe(T0 + 500)
    expect(tl.emittedCount).toBe(1) // only the t+0 event
  })

  it('clamps at the window end and auto-pauses there', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    const emitted = tl.advance(60_000)
    expect(emitted).toHaveLength(6)
    expect(tl.virtualMs).toBe(tl.endMs)
    expect(tl.isPlaying).toBe(false)
    expect(tl.advance(60_000)).toEqual([]) // parked at the end
  })

  it('keeps the clock parked while paused mid-window and resumes cleanly', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    tl.advance(1200)
    tl.pause()
    expect(tl.advance(5000)).toEqual([])
    expect(tl.virtualMs).toBeGreaterThan(T0 + 1000)
    tl.play()
    const emitted = tl.advance(0) // zero-delta advance emits nothing…
    expect(emitted).toEqual([])
    const rest = tl.advance(1300) // …but time crossing does
    expect(rest.length).toBeGreaterThan(0)
  })
})

// ---- stepping --------------------------------------------------------------------

describe('ReplayTimeline step ±1 event', () => {
  it('stepForward emits exactly the next event and jumps the clock to it', () => {
    const tl = new ReplayTimeline(window6())
    const ev = tl.stepForward()
    expect(ev?.eventId).toBe(tl.events[0].eventId)
    expect(tl.emittedCount).toBe(1)
    expect(tl.virtualMs).toBe(T0)
    tl.stepForward()
    expect(tl.emittedCount).toBe(2)
    expect(tl.virtualMs).toBe(T0 + 1000)
  })

  it('stepForward works while paused and returns null at the end', () => {
    const tl = new ReplayTimeline([mk(at(0))])
    expect(tl.stepForward()).not.toBeNull()
    expect(tl.stepForward()).toBeNull()
    expect(tl.emittedCount).toBe(1)
  })

  it('stepBack rewinds the cursor and the clock to the previous event', () => {
    const tl = new ReplayTimeline(window6())
    tl.play()
    tl.advance(10_000) // emit all
    tl.stepBack()
    expect(tl.emittedCount).toBe(5)
    expect(tl.virtualMs).toBe(T0 + 4000) // receivedAt of the new last emitted
  })

  it('stepBack to empty rewinds the clock to the window start', () => {
    const tl = new ReplayTimeline(window6())
    tl.stepForward()
    tl.stepForward()
    tl.stepBack()
    tl.stepBack()
    expect(tl.emittedCount).toBe(0)
    expect(tl.virtualMs).toBe(T0)
    expect(tl.fraction()).toBe(0)
  })
})

// ---- scrubbing --------------------------------------------------------------------

describe('ReplayTimeline scrubbing', () => {
  it('scrubs forward: cursor lands on all events at or before the target time', () => {
    const tl = new ReplayTimeline(window6())
    const cursor = tl.scrubToFraction(0.5) // mid-span = t+2.5s → 3 events
    expect(cursor).toBe(3)
    expect(tl.virtualMs).toBe(T0 + 2500)
    expect(tl.eventsSince(0)).toHaveLength(3)
  })

  it('scrubs backward: the cursor retreats so the caller can rebuild the prefix', () => {
    const tl = new ReplayTimeline(window6())
    tl.scrubToFraction(1)
    expect(tl.emittedCount).toBe(6)
    const cursor = tl.scrubToFraction(0.2) // t+1s → 2 events
    expect(cursor).toBe(2)
    expect(tl.emittedEvents()).toHaveLength(2)
  })

  it('clamps out-of-range fractions into 0..1', () => {
    const tl = new ReplayTimeline(window6())
    expect(tl.scrubToFraction(-3)).toBe(0)
    expect(tl.scrubToFraction(42)).toBe(6)
    expect(tl.fraction()).toBe(1)
  })

  it('fraction 0 is the pre-start instant: nothing emitted, like a fresh timeline', () => {
    const tl = new ReplayTimeline(window6())
    tl.scrubToFraction(0.5)
    expect(tl.scrubToFraction(0)).toBe(0)
    expect(tl.emittedEvents()).toEqual([])
    expect(tl.virtualMs).toBe(T0)
    expect(tl.fraction()).toBe(0)
  })

  it('eventsSince returns exactly the crossed range for a forward scrub', () => {
    const tl = new ReplayTimeline(window6())
    tl.scrubToFraction(0.34) // ~t+1.7s → 2 events
    const from = tl.emittedCount
    tl.scrubToFraction(0.67) // ~t+3.35s → 4 events
    expect(tl.eventsSince(from)).toHaveLength(2)
  })
})

// ---- surface -----------------------------------------------------------------------

describe('replay surface constants', () => {
  it('offers exactly the brief §9.4 speeds 0.5x/1x/2x/4x', () => {
    expect(REPLAY_SPEEDS).toEqual([0.5, 1, 2, 4])
  })

  it('fetch caps stay inside the server MAX_LIMIT (1000) per window', () => {
    expect(windowFetchLimit(5 * 60_000)).toBe(250)
    expect(windowFetchLimit(15 * 60_000)).toBe(500)
    expect(windowFetchLimit(60 * 60_000)).toBe(1000)
  })
})
