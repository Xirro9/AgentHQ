import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deriveAgentStates } from './state'
import { openEventsDb } from './db'
import { sanitizeEvent } from './redact'
import { startDemoAdapter } from './adapters/demo'
import { startOpencodeAdapter, type OpencodeAdapter } from './adapters/opencode'
import { startHermesAdapter, type HermesAdapter } from './adapters/hermes'
import type { NormalizedEvent, ServerMessage } from '../shared/events'

/**
 * Server bind address, env-configurable for container deployments (Docker port
 * publishing forwards to the container's eth0, not its loopback — see
 * docs/OPERATIONS.md "Running in Docker"). Defaults are byte-identical to the
 * former hard-coded loopback bind.
 */
export function resolveBind(
  env: Partial<Pick<NodeJS.ProcessEnv, 'AGENTHQ_HOST' | 'AGENTHQ_PORT'>> = process.env
): { host: string; port: number } {
  return {
    host: env.AGENTHQ_HOST || '127.0.0.1',
    port: Number(env.AGENTHQ_PORT) || 4310
  }
}

const { host: HOST, port: PORT } = resolveBind()
const SNAPSHOT_CAP = 500
const WS_BEHIND_THRESHOLD = 150
const HEARTBEAT_MS = 15_000
const WS_OPEN = 1 // ws OPEN readyState

interface WsClient {
  send(data: string): void
  close(): void
  readyState: number
  on(event: string, cb: (...args: unknown[]) => void): unknown
}

function toText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return Buffer.from(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString('utf8')
  return ''
}

export async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(fastifyWebsocket)

  const db = openEventsDb()
  const clients = new Set<WsClient>()

  const currentMode = (): string =>
    opencode.status() === 'connected' ? 'live' : 'demo'

  function send(client: WsClient, message: ServerMessage) {
    if (client.readyState !== WS_OPEN) return
    try {
      client.send(JSON.stringify(message))
    } catch {
      clients.delete(client)
    }
  }

  function broadcast(message: ServerMessage) {
    for (const client of clients) send(client, message)
  }

  // Every event passes through sanitizeEvent before insertEvent; insert, then broadcast.
  function ingest(raw: unknown): void {
    const clean = sanitizeEvent(raw)
    if (!clean) return
    const before = db.latestSeq()
    const stored = db.insertEvent(clean)
    // dedup (insertEvent returned an already-stored event) is not re-broadcast
    if (!stored || stored.ingestSeq <= before) return
    broadcast({ type: 'event', event: stored })
  }

  app.get('/api/health', async () => ({
    ok: true,
    mode: currentMode(),
    adapters: { demo: 'running', opencode: opencode.status(), hermes: hermes.status() },
    latestSeq: db.latestSeq()
  }))

  app.get('/api/snapshot', async (req) => {
    const query = req.query as { since?: string }
    const since = Math.max(0, Math.floor(Number(query.since) || 0))
    return { events: db.getSnapshot(since, SNAPSHOT_CAP), seq: db.latestSeq() }
  })

  app.get('/api/events', async (req) => {
    const query = req.query as { agentId?: string; kind?: string; beforeSeq?: string; limit?: string }
    return {
      events: db.queryEvents({
        agentId: query.agentId || undefined,
        kind: query.kind || undefined,
        beforeSeq: query.beforeSeq !== undefined ? Math.floor(Number(query.beforeSeq) || 0) : undefined,
        limit: query.limit !== undefined ? Math.floor(Number(query.limit) || 0) || undefined : undefined
      })
    }
  })

  app.get('/api/states', async () =>
    deriveAgentStates(db.queryEvents({ limit: 200 }).reverse())
  )

  app.get('/ws', { websocket: true }, (socket: unknown) => {
    const client = socket as WsClient
    clients.add(client)
    client.on('message', (data: unknown) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(toText(data))
      } catch {
        return
      }
      if (typeof parsed !== 'object' || parsed === null) return
      const hello = parsed as { type?: string; lastSeq?: unknown }
      if (hello.type !== 'hello') return
      const lastSeq = Math.max(0, Math.floor(Number(hello.lastSeq) || 0))
      const seq = db.latestSeq()
      send(client, { type: 'snapshot', events: db.getSnapshot(lastSeq, SNAPSHOT_CAP), seq, mode: currentMode() })
      // We retain all events, so gaps should not occur; still implement the check:
      // send a gap marker only when lastSeq is older than the oldest retained event.
      if (seq - lastSeq > WS_BEHIND_THRESHOLD) {
        const oldest = db.oldestSeq()
        if (lastSeq < oldest - 1) {
          send(client, { type: 'gap', fromSeq: lastSeq + 1, toSeq: oldest - 1 })
        }
      }
    })
    const drop = () => clients.delete(client)
    client.on('close', drop)
    client.on('error', drop)
  })

  if (process.argv.includes('--production')) {
    const distRoot = resolve(process.cwd(), 'dist')
    if (existsSync(distRoot)) {
      await app.register(fastifyStatic, { root: distRoot })
      app.setNotFoundHandler((req, reply) => {
        const url = req.raw.url ?? ''
        if (url.startsWith('/api/') || url === '/ws') {
          return reply.code(404).send({ error: 'not found' })
        }
        return reply.sendFile('index.html')
      })
    }
  }

  const stopDemo = startDemoAdapter(ingest)
  const opencode: OpencodeAdapter = startOpencodeAdapter(ingest)
  const hermes: HermesAdapter = startHermesAdapter(ingest)

  const heartbeat = setInterval(() => {
    for (const client of clients) send(client, { type: 'ping', t: Date.now() })
  }, HEARTBEAT_MS)

  async function stop() {
    clearInterval(heartbeat)
    stopDemo()
    opencode.stop()
    hermes.stop()
    for (const client of clients) {
      try {
        client.close()
      } catch {
        /* already gone */
      }
    }
    clients.clear()
    await app.close()
    db.close()
  }

  return { app, db, ingest, stop }
}

export type RunningServer = Awaited<ReturnType<typeof buildServer>>

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await buildServer()
  await server.app.listen({ port: PORT, host: HOST })

  let stopping = false
  const shutdown = (signal: string) => {
    if (stopping) return
    stopping = true
    console.log(`agenthq server: ${signal} received, shutting down`)
    server.stop()
      .catch((err: unknown) => console.error('shutdown error', err))
      .finally(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// Re-exported for convenience of downstream tooling; the event type is the contract.
export type { NormalizedEvent }
