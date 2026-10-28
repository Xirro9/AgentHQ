// src/sim/cats.ts — pure cat simulation core for AgentHQ.
// Engine-free, IO-free, timer-free: the engine calls update(dt).
// Fully deterministic from (world, seed).

import { Rng } from './rng'
import type { SimWorld, Vec } from './world'

// ---- public types ------------------------------------------------------------

export type CatId = 'pixel' | 'biscuit'
export type MessId = 'puddle' | 'papers' | 'cable' | 'plant_tilt' | 'paper_jam'

export type CatEvent =
  | { type: 'moved'; cat: CatId; x: number; y: number; facing: 'left' | 'right' }
  | { type: 'state'; cat: CatId; state: string }
  | { type: 'mischief_started'; cat: CatId; incident: string; target: string }
  | { type: 'mess_created'; mess: MessId; x: number; y: number }
  | { type: 'mess_cleaning'; mess: MessId; by: string }
  | { type: 'mess_cleaned'; mess: MessId }
  | { type: 'incident_resolved'; incident: string }
  | { type: 'purr'; cat: CatId }

export interface CatAgentView {
  x: number
  y: number
  facing: 'left' | 'right'
  state: string
  path: Vec[]
}

export interface ActiveMessView {
  mess: MessId
  x: number
  y: number
  cleaning?: string
}

// ---- tuning (numbers from AGENT_HQ_MASTER_BRIEF.md §7, exposed for tests) ----

export const TUNING = {
  tile: 16,
  maxDt: 0.5,              // clamp huge frames; smaller is always fine
  cleanupSeconds: 6,       // assignCleanup -> mess_cleaned delay
  petHappySeconds: 2.5,
  avoidWaitSeconds: 2,     // wait before repathing around the other cat
  avoidRange: 24,          // "worker within 24px"-scale proximity for tile yield
  incidentFloor: 60,       // per-incident cooldown floor (s)
  pixel: {
    decisionMin: 4,        // decision check every 4-9 s
    decisionMax: 9,
    speedMin: 26,          // walk speed 26-38 px/s
    speedMax: 38,
    zoomiesMult: 2.2,      // zoomies at ~2.2x speed
    zoomiesMin: 2,         // burst 2-4 s
    zoomiesMax: 4,
    fleeMult: 2.0,
    mischiefChance: 0.45,  // per decision once the cooldown has elapsed
    mischiefCooldownMin: 90,   // 90-180 s
    mischiefCooldownMax: 180,
    firstMischiefMin: 20,
    firstMischiefMax: 60
  },
  biscuit: {
    decisionMin: 20,       // decision check every 20-40 s
    decisionMax: 40,
    speedMin: 9,           // walk speed 9-13 px/s
    speedMax: 13,
    mischiefChance: 0.22,  // rare mischief only
    mischiefCooldownMin: 300,
    mischiefCooldownMax: 600,
    firstMischiefMin: 60,
    firstMischiefMax: 180
  },
  laserMult: 1.6
} as const

// ---- scenes (brief §7.1 / §7.2) ----------------------------------------------

type Beat =
  | { k: 'goto' }
  | { k: 'act'; state: string; min: number; max: number }
  | { k: 'mess'; mess: MessId }
  | { k: 'zoom'; min: number; max: number }
  | { k: 'laser'; min: number; max: number }
  | { k: 'flee' }
  | { k: 'end' }

interface SceneDef {
  name: string
  cat: CatId
  target: string
  mess?: MessId
  weight: number
  beats: Beat[]
}

const SCENES: SceneDef[] = [
  // Pixel mischief scenes (8, brief §7.1)
  { name: 'keyboard_cat', cat: 'pixel', target: 'dev_keyboard', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'bat', min: 6, max: 10 }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'coffee_catastrophe', cat: 'pixel', target: 'food_bowls', mess: 'puddle', weight: 12, beats: [
    { k: 'goto' }, { k: 'act', state: 'bat', min: 3, max: 6 }, { k: 'mess', mess: 'puddle' }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'cable_thief', cat: 'pixel', target: 'cable_corner', mess: 'cable', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'bat', min: 4, max: 8 }, { k: 'mess', mess: 'cable' }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'printer_battle', cat: 'pixel', target: 'printer', mess: 'paper_jam', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'pounce', min: 2, max: 4 }, { k: 'act', state: 'bat', min: 4, max: 7 },
    { k: 'mess', mess: 'paper_jam' }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'plant_assassin', cat: 'pixel', target: 'plant', mess: 'plant_tilt', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'bat', min: 4, max: 8 }, { k: 'mess', mess: 'plant_tilt' }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'zoomies_scene', cat: 'pixel', target: 'toy', weight: 18, beats: [
    { k: 'zoom', min: 2, max: 4 }, { k: 'zoom', min: 2, max: 4 }, { k: 'end' }
  ] },
  { name: 'forbidden_warmth', cat: 'pixel', target: 'security_monitor', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'sleep', min: 8, max: 14 }, { k: 'flee' }, { k: 'end' }
  ] },
  { name: 'laser_chase', cat: 'pixel', target: 'toy', weight: 12, beats: [
    { k: 'laser', min: 3, max: 6 }, { k: 'act', state: 'pounce', min: 1, max: 2 }, { k: 'end' }
  ] },
  // Biscuit scenes (5, brief §7.2)
  { name: 'keyboard_occupation', cat: 'biscuit', target: 'architect_keyboard', weight: 12, beats: [
    { k: 'goto' }, { k: 'act', state: 'occupy', min: 40, max: 90 }, { k: 'end' }
  ] },
  { name: 'chair_theft', cat: 'biscuit', target: 'security_monitor', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'occupy', min: 35, max: 70 }, { k: 'end' }
  ] },
  { name: 'printer_throne', cat: 'biscuit', target: 'printer', weight: 10, beats: [
    { k: 'goto' }, { k: 'act', state: 'occupy', min: 30, max: 60 }, { k: 'end' }
  ] },
  { name: 'doorway_boulder', cat: 'biscuit', target: 'doorway_lounge', weight: 12, beats: [
    { k: 'goto' }, { k: 'act', state: 'sit', min: 30, max: 60 }, { k: 'end' }
  ] },
  { name: 'slowest_crime', cat: 'biscuit', target: 'papers_table', mess: 'papers', weight: 8, beats: [
    { k: 'goto' }, { k: 'act', state: 'bat', min: 22, max: 40 }, { k: 'mess', mess: 'papers' },
    { k: 'goto' }, { k: 'act', state: 'sleep', min: 20, max: 40 }, { k: 'end' }
  ] }
]

const SCENE_BY_NAME = new Map(SCENES.map(s => [s.name, s]))

// ---- internals ----------------------------------------------------------------

type Mode = 'rest' | 'travel' | 'zoom' | 'scene' | 'happy'

interface CatAgent extends CatAgentView {
  id: CatId
  speed: number
  baseSpeed: number
  mode: Mode
  stateUntil: number       // rest countdown end (-1 = n/a)
  zoomUntil: number
  zoomMult: number
  arriveState: string | null
  arriveMin: number
  arriveMax: number
  dest: Vec | null
  waitTime: number
  scene: { def: SceneDef; i: number; wait: number; waiting: boolean; waitKind: 'act' | 'retry'; retries: number } | null
  nextDecisionAt: number
  mischiefReadyAt: number
  lastSceneEnd: Record<string, number>
  happyUntil: number
  rng: Rng
}

interface StoredMess extends ActiveMessView {
  id: number
  by?: string
  cleanAt: number
}

const cell = (p: Vec): [number, number] => [Math.floor(p.x / 16), Math.floor(p.y / 16)]

function snapToWalkable(world: SimWorld, p: Vec): Vec {
  if (world.walkable(p.x, p.y)) return { ...p }
  const [c0, r0] = cell(p)
  for (let r = 1; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = (c0 + dx) * 16 + 8
        const y = (r0 + dy) * 16 + 8
        if (world.walkable(x, y)) return { x, y }
      }
    }
  }
  return { ...p }
}

// ---- the core -----------------------------------------------------------------

export class CatCore {
  readonly world: SimWorld
  pixel: CatAgentView
  biscuit: CatAgentView

  private t = 0
  private queue: CatEvent[] = []
  private messes: StoredMess[] = []
  private messSeq = 0
  private agents: { pixel: CatAgent; biscuit: CatAgent }

  constructor(world: SimWorld, seed: number) {
    this.world = world
    this.agents = {
      pixel: this.makeCat('pixel', world.spawn?.pixel ?? { x: 120, y: 140 }, seed),
      biscuit: this.makeCat('biscuit', world.spawn?.biscuit ?? { x: 318, y: 210 }, (seed ^ 0x9e3779b9) >>> 0)
    }
    this.pixel = this.agents.pixel
    this.biscuit = this.agents.biscuit
  }

  private makeCat(id: CatId, at: Vec, seed: number): CatAgent {
    const tun = TUNING[id]
    const rng = new Rng(seed)
    const pos = snapToWalkable(this.world, at)
    return {
      id,
      x: pos.x,
      y: pos.y,
      facing: 'right',
      state: 'idle',
      path: [],
      baseSpeed: tun.speedMin,
      speed: tun.speedMin,
      mode: 'rest',
      stateUntil: -1,
      zoomUntil: 0,
      zoomMult: 1,
      arriveState: null,
      arriveMin: 0,
      arriveMax: 0,
      dest: null,
      waitTime: 0,
      scene: null,
      nextDecisionAt: 0,
      mischiefReadyAt: rng.int(tun.firstMischiefMin, tun.firstMischiefMax),
      lastSceneEnd: {},
      happyUntil: 0,
      rng
    }
  }

  // ---- public API ----

  /** Advance the simulation; returns and drains the events emitted this step. */
  update(dt: number): CatEvent[] {
    if (dt > 0) {
      const step = Math.min(dt, TUNING.maxDt)
      this.t += step
      const pre = { px: { x: this.agents.pixel.x, y: this.agents.pixel.y }, bx: { x: this.agents.biscuit.x, y: this.agents.biscuit.y } }
      this.updateCat(this.agents.pixel, this.agents.biscuit, step)
      this.updateCat(this.agents.biscuit, this.agents.pixel, step)
      // hard rule: cats never share a tile
      const [pcx, pcy] = cell(this.agents.pixel)
      const [bcx, bcy] = cell(this.agents.biscuit)
      if (pcx === bcx && pcy === bcy) {
        this.agents.pixel.x = pre.px.x
        this.agents.pixel.y = pre.px.y
        const [pcx2, pcy2] = cell(this.agents.pixel)
        if (pcx2 === bcx && pcy2 === bcy) {
          this.agents.biscuit.x = pre.bx.x
          this.agents.biscuit.y = pre.bx.y
        }
      }
      // mess lifecycle
      for (const m of [...this.messes]) {
        if (m.by && this.t >= m.cleanAt) {
          this.queue.push({ type: 'mess_cleaned', mess: m.mess })
          this.messes = this.messes.filter(x => x !== m)
        }
      }
    }
    return this.drain()
  }

  /** Pet a cat: purr/heart event plus a brief happy state. */
  pet(id: CatId): CatEvent[] {
    const cat = this.agents[id]
    const events: CatEvent[] = [{ type: 'purr', cat: id }]
    if (cat.state !== 'happy') events.push({ type: 'state', cat: id, state: 'happy' })
    cat.state = 'happy'
    cat.mode = 'happy'
    cat.happyUntil = this.t + TUNING.petHappySeconds
    cat.path = []
    cat.dest = null
    cat.nextDecisionAt = this.t
    return events
  }

  /** Assign an agent to clean a mess; mess_cleaned follows cleanupSeconds later. */
  assignCleanup(mess: MessId, agentId: string): void {
    const m = this.messes.find(x => x.mess === mess && !x.by)
    if (!m) return
    m.by = agentId
    m.cleanAt = this.t + TUNING.cleanupSeconds
    this.queue.push({ type: 'mess_cleaning', mess, by: agentId })
  }

  /** Single source of mess truth. */
  activeMesses(): ActiveMessView[] {
    return this.messes.map(m =>
      m.by ? { mess: m.mess, x: m.x, y: m.y, cleaning: m.by } : { mess: m.mess, x: m.x, y: m.y }
    )
  }

  /** Manual incident trigger (tests/demo); false while on cooldown or ineligible. */
  startIncident(name: string): boolean {
    const def = SCENE_BY_NAME.get(name)
    if (!def || !this.canStart(def)) return false
    this.startScene(def)
    return true
  }

  // ---- per-tick cat logic ----

  private updateCat(cat: CatAgent, other: CatAgent, dt: number): void {
    if (cat.mode === 'happy') {
      if (this.t >= cat.happyUntil) {
        cat.mode = cat.scene ? 'scene' : 'rest'
        cat.stateUntil = -1
        cat.nextDecisionAt = this.t
      }
      return
    }
    if (cat.path.length > 0) {
      const res = this.advance(cat, other, dt)
      if (res === 'arrived') this.onArrive(cat, other)
      else if (res === 'blocked') this.handleBlocked(cat, other, dt)
      return
    }
    if (cat.mode === 'scene') {
      this.runSceneBeat(cat, other, dt)
      return
    }
    if (cat.stateUntil >= 0 && this.t >= cat.stateUntil) {
      cat.stateUntil = -1
      this.afterStateEnd(cat)
      return
    }
    if (cat.nextDecisionAt <= this.t) this.decide(cat)
  }

  private advance(cat: CatAgent, other: CatAgent, dt: number): 'moved' | 'arrived' | 'blocked' {
    const prevX = cat.x
    const prevY = cat.y
    const prevF = cat.facing
    let budget = dt
    while (budget > 1e-9 && cat.path.length > 0) {
      const wp = cat.path[0]
      const dx = wp.x - cat.x
      const dy = wp.y - cat.y
      const dist = Math.hypot(dx, dy)
      if (dist <= 1e-6) {
        cat.path.shift()
        continue
      }
      const [wcx, wcy] = cell(wp)
      const [ocx, ocy] = cell(other)
      if (wcx === ocx && wcy === ocy && dist < TUNING.avoidRange) return 'blocked'
      const step = cat.speed * budget
      if (step >= dist) {
        cat.x = wp.x
        cat.y = wp.y
        cat.path.shift()
        budget -= dist / cat.speed
        continue
      }
      const nx = cat.x + (dx / dist) * step
      const ny = cat.y + (dy / dist) * step
      if (Math.hypot(nx - other.x, ny - other.y) < 8) return 'blocked'
      cat.x = nx
      cat.y = ny
      budget = 0
    }
    if (Math.abs(cat.x - prevX) > 1e-9 || Math.abs(cat.y - prevY) > 1e-9) {
      if (Math.abs(cat.x - prevX) > 1e-9) cat.facing = cat.x < prevX ? 'left' : 'right'
    }
    if (cat.facing !== prevF || Math.abs(cat.x - prevX) > 1e-9 || Math.abs(cat.y - prevY) > 1e-9) {
      this.queue.push({ type: 'moved', cat: cat.id, x: cat.x, y: cat.y, facing: cat.facing })
    }
    return cat.path.length === 0 ? 'arrived' : 'moved'
  }

  private onArrive(cat: CatAgent, other: CatAgent): void {
    cat.dest = null
    cat.waitTime = 0
    const sc = cat.scene
    if (sc) {
      const b = sc.def.beats[sc.i]
      if ((b.k === 'zoom' || b.k === 'laser') && this.t < cat.zoomUntil - 1e-6) {
        // keep the burst going: chain another lap
        this.pickDashDest(cat, other, b.k === 'zoom' ? cat.zoomMult : TUNING.laserMult, b.k === 'zoom' ? 80 : 40, b.k === 'zoom' ? 240 : 120)
        return
      }
      sc.i++
      sc.wait = 0
      sc.waiting = false
      this.runSceneBeat(cat, other, 0)
      return
    }
    if (cat.mode === 'zoom') {
      if (this.t < cat.zoomUntil - 1e-6) {
        this.pickDashDest(cat, other, TUNING.pixel.zoomiesMult, 80, 240)
        return
      }
      cat.mode = 'rest'
      cat.stateUntil = -1
      cat.nextDecisionAt = this.t
      return
    }
    // idle travel
    cat.mode = 'rest'
    if (cat.arriveState) {
      const dur = cat.rng.int(cat.arriveMin, cat.arriveMax)
      this.setState(cat, cat.arriveState)
      cat.stateUntil = this.t + dur
      cat.arriveState = null
    } else {
      cat.stateUntil = -1
      this.afterStateEnd(cat)
    }
  }

  private handleBlocked(cat: CatAgent, other: CatAgent, dt: number): void {
    cat.waitTime += dt
    if (cat.waitTime < TUNING.avoidWaitSeconds) return
    cat.waitTime = 0
    if (!cat.dest) {
      cat.path = []
      if (cat.scene) this.endScene(cat)
      else this.decide(cat)
      return
    }
    // dynamic blockage: repath around the other cat's current tile
    const [ocx, ocy] = cell(other)
    const rect = { x: ocx * 16, y: ocy * 16, w: 16, h: 16 }
    this.world.blocked.push(rect)
    let ok = false
    try {
      ok = this.tryTravel(cat, cat.dest, cat.state, cat.speed)
    } finally {
      this.world.blocked.pop()
    }
    if (!ok) {
      cat.path = []
      cat.dest = null
      if (cat.scene) this.endScene(cat)
      else this.decide(cat)
    }
  }

  // ---- decisions ----

  private afterStateEnd(cat: CatAgent): void {
    if (cat.id === 'biscuit' && this.t < cat.nextDecisionAt && cat.rng.chance(0.45)) {
      // doze until the next scheduled decision check
      this.setState(cat, 'sleep')
      cat.stateUntil = cat.nextDecisionAt
    } else {
      this.decide(cat)
    }
  }

  private decide(cat: CatAgent): void {
    const tun = TUNING[cat.id]
    const cr = cat.rng
    cat.nextDecisionAt = this.t + cr.int(tun.decisionMin, tun.decisionMax)
    if (this.t >= cat.mischiefReadyAt && cr.chance(tun.mischiefChance)) {
      const def = this.pickScene(cat.id)
      if (def) {
        this.startScene(def)
        return
      }
    }
    if (cat.id === 'pixel') this.decidePixel(cat)
    else this.decideBiscuit(cat)
  }

  private decidePixel(cat: CatAgent): void {
    const cr = cat.rng
    const r = cr.next()
    const speed = () => cr.int(TUNING.pixel.speedMin, TUNING.pixel.speedMax)
    if (r < 0.28) {
      // wander
      const dest = this.randCell(cat, cr, 40, 220) ?? cr.pick(Object.values(this.world.targets))
      if (!this.tryTravel(cat, dest, 'wander', speed(), { state: 'sit', min: 1, max: 2 })) {
        this.rest(cat, 'sit', cr.int(2, 5))
      }
    } else if (r < 0.5) {
      // investigate a named interest point
      const name = cr.pick(Object.keys(this.world.targets))
      const tp = this.world.targets[name]
      if (!tp || !this.tryTravel(cat, tp, 'investigate', speed(), { state: 'investigate', min: 2, max: 4 })) {
        this.rest(cat, 'sit', cr.int(2, 5))
      }
    } else if (r < 0.6) {
      // zoomies burst
      cat.mode = 'zoom'
      cat.zoomUntil = this.t + cr.int(TUNING.pixel.zoomiesMin, TUNING.pixel.zoomiesMax)
      cat.zoomMult = TUNING.pixel.zoomiesMult
      this.pickDashDest(cat, this.agents.biscuit, TUNING.pixel.zoomiesMult, 80, 240)
    } else if (r < 0.7) this.rest(cat, 'sit', cr.int(3, 8))
    else if (r < 0.8) this.rest(cat, 'loaf', cr.int(4, 9))
    else if (r < 0.88) this.rest(cat, 'groom', cr.int(3, 6))
    else if (r < 0.93) this.rest(cat, 'pounce', cr.int(1, 2))
    else this.rest(cat, 'sleep', cr.int(4, 9))
  }

  private decideBiscuit(cat: CatAgent): void {
    const cr = cat.rng
    const r = cr.next()
    if (r < 0.26) this.rest(cat, 'sleep', cr.int(18, 36))
    else if (r < 0.36) this.rest(cat, 'sit', cr.int(10, 18))
    else if (r < 0.42) this.rest(cat, 'loaf', cr.int(8, 16))
    else if (r < 0.52) this.rest(cat, 'stretch', cr.int(3, 5))
    else if (r < 0.64) this.rest(cat, 'look', cr.int(3, 7))
    else if (r < 0.7) this.rest(cat, 'wake', cr.int(2, 4))
    else {
      // waddle somewhere nearby, then settle
      const dest = this.randCell(cat, cr, 60, 180)
      if (!dest || !this.tryTravel(cat, dest, 'waddle', cr.int(TUNING.biscuit.speedMin, TUNING.biscuit.speedMax), { state: 'sit', min: 6, max: 14 })) {
        this.rest(cat, 'sleep', cr.int(10, 20))
      }
    }
  }

  private rest(cat: CatAgent, state: string, dur: number): void {
    this.setState(cat, state)
    cat.mode = 'rest'
    cat.stateUntil = this.t + dur
  }

  // ---- travel helpers ----

  private setState(cat: CatAgent, state: string): void {
    if (cat.state !== state) {
      cat.state = state
      this.queue.push({ type: 'state', cat: cat.id, state })
    }
  }

  /** Set a path if reachable; every waypoint must be walkable. Returns false if not. */
  private tryTravel(cat: CatAgent, to: Vec, state: string, speed: number, arrive?: { state: string; min: number; max: number }): boolean {
    const pts = this.world.path({ x: cat.x, y: cat.y }, to)
    if (pts.length < 2) return false
    for (const p of pts) {
      if (!this.world.walkable(p.x, p.y)) return false
    }
    cat.path = pts.slice(1)
    cat.dest = { ...to }
    cat.speed = speed
    cat.baseSpeed = speed
    cat.mode = cat.mode === 'scene' ? 'scene' : 'travel'
    cat.waitTime = 0
    if (arrive) {
      cat.arriveState = arrive.state
      cat.arriveMin = arrive.min
      cat.arriveMax = arrive.max
    } else {
      cat.arriveState = null
    }
    this.setState(cat, state)
    return true
  }

  private pickDashDest(cat: CatAgent, other: CatAgent, mult: number, minD: number, maxD: number): void {
    const cr = cat.rng
    const dest = this.randCell(cat, cr, minD, maxD) ?? cr.pick(Object.values(this.world.targets))
    cat.mode = cat.scene ? 'scene' : 'zoom'
    cat.zoomMult = mult
    if (!this.tryTravel(cat, dest, cat.scene && cat.scene.def.beats[cat.scene.i].k === 'laser' ? 'pounce' : 'zoomies', cat.baseSpeed * mult)) {
      // nowhere to dash: end the dash phase
      if (cat.scene) {
        cat.scene.i++
        cat.scene.wait = 0
        this.runSceneBeat(cat, other, 0)
      } else {
        cat.mode = 'rest'
        cat.stateUntil = -1
        cat.nextDecisionAt = this.t
      }
    }
  }

  private randCell(cat: CatAgent, cr: Rng, minD: number, maxD: number): Vec | null {
    const [c0, r0] = cell(cat)
    for (let i = 0; i < 24; i++) {
      const cx = c0 + cr.int(-18, 18)
      const cy = r0 + cr.int(-11, 11)
      const x = cx * 16 + 8
      const y = cy * 16 + 8
      if (!this.world.walkable(x, y)) continue
      const d = Math.hypot(x - cat.x, y - cat.y)
      if (d >= minD && d <= maxD) return { x, y }
    }
    return null
  }

  // ---- scenes ----

  private canStart(def: SceneDef): boolean {
    const cat = this.agents[def.cat]
    const other = this.agents[def.cat === 'pixel' ? 'biscuit' : 'pixel']
    if (cat.scene) return false
    if (this.t < cat.happyUntil) return false
    if (this.t < (cat.lastSceneEnd[def.name] ?? -Infinity) + TUNING.incidentFloor) return false
    if (other.scene && other.scene.def.target === def.target) return false
    if (def.mess && this.messes.some(m => m.mess === def.mess)) return false
    return true
  }

  private pickScene(id: CatId): SceneDef | null {
    const cat = this.agents[id]
    const pool = SCENES.filter(s => s.cat === id && this.canStart(s))
    if (pool.length === 0) return null
    const rng = cat.rng
    // variety dampener: scenes repeated within the last 400s lose weight (brief §7.3)
    const recent = (name: string): number => {
      const at = cat.lastSceneEnd[name]
      return at !== undefined && this.t - at <= 400 ? 1 : 0
    }
    const weight = (s: SceneDef): number => s.weight / (1 + 2 * recent(s.name))
    let total = 0
    for (const s of pool) total += weight(s)
    let r = rng.next() * total
    for (const s of pool) {
      r -= weight(s)
      if (r < 0) return s
    }
    return pool[pool.length - 1]
  }

  private startScene(def: SceneDef): void {
    const cat = this.agents[def.cat]
    cat.scene = { def, i: 0, wait: 0, waiting: false, waitKind: 'act', retries: 0 }
    cat.mode = 'scene'
    cat.path = []
    cat.dest = null
    cat.stateUntil = -1
    this.queue.push({ type: 'mischief_started', cat: cat.id, incident: def.name, target: def.target })
    const other = this.agents[def.cat === 'pixel' ? 'biscuit' : 'pixel']
    this.runSceneBeat(cat, other, 0)
  }

  private runSceneBeat(cat: CatAgent, other: CatAgent, dt: number): void {
    const sc = cat.scene
    if (!sc) return
    const cr = cat.rng
    if (sc.waiting) {
      sc.wait -= dt
      if (sc.wait > 0) return
      sc.wait = 0
      sc.waiting = false
      if (sc.waitKind === 'act') sc.i++ // the performance finished
    }
    let guard = 0
    while (cat.scene === sc && guard++ < 8) {
      const b = sc.def.beats[sc.i]
      if (!b) {
        this.endScene(cat)
        return
      }
      switch (b.k) {
        case 'goto': {
          const tp = this.world.targets[sc.def.target] ?? { x: cat.x, y: cat.y }
          const [tcx, tcy] = cell(tp)
          const [ccx, ccy] = cell(cat)
          if (tcx === ccx && tcy === ccy) {
            sc.i++
            continue
          }
          const gotoState = cat.id === 'biscuit' ? 'waddle' : 'investigate'
          const speed = cr.int(TUNING[cat.id].speedMin, TUNING[cat.id].speedMax)
          if (!this.tryTravel(cat, tp, gotoState, speed)) {
            // transient blockage (e.g. the other cat on the tile): retry, then resolve
            sc.retries++
            if (sc.retries > 5) {
              this.endScene(cat)
              return
            }
            sc.waiting = true
            sc.waitKind = 'retry'
            sc.wait = 1.2
            return
          }
          return // traveling; movement resumes on the next tick
        }
        case 'act': {
          if (!sc.waiting) {
            sc.waiting = true
            sc.waitKind = 'act'
            sc.wait = cr.int(b.min, b.max)
            this.setState(cat, b.state)
          }
          return
        }
        case 'mess': {
          this.createMess(b.mess, cat.x, cat.y)
          sc.i++
          continue
        }
        case 'zoom':
        case 'laser': {
          cat.zoomUntil = this.t + cr.int(b.min, b.max)
          const mult = b.k === 'zoom' ? TUNING.pixel.zoomiesMult : TUNING.laserMult
          this.pickDashDest(cat, other, mult, b.k === 'zoom' ? 80 : 40, b.k === 'zoom' ? 240 : 120)
          return
        }
        case 'flee': {
          // the worker approaches: bolt away from the scene target
          const dest = this.randCell(cat, cr, 100, 400) ?? cr.pick(Object.values(this.world.targets))
          const speed = cat.baseSpeed * TUNING.pixel.fleeMult
          if (!this.tryTravel(cat, dest, 'flee', speed)) {
            this.endScene(cat)
            return
          }
          return
        }
        case 'end': {
          this.endScene(cat)
          return
        }
      }
    }
  }

  private endScene(cat: CatAgent): void {
    const sc = cat.scene
    if (!sc) return
    const tun = TUNING[cat.id]
    this.queue.push({ type: 'incident_resolved', incident: sc.def.name })
    cat.lastSceneEnd[sc.def.name] = this.t
    cat.mischiefReadyAt = this.t + cat.rng.int(tun.mischiefCooldownMin, tun.mischiefCooldownMax)
    cat.scene = null
    cat.mode = 'rest'
    cat.stateUntil = -1
    cat.path = []
    cat.dest = null
    cat.nextDecisionAt = this.t + (cat.id === 'pixel' ? cat.rng.int(2, 5) : cat.rng.int(6, 15))
  }

  // ---- messes ----

  private createMess(mess: MessId, x: number, y: number): void {
    this.messes.push({ id: this.messSeq++, mess, x, y, cleanAt: 0 })
    this.queue.push({ type: 'mess_created', mess, x, y })
  }

  private drain(): CatEvent[] {
    const out = this.queue
    this.queue = []
    return out
  }
}
