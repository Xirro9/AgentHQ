import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { NormalizedEvent } from '../shared/events'

export interface QueryFilter {
  agentId?: string
  kind?: string
  beforeSeq?: number
  limit?: number
}

export interface EventsDb {
  /** Insert a sanitized event; dedupes on eventId (returns the existing row's event instead). */
  insertEvent(e: Omit<NormalizedEvent, 'ingestSeq'>): NormalizedEvent | null
  /** Events with ingestSeq > sinceSeq, ascending, capped at limit (default 500). */
  getSnapshot(sinceSeq: number, limit?: number): NormalizedEvent[]
  /** Filtered events, newest first. */
  queryEvents(f: QueryFilter): NormalizedEvent[]
  latestSeq(): number
  /** Lowest retained ingest_seq (0 when the table is empty). Used for gap detection. */
  oldestSeq(): number
  close(): void
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

type Row = { json: string; ingest_seq: number | bigint }

function rowToEvent(row: Row): NormalizedEvent {
  const parsed = JSON.parse(row.json) as Omit<NormalizedEvent, 'ingestSeq'>
  return { ...parsed, ingestSeq: Number(row.ingest_seq) }
}

/**
 * Open (and create) the events database. WAL mode for concurrent readers.
 * The json column stores the full normalized event minus ingestSeq, which is
 * taken from the row's ingest_seq on every read.
 */
export function openEventsDb(path: string = 'data/agenthq.db'): EventsDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      ingest_seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE,
      agent_id TEXT,
      kind TEXT,
      json TEXT NOT NULL,
      received_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events (agent_id, ingest_seq);
    CREATE INDEX IF NOT EXISTS idx_events_kind ON events (kind, ingest_seq);
  `)

  const selectByEventId = db.prepare('SELECT json, ingest_seq FROM events WHERE event_id = ?')
  const insertStmt = db.prepare(
    'INSERT INTO events (event_id, agent_id, kind, json, received_at) VALUES (?, ?, ?, ?, ?)'
  )
  const snapshotStmt = db.prepare(
    'SELECT json, ingest_seq FROM events WHERE ingest_seq > ? ORDER BY ingest_seq ASC LIMIT ?'
  )
  const maxStmt = db.prepare('SELECT COALESCE(MAX(ingest_seq), 0) AS s FROM events')
  const minStmt = db.prepare('SELECT COALESCE(MIN(ingest_seq), 0) AS s FROM events')

  return {
    insertEvent(e) {
      const existing = selectByEventId.get(e.eventId) as Row | undefined
      if (existing) return rowToEvent(existing)
      // store without ingestSeq; the rowid is the authoritative sequence
      const candidate = e as Omit<NormalizedEvent, 'ingestSeq'> & { ingestSeq?: number }
      const stored = { ...candidate }
      delete stored.ingestSeq
      const result = insertStmt.run(
        e.eventId,
        e.agentId ?? null,
        e.kind,
        JSON.stringify(stored),
        e.receivedAt
      )
      return { ...stored, ingestSeq: Number(result.lastInsertRowid) }
    },

    getSnapshot(sinceSeq, limit = 500) {
      const rows = snapshotStmt.all(sinceSeq, limit) as unknown as Row[]
      return rows.map(rowToEvent)
    },

    queryEvents(f) {
      const where: string[] = []
      const params: Array<string | number> = []
      if (f.agentId !== undefined) {
        where.push('agent_id = ?')
        params.push(f.agentId)
      }
      if (f.kind !== undefined) {
        where.push('kind = ?')
        params.push(f.kind)
      }
      if (f.beforeSeq !== undefined) {
        where.push('ingest_seq < ?')
        params.push(f.beforeSeq)
      }
      const limit = Math.min(MAX_LIMIT, Math.max(1, f.limit ?? DEFAULT_LIMIT))
      const sql = `SELECT json, ingest_seq FROM events
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ingest_seq DESC LIMIT ${limit}`
      const rows = db.prepare(sql).all(...params) as unknown as Row[]
      return rows.map(rowToEvent)
    },

    latestSeq() {
      return Number((maxStmt.get() as { s: number | bigint }).s)
    },

    oldestSeq() {
      return Number((minStmt.get() as { s: number | bigint }).s)
    },

    close() {
      db.close()
    }
  }
}
