// src/sim/world.ts — pure tile world model for the cat simulation.
// No engine, no IO. Fed a slice of public/assets/gen/layout.json by the caller.

export interface Vec {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SimWorld {
  /** True when the point stands on a legal cat tile (inside walkable region, off furniture). */
  walkable(x: number, y: number): boolean
  /** 4-dir A* on the 16px grid, max 400 expansions, fallback straight line [from, to]. */
  path(from: Vec, to: Vec): Vec[]
  /** Named interest points in world (logical px) coordinates. */
  targets: Record<string, Vec>
  /** Furniture rectangles the cats must not enter. */
  blocked: Rect[]
  /** Cat spawn points taken from layout.spawn (optional; cats fall back to layout defaults). */
  spawn?: { pixel?: Vec; biscuit?: Vec }
}

export const TILE = 16
export const PATH_MAX_EXPANSIONS = 400

export interface WorldLayout {
  cat_routes?: unknown
  spawn?: { pixel?: number[]; biscuit?: number[] }
  world?: { w?: number; h?: number }
  walkable?: Rect
  blocked?: Rect[]
  interactables?: { id?: string; kind?: string; rect?: number[] | Rect }[]
  workstations?: { id?: string; desk?: { x?: number; y?: number } }[]
}

const DEFAULT_REGION: Rect = { x: 16, y: 96, w: 448, h: 176 }
const DEFAULT_SIZE = { w: 480, h: 288 }

// Interest points for the default office map (layout.json coordinates).
const DEFAULT_TARGETS: Record<string, Vec> = {
  dev_keyboard: { x: 152, y: 104 },
  printer: { x: 440, y: 112 },
  plant: { x: 288, y: 252 },
  cable_corner: { x: 32, y: 112 },
  couch: { x: 324, y: 206 },
  security_monitor: { x: 176, y: 168 },
  architect_keyboard: { x: 88, y: 104 },
  doorway_lounge: { x: 296, y: 180 },
  papers_table: { x: 352, y: 236 },
  food_bowls: { x: 56, y: 232 },
  window_seat: { x: 124, y: 104 },
  toy: { x: 232, y: 244 },
  box: { x: 416, y: 252 }
}

function asRect(r: number[] | Rect | undefined): Rect | null {
  if (!r) return null
  if (Array.isArray(r) && r.length >= 4) return { x: r[0], y: r[1], w: r[2], h: r[3] }
  if (!Array.isArray(r) && typeof r === 'object') {
    const o = r as Rect
    if (typeof o.x === 'number' && typeof o.y === 'number' && typeof o.w === 'number' && typeof o.h === 'number') {
      return { x: o.x, y: o.y, w: o.w, h: o.h }
    }
  }
  return null
}

export function buildWorld(layout: WorldLayout, extraTargets?: Record<string, Vec>): SimWorld {
  const size = { w: layout.world?.w ?? DEFAULT_SIZE.w, h: layout.world?.h ?? DEFAULT_SIZE.h }
  const region: Rect = layout.walkable
    ? { ...layout.walkable }
    : { ...DEFAULT_REGION }
  const blocked: Rect[] = []

  if (Array.isArray(layout.blocked)) {
    for (const b of layout.blocked) {
      const r = asRect(b)
      if (r) blocked.push(r)
    }
  }
  for (const it of layout.interactables ?? []) {
    const r = asRect(it.rect)
    if (r) blocked.push(r)
  }
  for (const ws of layout.workstations ?? []) {
    if (typeof ws.desk?.x === 'number' && typeof ws.desk?.y === 'number') {
      blocked.push({ x: ws.desk.x - 12, y: ws.desk.y - 8, w: 32, h: 16 })
    }
  }

  const cols = Math.max(1, Math.floor(size.w / TILE))
  const rows = Math.max(1, Math.floor(size.h / TILE))

  const inRegion = (x: number, y: number): boolean =>
    x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h

  const cellFree = (cx: number, cy: number): boolean => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false
    const mx = cx * TILE + TILE / 2
    const my = cy * TILE + TILE / 2
    if (!inRegion(mx, my)) return false
    for (const r of blocked) {
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) return false
    }
    return true
  }

  const cellOf = (x: number, y: number): [number, number] => [Math.floor(x / TILE), Math.floor(y / TILE)]

  const nearestWalkableCell = (x: number, y: number): [number, number] | null => {
    const [sc, sr] = cellOf(x, y)
    let best: [number, number] | null = null
    let bestD = Infinity
    for (let cy = Math.max(0, sr - 14); cy <= Math.min(rows - 1, sr + 14); cy++) {
      for (let cx = Math.max(0, sc - 14); cx <= Math.min(cols - 1, sc + 14); cx++) {
        if (!cellFree(cx, cy)) continue
        const mx = cx * TILE + TILE / 2
        const my = cy * TILE + TILE / 2
        const d = (mx - x) * (mx - x) + (my - y) * (my - y)
        if (d < bestD) {
          bestD = d
          best = [cx, cy]
        }
      }
    }
    return best
  }

  const targets: Record<string, Vec> = {}
  for (const [k, v] of Object.entries(DEFAULT_TARGETS)) targets[k] = { ...v }
  for (const [k, v] of Object.entries(extraTargets ?? {})) targets[k] = { ...v }

  const world: SimWorld = {
    targets,
    blocked,
    spawn: {
      pixel: layout.spawn?.pixel ? { x: layout.spawn.pixel[0], y: layout.spawn.pixel[1] } : undefined,
      biscuit: layout.spawn?.biscuit ? { x: layout.spawn.biscuit[0], y: layout.spawn.biscuit[1] } : undefined
    },
    walkable(x: number, y: number): boolean {
      if (!inRegion(x, y)) return false
      const [cx, cy] = cellOf(x, y)
      return cellFree(cx, cy)
    },
    path(from: Vec, to: Vec): Vec[] {
      const s = nearestWalkableCell(from.x, from.y)
      const g = nearestWalkableCell(to.x, to.y)
      if (!s || !g) return [{ ...from }, { ...to }]

      const start = s[1] * cols + s[0]
      const goal = g[1] * cols + g[0]
      if (start === goal) {
        const pts: Vec[] = [{ ...from }]
        if (world.walkable(to.x, to.y) && (to.x !== from.x || to.y !== from.y)) pts.push({ ...to })
        return pts
      }

      const gScore = new Float64Array(cols * rows).fill(Infinity)
      const came = new Int32Array(cols * rows).fill(-1)
      const closed = new Uint8Array(cols * rows)
      const open: { i: number; f: number }[] = []
      const h = (i: number): number => {
        const gx = i % cols
        const gy = (i / cols) | 0
        return Math.abs(gx - g[0]) + Math.abs(gy - g[1])
      }
      gScore[start] = 0
      open.push({ i: start, f: h(start) })

      const found: number[] = []
      let expansions = 0
      while (open.length > 0) {
        let bi = 0
        for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k
        const cur = open.splice(bi, 1)[0]
        if (closed[cur.i]) continue
        closed[cur.i] = 1
        if (cur.i === goal) {
          let c = cur.i
          while (c !== -1) {
            found.push(c)
            c = came[c]
          }
          break
        }
        expansions++
        if (expansions > PATH_MAX_EXPANSIONS) break
        const cx = cur.i % cols
        const cy = (cur.i / cols) | 0
        const nbrs: [number, number][] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]
        for (const [nx, ny] of nbrs) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !cellFree(nx, ny)) continue
          const ni = ny * cols + nx
          if (closed[ni]) continue
          const ng = gScore[cur.i] + 1
          if (ng < gScore[ni]) {
            gScore[ni] = ng
            came[ni] = cur.i
            open.push({ i: ni, f: ng + h(ni) })
          }
        }
      }

      if (found.length === 0) return [{ ...from }, { ...to }] // fallback straight line

      const pts: Vec[] = [{ ...from }]
      for (let k = found.length - 2; k >= 0; k--) {
        const c = found[k]
        pts.push({ x: (c % cols) * TILE + TILE / 2, y: ((c / cols) | 0) * TILE + TILE / 2 })
      }
      if (world.walkable(to.x, to.y)) {
        const last = pts[pts.length - 1]
        if (last.x !== to.x || last.y !== to.y) pts.push({ ...to })
      }
      return pts
    }
  }

  return world
}
