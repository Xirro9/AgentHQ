// src/client/ui/GlobalFeed.tsx — bottom-left collapsible drawer (spec 04 §6):
// chronological events across ALL sources with colored source badges, kind
// filter chips, and search. Opens from the HUD "Activity" button.

import { useMemo, useState } from 'react'
import type { NormalizedEvent } from '../../shared/events'
import {
  SEVERITY_COLORS,
  SOURCE_COLORS,
  eventTime,
  filterEvents,
  formatClock,
  formatRelative,
  kindGlyph
} from './logic'

const RENDER_CAP = 150

/** Kind chips map to kind prefixes so new kinds keep landing in a bucket. */
const CHIPS: Array<{ id: string; label: string; match(kind: string): boolean }> = [
  { id: 'all', label: 'all', match: () => true },
  { id: 'task', label: 'tasks', match: (k) => k.startsWith('task.') },
  { id: 'agent', label: 'agents', match: (k) => k.startsWith('agent.') },
  { id: 'tool', label: 'tools', match: (k) => k.startsWith('tool.') },
  { id: 'test', label: 'tests', match: (k) => k.startsWith('test.') },
  { id: 'review', label: 'reviews', match: (k) => k.startsWith('review.') },
  { id: 'files', label: 'files', match: (k) => k === 'file.changed' || k === 'artifact.created' },
  {
    id: 'system',
    label: 'system',
    match: (k) => k.startsWith('session.') || k.startsWith('integration.') || k.startsWith('permission.') || k === 'status.changed' || k === 'diagnostic.recorded'
  }
]

export interface GlobalFeedProps {
  events: NormalizedEvent[]
  open: boolean
  onToggle(): void
}

export default function GlobalFeed({ events, open, onToggle }: GlobalFeedProps) {
  const [chip, setChip] = useState('all')
  const [text, setText] = useState('')

  const filtered = useMemo(() => {
    const list = filterEvents(events, { text })
    if (chip === 'all') return list
    const matcher = CHIPS.find((c) => c.id === chip) ?? CHIPS[0]
    return list.filter((e) => matcher.match(e.kind))
  }, [events, chip, text])
  const newest = [...filtered].reverse().slice(0, RENDER_CAP)

  return (
    <div className="hq-globalfeed">
      {open && (
        <section className="hq-globalfeed-panel hq-panel" aria-label="Global activity feed">
          <header className="hq-panel-head">
            <div className="hq-panel-title">
              <strong>Activity</strong>
              <span>
                all sources · {filtered.length} event{filtered.length === 1 ? '' : 's'}
                {filtered.length > RENDER_CAP ? ` · newest ${RENDER_CAP}` : ''}
              </span>
            </div>
            <button type="button" className="hq-icon-btn" aria-label="Collapse activity" onClick={onToggle}>
              ×
            </button>
          </header>
          <div className="hq-filter-row hq-filter-row--wrap">
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`hq-chip-btn${chip === c.id ? ' hq-chip-btn--active' : ''}`}
                aria-pressed={chip === c.id}
                onClick={() => setChip(c.id)}
              >
                {c.label}
              </button>
            ))}
            <input
              id="hq-feed-search"
              name="activity-search"
              type="search"
              className="hq-feed-search"
              maxLength={100}
              value={text}
              placeholder="search…"
              onChange={(e) => setText(e.target.value)}
              aria-label="Search activity"
            />
          </div>
          <div className="hq-feed hq-feed--drawer">
            {newest.length === 0 ? (
              <p className="hq-empty">
                {events.length === 0 ? 'No activity observed yet' : 'Nothing matches these filters'}
              </p>
            ) : (
              newest.map((ev) => (
                <div key={ev.eventId} className="hq-feed-row" title={ev.publicSummary}>
                  <span
                    className="hq-src-badge"
                    style={{ borderColor: SOURCE_COLORS[ev.source] ?? '#8b87a8' }}
                  >
                    {ev.source}
                  </span>
                  <span className="hq-glyph" style={{ color: SEVERITY_COLORS[ev.severity ?? 'info'] }}>
                    {kindGlyph(ev.kind)}
                  </span>
                  <span className="hq-time">{formatClock(eventTime(ev))}</span>
                  <span className="hq-feed-text">{ev.publicSummary}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
      <button
        type="button"
        className={`hq-activity-btn${open ? ' hq-activity-btn--open' : ''}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        Activity
        {events.length > 0 && <span className="hq-activity-count hq-mono">{events.length}</span>}
      </button>
      <span className="hq-feed-age hq-dim-text">
        {events.length > 0 ? formatRelative(eventTime(events[events.length - 1])) : ''}
      </span>
    </div>
  )
}
