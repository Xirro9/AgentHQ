// src/client/ui/DeskPanel.tsx — the Level-2 inspection panel (spec 04 §1).
// Opens beside the selected desk (flips sides near the right edge, 320px),
// glass-dark plum, and shows only what the events actually say: state chip,
// project/task, last event, and a live ~10-event feed with an auto-follow
// pause + "jump to live" pill. Empty states are honest.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, type AgentId, type NormalizedEvent } from '../../shared/events'
import {
  SEVERITY_COLORS,
  eventTime,
  eventsForAgent,
  filterEvents,
  formatClock,
  formatRelative,
  kindGlyph
} from './logic'

const FEED_LENGTH = 10

export interface DeskPanelProps {
  agentId: AgentId
  /** Client px of the desk click (null when selected from the HUD strip). */
  anchor: { x: number; y: number } | null
  events: NormalizedEvent[]
  state: { state: string; since: string }
  followEnabled: boolean
  onClose(): void
  onExpand(): void
  onFollow(): void
  onOpenBoard(): void
}

interface Anchor {
  left: number
  top: number
}

/** Right of the desk; flips left when it would leave the viewport. */
function placePanel(anchor: { x: number; y: number } | null): Anchor {
  const width = 320
  const margin = 10
  const top = Math.min(
    Math.max(anchor ? anchor.y - 48 : 96, 64),
    Math.max(64, window.innerHeight - 360)
  )
  if (!anchor) {
    return { left: window.innerWidth - width - 14, top }
  }
  const right = anchor.x + 18
  if (right + width + margin <= window.innerWidth) {
    return { left: right, top }
  }
  return { left: Math.max(margin, anchor.x - width - 18), top }
}

export default function DeskPanel(props: DeskPanelProps) {
  const { agentId, anchor, events, onClose, onExpand, onFollow, onOpenBoard } = props
  const agent = AGENTS[agentId]
  const liveFeed = useMemo(() => {
    const own = eventsForAgent(events, agentId)
    return own.slice(-FEED_LENGTH).reverse() // newest on top
  }, [events, agentId])
  const feedRef = useRef(liveFeed)
  feedRef.current = liveFeed

  const project = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].projectId) return events[i].projectId
    }
    return null
  }, [events])

  const latestTask = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev.agentId === agentId && ev.taskId) return ev
    }
    return null
  }, [events, agentId])

  const lastEvent = liveFeed[0] ?? null

  // Auto-follow: newest on top means "live" is scrollTop 0. Scrolling away
  // pauses following AND freezes the rendered rows (brief §1.2: the viewer
  // never shifts while history is inspected); a pill counts what you missed.
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastSeenRef = useRef<string | null>(null)
  const [following, setFollowing] = useState(true)
  const [frozen, setFrozen] = useState<NormalizedEvent[] | null>(null)
  const [pending, setPending] = useState(0)
  const feed = following ? liveFeed : (frozen ?? liveFeed)

  // A new selection starts live again.
  useEffect(() => {
    setFollowing(true)
    setFrozen(null)
    setPending(0)
  }, [agentId])

  useEffect(() => {
    const own = eventsForAgent(events, agentId)
    const newest = own[own.length - 1] ?? null
    if (!newest) return
    if (following) {
      lastSeenRef.current = newest.eventId
      setPending(0)
      return
    }
    if (!lastSeenRef.current) return
    const idx = own.findIndex((e) => e.eventId === lastSeenRef.current)
    const missed = idx >= 0 ? own.length - 1 - idx : own.length
    if (missed > 0) setPending(missed)
  }, [events, agentId, following])

  const jumpToLive = (): void => {
    const own = eventsForAgent(events, agentId)
    const newest = own[own.length - 1] ?? null
    lastSeenRef.current = newest ? newest.eventId : null
    const list = listRef.current
    if (list) list.scrollTop = 0
    setFollowing(true)
    setFrozen(null)
    setPending(0)
  }

  const pos = useMemo(() => placePanel(anchor), [anchor])
  const stateLabel = props.state.state === '' ? 'unknown' : props.state.state

  return (
    <aside
      className="hq-panel hq-desk-panel"
      role="dialog"
      aria-label={`${agent.label} inspection panel`}
      style={{ left: pos.left, top: pos.top }}
    >
      <header className="hq-panel-head">
        <span className="hq-dot" style={{ backgroundColor: agent.color }} aria-hidden="true" />
        <div className="hq-panel-title">
          <strong>{agent.label}</strong>
          <span>{agent.role}</span>
        </div>
        <button type="button" className="hq-icon-btn" aria-label="Close panel" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="hq-panel-body">
        <div className="hq-state-row">
          <span className={`hq-state-chip hq-state--${stateLabel}`}>
            <span className="hq-state-pip" aria-hidden="true" />
            {stateLabel}
          </span>
          <span className="hq-dim-text">
            {props.state.since ? `since ${formatRelative(props.state.since)}` : 'since unknown'}
          </span>
        </div>

        <dl className="hq-facts">
          <div>
            <dt>Project</dt>
            <dd>{project ?? <span className="hq-unknown">not exposed</span>}</dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd>
              {latestTask ? (
                <span title={latestTask.publicSummary}>
                  {latestTask.taskId} · {latestTask.publicSummary}
                </span>
              ) : (
                <span className="hq-unknown">no task observed</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="hq-feed-head">
          <span className="hq-label">Live feed</span>
          <span className="hq-dim-text">
            {lastEvent ? `last event ${formatRelative(eventTime(lastEvent))}` : 'no events'}
          </span>
        </div>

        <div className="hq-feed-wrap">
          <div
            className="hq-feed"
            ref={listRef}
            onScroll={(e) => {
              const atLive = e.currentTarget.scrollTop <= 6
              if (!atLive && following) setFrozen(feedRef.current)
              if (atLive) {
                setPending(0)
                setFrozen(null)
              }
              setFollowing(atLive)
            }}
          >
            {feed.length === 0 ? (
              <p className="hq-empty">No activity observed yet</p>
            ) : (
              feed.map((ev) => (
                <div key={ev.eventId} className="hq-feed-row" title={ev.publicSummary}>
                  <span className="hq-glyph" style={{ color: SEVERITY_COLORS[ev.severity ?? 'info'] }}>
                    {kindGlyph(ev.kind)}
                  </span>
                  <span className="hq-time">{formatClock(eventTime(ev))}</span>
                  <span className="hq-feed-text">{ev.publicSummary}</span>
                </div>
              ))
            )}
          </div>
          {!following && (
            <button type="button" className="hq-jump-pill" onClick={jumpToLive}>
              {pending > 0 ? `${pending} new · ` : ''}jump to live ↓
            </button>
          )}
        </div>
      </div>

      <footer className="hq-panel-foot">
        <button type="button" className="hq-btn hq-btn--primary" onClick={onExpand}>
          Expand
        </button>
        <button
          type="button"
          className={`hq-btn${props.followEnabled ? ' hq-btn--active' : ''}`}
          aria-pressed={props.followEnabled}
          onClick={onFollow}
        >
          Follow
        </button>
        <button type="button" className="hq-btn" onClick={onOpenBoard}>
          Task Board
        </button>
      </footer>
    </aside>
  )
}
