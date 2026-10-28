// src/client/audio/sfx.ts — synthesized office soundscape (spec 04 §5).
// Pure WebAudio: OscillatorNode + GainNode envelopes, no audio files, no
// autoplay. Master gate starts muted; the AudioContext is created lazily on
// the first user gesture (browser policy). Volumes come from validated
// settings via the store; chimes fire only on real observed task.completed
// events (demo completions get a softer, clearly-smaller chime).

import { AGENT_IDS } from '../../shared/events'
import { store, type HqState } from '../net/store'
import {
  INTERACT_EVENT,
  PET_EVENT,
  SFX_CUE_EVENT,
  onBridgeEvent,
  type InteractDetail,
  type PetDetail,
  type SfxCueDetail
} from '../office/bridge'

const TICK_MIN_MS = 80 // keyboard tick loop window (spec 04 §5)
const TICK_MAX_MS = 140
const IDLE_CHECK_MS = 400

type AudioLevels = HqState['settings']['audio']

let ctx: AudioContext | null = null
let master: GainNode | null = null
let uiBus: GainNode | null = null
let ambienceBus: GainNode | null = null
let catsBus: GainNode | null = null

let levels: AudioLevels = { master: 0.7, ambience: 0.6, ui: 0.6, cats: 0.7 }
let muted = true
let typingActive = false
let tickTimer: number | undefined
let lastChimeEventId: string | null = null
let started = false

function ensureCtx(): boolean {
  if (typeof window === 'undefined') return false
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return false
    try {
      ctx = new Ctor()
    } catch {
      return false
    }
    master = ctx.createGain()
    master.connect(ctx.destination)
    uiBus = ctx.createGain()
    uiBus.connect(master)
    ambienceBus = ctx.createGain()
    ambienceBus.connect(master)
    catsBus = ctx.createGain()
    catsBus.connect(master)
    applyGains()
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return true
}

function applyGains(): void {
  if (!ctx || !master || !uiBus || !ambienceBus || !catsBus) return
  const t = ctx.currentTime
  const smooth = (node: GainNode, value: number): void => {
    node.gain.setTargetAtTime(value, t, 0.04)
  }
  smooth(master, muted ? 0 : levels.master)
  smooth(uiBus, levels.ui)
  smooth(ambienceBus, levels.ambience)
  smooth(catsBus, levels.cats)
}

/** One enveloped oscillator blip on a bus. */
function tone(
  bus: GainNode | null,
  opts: {
    type: OscillatorType
    f0: number
    f1?: number
    dur: number
    gain: number
    when?: number
  }
): void {
  if (!ctx || !bus || muted || levels.master <= 0) return
  const t = ctx.currentTime + (opts.when ?? 0)
  const osc = ctx.createOscillator()
  osc.type = opts.type
  osc.frequency.setValueAtTime(Math.max(1, opts.f0), t)
  if (opts.f1 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t + opts.dur)
  }
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur)
  osc.connect(g)
  g.connect(bus)
  osc.start(t)
  osc.stop(t + opts.dur + 0.05)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

// ---- the sounds -----------------------------------------------------------------

/** Soft UI click (buttons, toggles, tabs). */
export function playClick(): void {
  if (!ensureCtx()) return
  tone(uiBus, { type: 'triangle', f0: 1750, f1: 1350, dur: 0.05, gain: 0.1 })
}

/** Very quiet keyboard tick; frequency randomized so it never becomes a hum. */
function playKeyTick(): void {
  const f = 2100 + Math.random() * 1100
  tone(ambienceBus, { type: 'square', f0: f, f1: f * 0.8, dur: 0.02, gain: 0.018 })
}

/** Coffee machine gurgle: a few low wobble blips over a hum. */
function playCoffee(): void {
  if (!ensureCtx()) return
  tone(ambienceBus, { type: 'sine', f0: 70, f1: 55, dur: 0.7, gain: 0.035 })
  for (let i = 0; i < 4; i++) {
    tone(ambienceBus, {
      type: 'sine',
      f0: 150 - i * 18,
      f1: 85,
      dur: 0.16,
      gain: 0.05,
      when: 0.05 + i * 0.15
    })
  }
}

/** Cat meow: pitch bend up then down (triangle keeps it soft). */
function playMeow(): void {
  if (!ensureCtx()) return
  tone(catsBus, { type: 'triangle', f0: 480, f1: 820, dur: 0.16, gain: 0.09 })
  tone(catsBus, { type: 'triangle', f0: 820, f1: 380, dur: 0.24, gain: 0.08, when: 0.15 })
}

/** Purr: low sawtooth with an amplitude wobble (LFO on the gain node). */
function playPurr(): void {
  if (!ctx || !catsBus || muted || levels.master <= 0 || levels.cats <= 0) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(42, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.08)
  g.gain.setValueAtTime(0.05, t + 1.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(22, t)
  const lfoGain = ctx.createGain()
  lfoGain.gain.setValueAtTime(0.025, t)
  lfo.connect(lfoGain)
  lfoGain.connect(g.gain)
  osc.connect(g)
  g.connect(catsBus)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + 1.5)
  lfo.stop(t + 1.5)
  osc.onended = () => {
    osc.disconnect()
    lfo.disconnect()
    lfoGain.disconnect()
    g.disconnect()
  }
}

/** Two-note success chime — REAL task completions only (provenance !== simulation). */
function playSuccessChime(): void {
  if (!ensureCtx()) return
  tone(uiBus, { type: 'sine', f0: 659, dur: 0.32, gain: 0.13 })
  tone(uiBus, { type: 'sine', f0: 988, dur: 0.5, gain: 0.11, when: 0.13 })
  tone(uiBus, { type: 'triangle', f0: 1318, dur: 0.4, gain: 0.03, when: 0.13 })
}

/** Demo completions: same shape, smaller and clearly softer. */
function playDemoChime(): void {
  if (!ensureCtx()) return
  tone(uiBus, { type: 'sine', f0: 523, dur: 0.22, gain: 0.05 })
  tone(uiBus, { type: 'sine', f0: 659, dur: 0.3, gain: 0.04, when: 0.11 })
}

/** Printer: rapid impact ticks plus a low feed whirr. */
function playPrinter(): void {
  if (!ensureCtx()) return
  tone(ambienceBus, { type: 'sawtooth', f0: 95, f1: 65, dur: 0.55, gain: 0.03 })
  for (let i = 0; i < 7; i++) {
    tone(ambienceBus, {
      type: 'square',
      f0: 160 + Math.random() * 60,
      dur: 0.03,
      gain: 0.045,
      when: i * 0.07
    })
  }
}

// ---- keyboard tick loop ----------------------------------------------------------

/** Self-rescheduling single timer: ticks only while a worker is typing. */
function scheduleTick(): void {
  if (typingActive && ctx && !muted && levels.ambience > 0 && levels.master > 0) {
    playKeyTick()
    tickTimer = window.setTimeout(scheduleTick, TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS))
  } else {
    tickTimer = window.setTimeout(scheduleTick, IDLE_CHECK_MS)
  }
}

// ---- wiring ----------------------------------------------------------------------

function applyStore(s: HqState): void {
  levels = s.settings.audio
  muted = s.settings.muted
  applyGains()
  typingActive = AGENT_IDS.some((id) => {
    const st = s.agentStates[id]?.state
    return st === 'working' || st === 'testing'
  })

  // Chimes: only on newly observed task.completed events. The cursor is the
  // newest eventId; when it can't be found (server restart, event cap) the
  // cursor re-arms silently — never a burst of stale celebration.
  const events = s.events
  const newest = events[events.length - 1]
  if (!lastChimeEventId) {
    lastChimeEventId = newest?.eventId ?? null
  } else {
    const cursorIdx = events.findIndex((ev) => ev.eventId === lastChimeEventId)
    if (cursorIdx < 0) {
      lastChimeEventId = newest?.eventId ?? null
    } else {
      for (let i = cursorIdx + 1; i < events.length; i++) {
        const ev = events[i]
        if (ev.kind !== 'task.completed') continue
        if (ev.provenance === 'simulation') playDemoChime()
        else playSuccessChime()
      }
      lastChimeEventId = newest?.eventId ?? null
    }
  }
}

/**
 * Start the soundscape exactly once; returns a cleanup function.
 * Safe to call before any user gesture — nothing audible happens until the
 * context is unlocked, and the master gate starts muted regardless.
 */
export function initSfx(): () => void {
  if (started) return () => undefined
  started = true

  const unlock = (): void => {
    ensureCtx()
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })

  const unsubStore = store.subscribe(() => applyStore(store.get()))
  applyStore(store.get())

  const offInteract = onBridgeEvent<InteractDetail>(INTERACT_EVENT, (d) => {
    if (d.kind === 'coffee') playCoffee()
  })
  const offPet = onBridgeEvent<PetDetail>(PET_EVENT, () => {
    playMeow()
    playPurr()
  })
  const offCue = onBridgeEvent<SfxCueDetail>(SFX_CUE_EVENT, (d) => {
    if (d.cue === 'printer') playPrinter()
  })
  scheduleTick()

  return () => {
    unsubStore()
    offInteract()
    offPet()
    offCue()
    window.removeEventListener('pointerdown', unlock, { capture: true })
    window.removeEventListener('keydown', unlock, { capture: true })
    if (tickTimer !== undefined) window.clearTimeout(tickTimer)
    tickTimer = undefined
    if (ctx) {
      void ctx.close().catch(() => undefined)
      ctx = null
      master = uiBus = ambienceBus = catsBus = null
    }
    started = false
  }
}
