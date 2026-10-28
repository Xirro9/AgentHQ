// src/client/office/layout.ts — types for the generator-owned art contract:
// public/assets/gen/atlas.json (frame rects in exported 3x px) and layout.json
// (all placement, in logical px). Never edited by hand; see assets-src/.

import type { AgentId } from '../../shared/events'

/** Exported sheets are 3x nearest-neighbor upscales of the logical art. */
export const EXPORT_SCALE = 3

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

export interface FloorTile {
  frame: string
  x: number
  y: number
}

export interface LayoutSprite {
  sheet: string
  frame: string
  x: number
  y: number
}

export interface WorkstationLayout {
  id: AgentId
  desk: Vec
  worker: Vec
  monitor: Vec
}

export interface InteractableLayout {
  id: string
  rect: [number, number, number, number]
  kind: string
}

export interface OfficeLayout {
  version: number
  world: {
    w: number
    h: number
    tile: number
    floor: Rect
    walkable: Rect
  }
  floors: FloorTile[]
  sprites: LayoutSprite[]
  workstations: WorkstationLayout[]
  interactables: InteractableLayout[]
  cat_routes?: { pixel?: Vec[]; biscuit?: Vec[] }
  spawn?: { pixel?: number[]; biscuit?: number[] }
}

export interface AtlasFrame {
  /** Frame rect inside the sheet PNG, in exported 3x px. */
  x: number
  y: number
  w: number
  h: number
  /** Logical (1x) size, provided by the generator. */
  lw: number
  lh: number
}

export interface AtlasSheet {
  frames: Record<string, AtlasFrame>
}

export interface AtlasJson {
  meta: { app: string; scale: number }
  sheets: Record<string, AtlasSheet>
}

/** Every sheet PNG referenced by atlas.json (also the loader list). */
export const SHEET_KEYS = [
  'tiles',
  'furniture',
  'props',
  'fx',
  'agent_hermes',
  'agent_architect',
  'agent_implementation',
  'agent_frontend',
  'agent_tester',
  'agent_debugger',
  'agent_security',
  'cat_pixel',
  'cat_biscuit'
] as const

export type SheetKey = (typeof SHEET_KEYS)[number]

/** Logical (1x) display size of an atlas frame. */
export function logicalSize(frame: AtlasFrame): { w: number; h: number } {
  return { w: frame.lw ?? frame.w / EXPORT_SCALE, h: frame.lh ?? frame.h / EXPORT_SCALE }
}

/**
 * y-sort depth for a sprite whose top-left sits at (y): depth = y + frameHeight
 * (spec 03 §4; frameHeight in logical px). Equals the sprite's bottom edge, so
 * actors anchored at their feet slot into the same ordering.
 */
export function depthFor(y: number, frame: AtlasFrame): number {
  return y + (frame.lh ?? frame.h / EXPORT_SCALE)
}
