// src/client/perf.ts — performance hardening (spec 05 §2).
//
// TIMER MAP (code-review contract — no other repeating timers may be added):
//
//   The client runs exactly these repeating timers, each with a justification:
//   1. WS reconnect backoff        — self-clearing setTimeout chain with jitter,
//                                    src/client/net/useHq.ts (transport only)
//   2. /api/states + /api/health
//      poll                        — single setInterval (POLL_MS, debounced),
//                                    src/client/net/useHq.ts (spec 03 §2)
//   3. HUD clock tick              — setInterval 1000ms, src/client/App.tsx
//                                    (spec 04 HUD clock; UI only, no network)
//
//   Everything else is requestAnimationFrame (arrow-key pan, rain overlay,
//   replay playback — all cancelled on unmount/blur) or Phaser's own scene
//   scheduler (tweens, delayedCall, anims). The replay engine is driven by rAF
//   from the ReplayBar and stops dead when paused, hidden, or unmounted.
//   Do NOT add a new setInterval/setTimeout loop without updating this map in
//   the same commit — that is the enforcement mechanism (code-review comment map).

/**
 * Structural slice of the Phaser game loop we retarget (avoids importing
 * Phaser here). `_limitRate` exists at runtime but is undeclared in Phaser's
 * TimeStep typings, hence the optional marker.
 */
export interface FpsGame {
  loop: { fpsLimit: number; _limitRate?: number }
}

/**
 * Apply an FPS cap via the Phaser loop's frame-rate limiter (spec 04 §4: the
 * game is created with `fps: { limit: 60 }` so the limited step path is active
 * and can be retargeted at runtime).
 */
export function applyFpsCap(game: FpsGame, fps: 30 | 60): void {
  game.loop.fpsLimit = fps
  game.loop._limitRate = 1000 / fps
}

/**
 * Spec 05 §2: while the tab is unfocused the loop drops to 30fps
 * (visibilitychange), restoring the user's cap when it becomes visible again.
 * Returns the uninstall function.
 */
export function installUnfocusedFpsCap(game: FpsGame, getCap: () => 30 | 60): () => void {
  const onVisibility = (): void => {
    applyFpsCap(game, document.hidden ? 30 : getCap())
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/**
 * Particle budget (spec 05 §2): the total decorative particle allowance per
 * effects-quality tier. The rain overlay draws exactly this many drops; the
 * office steam puffs are one-at-a-time and always inside budget.
 */
export const PARTICLE_BUDGET: Record<'low' | 'medium' | 'high', number> = {
  low: 40,
  medium: 110,
  high: 160
}

/**
 * Effective rain-drop count for the current settings: the effects toggle
 * (settings.particles) or reduced motion disables particles entirely (0), and
 * the 30fps cap trims the budget by a quarter so per-frame particle work
 * stays inside the halved frame rate.
 */
export function particleCount(
  quality: 'low' | 'medium' | 'high',
  particlesEnabled: boolean,
  reducedMotion: boolean,
  fpsCap: 30 | 60
): number {
  if (!particlesEnabled || reducedMotion) return 0
  const base = PARTICLE_BUDGET[quality]
  return fpsCap === 30 ? Math.round(base * 0.75) : base
}

/**
 * The effects toggle (spec 05 §2): every decorative particle system must gate
 * on this (rain overlay render condition, office steam puff scheduler).
 * Reduced motion forces it off globally (spec 03/04 convention).
 */
export function effectsEnabled(particles: boolean, reducedMotion: boolean): boolean {
  return particles && !reducedMotion
}
