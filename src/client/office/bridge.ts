// src/client/office/bridge.ts — typed window CustomEvent helpers connecting the
// Phaser office to the React shell (spec 03 §8). React never reaches into the
// scene; the scene never imports React.

import type { AgentId } from '../../shared/events'

export const FOCUS_DESK_EVENT = 'agenthq:focus-desk'
export const HOVER_EVENT = 'agenthq:hover'
export const INTERACT_EVENT = 'agenthq:interact'
export const PET_EVENT = 'agenthq:pet'
export const CAMERA_RESET_EVENT = 'agenthq:camera-reset'
export const SCENE_READY_EVENT = 'agenthq:scene-ready'
// Spec 04 wiring: settings fan-out, desk follow, camera pause, sfx cues.
export const SETTINGS_EVENT = 'agenthq:settings'
export const FOLLOW_DESK_EVENT = 'agenthq:follow-desk'
export const CAMERA_PAUSE_EVENT = 'agenthq:camera-pause'
export const CAMERA_PAN_EVENT = 'agenthq:camera-pan'
export const DESK_ANCHOR_EVENT = 'agenthq:desk-anchor'
export const SFX_CUE_EVENT = 'agenthq:sfx-cue'

/**
 * The slice of the settings blob the office scene reacts to. `UiSettings`
 * (src/client/ui/logic.ts) extends this, so the store can dispatch its whole
 * validated settings object directly.
 */
export interface SceneSettings {
  ambience: 'day' | 'evening' | 'night' | 'auto'
  reducedMotion: boolean
  weather: 'none' | 'rain'
  catsEnabled: boolean
  mischiefLevel: 'calm' | 'normal' | 'chaos'
  peacefulMode: boolean
  pettingEnabled: boolean
  fpsCap: 30 | 60
  particles: boolean
  effectsQuality: 'low' | 'medium' | 'high'
}

export type CatId = 'pixel' | 'biscuit'
export type HoverAgentId = AgentId | CatId

export interface FocusDeskDetail {
  agentId: AgentId
}
export interface DeskAnchorDetail {
  agentId: AgentId
  /** Desk position in client (viewport) px, tracked per frame. */
  x: number
  y: number
}
export interface CameraPanDetail {
  /** Logical-px pan delta for this frame (App divides by zoom in-scene). */
  dx: number
  dy: number
}
export interface HoverDetail {
  agentId: HoverAgentId
  /** Viewport (screen) px for the HTML tooltip. */
  x: number
  y: number
}
export interface InteractDetail {
  kind: string
  id: string
}
export interface PetDetail {
  catId: CatId
}
export interface CameraPauseDetail {
  paused: boolean
}
export interface FollowDeskDetail {
  agentId: AgentId
}
export interface SfxCueDetail {
  cue: 'printer' | 'mess'
}

function emit<T>(type: string, detail: T): void {
  window.dispatchEvent(new CustomEvent<T>(type, { detail }))
}

export function emitFocusDesk(detail: FocusDeskDetail): void {
  emit(FOCUS_DESK_EVENT, detail)
}

export function emitSettings(detail: SceneSettings): void {
  emit(SETTINGS_EVENT, detail)
}

export function emitCameraReset(): void {
  emit(CAMERA_RESET_EVENT, undefined)
}

export function emitFollowDesk(detail: FollowDeskDetail): void {
  emit(FOLLOW_DESK_EVENT, detail)
}

export function emitCameraPause(detail: CameraPauseDetail): void {
  emit(CAMERA_PAUSE_EVENT, detail)
}

export function emitCameraPan(detail: CameraPanDetail): void {
  emit(CAMERA_PAN_EVENT, detail)
}

export function emitDeskAnchor(detail: DeskAnchorDetail): void {
  emit(DESK_ANCHOR_EVENT, detail)
}

export function emitSfxCue(detail: SfxCueDetail): void {
  emit(SFX_CUE_EVENT, detail)
}

export function emitHover(detail: HoverDetail | null): void {
  emit(HOVER_EVENT, detail)
}

export function emitInteract(detail: InteractDetail): void {
  emit(INTERACT_EVENT, detail)
}

export function emitPet(detail: PetDetail): void {
  emit(PET_EVENT, detail)
}

export function emitSceneReady(): void {
  emit(SCENE_READY_EVENT, undefined)
}

/** Subscribe to a typed bridge event; returns an unsubscribe function. */
export function onBridgeEvent<T>(type: string, handler: (detail: T) => void): () => void {
  const listener = (event: Event): void => {
    handler((event as CustomEvent<T>).detail)
  }
  window.addEventListener(type, listener)
  return () => {
    window.removeEventListener(type, listener)
  }
}
