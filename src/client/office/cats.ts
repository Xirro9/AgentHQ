// src/client/office/cats.ts — the two office cats, rendered from the pure sim.
// CatCore (src/sim) owns ALL behavior: this layer only applies returned events
// to sprites (spec 03 §6). Pixel: cat_pixel walk/run/sit/loaf/sleep @8fps walk;
// Biscuit: cat_biscuit sleep_0..2 breathing @1fps, waddle, sit, stretch.
// Cats y-sort with furniture (depth = feet y) and are clickable (pet → purr).

import Phaser from 'phaser'
import { CatCore, type CatEvent, type CatId, type MessId } from '../../sim/cats'
import { buildWorld, type Rect, type SimWorld } from '../../sim/world'
import type { OfficeLayout } from './layout'
import type { CatId as BridgeCatId } from './bridge'

export interface CatHooks {
  /** Mischief began; the scene pops an exclaim on the nearest worker. */
  onMischief(cat: CatId, x: number, y: number): void
  /** Hover relay so cats use the same HTML tooltip as desks. */
  onHoverCat(cat: BridgeCatId | null, pointer: Phaser.Input.Pointer): void
  /** Click gating (drag suppression lives in the scene). */
  canClick(): boolean
  /** Pet request from a click; the scene emits the bridge event. */
  onPet(cat: CatId): void
  /** Mess lifecycle relay for the scene's cleanup scheduler (brief §7.4). */
  onMessCreated(mess: MessId, x: number, y: number): void
  onMessCleaned(mess: MessId): void
}

/** Sim targets that don't sit on their namesake art get aligned client-side. */
const TARGET_OVERRIDES: Record<string, { x: number; y: number }> = {
  printer: { x: 32, y: 160 }, // printer cart is bottom-left, not top-right
  food_bowls: { x: 128, y: 244 }, // bowls sit by the kitchenette counter
  plant: { x: 150, y: 230 }, // potted plant next to the counter
  papers_table: { x: 344, y: 238 } // beside the cat bed / cardboard box
}

const PIXEL_ANIMS: Record<string, { anim?: string; frame?: string }> = {
  wander: { anim: 'cat_pixel_walk' },
  investigate: { anim: 'cat_pixel_walk' },
  zoomies: { anim: 'cat_pixel_run' },
  flee: { anim: 'cat_pixel_run' },
  sit: { anim: 'cat_pixel_sit' },
  loaf: { frame: 'loaf_0' },
  groom: { anim: 'cat_pixel_groom' },
  pounce: { anim: 'cat_pixel_pounce' },
  sleep: { anim: 'cat_pixel_sleep' },
  bat: { anim: 'cat_pixel_bat' },
  happy: { anim: 'cat_pixel_sit' },
  idle: { frame: 'loaf_0' }
}

const BISCUIT_ANIMS: Record<string, { anim?: string; frame?: string }> = {
  waddle: { anim: 'cat_biscuit_waddle' },
  investigate: { anim: 'cat_biscuit_waddle' },
  sleep: { anim: 'cat_biscuit_sleep' },
  occupy: { anim: 'cat_biscuit_sleep' },
  loaf: { frame: 'sit_0' },
  sit: { frame: 'sit_0' },
  wake: { frame: 'sit_0' },
  happy: { frame: 'sit_0' },
  stretch: { anim: 'cat_biscuit_stretch' },
  look: { frame: 'look_0' },
  ear: { anim: 'cat_biscuit_ear' },
  idle: { anim: 'cat_biscuit_sleep' }
}

const MESS_ART: Record<MessId, { sheet: string; frame: string; tilt?: boolean }> = {
  puddle: { sheet: 'fx', frame: 'puddle' },
  papers: { sheet: 'fx', frame: 'paperfly' },
  cable: { sheet: 'fx', frame: 'cable_0' },
  paper_jam: { sheet: 'fx', frame: 'paperfly' },
  plant_tilt: { sheet: 'furniture', frame: 'plant', tilt: true }
}

export function createCatAnims(scene: Phaser.Scene): void {
  const defs: Array<{ key: string; sheet: string; frames: string[]; frameRate: number }> = [
    { key: 'cat_pixel_walk', sheet: 'cat_pixel', frames: ['walk_0', 'walk_1', 'walk_2', 'walk_3'], frameRate: 8 },
    { key: 'cat_pixel_run', sheet: 'cat_pixel', frames: ['run_0', 'run_1'], frameRate: 10 },
    { key: 'cat_pixel_sit', sheet: 'cat_pixel', frames: ['sit_0', 'sit_1'], frameRate: 2 },
    { key: 'cat_pixel_groom', sheet: 'cat_pixel', frames: ['groom_0', 'groom_1'], frameRate: 3 },
    { key: 'cat_pixel_pounce', sheet: 'cat_pixel', frames: ['pounce_0', 'pounce_1'], frameRate: 6 },
    { key: 'cat_pixel_sleep', sheet: 'cat_pixel', frames: ['sleep_0', 'sleep_1'], frameRate: 1.5 },
    { key: 'cat_pixel_bat', sheet: 'cat_pixel', frames: ['bat_0', 'bat_1'], frameRate: 6 },
    {
      key: 'cat_biscuit_waddle',
      sheet: 'cat_biscuit',
      frames: ['waddle_0', 'waddle_1', 'waddle_2', 'waddle_3'],
      frameRate: 5
    },
    { key: 'cat_biscuit_sleep', sheet: 'cat_biscuit', frames: ['sleep_0', 'sleep_1', 'sleep_2'], frameRate: 1 },
    { key: 'cat_biscuit_stretch', sheet: 'cat_biscuit', frames: ['stretch_0', 'stretch_1'], frameRate: 2 },
    { key: 'cat_biscuit_ear', sheet: 'cat_biscuit', frames: ['ear_0', 'ear_1'], frameRate: 1.5 },
    { key: 'fx_zzz', sheet: 'fx', frames: ['zzz_0', 'zzz_1'], frameRate: 1 }
  ]
  for (const def of defs) {
    if (scene.anims.exists(def.key)) continue
    scene.anims.create({
      key: def.key,
      frames: def.frames.map((frame) => ({ key: def.sheet, frame })),
      frameRate: def.frameRate,
      repeat: -1
    })
  }
}

export class CatLayer {
  readonly core: CatCore
  private readonly scene: Phaser.Scene
  private readonly hooks: CatHooks
  private readonly isReducedMotion: () => boolean
  private readonly sprites: Record<CatId, Phaser.GameObjects.Sprite>
  private readonly zz: Partial<Record<CatId, Phaser.GameObjects.Sprite>> = {}
  private readonly messSprites = new Map<MessId, Phaser.GameObjects.Sprite>()

  constructor(
    scene: Phaser.Scene,
    world: SimWorld,
    seed: number,
    isReducedMotion: () => boolean,
    hooks: CatHooks
  ) {
    this.scene = scene
    this.hooks = hooks
    this.isReducedMotion = isReducedMotion
    this.core = new CatCore(world, seed)
    this.sprites = {
      pixel: this.makeSprite('pixel', 'cat_pixel', 48, 36, 'loaf_0'),
      biscuit: this.makeSprite('biscuit', 'cat_biscuit', 72, 48, 'sleep_0')
    }
  }

  private makeSprite(id: CatId, sheet: string, fw: number, fh: number, frame: string): Phaser.GameObjects.Sprite {
    const agent = this.core[id]
    const sprite = this.scene.add
      .sprite(agent.x, agent.y + 6, sheet, frame)
      .setOrigin(0.5, 1)
      .setScale(1 / 3)
      .setDepth(agent.y + 6)
    sprite.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, fw, fh),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    })
    sprite.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      this.hooks.onHoverCat(id, pointer)
    })
    sprite.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hooks.onHoverCat(id, pointer)
    })
    sprite.on('pointerout', () => {
      this.hooks.onHoverCat(null, this.scene.input.activePointer)
    })
    sprite.on('pointerup', () => {
      if (this.hooks.canClick()) this.hooks.onPet(id)
    })
    return sprite
  }

  update(dt: number): void {
    this.apply(this.core.update(dt))
  }

  /** Pet interaction: bridge event already emitted by the scene. */
  pet(id: CatId): void {
    this.apply(this.core.pet(id))
    const sprite = this.sprites[id]
    this.burstHearts(sprite.x, sprite.y - 10)
  }

  private apply(events: CatEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'moved': {
          const sprite = this.sprites[ev.cat as CatId]
          sprite.setPosition(ev.x, ev.y + 6)
          sprite.setDepth(ev.y + 6)
          sprite.setFlipX(ev.facing === 'left') // cat art faces right
          break
        }
        case 'state': {
          this.applyState(ev.cat as CatId, ev.state)
          break
        }
        case 'mischief_started': {
          const pos = this.core.world.targets[ev.target] ?? this.core[ev.cat as CatId]
          this.hooks.onMischief(ev.cat as CatId, pos.x, pos.y)
          break
        }
        case 'mess_created': {
          this.addMess(ev.mess, ev.x, ev.y)
          this.hooks.onMessCreated(ev.mess, ev.x, ev.y)
          break
        }
        case 'mess_cleaning': {
          const sprite = this.messSprites.get(ev.mess)
          if (sprite) sprite.setTint(0x9fe8d0)
          break
        }
        case 'mess_cleaned': {
          const sprite = this.messSprites.get(ev.mess)
          if (sprite) {
            this.sparkleAt(sprite.x, sprite.y - 2)
            sprite.destroy()
          }
          this.messSprites.delete(ev.mess)
          this.hooks.onMessCleaned(ev.mess)
          break
        }
        case 'purr': {
          const sprite = this.sprites[ev.cat as CatId]
          this.burstHearts(sprite.x, sprite.y - 10)
          break
        }
        case 'incident_resolved':
          break
      }
    }
  }

  private applyState(id: CatId, state: string): void {
    const sprite = this.sprites[id]
    const table = id === 'pixel' ? PIXEL_ANIMS : BISCUIT_ANIMS
    const art = table[state] ?? (id === 'pixel' ? { frame: 'loaf_0' } : { anim: 'cat_biscuit_sleep' })
    if (art.anim && this.scene.anims.exists(art.anim)) sprite.play(art.anim)
    else if (art.frame) {
      sprite.stop()
      sprite.setFrame(art.frame)
    }
    this.updateZz(id, state === 'sleep' || state === 'occupy')
  }

  private updateZz(id: CatId, asleep: boolean): void {
    const existing = this.zz[id]
    if (asleep && !existing) {
      const cat = this.sprites[id]
      const zz = this.scene.add
        .sprite(cat.x + 6, cat.y - 14, 'fx', 'zzz_0')
        .setOrigin(0.5, 1)
        .setScale(1 / 3)
        .setDepth(cat.depth + 1)
      if (this.scene.anims.exists('fx_zzz')) zz.play('fx_zzz')
      this.zz[id] = zz
    } else if (!asleep && existing) {
      existing.destroy()
      delete this.zz[id]
    } else if (asleep && existing) {
      existing.setPosition(this.sprites[id].x + 6, this.sprites[id].y - 14)
      existing.setDepth(this.sprites[id].depth + 1)
    }
  }

  private addMess(mess: MessId, x: number, y: number): void {
    if (this.messSprites.has(mess)) return
    const art = MESS_ART[mess]
    const sprite = this.scene.add
      .sprite(x, y + (art.tilt ? 8 : 3), art.sheet, art.frame)
      .setOrigin(0.5, 1)
      .setScale(1 / 3)
      .setDepth(y + 2)
    if (art.tilt) sprite.setAngle(24)
    this.messSprites.set(mess, sprite)
  }

  private burstHearts(x: number, y: number): void {
    const reduced = this.isReducedMotion()
    const count = reduced ? 1 : 3
    for (let i = 0; i < count; i++) {
      const heart = this.scene.add
        .sprite(x + (reduced ? 0 : (i - 1) * 5), y, 'fx', i % 2 === 0 ? 'heart_0' : 'heart_1')
        .setOrigin(0.5, 1)
        .setScale(1 / 3)
        .setDepth(y + 60)
        .setAlpha(reduced ? 1 : 0)
      if (reduced) {
        this.scene.time.delayedCall(800, () => heart.destroy())
      } else {
        this.scene.tweens.add({
          targets: heart,
          y: y - 14,
          alpha: 1,
          duration: 260,
          delay: i * 130,
          yoyo: true,
          hold: 200,
          onComplete: () => heart.destroy()
        })
      }
    }
  }

  private sparkleAt(x: number, y: number): void {
    for (let i = 0; i < 2; i++) {
      const spark = this.scene.add
        .sprite(x + (i === 0 ? -3 : 3), y - 2, 'fx', i === 0 ? 'sparkle_0' : 'sparkle_1')
        .setOrigin(0.5, 1)
        .setScale(1 / 3)
        .setDepth(y + 60)
      const hold = this.isReducedMotion() ? 500 : 0
      this.scene.tweens.add({
        targets: spark,
        alpha: 0,
        y: y - 8,
        delay: hold,
        duration: this.isReducedMotion() ? 1 : 420,
        onComplete: () => spark.destroy()
      })
    }
  }

  destroy(): void {
    for (const id of ['pixel', 'biscuit'] as const) {
      this.sprites[id].destroy()
      this.zz[id]?.destroy()
    }
    for (const mess of this.messSprites.values()) mess.destroy()
    this.messSprites.clear()
  }
}

// Solid floor furniture the cats (and strolling workers) should route around.
export function extraBlockedRects(): Rect[] {
  return [
    { x: 16, y: 240, w: 48, h: 20 }, // kitchenette counter
    { x: 440, y: 96, w: 24, h: 32 }, // bookshelf
    { x: 408, y: 200, w: 14, h: 22 }, // big plant
    { x: 448, y: 160, w: 10, h: 16 }, // plant
    { x: 8, y: 130, w: 10, h: 16 }, // plant
    { x: 150, y: 236, w: 10, h: 16 }, // plant
    { x: 372, y: 236, w: 16, h: 12 }, // cardboard box
    { x: 70, y: 224, w: 12, h: 20 }, // water cooler
    { x: 16, y: 168, w: 32, h: 20 }, // printer cart desk
    { x: 120, y: 250, w: 9, h: 5 }, // food bowl (amber)
    { x: 132, y: 250, w: 9, h: 5 }, // food bowl (teal)
    { x: 352, y: 232, w: 16, h: 9 } // cat bed
  ]
}

export { TARGET_OVERRIDES }

/**
 * Build the shared walkable world for cats AND strolling workers: the sim's
 * buildWorld fed with the layout's walkable region, client-side solid-furniture
 * rects, and target coordinates aligned to the actual art placement. The sim
 * module itself stays untouched.
 */
export function buildCatWorld(layout: OfficeLayout): SimWorld {
  return buildWorld(
    {
      ...layout,
      walkable: layout.world.walkable,
      blocked: extraBlockedRects()
    },
    TARGET_OVERRIDES
  )
}
