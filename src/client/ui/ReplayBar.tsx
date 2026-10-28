// src/client/ui/ReplayBar.tsx — replay playback controls (spec 05 §1).
//
// Entry: the GlobalFeed "Replay" button opens this bar in the window-picker
// state (last 5m / 15m / 1h). After a window is chosen the bar owns the whole
// replay lifecycle: play/pause, 0.5x/1x/2x/4x speed, a scrub slider over the
// window, ±1 event stepping, and exit. The virtual clock drives the store via
// src/client/net/replay.ts — this component only renders its state and ticks
// it with requestAnimationFrame (no setInterval; see src/client/perf.ts).

import { useCallback, useEffect, useState } from 'react'
import {
  REPLAY_SPEEDS,
  REPLAY_WINDOWS,
  enterReplay,
  getReplayTimeline,
  isReplayActive,
  leaveReplay,
  replayAdvance,
  replayPause,
  replayPlay,
  replayScrub,
  replaySetSpeed,
  replayStep,
  type ReplaySpeed,
  type ReplayWindowMs
} from '../net/replay'

function formatClockMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

interface ReplayView {
  cursor: number
  total: number
  fraction: number
  clock: string
  startClock: string
  endClock: string
  speed: ReplaySpeed
}

function readView(): ReplayView | null {
  const tl = getReplayTimeline()
  if (!tl) return null
  return {
    cursor: tl.emittedCount,
    total: tl.events.length,
    fraction: tl.fraction(),
    clock: formatClockMs(tl.virtualMs),
    startClock: formatClockMs(tl.startMs),
    endClock: formatClockMs(tl.endMs),
    speed: tl.currentSpeed
  }
}

function sameView(a: ReplayView | null, b: ReplayView | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.cursor === b.cursor &&
    a.total === b.total &&
    a.speed === b.speed &&
    a.clock === b.clock &&
    a.startClock === b.startClock &&
    a.endClock === b.endClock &&
    Math.abs(a.fraction - b.fraction) < 0.0005
  )
}

type Phase = 'pick' | 'loading' | 'active' | 'error'

export default function ReplayBar({ onClose }: { onClose(): void }) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ReplayView | null>(null)
  const [playing, setPlaying] = useState(false)

  // Leave replay on unmount no matter how the bar goes away (Esc path, HMR):
  // the transport must never stay suspended with a dead timeline.
  useEffect(() => () => {
    if (isReplayActive()) leaveReplay()
  }, [])

  const sync = useCallback(() => {
    setPlaying(getReplayTimeline()?.isPlaying ?? false)
    setView((prev) => {
      const next = readView()
      return sameView(prev, next) ? prev : next
    })
  }, [])

  // Playback ticker: requestAnimationFrame drives the virtual clock (the
  // replay engine itself is pure; rAF stops when the tab hides or we unmount).
  useEffect(() => {
    if (phase !== 'active' || !playing) return
    let raf = 0
    let last = performance.now()
    const frame = (t: number): void => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(250, t - last)
      last = t
      replayAdvance(dt)
      sync()
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, playing, sync])

  const enter = async (windowMs: ReplayWindowMs): Promise<void> => {
    setPhase('loading')
    setError(null)
    try {
      await enterReplay(windowMs)
      setPhase('active')
      sync()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'replay unavailable')
      setPhase('error')
    }
  }

  const exit = (): void => {
    leaveReplay()
    onClose()
  }

  const scrub = (e: React.ChangeEvent<HTMLInputElement>): void => {
    replayScrub(Number(e.target.value) / 1000)
    sync()
  }

  const step = (delta: 1 | -1): void => {
    replayStep(delta)
    sync()
  }

  const togglePlay = (): void => {
    if (playing) replayPause()
    else replayPlay()
    sync()
  }

  const setSpeed = (speed: ReplaySpeed): void => {
    replaySetSpeed(speed)
    sync()
  }

  return (
    <div className="hq-replaybar" role="toolbar" aria-label="Replay controls">
      <span className="hq-replay-chip" title="Replaying stored events — not live telemetry">
        REPLAY
      </span>

      {phase === 'pick' || phase === 'error' || phase === 'loading' ? (
        <div className="hq-replay-pick">
          <span className="hq-replay-hint">
            {phase === 'loading' ? 'loading window…' : 'reconstruct a stored window:'}
          </span>
          {REPLAY_WINDOWS.map((w) => (
            <button
              key={w.ms}
              type="button"
              className="hq-chip-btn"
              disabled={phase === 'loading'}
              onClick={() => void enter(w.ms)}
            >
              {w.label}
            </button>
          ))}
          {error && <span className="hq-replay-error">{error}</span>}
        </div>
      ) : (
        view !== null && (
          <>
            <span className="hq-replay-meta hq-mono">
              {view.cursor}/{view.total} events
            </span>
            <button
              type="button"
              className="hq-icon-btn"
              aria-label="Step one event back"
              onClick={() => step(-1)}
            >
              ◁
            </button>
            <button
              type="button"
              className="hq-icon-btn"
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              onClick={togglePlay}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <button
              type="button"
              className="hq-icon-btn"
              aria-label="Step one event forward"
              onClick={() => step(1)}
            >
              ▷
            </button>
            <input
              type="range"
              className="hq-replay-scrub"
              min={0}
              max={1000}
              step={1}
              value={Math.round(view.fraction * 1000)}
              onChange={scrub}
              aria-label="Scrub replay window"
            />
            <span className="hq-replay-clock hq-mono" title="Virtual replay clock">
              {view.clock}
              <span className="hq-replay-range">
                {' '}
                ({view.startClock} → {view.endClock})
              </span>
            </span>
            <span className="hq-replay-speeds" role="group" aria-label="Replay speed">
              {REPLAY_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`hq-chip-btn${view.speed === s ? ' hq-chip-btn--active' : ''}`}
                  aria-pressed={view.speed === s}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </span>
            <button type="button" className="hq-btn" onClick={exit}>
              Exit replay
            </button>
          </>
        )
      )}
      {(phase === 'pick' || phase === 'error' || phase === 'loading') && (
        <button type="button" className="hq-icon-btn" aria-label="Close replay bar" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  )
}
