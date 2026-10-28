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

export type CatId = 'pixel' | 'biscuit'
export type HoverAgentId = AgentId | CatId

export interface FocusDeskDetail {
  agentId: AgentId
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

function emit<T>(type: string, detail: T): void {
  window.dispatchEvent(new CustomEvent<T>(type, { detail }))
}

export function emitFocusDesk(detail: FocusDeskDetail): void {
  emit(FOCUS_DESK_EVENT, detail)
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
