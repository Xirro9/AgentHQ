// src/client/ui/WorkstationView.tsx — the Level-3 expanded workstation
// (spec 04 §2). Full-screen overlay; the office stays visible behind a 40%
// dim (camera motion is paused by App via the bridge; cats keep living).
// Seven tabs, all fed strictly from observed events: nothing is fabricated —
// missing data reads "not exposed" / "result only", never invented counts.

import { useMemo, useState } from 'react'
import { AGENTS, type AgentId, type NormalizedEvent } from '../../shared/events'
import {
  SEVERITY_COLORS,
  SOURCE_COLORS,
  copyText,
  deriveTaskCards,
  eventTime,
  eventsForAgent,
  filterEvents,
  formatClock,
  formatRelative,
  kindGlyph,
  summarizeTestEvents
} from './logic'
import { TaskMiniCard } from './TaskBoard'

const RENDER_CAP = 200
const LOAD_MORE = 200
const WORK_EVENT_KIND_LIST = [
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

const TABS = [
  'overview',
  'activity',
  'tasks',
  'files',
  'tests',
  'timeline',
  'diagnostics'
] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  activity: 'Live Activity',
  tasks: 'Tasks',
  files: 'Files',
  tests: 'Tests',
  timeline: 'Timeline',
  diagnostics: 'Diagnostics'
}

export interface WorkstationViewProps {
  agentId: AgentId
  events: NormalizedEvent[]
  state: { state: string; since: string }
  mode: string
  onClose(): void
}

export default function WorkstationView(props: WorkstationViewProps) {
  const { agentId, events, mode, onClose } = props
  const agent = AGENTS[agentId]
  const [tab, setTab] = useState<Tab>('overview')
  const own = useMemo(() => eventsForAgent(events, agentId), [events, agentId])

  return (
    <section className="hq-workstation" role="dialog" aria-modal="true" aria-label={`${agent.label} workstation`}>
      <header className="hq-workstation-head">
        <span className="hq-dot" style={{ backgroundColor: agent.color }} aria-hidden="true" />
        <div className="hq-panel-title">
          <strong>{agent.label}</strong>
          <span>
            {agent.role} · {own.length} observed event{own.length === 1 ? '' : 's'}
          </span>
        </div>
        <nav className="hq-tabs" aria-label="Workstation tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`hq-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`hq-tabpane-${t}`}
              tabIndex={tab === t ? 0 : -1}
              className={`hq-tab${tab === t ? ' hq-tab--active' : ''}`}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(tab)
                if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length])
                if (e.key === 'ArrowLeft') setTab(TABS[(i - 1 + TABS.length) % TABS.length])
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <button type="button" className="hq-icon-btn" aria-label="Close workstation" onClick={onClose}>
          ×
        </button>
      </header>

      <div
        className="hq-workstation-body"
        role="tabpanel"
        id={`hq-tabpane-${tab}`}
        aria-labelledby={`hq-tab-${tab}`}
      >
        {tab === 'overview' && <OverviewTab own={own} state={props.state} mode={mode} />}
        {tab === 'activity' && <ActivityTab own={own} />}
        {tab === 'tasks' && <TasksTab own={own} />}
        {tab === 'files' && <FilesTab own={own} />}
        {tab === 'tests' && <TestsTab own={own} />}
        {tab === 'timeline' && <TimelineTab own={own} />}
        {tab === 'diagnostics' && <DiagnosticsTab own={own} />}
      </div>
    </section>
  )
}

// ---- Overview --------------------------------------------------------------------

function OverviewTab({
  own,
  state,
  mode
}: {
  own: NormalizedEvent[]
  state: { state: string; since: string }
  mode: string
}) {
  const sources = useMemo(() => [...new Set(own.map((e) => e.source))], [own])
  const sessions = useMemo(
    () => [...new Set(own.map((e) => e.sessionId).filter((s): s is string => Boolean(s)))],
    [own]
  )
  const projectId = useMemo(() => {
    for (let i = own.length - 1; i >= 0; i--) if (own[i].projectId) return own[i].projectId
    return null
  }, [own])
  const taskId = useMemo(() => {
    for (let i = own.length - 1; i >= 0; i--) if (own[i].taskId) return own[i].taskId
    return null
  }, [own])
  const last = own[own.length - 1] ?? null
  const stateLabel = state.state === '' ? 'unknown' : state.state

  return (
    <div className="hq-tab-pane">
      <div className="hq-state-row">
        <span className={`hq-state-chip hq-state--${stateLabel}`}>
          <span className="hq-state-pip" aria-hidden="true" />
          {stateLabel}
        </span>
        <span className="hq-dim-text">
          {state.since ? `since ${formatRelative(state.since)}` : 'since unknown'}
        </span>
      </div>
      <dl className="hq-facts hq-facts--grid">
        <div>
          <dt>Project</dt>
          <dd>{projectId ?? <span className="hq-unknown">not exposed</span>}</dd>
        </div>
        <div>
          <dt>Task</dt>
          <dd>{taskId ?? <span className="hq-unknown">no task observed</span>}</dd>
        </div>
        <div>
          <dt>Source{sources.length === 1 ? '' : 's'} seen in events</dt>
          <dd>
            {sources.length === 0 ? (
              <span className="hq-unknown">none yet</span>
            ) : (
              sources.map((s) => (
                <span key={s} className="hq-src-badge" style={{ borderColor: SOURCE_COLORS[s] }}>
                  {s}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt>Session id{sessions.length === 1 ? '' : 's'}</dt>
          <dd>
            {sessions.length === 0 ? (
              <span className="hq-unknown">not exposed</span>
            ) : (
              <span className="hq-mono">{sessions.slice(0, 3).join(', ')}{sessions.length > 3 ? ` +${sessions.length - 3}` : ''}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>{last ? `${formatRelative(eventTime(last))} — ${last.publicSummary}` : <span className="hq-unknown">no activity observed yet</span>}</dd>
        </div>
        <div>
          <dt>Connectivity</dt>
          <dd>
            <span className={`hq-mode-pill hq-mode--${mode}`}>{mode}</span>{' '}
            <span className="hq-dim-text">
              {mode === 'disconnected'
                ? 'socket down; retrying with backoff'
                : mode === 'demo'
                  ? 'demo fixture events'
                  : mode === 'replay'
                    ? 'replaying captured events'
                    : 'live over local WebSocket'}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

// ---- Live Activity -----------------------------------------------------------------

function ActivityTab({ own }: { own: NormalizedEvent[] }) {
  const [kind, setKind] = useState('')
  const [severity, setSeverity] = useState('')
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(RENDER_CAP)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      filterEvents(own, {
        kinds: kind ? [kind] : undefined,
        severities: severity ? [severity] : undefined,
        text
      }).reverse(), // newest on top
    [own, kind, severity, text]
  )
  const shown = filtered.slice(0, visible)

  const copy = async (ev: NormalizedEvent): Promise<void> => {
    if (await copyText(ev.publicSummary)) {
      setCopiedId(ev.eventId)
      window.setTimeout(() => setCopiedId((c) => (c === ev.eventId ? null : c)), 1200)
    }
  }

  return (
    <div className="hq-tab-pane">
      <div className="hq-filter-row">
        <label htmlFor="hq-filter-kind">
          kind{' '}
          <select id="hq-filter-kind" name="kind" value={kind} onChange={(e) => { setKind(e.target.value); setVisible(RENDER_CAP) }}>
            <option value="">all</option>
            {WORK_EVENT_KIND_LIST.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label htmlFor="hq-filter-severity">
          severity{' '}
          <select id="hq-filter-severity" name="severity" value={severity} onChange={(e) => { setSeverity(e.target.value); setVisible(RENDER_CAP) }}>
            <option value="">all</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="hq-filter-grow" htmlFor="hq-filter-text">
          search{' '}
          <input
            id="hq-filter-text"
            name="search"
            type="search"
            value={text}
            maxLength={100}
            placeholder="case-insensitive…"
            onChange={(e) => { setText(e.target.value); setVisible(RENDER_CAP) }}
          />
        </label>
        <span className="hq-dim-text">{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
      </div>

      <div className="hq-feed hq-feed--tall">
        {shown.length === 0 ? (
          <p className="hq-empty">
            {own.length === 0 ? 'No activity observed yet' : 'Nothing matches these filters'}
          </p>
        ) : (
          shown.map((ev) => (
            <div key={ev.eventId} className="hq-feed-row hq-feed-row--wide">
              <span className="hq-glyph" style={{ color: SEVERITY_COLORS[ev.severity ?? 'info'] }}>
                {kindGlyph(ev.kind)}
              </span>
              <span className="hq-time">{formatClock(eventTime(ev))}</span>
              <span className="hq-kind">{ev.kind}</span>
              <span className="hq-feed-text" title={ev.nativeEventType}>{ev.publicSummary}</span>
              <button
                type="button"
                className="hq-icon-btn hq-copy-btn"
                aria-label="Copy summary"
                onClick={() => void copy(ev)}
              >
                {copiedId === ev.eventId ? '✓' : '⎘'}
              </button>
            </div>
          ))
        )}
      </div>
      {filtered.length > shown.length && (
        <button type="button" className="hq-btn hq-load-more" onClick={() => setVisible((v) => v + LOAD_MORE)}>
          Load more ({filtered.length - shown.length} older)
        </button>
      )}
    </div>
  )
}

// ---- Tasks --------------------------------------------------------------------------

function TasksTab({ own }: { own: NormalizedEvent[] }) {
  const cards = useMemo(() => deriveTaskCards(own), [own])
  if (cards.length === 0) return <p className="hq-empty">No task events observed for this agent</p>
  return (
    <div className="hq-tab-pane hq-task-grid">
      {cards.map((card) => (
        <TaskMiniCard key={card.taskId} card={card} />
      ))}
    </div>
  )
}

// ---- Files ---------------------------------------------------------------------------

function FilesTab({ own }: { own: NormalizedEvent[] }) {
  const files = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ev of own) for (const ref of ev.safeFileRefs ?? []) counts.set(ref, (counts.get(ref) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [own])
  const [copied, setCopied] = useState<string | null>(null)

  if (files.length === 0) {
    return <p className="hq-empty">No file paths observed — file contents are not exposed</p>
  }
  return (
    <div className="hq-tab-pane">
      <p className="hq-dim-text hq-privacy-note">
        Safe path references only. Nothing is opened — clicking copies the path.
      </p>
      <ul className="hq-file-list">
        {files.map(([path, count]) => (
          <li key={path}>
            <button
              type="button"
              className="hq-file-row"
              onClick={() => {
                void copyText(path).then((ok) => {
                  if (!ok) return
                  setCopied(path)
                  window.setTimeout(() => setCopied((c) => (c === path ? null : c)), 1200)
                })
              }}
              title="Copy path"
            >
              <span className="hq-mono">{path}</span>
              <span className="hq-file-meta">{copied === path ? 'copied ✓' : `×${count}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Tests ---------------------------------------------------------------------------

function TestsTab({ own }: { own: NormalizedEvent[] }) {
  const rows = useMemo(() => summarizeTestEvents(own), [own])
  if (rows.length === 0) return <p className="hq-empty">No test events observed</p>
  return (
    <div className="hq-tab-pane">
      <p className="hq-dim-text hq-privacy-note">
        Counts appear only when the event carried parseable results — prose is shown as-is.
      </p>
      <ul className="hq-test-list">
        {rows.map((row) => (
          <li key={row.eventId} className="hq-test-row">
            <span className={`hq-test-phase hq-test-phase--${row.phase}`}>
              {row.phase === 'started' ? 'run started' : 'run finished'}
            </span>
            <span className="hq-time">{formatClock(row.at)}</span>
            {row.counts ? (
              <span className="hq-test-counts hq-mono">
                {row.counts.passed !== undefined ? `${row.counts.passed} passed` : null}
                {row.counts.failed !== undefined ? `${row.counts.passed !== undefined ? ' · ' : ''}${row.counts.failed} failed` : null}
                {row.counts.total !== undefined ? ` of ${row.counts.total}` : null}
              </span>
            ) : (
              <span className="hq-test-counts hq-unknown">result only</span>
            )}
            <span className="hq-feed-text">{row.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Timeline -------------------------------------------------------------------------

function TimelineTab({ own }: { own: NormalizedEvent[] }) {
  const ordered = useMemo(() => [...own].sort((a, b) => a.ingestSeq - b.ingestSeq), [own])
  const [index, setIndex] = useState(ordered.length - 1)
  if (ordered.length === 0) return <p className="hq-empty">Nothing to scrub yet — no events observed</p>
  const i = Math.min(Math.max(index, 0), ordered.length - 1)
  const ev = ordered[i]
  return (
    <div className="hq-tab-pane">
      <div className="hq-timeline-card">
        <span className="hq-glyph" style={{ color: SEVERITY_COLORS[ev.severity ?? 'info'] }}>
          {kindGlyph(ev.kind)}
        </span>
        <span className="hq-kind">{ev.kind}</span>
        <span className="hq-time">{formatClock(eventTime(ev))}</span>
        <span className="hq-src-badge" style={{ borderColor: SOURCE_COLORS[ev.source] }}>{ev.source}</span>
        <p className="hq-feed-text">{ev.publicSummary}</p>
      </div>
      <label className="hq-scrubber">
        <span className="hq-label">
          step {i + 1} of {ordered.length}
        </span>
        <input
          type="range"
          min={0}
          max={ordered.length - 1}
          value={i}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Timeline position"
          style={{ ['--pct' as string]: `${ordered.length > 1 ? (i / (ordered.length - 1)) * 100 : 100}%` }}
        />
        <div className="hq-timeline-marks" aria-hidden="true">
          <span>oldest</span>
          <span>newest</span>
        </div>
      </label>
    </div>
  )
}

// ---- Diagnostics ------------------------------------------------------------------------

function DiagnosticsTab({ own }: { own: NormalizedEvent[] }) {
  const byKind = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ev of own) counts.set(ev.kind, (counts.get(ev.kind) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [own])
  const byProvenance = useMemo(() => {
    const counts = { direct: 0, derived: 0, simulation: 0 } as Record<string, number>
    for (const ev of own) counts[ev.provenance] += 1
    return counts
  }, [own])
  const first = own[0] ?? null
  const last = own[own.length - 1] ?? null

  if (own.length === 0) return <p className="hq-empty">No diagnostics yet — nothing observed</p>
  return (
    <div className="hq-tab-pane hq-diag-grid">
      <div>
        <h3 className="hq-label">Events by kind</h3>
        <ul className="hq-diag-list">
          {byKind.map(([kind, n]) => (
            <li key={kind}>
              <span>{kind}</span>
              <span className="hq-mono">{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="hq-label">Provenance</h3>
        <ul className="hq-diag-list">
          {Object.entries(byProvenance).map(([prov, n]) => (
            <li key={prov}>
              <span>{prov}</span>
              <span className="hq-mono">{n}</span>
            </li>
          ))}
        </ul>
        <h3 className="hq-label">Window</h3>
        <ul className="hq-diag-list">
          <li>
            <span>first seen</span>
            <span>{formatRelative(eventTime(first))}</span>
          </li>
          <li>
            <span>last seen</span>
            <span>{formatRelative(eventTime(last))}</span>
          </li>
          <li>
            <span>total</span>
            <span className="hq-mono">{own.length}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
