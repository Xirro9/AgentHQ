// src/client/office/OfficeScene.ts — the living office (spec 03 §4).
//
// Render order: baked floor (one CanvasTexture) -> wall/furniture sprites from
// layout.json y-sorted by depth = y + frameHeight -> actors (workers, cats)
// sorted by feet y -> ambience tint (multiply) -> additive glows -> input zones.
// Everything renders in logical px (layout coordinates); atlas frames are
// displayed at 1/3 scale because the exported art is 3x nearest-neighbor.

import Phaser from 'phaser'
import type { AgentId } from '../../shared/events'
import { store, type Ambience } from '../net/store'
import {
  emitFocusDesk,
  emitHover,
  emitInteract,
  emitPet,
  emitSceneReady,
  onBridgeEvent,
  type HoverAgentId
} from './bridge'
import { buildCatWorld, CatLayer, createCatAnims, type CatHooks } from './cats'
import { ATLAS_CACHE_KEY, LAYOUT_CACHE_KEY, OFFICE_SCENE_KEY } from './BootScene'
import { depthFor, type AtlasJson, type LayoutSprite, type OfficeLayout } from './layout'
import { createWorkerAnims, WorkerActor } from './workers'
import type { MessId } from '../../sim/cats'
import type { SimWorld } from '../../sim/world'

const CAMERA_MIN_ZOOM = 0.6
const CAMERA_MAX_ZOOM = 1.8
const ZOOM_STEP = 1.12
const DRAG_THRESHOLD = 6
const KEYBOARD_PAN_SPEED = 260 // logical px/s at zoom 1
const RACK_CYCLE_MS = 800
const AMBIENCE_TWEEN_MS = 1500
const CLEANUP_RETRY_S = 8
const MISCHIEF_EXCLAIM_RANGE = 80

const GLOW_LAMP_COLOR = 0xf5c66b
const GLOW_MONITOR_COLOR = 0x5ad0c8
const HOVER_GLOW_COLOR = 0xf2e6d8

/** Flat floor decor: rendered above the floor bake, below all actors. */
const FLAT_FRAMES = new Set(['rug', 'bowl_amber', 'bowl_teal', 'cat_bed'])
const FLAT_DEPTH = -50

type RoomMode = 'day' | 'evening' | 'night'

function resolveAmbience(pref: Ambience): RoomMode {
  if (pref !== 'auto') return pref
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

interface MonitorFlicker {
  image: Phaser.GameObjects.Image
  phase: number
}

interface Rack {
  image: Phaser.GameObjects.Image
  offset: number
}

interface Glow {
  image: Phaser.GameObjects.Image
  role: 'lamp' | 'monitor'
  base: number
  phase: number
}

interface HoverFx {
  glow: Phaser.FX.Glow | null
  tween: Phaser.Tweens.Tween | null
}

interface DeskUi {
  id: AgentId
  hover: HoverFx[]
}

interface CleanupTask {
  mess: MessId
  pos: { x: number; y: number }
  nextTryAt: number
}

const GLOW_BASE: Record<RoomMode, Record<'lamp' | 'monitor', number>> = {
  day: { lamp: 0, monitor: 0 },
  evening: { lamp: 0.26, monitor: 0.12 },
  night: { lamp: 0.55, monitor: 0.45 }
}

export class OfficeScene extends Phaser.Scene {
  private layout!: OfficeLayout
  private atlas!: AtlasJson
  private catWorld!: SimWorld
  private cats!: CatLayer
  private workers: WorkerActor[] = []
  private deskUi: DeskUi[] = []

  private windows: Phaser.GameObjects.Image[] = []
  private monitors: MonitorFlicker[] = []
  private racks: Rack[] = []
  private glows: Glow[] = []
  private roomImages: Array<{ data: LayoutSprite; image: Phaser.GameObjects.Image }> = []
  private tint!: Phaser.GameObjects.Rectangle

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null
  private dragStart: { x: number; y: number } | null = null
  private dragDistance = 0
  private camTween: Phaser.Tweens.Tween | null = null

  private reducedMotion = false
  private ambience: RoomMode = 'day'
  private rackTimer = 0
  private rackStep = 0
  private pendingCleanups: CleanupTask[] = []
  private storeUnsub: (() => void) | null = null
  private resetUnsub: (() => void) | null = null

  constructor() {
    super(OFFICE_SCENE_KEY)
  }

  create(): void {
    this.layout = this.cache.json.get(LAYOUT_CACHE_KEY) as OfficeLayout
    this.atlas = this.cache.json.get(ATLAS_CACHE_KEY) as AtlasJson
    this.reducedMotion = store.get().settings.reducedMotion

    this.bakeFloor()
    this.addRoomSprites()
    createCatAnims(this)

    this.catWorld = buildCatWorld(this.layout)
    this.createCats()
    this.createWorkers()
    this.createDeskZones()
    this.createInteractables()
    this.createAmbience()

    this.setupCamera()
    this.setupSteam()
    this.setupInput()

    this.cursors = this.input.keyboard?.createCursorKeys() ?? null

    this.storeUnsub = store.subscribe(() => this.applyStore())
    this.resetUnsub = onBridgeEvent('agenthq:camera-reset', () => this.resetCamera())
    this.applyStore()

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.storeUnsub?.()
      this.storeUnsub = null
      this.resetUnsub?.()
      this.resetUnsub = null
      for (const worker of this.workers) worker.destroy()
      this.workers = []
      this.cats.destroy()
      emitHover(null)
    })

    emitSceneReady()
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000
    const t = time / 1000

    this.cats.update(dt)
    for (const worker of this.workers) worker.update(t, dt)

    this.updateMonitorFlicker(t)
    this.updateRacks(delta)
    this.updateGlows(t)
    this.updateKeyboardPan(delta)
    this.updatePendingCleanups(t)
  }

  // ---- world construction -----------------------------------------------------

  /** 360 floor tiles baked once into a single texture (spec 03 §4 render note). */
  private bakeFloor(): void {
    const key = 'office_floor_bake'
    if (this.textures.exists(key)) this.textures.remove(key)
    const tex = this.textures.createCanvas(key, this.layout.world.w, this.layout.world.h)
    if (!tex) {
      // Canvas textures unavailable (rare): fall back to one Image per tile.
      for (const tile of this.layout.floors) {
        this.add.image(tile.x, tile.y, 'tiles', tile.frame).setOrigin(0, 0).setScale(1 / 3).setDepth(-100)
      }
      return
    }
    const ctx = tex.getContext()
    const sheet = this.textures.get('tiles').getSourceImage() as CanvasImageSource
    for (const tile of this.layout.floors) {
      const frame = this.atlas.sheets.tiles?.frames[tile.frame]
      if (!frame) continue
      ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, tile.x, tile.y, frame.lw, frame.lh)
    }
    tex.refresh()
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100)
  }

  private addRoomSprites(): void {
    for (const data of this.layout.sprites) {
      const frame = this.atlas.sheets[data.sheet]?.frames[data.frame]
      if (!frame) {
        console.warn(`[agenthq] layout sprite ${data.sheet}/${data.frame} missing from atlas`)
        continue
      }
      const image = this.add
        .image(data.x, data.y, data.sheet, data.frame)
        .setOrigin(0, 0)
        .setScale(1 / 3)
        .setDepth(data.sheet === 'furniture' && FLAT_FRAMES.has(data.frame) ? FLAT_DEPTH : depthFor(data.y, frame))
      this.roomImages.push({ data, image })
      if (data.sheet === 'tiles' && data.frame.startsWith('window_')) this.windows.push(image)
      if (data.sheet === 'furniture' && data.frame.startsWith('monitor')) {
        this.monitors.push({ image, phase: this.monitors.length * 1.13 })
      }
      if (data.sheet === 'furniture' && data.frame.startsWith('server_rack')) {
        this.racks.push({ image, offset: this.racks.length })
      }
    }
  }

  private createCats(): void {
    const hooks: CatHooks = {
      onMischief: (cat, x, y) => this.reactToMischief(x, y),
      onHoverCat: (cat, pointer) => {
        if (cat === null) emitHover(null)
        else this.emitHoverAt(cat, pointer)
      },
      canClick: () => this.dragDistance <= DRAG_THRESHOLD,
      onPet: (cat) => {
        emitPet({ catId: cat })
        this.cats.pet(cat)
      },
      onMessCreated: (mess, x, y) => {
        this.pendingCleanups.push({ mess, pos: { x, y }, nextTryAt: this.nowSeconds + 2 })
      },
      onMessCleaned: (mess) => {
        this.pendingCleanups = this.pendingCleanups.filter((task) => task.mess !== mess)
      }
    }
    this.cats = new CatLayer(this, this.catWorld, (Date.now() & 0xffffffff) >>> 0, () => this.reducedMotion, hooks)
  }

  private createWorkers(): void {
    const pathFn = (from: { x: number; y: number }, to: { x: number; y: number }) => this.catWorld.path(from, to)
    this.layout.workstations.forEach((ws, index) => {
      createWorkerAnims(this, ws.id)
      const seed = (0x51ed + index * 0x9e37) >>> 0
      this.workers.push(
        new WorkerActor(this, ws, { pathFn, isReducedMotion: () => this.reducedMotion, index }, seed)
      )
    })
  }

  private createDeskZones(): void {
    for (const ws of this.layout.workstations) {
      // Hit area over desk+monitor+chair rect (spec 03 §4): desk.x-4..+36, desk.y-24..+20.
      const zone = this.add
        .zone(ws.desk.x - 4, ws.desk.y - 24, 40, 44)
        .setOrigin(0, 0)
        .setDepth(9001)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerup', () => {
        if (this.dragDistance > DRAG_THRESHOLD) return
        const already = store.get().selected === ws.id
        store.select(already ? null : ws.id)
        emitFocusDesk({ agentId: ws.id })
      })
      zone.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        this.setDeskHover(ws.id, true)
        this.emitHoverAt(ws.id, pointer)
      })
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.emitHoverAt(ws.id, pointer)
      })
      zone.on('pointerout', () => {
        this.setDeskHover(ws.id, false)
        emitHover(null)
      })

      const hover: HoverFx[] = []
      const deskImage = this.findRoomImage('furniture', ws.desk.x, ws.desk.y)
      const monitorImage = this.findRoomImage('furniture', ws.monitor.x, ws.monitor.y)
      const chairImage = this.findRoomImage('furniture', ws.worker.x + 1, ws.worker.y)
      for (const image of [deskImage, monitorImage, chairImage]) {
        if (!image) continue
        // WebGL only (preFX is null on Canvas); hover falls back to cursor+tooltip.
        const glow = image.preFX ? image.preFX.addGlow(HOVER_GLOW_COLOR, 0, 0, false) : null
        hover.push({ glow, tween: null })
      }
      this.deskUi.push({ id: ws.id, hover })
    }
  }

  private createInteractables(): void {
    for (const it of this.layout.interactables) {
      const [x, y, w, h] = it.rect
      const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setDepth(9000)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerup', () => {
        if (this.dragDistance > DRAG_THRESHOLD) return
        emitInteract({ kind: it.kind, id: it.id })
      })
    }
  }

  private createAmbience(): void {
    const { w, h } = this.layout.world
    this.tint = this.add
      .rectangle(0, 0, w, h, 0xffffff, 1)
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(8000)
      .setAlpha(0)

    if (!this.textures.exists('glow')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff, 0.14).fillCircle(16, 16, 15)
      g.fillStyle(0xffffff, 0.2).fillCircle(16, 16, 9)
      g.fillStyle(0xffffff, 0.3).fillCircle(16, 16, 4)
      g.generateTexture('glow', 32, 32)
      g.destroy()
    }
    for (const data of this.layout.sprites) {
      if (data.sheet === 'furniture' && data.frame === 'lamp') {
        this.glows.push(this.makeGlow(data.x + 5, data.y + 5, GLOW_LAMP_COLOR, 'lamp'))
      }
    }
    for (const ws of this.layout.workstations) {
      const sprite = this.layout.sprites.find(
        (s) => s.sheet === 'furniture' && s.x === ws.monitor.x && s.y === ws.monitor.y
      )
      const frame = sprite ? this.atlas.sheets.furniture.frames[sprite.frame] : undefined
      const lw = frame?.lw ?? 16
      const lh = frame?.lh ?? 14
      this.glows.push(this.makeGlow(ws.monitor.x + lw / 2, ws.monitor.y + lh / 2, GLOW_MONITOR_COLOR, 'monitor'))
    }
  }

  private makeGlow(x: number, y: number, color: number, role: 'lamp' | 'monitor'): Glow {
    const image = this.add
      .image(x, y, 'glow')
      .setOrigin(0.5, 0.5)
      .setScale(role === 'lamp' ? 0.5 : 0.42)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(8500)
      .setAlpha(0)
    return { image, role, base: 0, phase: this.glows.length * 1.7 }
  }

  private setupSteam(): void {
    if (!this.anims.exists('fx_steam')) {
      this.anims.create({
        key: 'fx_steam',
        frames: [
          { key: 'fx', frame: 'steam_0' },
          { key: 'fx', frame: 'steam_1' }
        ],
        frameRate: 2,
        repeat: -1
      })
    }
    const machine = this.layout.sprites.find(
      (s) => s.sheet === 'furniture' && s.frame === 'coffee_machine'
    )
    if (!machine) return
    const puff = (): void => {
      if (!this.scene.isActive()) return
      const steam = this.add
        .sprite(machine.x + 7, machine.y - 2, 'fx', 'steam_0')
        .setOrigin(0.5, 1)
        .setScale(1 / 3)
        .setDepth(8200)
        .setAlpha(0)
      if (this.anims.exists('fx_steam')) steam.play('fx_steam')
      const reduced = this.reducedMotion
      this.tweens.add({
        targets: steam,
        alpha: { from: 0, to: 0.8 },
        duration: reduced ? 1 : 600,
        yoyo: true,
        hold: reduced ? 700 : 500,
        onComplete: () => steam.destroy()
      })
      if (!reduced) {
        this.tweens.add({ targets: steam, y: '-=5', duration: 1700, ease: 'Sine.easeOut' })
      }
      this.time.delayedCall(reduced ? 9000 : 4200 + Math.random() * 3200, puff)
    }
    this.time.delayedCall(1500, puff)
  }

  private setupCamera(): void {
    const cam = this.cameras.main
    const { w, h } = this.layout.world
    cam.setBounds(0, 0, w, h)
    cam.setZoom(1)
    cam.centerOn(w / 2, h / 2)
    cam.roundPixels = true
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = { x: pointer.x, y: pointer.y }
      this.dragDistance = 0
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return
      if (this.dragStart !== null) {
        this.dragDistance = Math.max(
          this.dragDistance,
          Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y)
        )
      }
      if (this.dragDistance > DRAG_THRESHOLD) {
        this.killCamTween()
        const cam = this.cameras.main
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom
      }
    })
    this.input.on('pointerup', () => {
      this.dragStart = null
      this.dragDistance = 0
    })
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main
      this.killCamTween()
      const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP), CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM)
      if (next === cam.zoom) return
      const before = cam.getWorldPoint(pointer.x, pointer.y, new Phaser.Math.Vector2())
      cam.zoom = next
      const after = cam.getWorldPoint(pointer.x, pointer.y, new Phaser.Math.Vector2())
      cam.scrollX += before.x - after.x
      cam.scrollY += before.y - after.y
    })
  }

  // ---- per-frame systems ------------------------------------------------------

  private get nowSeconds(): number {
    return this.time.now / 1000
  }

  private updateMonitorFlicker(t: number): void {
    if (this.reducedMotion) return
    for (const m of this.monitors) {
      m.image.setAlpha(0.85 + 0.075 * (1 + Math.sin(t * 1.7 + m.phase)))
    }
  }

  private updateRacks(delta: number): void {
    if (this.racks.length === 0) return
    if (this.reducedMotion) return // art bible: freeze decorative loops
    this.rackTimer += delta
    if (this.rackTimer < RACK_CYCLE_MS) return
    this.rackTimer -= RACK_CYCLE_MS
    this.rackStep = (this.rackStep + 1) % 3
    for (const rack of this.racks) {
      rack.image.setTexture('furniture', `server_rack_${(this.rackStep + rack.offset) % 3}`)
    }
  }

  private updateGlows(t: number): void {
    for (const glow of this.glows) {
      if (glow.base <= 0) continue
      if (this.reducedMotion) {
        glow.image.setAlpha(glow.base)
        continue
      }
      glow.image.setAlpha(glow.base * (0.88 + 0.12 * Math.sin(t * 1.6 + glow.phase)))
    }
  }

  private updateKeyboardPan(delta: number): void {
    if (!this.cursors) return
    const cam = this.cameras.main
    const speed = (delta / 1000) * KEYBOARD_PAN_SPEED / cam.zoom
    let dx = 0
    let dy = 0
    if (this.cursors.left.isDown) dx -= speed
    if (this.cursors.right.isDown) dx += speed
    if (this.cursors.up.isDown) dy -= speed
    if (this.cursors.down.isDown) dy += speed
    if (dx !== 0) cam.scrollX += dx
    if (dy !== 0) cam.scrollY += dy
  }

  private updatePendingCleanups(t: number): void {
    if (this.pendingCleanups.length === 0) return
    for (const task of this.pendingCleanups) {
      if (t < task.nextTryAt) continue
      task.nextTryAt = t + CLEANUP_RETRY_S
      const eligible = this.workers
        .filter((w) => w.state === 'idle' && w.available)
        .sort(
          (a, b) =>
            Math.hypot(a.feet.x - task.pos.x, a.feet.y - task.pos.y) -
            Math.hypot(b.feet.x - task.pos.x, b.feet.y - task.pos.y)
        )[0]
      if (!eligible) continue
      const dispatched = eligible.sendTo(task.pos, () => {
        this.cats.core.assignCleanup(task.mess, eligible.id)
      })
      if (dispatched) {
        this.pendingCleanups = this.pendingCleanups.filter((candidate) => candidate !== task)
      }
    }
  }

  // ---- ambience ----------------------------------------------------------------

  private applyStore(): void {
    const snapshot = store.get()
    this.reducedMotion = snapshot.settings.reducedMotion
    for (const worker of this.workers) {
      const runtime = snapshot.agentStates[worker.id]
      if (runtime) worker.setTrueState(runtime.state)
    }
    const next = resolveAmbience(snapshot.ambience)
    if (next !== this.ambience) this.applyAmbience(next, true)
  }

  private applyAmbience(mode: RoomMode, animate: boolean): void {
    this.ambience = mode
    for (const win of this.windows) win.setTexture('tiles', `window_${mode}`)

    // day: none · evening: warm amber multiply ~12% · night: navy multiply ~28%
    const tint = mode === 'evening' ? 0xf5c66b : mode === 'night' ? 0x23233d : 0xffffff
    const tintAlpha = mode === 'evening' ? 0.12 : mode === 'night' ? 0.28 : 0
    this.tint.setFillStyle(tint)
    this.tweenValue(this.tint, tintAlpha, animate)

    for (const glow of this.glows) {
      glow.base = GLOW_BASE[mode][glow.role]
      this.tweenValue(glow.image, glow.base, animate)
    }
  }

  private tweenValue(target: Phaser.GameObjects.GameObject, alpha: number, animate: boolean): void {
    this.tweens.killTweensOf(target)
    if (!animate || this.reducedMotion) {
      ;(target as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(alpha)
      return
    }
    this.tweens.add({ targets: target, alpha, duration: AMBIENCE_TWEEN_MS, ease: 'Sine.easeInOut' })
  }

  // ---- camera + hover ----------------------------------------------------------

  private killCamTween(): void {
    if (this.camTween) {
      this.camTween.stop()
      this.camTween = null
    }
  }

  private resetCamera(): void {
    const cam = this.cameras.main
    const { w, h } = this.layout.world
    this.killCamTween()
    if (this.reducedMotion) {
      cam.setZoom(1)
      cam.centerOn(w / 2, h / 2)
      return
    }
    this.camTween = this.tweens.add({
      targets: cam,
      zoom: 1,
      scrollX: w / 2 - cam.width / 2,
      scrollY: h / 2 - cam.height / 2,
      duration: 700,
      ease: 'Sine.easeInOut'
    })
  }

  private setDeskHover(id: AgentId, on: boolean): void {
    const ui = this.deskUi.find((d) => d.id === id)
    if (!ui) return
    for (const target of ui.hover) {
      if (target.glow === null) continue
      target.tween?.stop()
      target.tween = this.tweens.add({
        targets: target.glow,
        outerStrength: on ? 2.2 : 0,
        duration: this.reducedMotion ? 1 : 140
      })
    }
  }

  private emitHoverAt(agentId: HoverAgentId, pointer: Phaser.Input.Pointer): void {
    let x = pointer.x
    let y = pointer.y
    const native = pointer.event
    if (native && 'clientX' in native) {
      x = native.clientX
      y = native.clientY
    } else if (native && 'touches' in native && native.touches.length > 0) {
      x = native.touches[0].clientX
      y = native.touches[0].clientY
    }
    emitHover({ agentId, x, y })
  }

  private reactToMischief(x: number, y: number): void {
    let best: WorkerActor | null = null
    let bestDist = MISCHIEF_EXCLAIM_RANGE
    for (const worker of this.workers) {
      const d = Math.hypot(worker.seat.x - x, worker.seat.y - y)
      if (d < bestDist) {
        bestDist = d
        best = worker
      }
    }
    best?.showExclaim(1.5)
  }

  private findRoomImage(sheet: string, x: number, y: number): Phaser.GameObjects.Image | undefined {
    return this.roomImages.find((entry) => entry.data.sheet === sheet && entry.data.x === x && entry.data.y === y)
      ?.image
  }
}
