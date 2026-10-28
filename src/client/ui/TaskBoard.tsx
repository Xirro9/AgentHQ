// src/client/ui/TaskBoard.tsx — the kanban board (spec 04 §3).
// Columns are derived ONLY from task events (see logic.deriveTaskCards) — a
// stage is never inferred from an agent's role. Sticky-note cards (paper bg,
// pin dot, agent-color edge) move with a 300ms FLIP transition. The "+" button
// creates local-only manual notes: tagged, persisted to localStorage, and
// never sent anywhere near telemetry.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, type NormalizedEvent } from '../../shared/events'
import {
  COLUMN_LABELS,
  TASK_COLUMNS,
  copyText,
  deriveTaskCards,
  formatRelative,
  kindGlyph,
  type TaskCard,
  type TaskColumn
} from './logic'

const NOTES_STORAGE_KEY = 'agenthq.taskboard.notes'

export interface ManualNote {
  id: string
  title: string
  column: TaskColumn
  createdAt: string
}

function loadNotes(): ManualNote[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (n): n is ManualNote =>
          typeof n === 'object' && n !== null &&
          typeof (n as ManualNote).id === 'string' &&
          typeof (n as ManualNote).title === 'string' &&
          typeof (n as ManualNote).column === 'string' &&
          TASK_COLUMNS.includes((n as ManualNote).column as TaskColumn)
      )
      .slice(0, 100)
  } catch {
    return []
  }
}

function saveNotes(notes: ManualNote[]): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    /* session-only notes */
  }
}

export interface TaskBoardProps {
  events: NormalizedEvent[]
  /** In-app reduced-motion setting; the OS preference is honored as well. */
  reducedMotion: boolean
  onClose(): void
}

export default function TaskBoard({ events, reducedMotion, onClose }: TaskBoardProps) {
  const cards = useMemo(() => deriveTaskCards(events), [events])
  const [notes, setNotes] = useState<ManualNote[]>(loadNotes)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const boardRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => saveNotes(notes), [notes])

  // FLIP: cards carry data-flip-id; after every commit we diff positions and
  // play a 300ms transform (skipped entirely under reduced motion).
  const rects = useRef(new Map<string, DOMRect>())
  const reduced =
    reducedMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    const prev = rects.current
    for (const node of board.querySelectorAll<HTMLElement>('[data-flip-id]')) {
      const id = node.dataset.flipId ?? ''
      const next = node.getBoundingClientRect()
      const old = prev.get(id)
      if (old && !reduced) {
        const dx = old.left - next.left
        const dy = old.top - next.top
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          node.animate?.(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 300, easing: 'cubic-bezier(.2,.7,.3,1)' }
          )
        }
      }
      prev.set(id, next)
    }
    for (const id of prev.keys()) {
      if (!board.querySelector(`[data-flip-id="${CSS.escape(id)}"]`)) prev.delete(id)
    }
  })

  const addNote = (): void => {
    const title = draft.trim().slice(0, 120)
    if (!title) return
    setNotes((ns) => [
      ...ns,
      {
        id: `manual-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        title,
        column: 'queued',
        createdAt: new Date().toISOString()
      }
    ])
    setDraft('')
    setComposing(false)
  }

  const moveNote = (id: string, column: TaskColumn): void => {
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, column } : n)))
  }

  const removeNote = (id: string): void => {
    setNotes((ns) => ns.filter((n) => n.id !== id))
  }

  return (
    <>
      <div className="hq-scrim hq-scrim--board" onClick={onClose} aria-hidden="true" />
      <section className="hq-board" role="dialog" aria-modal="true" aria-label="Task board">
      <header className="hq-board-head">
        <div className="hq-panel-title">
          <strong>Task board</strong>
          <span>
            from observed task events{events.some((e) => e.source === 'demo') ? ' · includes demo fixture' : ''}
          </span>
        </div>
        <button type="button" className="hq-btn" onClick={() => setComposing((c) => !c)}>
          + manual note
        </button>
        <button type="button" className="hq-icon-btn" aria-label="Close task board" onClick={onClose}>
          ×
        </button>
      </header>

      {composing && (
        <div className="hq-note-composer">
          <input
            id="hq-note-draft"
            name="manual-note"
            type="text"
            autoFocus
            value={draft}
            maxLength={120}
            placeholder="What should someone pick up?"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addNote()
              if (e.key === 'Escape') setComposing(false)
            }}
          />
          <button type="button" className="hq-btn hq-btn--primary" onClick={addNote}>
            Add to Queued
          </button>
          <button type="button" className="hq-btn" onClick={() => setComposing(false)}>
            Cancel
          </button>
          <span className="hq-dim-text">local-only · never enters telemetry</span>
        </div>
      )}

      <div className="hq-board-columns" ref={boardRef}>
        {TASK_COLUMNS.map((column) => {
          const inColumn = cards.filter((c) => c.column === column)
          const inNotes = notes.filter((n) => n.column === column)
          return (
            <div key={column} className="hq-board-col">
              <h3 className="hq-board-col-title">
                {COLUMN_LABELS[column]}
                <span className="hq-col-count">{inColumn.length + inNotes.length}</span>
              </h3>
              {inNotes.map((note) => (
                <article
                  key={note.id}
                  data-flip-id={note.id}
                  className="hq-note hq-note--manual"
                >
                  <span className="hq-note-pin" aria-hidden="true" />
                  <header className="hq-note-head">
                    <span className="hq-note-tag">manual</span>
                    <button
                      type="button"
                      className="hq-icon-btn"
                      aria-label="Delete note"
                      onClick={() => removeNote(note.id)}
                    >
                      ×
                    </button>
                  </header>
                  <p className="hq-note-title">{note.title}</p>
                  <footer className="hq-note-foot">
                    <span className="hq-dim-text">{formatRelative(note.createdAt)}</span>
                    <select
                      value={note.column}
                      aria-label="Move note"
                      onChange={(e) => moveNote(note.id, e.target.value as TaskColumn)}
                    >
                      {TASK_COLUMNS.map((c) => (
                        <option key={c} value={c}>{COLUMN_LABELS[c]}</option>
                      ))}
                    </select>
                  </footer>
                </article>
              ))}
              {inColumn.map((card) => (
                <TaskMiniCard key={card.taskId} card={card} flipId={card.taskId} />
              ))}
            </div>
          )
        })}
      </div>
    </section>
    </>
  )
}

/** A sticky-note task card with its mini timeline of observed steps. */
export function TaskMiniCard({ card, flipId }: { card: TaskCard; flipId?: string }) {
  const [copied, setCopied] = useState(false)
  const color = card.agentId ? AGENTS[card.agentId]?.color ?? '#9b5de5' : '#9b5de5'
  const agentLabel = card.agentId ? AGENTS[card.agentId]?.label ?? card.agentId : 'unassigned'
  return (
    <article
      data-flip-id={flipId ?? card.taskId}
      className={`hq-note hq-note--${card.column}`}
      style={{ borderLeftColor: color }}
    >
      <span className="hq-note-pin" aria-hidden="true" />
      <header className="hq-note-head">
        <button
          type="button"
          className="hq-note-id hq-mono"
          title="Copy task id"
          onClick={() => {
            void copyText(card.taskId).then((ok) => {
              if (!ok) return
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
          }}
        >
          {copied ? 'copied ✓' : card.taskId}
        </button>
        <span className="hq-note-agent" style={{ color }}>{agentLabel}</span>
      </header>
      <p className="hq-note-title">{card.title}</p>
      {card.steps.length > 0 && (
        <ol className="hq-note-steps">
          {card.steps.slice(-4).map((step, i) => (
            <li key={`${step.kind}-${i}`} title={`${step.label} (${formatRelative(step.at)})`}>
              <span className="hq-glyph">{kindGlyph(step.kind)}</span>
              {step.kind}
            </li>
          ))}
        </ol>
      )}
      <footer className="hq-note-foot">
        <span className="hq-dim-text">{formatRelative(card.lastAt)}</span>
        <span className="hq-note-steps-count">
          {card.steps.length} step{card.steps.length === 1 ? '' : 's'}
        </span>
      </footer>
    </article>
  )
}
