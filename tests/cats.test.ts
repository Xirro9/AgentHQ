import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import layout from '../public/assets/gen/layout.json'
import { buildWorld, type SimWorld } from '../src/sim/world'
import { CatCore, type CatEvent, type MessId } from '../src/sim/cats'

// ---- helpers ----------------------------------------------------------------

const DT = 0.1
const REST_STATES = new Set(['sleep', 'sit', 'loaf', 'occupy'])

const cellOf = (x: number, y: number): string => `${Math.floor(x / 16)},${Math.floor(y / 16)}`

interface RunStats {
  core: CatCore
  world: SimWorld
  log: CatEvent[]
  messesCreated: number
  messesCleaned: number
}

/** Run a core for `ticks` fixed steps, auto-assigning cleanup for any mess that appears. */
function run(core: CatCore, world: SimWorld, ticks: number, log: CatEvent[] = [], stats?: { created: number; cleaned: number }): void {
  for (let i = 0; i < ticks; i++) {
    const events = core.update(DT)
    for (const e of events) {
      if (e.type === 'mess_created') {
        core.assignCleanup(e.mess, 'tester')
        if (stats) stats.created++
      }
      if (e.type === 'mess_cleaned' && stats) stats.cleaned++
    }
    log.push(...events)
    // hard behavior rules: cats stay walkable and never share a tile
    const p = core.pixel
    const b = core.biscuit
    expect(world.walkable(p.x, p.y)).toBe(true)
    expect(world.walkable(b.x, b.y)).toBe(true)
    expect(cellOf(p.x, p.y)).not.toBe(cellOf(b.x, b.y))
  }
}

// ---- seeded determinism -------------------------------------------------------

describe('determinism', () => {
  it('two cores with the same seed and schedule produce identical event logs', () => {
    const runOnce = (): { log: CatEvent[]; manual: boolean[] } => {
      const world = buildWorld(layout)
      const core = new CatCore(world, 1234)
      const log: CatEvent[] = []
      const manual: boolean[] = []
      for (let i = 0; i < 1200; i++) {
        const events = core.update(DT)
        for (const e of events) {
          if (e.type === 'mess_created') core.assignCleanup(e.mess, 'tester')
        }
        log.push(...events)
        if (i === 300) log.push(...core.pet('pixel'))
        if (i === 700) log.push(...core.pet('biscuit'))
        if (i === 500) manual.push(core.startIncident('coffee_catastrophe'))
        if (i === 900) manual.push(core.startIncident('laser_chase'))
      }
      return { log, manual }
    }
    const a = runOnce()
    const b = runOnce()
    expect(a.log.length).toBeGreaterThan(100)
    expect(a.manual).toEqual(b.manual)
    expect(a.log).toEqual(b.log)
  })
})

// ---- statistical behavior (brief §7: cadence numbers) -------------------------

describe('statistical behavior', () => {
  it('600s x3 seeds: biscuit rests 0.6-0.88 of wall time and pixel is >1.4x faster', () => {
    const secs = 600
    const ticks = Math.round(secs / DT)
    for (const seed of [7, 42, 2024]) {
      const world = buildWorld(layout)
      const core = new CatCore(world, seed)
      let rest = 0
      const dist = { pixel: 0, biscuit: 0 }
      const last = { pixel: { x: core.pixel.x, y: core.pixel.y }, biscuit: { x: core.biscuit.x, y: core.biscuit.y } }
      for (let i = 0; i < ticks; i++) {
        const events = core.update(DT)
        for (const e of events) {
          if (e.type === 'mess_created') core.assignCleanup(e.mess, 'tester')
        }
        for (const id of ['pixel', 'biscuit'] as const) {
          const c = core[id]
          dist[id] += Math.hypot(c.x - last[id].x, c.y - last[id].y)
          last[id].x = c.x
          last[id].y = c.y
        }
        if (REST_STATES.has(core.biscuit.state)) rest += DT
      }
      const restFraction = rest / secs
      const pixelSpeed = dist.pixel / secs
      const biscuitSpeed = dist.biscuit / secs
      expect(restFraction).toBeGreaterThan(0.6)
      expect(restFraction).toBeLessThan(0.88)
      expect(pixelSpeed).toBeGreaterThan(biscuitSpeed * 1.4)
    }
  })
})

// ---- incidents -----------------------------------------------------------------

describe('incidents', () => {
  it('coffee_catastrophe makes a puddle within 20s, cleanup resolves it, cooldown blocks repeats', () => {
    const world = buildWorld(layout)
    const core = new CatCore(world, 5)
    expect(core.startIncident('coffee_catastrophe')).toBe(true)
    expect(core.startIncident('coffee_catastrophe')).toBe(false) // scene already running

    let messAt: number | null = null
    for (let i = 0; i < 200 && messAt === null; i++) { // 20 s
      for (const e of core.update(DT)) {
        if (e.type === 'mischief_started') expect(e.incident).toBe('coffee_catastrophe')
        if (e.type === 'mess_created' && e.mess === 'puddle') messAt = i * DT
      }
    }
    expect(messAt).not.toBeNull()
    expect(core.activeMesses().some(m => m.mess === 'puddle')).toBe(true)

    core.assignCleanup('puddle', 'implementation')
    const events: CatEvent[] = []
    for (let i = 0; i < 100; i++) events.push(...core.update(DT)) // 10 s >= cleanup delay
    expect(events.some(e => e.type === 'mess_cleaning' && e.mess === 'puddle' && e.by === 'implementation')).toBe(true)
    expect(events.some(e => e.type === 'mess_cleaned' && e.mess === 'puddle')).toBe(true)
    expect(core.activeMesses().length).toBe(0)
    expect(core.startIncident('coffee_catastrophe')).toBe(false) // per-incident cooldown floor
    expect(core.startIncident('no_such_incident')).toBe(false)
  })
})

// ---- pathfinding ----------------------------------------------------------------

describe('pathfinding', () => {
  it('routes around a blocked rect and never enters blocked tiles', () => {
    // wall segment hanging from the top wall with a gap underneath
    const world = buildWorld({ blocked: [{ x: 224, y: 96, w: 16, h: 80 }] })
    const path = world.path({ x: 60, y: 140 }, { x: 420, y: 140 })
    expect(path.length).toBeGreaterThan(2)
    for (const p of path) {
      expect(world.walkable(p.x, p.y)).toBe(true)
      for (const r of world.blocked) {
        expect(p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h).toBe(false)
      }
    }
    // a straight line would cross the wall, so the path must actually detour below it
    expect(path.some(p => p.y >= 176)).toBe(true)
  })

  it('snaps unreachable goals to the nearest walkable tile and keeps every waypoint legal', () => {
    const world = buildWorld({ blocked: [{ x: 200, y: 200, w: 64, h: 64 }] })
    const path = world.path({ x: 60, y: 140 }, { x: 232, y: 232 }) // goal inside the slab
    expect(path.length).toBeGreaterThanOrEqual(2)
    for (const p of path) expect(world.walkable(p.x, p.y)).toBe(true)
    expect(world.walkable(232, 232)).toBe(false)
  })
})

// ---- purity ---------------------------------------------------------------------

describe('purity', () => {
  it('src/sim imports nothing but relative sim modules and touches no engine/node/timer APIs', () => {
    const files = ['src/sim/rng.ts', 'src/sim/world.ts', 'src/sim/cats.ts']
    for (const f of files) {
      const raw = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') // strip comments
      // every static import must be a relative sim module
      const specifiers = [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])
      for (const s of specifiers) expect(s.startsWith('./'), `${f}: ${s}`).toBe(true)
      expect(text).not.toMatch(/require\s*\(/)
      expect(text).not.toMatch(/import\s*\(/) // no dynamic imports either
      expect(text).not.toMatch(/node:/)
      expect(text).not.toMatch(/\bphaser\b|\breact\b/i)
      expect(text).not.toMatch(/\b(setTimeout|setInterval|setImmediate|queueMicrotask|Date\.now|performance\.now|process\.|localStorage|window\.|document\.|fetch\()\b/)
    }
  })
})

// ---- mess lifecycle ---------------------------------------------------------------

describe('mess lifecycle', () => {
  it('every mess of every type is created, cleaned, and activeMesses() empties', () => {
    const world = buildWorld(layout)
    const core = new CatCore(world, 777)
    const stats = { created: 0, cleaned: 0 }
    const force: string[] = ['coffee_catastrophe', 'cable_thief', 'printer_battle', 'plant_assassin']
    let fi = 0
    for (let i = 0; i < 9000; i++) { // 900 s
      if (fi < force.length && i % 300 === 50) {
        if (core.startIncident(force[fi])) fi++
      }
      const events = core.update(DT)
      for (const e of events) {
        if (e.type === 'mess_created') {
          stats.created++
          core.assignCleanup(e.mess, 'debugger')
        }
        if (e.type === 'mess_cleaned') stats.cleaned++
      }
    }
    expect(fi).toBe(force.length) // all four mess scenes were forced successfully
    expect(stats.created).toBeGreaterThanOrEqual(force.length)

    // drain: simulate up to 60 s more until the last cleanup lands
    let guard = 600
    while (core.activeMesses().length > 0 && guard-- > 0) {
      for (const e of core.update(DT)) {
        if (e.type === 'mess_cleaned') stats.cleaned++
      }
    }
    expect(core.activeMesses()).toEqual([])
    expect(stats.cleaned).toBe(stats.created)
  })

  it('assignCleanup on an unknown mess is a no-op', () => {
    const core = new CatCore(buildWorld(layout), 11)
    core.update(DT) // drain the initial decision events
    core.assignCleanup('puddle' as MessId, 'tester')
    const messEvents = core.update(DT).filter(e => e.type.startsWith('mess_') || e.type === 'incident_resolved')
    expect(messEvents).toEqual([])
  })
})

// ---- petting ------------------------------------------------------------------------

describe('petting', () => {
  it('pet() emits purr + happy state, then the cat returns to normal behavior', () => {
    const world = buildWorld(layout)
    const core = new CatCore(world, 3)
    const events = core.pet('biscuit')
    expect(events.some(e => e.type === 'purr' && e.cat === 'biscuit')).toBe(true)
    expect(events.some(e => e.type === 'state' && e.cat === 'biscuit' && e.state === 'happy')).toBe(true)
    expect(core.biscuit.state).toBe('happy')
    for (let i = 0; i < 30; i++) core.update(DT) // 3 s > petHappySeconds
    expect(core.biscuit.state).not.toBe('happy')
  })
})
