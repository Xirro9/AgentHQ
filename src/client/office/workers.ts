// src/client/office/workers.ts — WorkerActor: one desk worker.
//
// Two state tracks, per spec 03 §5 and brief §6.2/§6.4:
//   - true state (externally grounded, from the telemetry store) drives the
//     pip + tooltip and the *base* desk animation;
//   - a cosmetic FSM (seeded, bounded ambient scheduler) may stand the worker
//     up for a short stroll to a role-appropriate point of interest, but never
//     overwrites the pip/tooltip state and never runs while the true state is
//     testing/reviewing/failed (or waiting/completed).
//
// Animation mapping (from atlas): working→sit_type loop; testing→same + amber
// pip; failed→react_0 1.2s then back + red pip; completed→celebrate ×2 then
// idle; waiting→sit_idle + violet pip; planning→think loop; idle→sit_idle blink
// loop. Walks use walk_down/up/side at 7fps, side mirrored for left.

import Phaser from 'phaser'
import { Rng } from '../../sim/rng'
import { type AgentId, type WorkState } from '../../shared/events'
import type { Vec, WorkstationLayout } from './layout'

export const WALK_FPS = 7
const TYPE_FPS = 4
const THINK_FPS = 2
const IDLE_BLINK_FPS = 0.5 // art bible: idle blink ~0.5fps toggle
const CELEBRATE_FPS = 4
const WALK_SPEED = 42 // logical px/s
const STROLL_MIN_S = 25
const STROLL_MAX_S = 70
const REACT_SECONDS = 1.2
const CELEBRATE_SECONDS = 1.0

/** True states that cancel any cosmetic stroll immediately. */
const STROLL_ABORT: ReadonlySet<WorkState> = new Set([
  'testing',
  'reviewing',
  'failed',
  'waiting',
  'completed',
  'assigned',
  'stale',
  'offline',
  'unknown'
])

const PIP_COLORS: Partial<Record<WorkState, number>> = {
  working: 0x5ad0c8,
  testing: 0xf5c66b,
  failed: 0xd65656,
  waiting: 0x9b5de5
}

/** Role-appropriate stroll destinations (logical px, open floor tiles). */
const STROLL_TARGETS: Record<AgentId, Vec> = {
  hermes: { x: 424, y: 104 }, // corkboard
  architect: { x: 184, y: 104 }, // whiteboard
  implementation: { x: 88, y: 232 }, // kitchenette / water cooler
  frontend: { x: 72, y: 104 }, // window seat
  tester: { x: 424, y: 168 }, // big plant
  debugger: { x: 40, y: 232 }, // coffee machine
  security: { x: 56, y: 168 } // printer corner
}

export interface WorkerDeps {
  /** A* path over the cat-sim world (same walkable grid as the cats). */
  pathFn(from: Vec, to: Vec): Vec[]
  isReducedMotion(): boolean
  /** Stable per-agent index, used to stagger first strolls. */
  index: number
}

type CosmeticMode = 'desk' | 'walk' | 'stand' | 'return' | 'glide'

export function createWorkerAnims(scene: Phaser.Scene, id: AgentId): void {
  const p = `wrk_${id}`
  const key = `agent_${id}`
  const defs: Array<{ key: string; frames: string[]; frameRate: number; repeat: number }> = [
    { key: `${p}_idle`, frames: ['sit_idle_0', 'sit_idle_1'], frameRate: IDLE_BLINK_FPS, repeat: -1 },
    { key: `${p}_type`, frames: ['sit_type_0', 'sit_type_1'], frameRate: TYPE_FPS, repeat: -1 },
    { key: `${p}_think`, frames: ['think_0', 'think_1'], frameRate: THINK_FPS, repeat: -1 },
    { key: `${p}_celebrate`, frames: ['celebrate_0', 'celebrate_1'], frameRate: CELEBRATE_FPS, repeat: 1 },
    {
      key: `${p}_walk_down`,
      frames: ['walk_down_0', 'walk_down_1', 'walk_down_2', 'walk_down_3'],
      frameRate: WALK_FPS,
      repeat: -1
    },
    {
      key: `${p}_walk_up`,
      frames: ['walk_up_0', 'walk_up_1', 'walk_up_2', 'walk_up_3'],
      frameRate: WALK_FPS,
      repeat: -1
    },
    {
      key: `${p}_walk_side`,
      frames: ['walk_side_0', 'walk_side_1', 'walk_side_2', 'walk_side_3'],
      frameRate: WALK_FPS,
      repeat: -1
    }
  ]
  for (const def of defs) {
    if (scene.anims.exists(def.key)) continue
    scene.anims.create({
      key: def.key,
      frames: def.frames.map((frame) => ({ key, frame })),
      frameRate: def.frameRate,
      repeat: def.repeat
    })
  }
}

export class WorkerActor {
  readonly id: AgentId
  readonly sprite: Phaser.GameObjects.Sprite
  /** Seat = feet anchor (origin bottom-center). */
  readonly seat: Vec
  private readonly scene: Phaser.Scene
  private readonly deps: WorkerDeps
  private readonly pip: Phaser.GameObjects.Graphics
  private readonly rng: Rng
  private readonly prefix: string

  private trueState: WorkState = 'unknown'
  private mode: CosmeticMode = 'desk'
  private waypoints: Vec[] = []
  private duty: (() => void) | null = null
  private now = 0
  private nextStrollAt: number
  private standUntil = 0
  private reactUntil = 0
  private celebrateUntil = 0
  private glideTween: Phaser.Tweens.Tween | null = null
  private exclaim: Phaser.GameObjects.Sprite | null = null
  private exclaimUntil = 0
  private destroyed = false

  constructor(scene: Phaser.Scene, ws: WorkstationLayout, deps: WorkerDeps, seed: number) {
    this.scene = scene
    this.deps = deps
    this.id = ws.id
    this.prefix = `wrk_${ws.id}`
    this.seat = { x: ws.worker.x + 8, y: ws.worker.y + 24 }
    this.rng = new Rng(seed)
    this.nextStrollAt = 8 + deps.index * 9 + this.rng.int(0, 20)

    // Frames are exported at 3x; everything renders at 1/3 in logical space.
    this.sprite = scene.add
      .sprite(this.seat.x, this.seat.y, `agent_${ws.id}`, 'sit_idle_0')
      .setOrigin(0.5, 1)
      .setScale(1 / 3)
      .setDepth(this.seat.y)
    this.sprite.play(`${this.prefix}_idle`)

    this.pip = scene.add.graphics().setPosition(this.seat.x, this.seat.y - 27).setDepth(this.seat.y + 2)
    this.redrawPip()
  }

  get feet(): Vec {
    return { x: this.sprite.x, y: this.sprite.y }
  }

  /** True externally grounded state (drives pip + base anim; never cosmetic). */
  get state(): WorkState {
    return this.trueState
  }

  /** Cosmetic idle: no stroll under way or pending react/celebrate. */
  get available(): boolean {
    return this.mode === 'desk' && this.reactUntil <= 0 && this.celebrateUntil <= 0
  }

  setTrueState(next: WorkState): void {
    if (next === this.trueState || this.destroyed) return
    this.trueState = next
    this.redrawPip()

    if (next === 'failed') {
      this.cancelStroll()
      this.reactUntil = this.now + REACT_SECONDS
      this.sprite.play(`${this.prefix}_idle`) // park on a stable track…
      this.sprite.stop()
      this.sprite.setFrame('react_0')
      return
    }
    if (next === 'completed') {
      this.cancelStroll()
      this.celebrateUntil = this.now + CELEBRATE_SECONDS
      this.sprite.play(`${this.prefix}_celebrate`)
      return
    }
    // Any other transition resolves pending one-shot reactions.
    this.reactUntil = 0
    this.celebrateUntil = 0
    if (STROLL_ABORT.has(next)) this.cancelStroll()
    else if (this.mode === 'desk') this.playBase()
  }

  update(time: number, dt: number): void {
    if (this.destroyed) return
    this.now = time

    if (this.exclaim !== null && time >= this.exclaimUntil) {
      this.exclaim.destroy()
      this.exclaim = null
    }
    if (this.reactUntil > 0 && time >= this.reactUntil) {
      this.reactUntil = 0
      if (this.mode === 'desk') this.playBase()
    }
    if (this.celebrateUntil > 0 && time >= this.celebrateUntil) {
      this.celebrateUntil = 0
      if (this.mode === 'desk') this.playBase()
    }

    switch (this.mode) {
      case 'desk':
        this.maybeStartStroll(time)
        break
      case 'walk':
        if (this.stepWalk(dt)) this.arriveWalk(time)
        break
      case 'stand':
        if (time >= this.standUntil) this.beginReturn()
        break
      case 'return':
        if (this.stepWalk(dt)) this.glideHome()
        break
      case 'glide':
        break // tween owns the sprite until it lands
    }

    // pip + exclaim follow the worker (they ride on the true state).
    if (this.pip.visible) {
      this.pip.setPosition(this.sprite.x, this.sprite.y - 27)
      this.pip.setDepth(this.sprite.depth + 2)
    }
    if (this.exclaim !== null) {
      this.exclaim.setPosition(this.sprite.x, this.sprite.y - 26)
      this.exclaim.setDepth(this.sprite.depth + 3)
    }
  }

  /** One-shot ! bubble above the worker (cat mischief nearby). */
  showExclaim(seconds: number): void {
    if (this.destroyed) return
    if (this.exclaim !== null) this.exclaim.destroy()
    this.exclaim = this.scene.add
      .sprite(this.sprite.x, this.sprite.y - 26, 'fx', 'exclaim')
      .setOrigin(0.5, 1)
      .setScale(1 / 3)
      .setDepth(this.sprite.depth + 3)
    this.exclaimUntil = this.now + seconds
    if (!this.deps.isReducedMotion()) {
      this.scene.tweens.add({
        targets: this.exclaim,
        y: '=-4',
        duration: 320,
        yoyo: true,
        repeat: Math.max(1, Math.round((seconds * 1000) / 320) - 1),
        onUpdate: () => {
          if (this.exclaim !== null) this.exclaim.setDepth(this.sprite.depth + 3)
        }
      })
    }
  }

  /**
   * Cosmetic dispatch for mess cleanup (brief §7.4): walk to the mess, run the
   * callback (the scene calls CatCore.assignCleanup there), pause, walk back.
   * Refuses when the worker is busy or mid-stroll; the scene retries later.
   */
  sendTo(target: Vec, onArrive: () => void): boolean {
    if (this.destroyed || this.mode !== 'desk' || this.trueState !== 'idle') return false
    const path = this.deps.pathFn(this.feet, target)
    if (path.length < 2) return false
    this.duty = onArrive
    this.waypoints = path
    this.mode = 'walk'
    this.faceAlong(path[0].x - this.sprite.x, path[0].y - this.sprite.y)
    return true
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.glideTween) this.glideTween.stop()
    this.sprite.destroy()
    this.pip.destroy()
    if (this.exclaim !== null) this.exclaim.destroy()
  }

  // ---- cosmetic scheduler -----------------------------------------------------

  private maybeStartStroll(time: number): void {
    if (time < this.nextStrollAt) return
    this.nextStrollAt = time + this.rng.int(STROLL_MIN_S, STROLL_MAX_S)
    const busy = this.reactUntil > 0 || this.celebrateUntil > 0
    const free = this.trueState === 'idle' || this.trueState === 'working'
    if (busy || !free) return
    this.startStroll(STROLL_TARGETS[this.id])
  }

  private startStroll(target: Vec): void {
    const path = this.deps.pathFn(this.feet, target)
    if (path.length < 2) {
      this.nextStrollAt = this.now + this.rng.int(15, 30)
      return
    }
    this.waypoints = path
    this.mode = 'walk'
    this.faceAlong(path[0].x - this.sprite.x, path[0].y - this.sprite.y)
  }

  private arriveWalk(time: number): void {
    const duty = this.duty
    this.duty = null
    duty?.()
    this.mode = 'stand'
    this.standUntil = time + (duty ? 1.6 : this.rng.int(2, 5))
    this.sprite.play(`${this.prefix}_idle`)
    this.sprite.stop()
    this.sprite.setFrame('walk_down_0')
  }

  private beginReturn(): void {
    const path = this.deps.pathFn(this.feet, this.seat)
    if (path.length < 2) {
      this.glideHome()
      return
    }
    this.waypoints = path
    this.mode = 'return'
    this.faceAlong(path[0].x - this.sprite.x, path[0].y - this.sprite.y)
  }

  private glideHome(): void {
    this.waypoints = []
    const snap = this.deps.isReducedMotion()
    if (snap || Math.hypot(this.sprite.x - this.seat.x, this.sprite.y - this.seat.y) < 0.75) {
      this.sprite.setPosition(this.seat.x, this.seat.y).setDepth(this.seat.y)
      this.landAtDesk()
      return
    }
    this.mode = 'glide'
    this.glideTween = this.scene.tweens.add({
      targets: this.sprite,
      x: this.seat.x,
      y: this.seat.y,
      duration: 140,
      onComplete: () => {
        this.sprite.setDepth(this.seat.y)
        this.landAtDesk()
      }
    })
  }

  private landAtDesk(): void {
    this.mode = 'desk'
    this.sprite.setFlipX(false)
    this.playBase()
    this.nextStrollAt = this.now + this.rng.int(STROLL_MIN_S, STROLL_MAX_S)
  }

  /** Abort any walk/stand and glide back to the desk (true-state priority). */
  private cancelStroll(): void {
    if (this.mode === 'desk' || this.mode === 'glide') return
    this.duty = null
    this.waypoints = []
    this.mode = 'stand'
    this.standUntil = 0
    this.glideHome()
  }

  // ---- movement ---------------------------------------------------------------

  /** Advances along waypoints; returns true when the path is finished. */
  private stepWalk(dt: number): boolean {
    let budget = WALK_SPEED * dt
    while (budget > 1e-6 && this.waypoints.length > 0) {
      const wp = this.waypoints[0]
      const dx = wp.x - this.sprite.x
      const dy = wp.y - this.sprite.y
      const dist = Math.hypot(dx, dy)
      if (dist <= 1e-6) {
        this.waypoints.shift()
        continue
      }
      this.faceAlong(dx, dy)
      if (dist <= budget) {
        this.sprite.setPosition(wp.x, wp.y)
        this.waypoints.shift()
        budget -= dist
        continue
      }
      this.sprite.x += (dx / dist) * budget
      this.sprite.y += (dy / dist) * budget
      budget = 0
    }
    this.sprite.setDepth(this.sprite.y)
    return this.waypoints.length === 0
  }

  /** walk_down/up/side selection; side art faces right → flip when going left. */
  private faceAlong(dx: number, dy: number): void {
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
    if (Math.abs(dy) >= Math.abs(dx)) {
      this.sprite.setFlipX(false)
      this.sprite.play(dy >= 0 ? `${this.prefix}_walk_down` : `${this.prefix}_walk_up`)
      return
    }
    this.sprite.setFlipX(dx < 0)
    this.sprite.play(`${this.prefix}_walk_side`)
  }

  // ---- presentation -----------------------------------------------------------

  private playBase(): void {
    if (this.destroyed || this.reactUntil > 0 || this.celebrateUntil > 0) return
    switch (this.trueState) {
      case 'working':
      case 'testing':
        this.sprite.play(`${this.prefix}_type`)
        break
      case 'planning':
      case 'reviewing':
        this.sprite.play(`${this.prefix}_think`)
        break
      default:
        this.sprite.play(`${this.prefix}_idle`)
        break
    }
  }

  private redrawPip(): void {
    this.pip.clear()
    const color = PIP_COLORS[this.trueState]
    if (color === undefined) {
      this.pip.setVisible(false)
      return
    }
    this.pip.setVisible(true)
    this.pip.fillStyle(0x1a1c2c, 1).fillCircle(0, 0, 3)
    this.pip.fillStyle(color, 1).fillCircle(0, 0, 1.8)
  }
}
