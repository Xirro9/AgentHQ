// src/client/office/BootScene.ts — loads the generated art contract and hands
// over to the office. Spec 03 §3: atlas.json + every sheet PNG + layout.json,
// all atlas frames registered as named texture frames.

import Phaser from 'phaser'
import { SHEET_KEYS, type AtlasJson, type OfficeLayout } from './layout'

export const BOOT_SCENE_KEY = 'boot'
export const OFFICE_SCENE_KEY = 'office'
export const LAYOUT_CACHE_KEY = 'layout'
export const ATLAS_CACHE_KEY = 'atlas'

export class BootScene extends Phaser.Scene {
  constructor() {
    super(BOOT_SCENE_KEY)
  }

  preload(): void {
    // Tiny canvas status; the pretty loader is the HTML overlay in App.tsx.
    const { width, height } = this.scale
    const note = this.add
      .text(width / 2, height - 16, 'waking the office…', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '8px',
        color: '#8f86b8'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1000)

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[agenthq] failed to load ${file.key} (${file.url})`)
    })
    this.load.once('complete', () => note.destroy())

    this.load.json(ATLAS_CACHE_KEY, 'assets/gen/atlas.json')
    this.load.json(LAYOUT_CACHE_KEY, 'assets/gen/layout.json')
    for (const key of SHEET_KEYS) {
      this.load.image(key, `assets/gen/${key}.png`)
    }
  }

  create(): void {
    const atlas = this.cache.json.get(ATLAS_CACHE_KEY) as AtlasJson | undefined
    if (!atlas || typeof atlas !== 'object' || !atlas.sheets) {
      console.error('[agenthq] atlas.json missing or malformed; office cannot start')
      return
    }

    // Register every named frame on its sheet texture. The PNGs were loaded as
    // plain images; the atlas provides the (non-uniform) frame rects.
    for (const key of SHEET_KEYS) {
      const sheet = atlas.sheets[key]
      if (!sheet || !this.textures.exists(key)) {
        console.error(`[agenthq] atlas sheet "${key}" missing`)
        continue
      }
      const texture = this.textures.get(key)
      for (const [frameName, rect] of Object.entries(sheet.frames)) {
        if (!texture.has(frameName)) {
          texture.add(frameName, 0, rect.x, rect.y, rect.w, rect.h)
        }
      }
    }

    const layout = this.cache.json.get(LAYOUT_CACHE_KEY) as OfficeLayout | undefined
    if (!layout || !Array.isArray(layout.sprites)) {
      console.error('[agenthq] layout.json missing or malformed; office cannot start')
      return
    }

    this.scene.start(OFFICE_SCENE_KEY)
  }
}
