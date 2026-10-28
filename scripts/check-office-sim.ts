// Scratch check (not part of the app): verifies the client-side sim wiring —
// stroll targets reachable, cats roam, messes get cleaned via assignCleanup.
import { readFileSync } from 'node:fs'
import { buildWorld } from '../src/sim/world'
import { CatCore } from '../src/sim/cats'
import type { OfficeLayout } from '../src/client/office/layout'

const layout = JSON.parse(readFileSync('public/assets/gen/layout.json', 'utf8')) as OfficeLayout

const blocked = [
  { x: 16, y: 240, w: 48, h: 20 },
  { x: 440, y: 96, w: 24, h: 32 },
  { x: 408, y: 200, w: 14, h: 22 },
  { x: 448, y: 160, w: 10, h: 16 },
  { x: 8, y: 130, w: 10, h: 16 },
  { x: 150, y: 236, w: 10, h: 16 },
  { x: 372, y: 236, w: 16, h: 12 },
  { x: 70, y: 224, w: 12, h: 20 },
  { x: 16, y: 168, w: 32, h: 20 },
  { x: 120, y: 250, w: 9, h: 5 },
  { x: 132, y: 250, w: 9, h: 5 },
  { x: 352, y: 232, w: 16, h: 9 }
]

const world = buildWorld(
  { ...layout, walkable: layout.world.walkable, blocked },
  {
    printer: { x: 32, y: 160 },
    food_bowls: { x: 128, y: 244 },
    plant: { x: 150, y: 230 },
    papers_table: { x: 344, y: 238 }
  }
)

// worker seats (worker.x+8, worker.y+24)
const seats: Record<string, { x: number; y: number }> = {}
for (const ws of layout.workstations) seats[ws.id] = { x: ws.worker.x + 8, y: ws.worker.y + 24 }
const strollTargets: Record<string, { x: number; y: number }> = {
  hermes: { x: 424, y: 104 },
  architect: { x: 184, y: 104 },
  implementation: { x: 88, y: 232 },
  frontend: { x: 72, y: 104 },
  tester: { x: 424, y: 168 },
  debugger: { x: 40, y: 232 },
  security: { x: 56, y: 168 }
}

let failures = 0
for (const [id, seat] of Object.entries(seats)) {
  const target = strollTargets[id]
  const path = world.path(seat, target)
  const ok = path.length >= 2
  if (!ok) failures++
  console.log(`stroll ${id}: seat(${seat.x},${seat.y}) -> (${target.x},${target.y}) path=${path.length} ${ok ? 'OK' : 'FAIL'}`)
  const back = world.path(target, seat)
  if (back.length < 2) { console.log(`  return path FAIL`); failures++ }
}

const core = new CatCore(world, 1234)
let messes = 0
let cleaned = 0
let mischief = 0
let purrs = 0
let moved = 0
for (let i = 0; i < 60 * 600; i++) {
  const events = core.update(1 / 60)
  for (const ev of events) {
    if (ev.type === 'mess_created') {
      messes++
      core.assignCleanup(ev.mess, 'implementation')
    }
    if (ev.type === 'mess_cleaned') cleaned++
    if (ev.type === 'mischief_started') mischief++
    if (ev.type === 'purr') purrs++
    if (ev.type === 'moved') moved++
  }
}
console.log(`sim 10min: messes=${messes} cleaned=${cleaned} mischief=${mischief} purrs=${purrs} moved=${moved}`)
console.log(`pixel at (${core.pixel.x.toFixed(0)},${core.pixel.y.toFixed(0)}) state=${core.pixel.state}`)
console.log(`biscuit at (${core.biscuit.x.toFixed(0)},${core.biscuit.y.toFixed(0)}) state=${core.biscuit.state}`)
console.log(failures === 0 ? 'ALL OK' : `${failures} FAILURES`)
