// App shell — full-viewport Phaser office (BootScene → OfficeScene) with the
// HUD and the spec-04 inspection layer layered above it: DeskPanel beside the
// selected desk, full-screen WorkstationView, TaskBoard, Settings slide-over,
// the GlobalFeed drawer, keyboard shortcuts, decorative rain, and the
// synthesized soundscape. Reduced motion is honored globally.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Phaser from 'phaser'
import { AGENTS, AGENT_IDS, type AgentId, type WorkState } from '../shared/events'
import { BootScene, OfficeScene } from './office/scenes'
import {
  DESK_ANCHOR_EVENT,
  HOVER_EVENT,
  INTERACT_EVENT,
  SCENE_READY_EVENT,
  emitCameraPan,
  emitCameraPause,
  emitCameraReset,
  emitFollowDesk,
  onBridgeEvent,
  type HoverDetail,
  type InteractDetail
} from './office/bridge'
import { store, type Mode } from './net/store'
import { useHq } from './net/useHq'
import { initSfx, playClick } from './audio/sfx'
import DeskPanel from './ui/DeskPanel'
import WorkstationView from './ui/WorkstationView'
import TaskBoard from './ui/TaskBoard'
import Settings from './ui/Settings'
import GlobalFeed from './ui/GlobalFeed'
import type { UiSettings } from './ui/logic'

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

  // Spec-04 UI state. Esc closes topmost; the z-stack lives in styles.css.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [following, setFollowing] = useState(false)

  // Mount the Phaser game once; the office reports readiness via the bridge.
  // `fps.limit` binds the loop to the limited step path so the 30/60 cap
  // setting can retarget it at runtime (see the fpsCap effect below).
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
      fps: { limit: 60 },
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

  // Performance setting: retarget the loop's frame-rate limiter (spec 04 §4).
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    const loop = game.loop as unknown as { fpsLimit: number; _limitRate: number }
    loop.fpsLimit = hq.settings.fpsCap
    loop._limitRate = 1000 / hq.settings.fpsCap
  }, [hq.settings.fpsCap, ready])

  useEffect(() => {
    const offReady = onBridgeEvent<void>(SCENE_READY_EVENT, () => setReady(true))
    const offHover = onBridgeEvent<HoverDetail | null>(HOVER_EVENT, setHover)
    return () => {
      offReady()
      offHover()
    }
  }, [])

  // The scene tracks the selected desk's viewport position every frame, so the
  // panel stays anchored beside it while the camera pans or zooms.
  useEffect(
    () =>
      onBridgeEvent(DESK_ANCHOR_EVENT, (d: { agentId: AgentId; x: number; y: number }) => {
        setAnchor({ x: d.x, y: d.y })
      }),
    []
  )

  // World interactables: the corkboard opens the task board.
  useEffect(
    () =>
      onBridgeEvent<InteractDetail>(INTERACT_EVENT, (d) => {
        if (d.kind === 'taskboard') setBoardOpen(true)
      }),
    []
  )

  // The synthesized soundscape starts once and lives for the app's lifetime.
  useEffect(() => initSfx(), [])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setLoaderGone(true), 450)
    return () => window.clearTimeout(timer)
  }, [ready])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Camera motion pauses while the workstation is open (cats keep living).
  useEffect(() => {
    emitCameraPause({ paused: expanded })
    return () => emitCameraPause({ paused: false })
  }, [expanded])

  // Closing the panel clears the expand state too; a new selection restarts
  // the follow toggle (the camera stays wherever the user left it).
  useEffect(() => {
    if (hq.selected === null) {
      setExpanded(false)
      setAnchor(null)
      if (following) {
        setFollowing(false)
        emitCameraReset()
      }
    }
  }, [hq.selected, following])

  const settings = hq.settings
  const applySettings = useCallback((patch: Partial<UiSettings>) => {
    store.updateSettings(patch)
  }, [])

  // Mode preference (spec 04 §4): 'demo' pins the fixture view; 'auto' trusts
  // the server. Pinned demo filters the visible feed to demo events only and
  // says so on the badge.
  const demoPinned = settings.mode === 'demo'
  const events = useMemo(
    () => (demoPinned ? hq.events.filter((e) => e.source === 'demo') : hq.events),
    [demoPinned, hq.events]
  )
  const mode: Mode = demoPinned && hq.mode !== 'disconnected' ? 'demo' : hq.mode

  // Keyboard: Esc closes topmost, T board, S settings, F follows the selected
  // agent. Arrow-key panning is forwarded to the scene bridge separately below.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        if (e.key !== 'Escape') return
      }
      const key = e.key.toLowerCase()
      if (e.key === 'Escape') {
        if (expanded) setExpanded(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (boardOpen) setBoardOpen(false)
        else if (feedOpen) setFeedOpen(false)
        else if (hq.selected) store.select(null)
        return
      }
      if (key === 't') {
        setBoardOpen((v) => !v)
        playClick()
      } else if (key === 's') {
        setSettingsOpen((v) => !v)
        playClick()
      } else if (key === 'f' && hq.selected) {
        emitFollowDesk({ agentId: hq.selected })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, settingsOpen, boardOpen, feedOpen, hq.selected])

  // Arrow keys pan the camera, forwarded to the scene bridge (spec 04 §7).
  // App owns the keyboard here so typing in inputs (or scrubbing a range
  // slider) never moves the office; the scene ignores pans while inspecting.
  const panKeys = useRef(new Set<string>())
  useEffect(() => {
    const TYPING = ['INPUT', 'TEXTAREA', 'SELECT']
    const PAN_SPEED = 260 // logical px/s at zoom 1
    let raf = 0
    let last = 0
    const step = (t: number): void => {
      raf = requestAnimationFrame(step)
      const dt = last === 0 ? 0 : Math.min(0.05, (t - last) / 1000)
      last = t
      let dx = 0
      let dy = 0
      if (panKeys.current.has('ArrowLeft')) dx -= 1
      if (panKeys.current.has('ArrowRight')) dx += 1
      if (panKeys.current.has('ArrowUp')) dy -= 1
      if (panKeys.current.has('ArrowDown')) dy += 1
      if (dx !== 0 || dy !== 0) {
        emitCameraPan({ dx: dx * PAN_SPEED * dt, dy: dy * PAN_SPEED * dt })
      }
    }
    const startPan = (): void => {
      if (raf === 0) {
        last = 0
        raf = requestAnimationFrame(step)
      }
    }
    const stopPan = (): void => {
      if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.key.startsWith('Arrow')) return
      const target = e.target as HTMLElement | null
      if (target && (TYPING.includes(target.tagName) || target.isContentEditable)) return
      panKeys.current.add(e.key)
      startPan()
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (!e.key.startsWith('Arrow')) return
      panKeys.current.delete(e.key)
      if (panKeys.current.size === 0) stopPan()
    }
    const onBlur = (): void => {
      panKeys.current.clear()
      stopPan()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      stopPan()
    }
  }, [])

  const clock = useMemo(
    () => now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [now]
  )

  const badge = MODE_BADGE[mode]

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

  const selected = hq.selected

  return (
    <div className={`hq-root${settings.reducedMotion ? ' hq-reduced' : ''}`}>
      <div id="office" ref={hostRef} aria-label="AgentHQ office" />

      {settings.weather === 'rain' && settings.particles && !settings.reducedMotion && (
        <RainOverlay fpsCap={settings.fpsCap} />
      )}

      {expanded && <div className="hq-dim" aria-hidden="true" />}

      <header className="hq-hud-left" role="status" aria-label="Connection status">
        <div className="hq-badge-row">
          <span
            className="hq-badge"
            style={{ backgroundColor: badge.color }}
            title={
              demoPinned
                ? `Demo pinned in settings (server reports: ${hq.mode})`
                : `Telemetry mode: ${hq.mode}`
            }
          >
            {badge.label}
          </span>
          {mode === 'demo' && <span className="hq-project">demo fixture</span>}
          {mode !== 'demo' && <span className="hq-project">{projectIdOf(events)}</span>}
        </div>
        <div className="hq-clock">{clock}</div>
        <button
          type="button"
          className="hq-gear-btn"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          onClick={() => {
            setSettingsOpen((v) => !v)
            playClick()
          }}
        >
          ⚙ settings <span className="hq-key-hint">S</span>
        </button>
      </header>

      <nav className="hq-strip" aria-label="Agent status">
        {AGENT_IDS.map((id) => {
          const agent = AGENTS[id]
          const runtime = hq.agentStates[id]
          const pip = STATE_PIP[runtime?.state ?? 'unknown']
          const isSelected = selected === id
          return (
            <button
              key={id}
              type="button"
              className={`hq-chip${isSelected ? ' hq-chip--selected' : ''}`}
              style={{ borderColor: agent.color }}
              aria-pressed={isSelected}
              title={`${agent.label} · ${agent.role}`}
              onClick={() => {
                setAnchor(null)
                setFollowing(false)
                store.select(isSelected ? null : id)
                playClick()
              }}
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

      <footer className="hq-hint">
        drag to pan · scroll to zoom · click a desk · T board · S settings · F follow
      </footer>

      {hover && (
        <div className="hq-tooltip" style={tooltipPos} aria-hidden="true">
          <strong>{tooltipLabel}</strong>
          <span>{tooltipState}</span>
        </div>
      )}

      {selected && !expanded && (
        <DeskPanel
          agentId={selected}
          anchor={anchor}
          events={events}
          state={{
            state: hq.agentStates[selected]?.state ?? 'unknown',
            since: hq.agentStates[selected]?.since ?? ''
          }}
          followEnabled={following}
          onClose={() => {
            playClick()
            store.select(null)
          }}
          onExpand={() => {
            playClick()
            setExpanded(true)
          }}
          onFollow={() => {
            const next = !following
            setFollowing(next)
            playClick()
            if (next) emitFollowDesk({ agentId: selected })
            else emitCameraReset()
          }}
          onOpenBoard={() => {
            playClick()
            setBoardOpen(true)
          }}
        />
      )}

      {expanded && selected && (
        <WorkstationView
          agentId={selected}
          events={events}
          state={{
            state: hq.agentStates[selected]?.state ?? 'unknown',
            since: hq.agentStates[selected]?.since ?? ''
          }}
          mode={mode}
          onClose={() => {
            playClick()
            setExpanded(false)
          }}
        />
      )}

      {boardOpen && (
        <TaskBoard
          events={events}
          reducedMotion={settings.reducedMotion}
          onClose={() => {
            playClick()
            setBoardOpen(false)
          }}
        />
      )}

      {settingsOpen && (
        <Settings settings={settings} onChange={applySettings} onClose={() => setSettingsOpen(false)} />
      )}

      <GlobalFeed
        events={events}
        open={feedOpen}
        onToggle={() => {
          setFeedOpen((v) => !v)
          playClick()
        }}
      />

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

function projectIdOf(events: { projectId?: string }[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const id = events[i].projectId
    if (id) return id
  }
  return null
}

/** Decorative rain (settings → weather): a light canvas particle overlay. */
function RainOverlay({ fpsCap }: { fpsCap: 30 | 60 }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = (): void => {
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    interface Drop {
      x: number
      y: number
      len: number
      speed: number
      drift: number
      alpha: number
    }
    const drops: Drop[] = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      len: 9 + Math.random() * 14,
      speed: 240 + Math.random() * 260,
      drift: 42 + Math.random() * 30,
      alpha: 0.12 + Math.random() * 0.18
    }))

    const frame = (t: number): void => {
      raf = requestAnimationFrame(frame)
      if (fpsCap === 30 && t - last < 30) return
      const dt = Math.min(0.05, last === 0 ? 0.016 : (t - last) / 1000)
      last = t
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1.25 * dpr
      ctx.lineCap = 'round'
      for (const d of drops) {
        d.y += (d.speed * dt) / window.innerHeight
        d.x += (d.drift * dt) / window.innerWidth
        if (d.y > 1.05) {
          d.y = -0.06
          d.x = Math.random()
        }
        if (d.x > 1.05) d.x = -0.05
        const x = d.x * w
        const y = d.y * h
        const grad = ctx.createLinearGradient(x, y, x + d.drift * dpr * 0.12, y + d.len * dpr)
        grad.addColorStop(0, 'rgba(157, 183, 224, 0)')
        grad.addColorStop(0.5, `rgba(157, 183, 224, ${d.alpha})`)
        grad.addColorStop(1, 'rgba(157, 183, 224, 0)')
        ctx.strokeStyle = grad
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + d.drift * dpr * 0.12, y + d.len * dpr)
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fpsCap])

  return <canvas ref={canvasRef} className="hq-rain" aria-hidden="true" />
}
