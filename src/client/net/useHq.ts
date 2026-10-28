// src/client/net/useHq.ts — React binding for the HQ store plus all transport:
// WebSocket (with exponential backoff + jitter) and the /api/states + /api/health
// poll. Spec 03 §2.
//
// Mode truth table (honest-status rule, brief §1.1):
//   socket down                     -> 'disconnected'
//   server says demo/replay         -> 'demo' | 'replay'
//   non-demo event over the socket  -> 'live'
// Replay mode (spec 05 §1) suspends this transport entirely: while replay is
// active the socket is closed, the poll paused, and the badge is owned by the
// replay controller — leaving replay resumes the connect loop here.

import { useEffect, useSyncExternalStore } from 'react'
import {
  AGENT_IDS,
  parseServerMessage,
  type AgentId
} from '../../shared/events'
import { asWorkState, store, type AgentRuntimeState, type HqState, type Mode } from './store'
import { isReplayActive, onReplayTransportChange } from './replay'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000
const RECONNECT_JITTER_MS = 250
const POLL_MS = 5_000

function wsUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws`
}

function isAgentStates(value: unknown): value is Record<AgentId, AgentRuntimeState> {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return AGENT_IDS.every((id) => {
    const entry = record[id]
    return typeof entry === 'object' && entry !== null && 'state' in entry && 'since' in entry
  })
}

function coerceAgentStates(value: unknown): Record<AgentId, AgentRuntimeState> | null {
  if (!isAgentStates(value)) return null
  const out = {} as Record<AgentId, AgentRuntimeState>
  for (const id of AGENT_IDS) {
    const entry = (value as Record<string, { state: unknown; since: unknown }>)[id]
    out[id] = {
      state: asWorkState(entry.state),
      since: typeof entry.since === 'string' ? entry.since : ''
    }
  }
  return out
}

/** Map a server-reported mode string onto a client Mode; null when unclaimed. */
function serverMode(mode: unknown): Mode | null {
  return mode === 'demo' || mode === 'replay' || mode === 'live' ? mode : null
}

export function useHq(): HqState {
  const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get)

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let attempts = 0
    let reconnectTimer: number | undefined
    let pollTimer: number | undefined
    let pollInFlight = false

    const setMode = (mode: Mode): void => {
      if (store.get().mode !== mode) store.set({ mode })
    }

    const poll = async (): Promise<void> => {
      if (pollInFlight || disposed || isReplayActive()) return // one poll at a time; replay owns the store
      pollInFlight = true
      try {
        const [statesRes, healthRes] = await Promise.all([fetch('/api/states'), fetch('/api/health')])
        if (statesRes.ok) {
          const states = coerceAgentStates(await statesRes.json())
          if (states) store.setAgentStates(states)
        }
        if (healthRes.ok) {
          const health = (await healthRes.json()) as { mode?: unknown }
          // The socket owns the connected/disconnected axis; health only names
          // demo/replay when we actually have a live socket to the server.
          if (socket && socket.readyState === WebSocket.OPEN) {
            const mode = serverMode(health.mode)
            if (mode === 'demo' || mode === 'replay') setMode(mode)
          }
        }
      } catch {
        /* server unreachable: the socket state governs the mode badge */
      } finally {
        pollInFlight = false
      }
    }

    const scheduleReconnect = (): void => {
      if (disposed || reconnectTimer !== undefined) return
      const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts)
      const delay = backoff + Math.random() * RECONNECT_JITTER_MS
      attempts += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, delay)
    }

    const applyServerMode = (mode: unknown): void => {
      const mapped = serverMode(mode)
      if (mapped) setMode(mapped)
    }

    const connect = (): void => {
      if (disposed || isReplayActive()) return // replay suspended the transport
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl())
      } catch {
        setMode('disconnected')
        scheduleReconnect()
        return
      }
      socket = ws
      ws.onopen = () => {
        attempts = 0
        try {
          ws.send(JSON.stringify({ type: 'hello', lastSeq: 0 }))
        } catch {
          /* raced close: onclose schedules the reconnect */
        }
      }
      ws.onmessage = (messageEvent: MessageEvent) => {
        if (typeof messageEvent.data !== 'string') return
        const msg = parseServerMessage(messageEvent.data)
        if (!msg) return
        switch (msg.type) {
          case 'snapshot':
            store.addEvents(msg.events)
            applyServerMode(msg.mode)
            void poll()
            break
          case 'event':
            store.addEvents([msg.event])
            if (msg.event.source !== 'demo') setMode('live')
            break
          case 'mode':
            applyServerMode(msg.mode)
            break
          case 'gap':
          case 'ping':
            break
        }
      }
      ws.onclose = () => {
        if (socket === ws) socket = null
        if (isReplayActive()) return // deliberate suspension: replay owns the badge
        setMode('disconnected')
        scheduleReconnect()
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          /* already closing */
        }
      }
    }

    connect()
    pollTimer = window.setInterval(() => void poll(), POLL_MS)
    void poll() // fill the HUD before the first snapshot lands

    // Replay transport suspension (spec 05 §1): on enter, drop the socket and
    // any pending reconnect without touching the badge (replay sets it); on
    // leave, resume the connect loop immediately.
    const offReplay = onReplayTransportChange((replayOn) => {
      if (disposed) return
      if (replayOn) {
        if (reconnectTimer !== undefined) {
          window.clearTimeout(reconnectTimer)
          reconnectTimer = undefined
        }
        if (socket) {
          const dying = socket
          socket = null
          dying.onclose = null
          dying.onerror = null
          dying.onmessage = null
          try {
            dying.close()
          } catch {
            /* already gone */
          }
        }
      } else {
        attempts = 0
        connect()
      }
    })

    return () => {
      disposed = true
      offReplay()
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      if (socket) {
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        try {
          socket.close()
        } catch {
          /* already gone */
        }
        socket = null
      }
      setMode('disconnected')
    }
  }, [])

  return snapshot
}
