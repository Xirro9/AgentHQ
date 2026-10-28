// App shell — full-viewport Phaser office (BootScene → OfficeScene) with the
// HUD layered above it: mode badge, agent strip, hint line, hover tooltip, and
// the loader overlay which stays up until the scene reports ready (spec 03 §7).

import { useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { AGENTS, AGENT_IDS, type AgentId, type WorkState } from '../shared/events'
import { BootScene, OfficeScene } from './office/scenes'
import {
  HOVER_EVENT,
  SCENE_READY_EVENT,
  onBridgeEvent,
  type HoverDetail
} from './office/bridge'
import { store, type Mode } from './net/store'
import { useHq } from './net/useHq'

const MODE_BADGE: Record<Mode, { label: string; color: string }> = {
  live: { label: 'LIVE', color: '#5ad0c8' },
  demo: { label: 'DEMO', color: '#f5c66b' },
  replay: { label: 'REPLAY', color: '#9b5de5' },
  disconnected: { label: 'DISCONNECTED', color: '#d65656' }
}

/** Matches the office pip colors so HUD and world tell the same story. */
const STATE_PIP: Partial<Record<WorkState, string>> = {
  working: '#5ad0c8',
  testing: '#f5c66b',
  failed: '#d65656',
  waiting: '#9b5de5'
}

const CAT_LABELS: Record<string, string> = { pixel: 'Pixel', biscuit: 'Biscuit' }

function stateLabel(state: WorkState | undefined): string {
  return state === undefined ? 'unknown' : state
}

export default function App() {
  const hq = useHq()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [ready, setReady] = useState(false)
  const [loaderGone, setLoaderGone] = useState(false)
  const [hover, setHover] = useState<HoverDetail | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Mount the Phaser game once; the office reports readiness via the bridge.
  useEffect(() => {
    const host = hostRef.current
    if (!host || gameRef.current) return
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: 480,
      height: 288,
      backgroundColor: '#12101f',
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: [BootScene, OfficeScene]
    })
    gameRef.current = game
    return () => {
      game.destroy(true)
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    const offReady = onBridgeEvent<void>(SCENE_READY_EVENT, () => setReady(true))
    const offHover = onBridgeEvent<HoverDetail | null>(HOVER_EVENT, setHover)
    return () => {
      offReady()
      offHover()
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setLoaderGone(true), 450)
    return () => window.clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const clock = useMemo(
    () => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [now]
  )

  const projectId = useMemo(() => {
    for (let i = hq.events.length - 1; i >= 0; i--) {
      const id = hq.events[i].projectId
      if (id) return id
    }
    return null
  }, [hq.events])

  const badge = MODE_BADGE[hq.mode]

  const tooltipLabel = hover
    ? hover.agentId in AGENTS
      ? AGENTS[hover.agentId as AgentId].label
      : (CAT_LABELS[hover.agentId] ?? hover.agentId)
    : ''

  const tooltipState = hover
    ? hover.agentId in AGENTS
      ? stateLabel(hq.agentStates[hover.agentId as AgentId]?.state)
      : 'sim cat'
    : ''

  const tooltipPos = useMemo(() => {
    if (!hover) return { left: 0, top: 0 }
    const left = Math.min(hover.x + 14, window.innerWidth - 190)
    const top = Math.min(hover.y + 18, window.innerHeight - 56)
    return { left: Math.max(8, left), top: Math.max(8, top) }
  }, [hover])

  return (
    <div className="hq-root">
      <div id="office" ref={hostRef} aria-label="AgentHQ office" />

      <header className="hq-hud-left" role="status" aria-label="Connection status">
        <div className="hq-badge-row">
          <span
            className="hq-badge"
            style={{ backgroundColor: badge.color }}
            title={`Telemetry mode: ${hq.mode}`}
          >
            {badge.label}
          </span>
          {hq.mode === 'demo' && <span className="hq-project">demo fixture</span>}
          {hq.mode !== 'demo' && projectId && <span className="hq-project">{projectId}</span>}
        </div>
        <div className="hq-clock">{clock}</div>
      </header>

      <nav className="hq-strip" aria-label="Agent status">
        {AGENT_IDS.map((id) => {
          const agent = AGENTS[id]
          const runtime = hq.agentStates[id]
          const pip = STATE_PIP[runtime?.state ?? 'unknown']
          const selected = hq.selected === id
          return (
            <button
              key={id}
              type="button"
              className={`hq-chip${selected ? ' hq-chip--selected' : ''}`}
              style={{ borderColor: agent.color }}
              aria-pressed={selected}
              title={`${agent.label} · ${agent.role}`}
              onClick={() => store.select(selected ? null : id)}
            >
              <span className="hq-chip-dot" style={{ backgroundColor: agent.color }} />
              <span className="hq-chip-name">{agent.label}</span>
              <span className="hq-chip-state">
                <span
                  className="hq-chip-pip"
                  style={{ backgroundColor: pip ?? 'rgba(242, 230, 216, 0.25)' }}
                />
                {stateLabel(runtime?.state)}
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="hq-hint">drag to pan · scroll to zoom · click a desk</footer>

      {hover && (
        <div
          className="hq-tooltip"
          style={tooltipPos}
          aria-hidden="true"
        >
          <strong>{tooltipLabel}</strong>
          <span>{tooltipState}</span>
        </div>
      )}

      {!loaderGone && (
        <div className={`hq-loader${ready ? ' hq-loader--done' : ''}`} role="status" aria-live="polite">
          <div className="hq-loader-mark">🏢</div>
          <div className="hq-loader-text">waking the office…</div>
          <div className="hq-loader-sub">agents stretching · coffee brewing · cats pretending to sleep</div>
        </div>
      )}
    </div>
  )
}
