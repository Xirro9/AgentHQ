// src/sim/rng.ts — seeded deterministic RNG (mulberry32). Pure: no imports.

export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9
  }

  /** Next float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [minIncl, maxIncl]. */
  int(minIncl: number, maxIncl: number): number {
    return minIncl + Math.floor(this.next() * (maxIncl - minIncl + 1))
  }

  /** Uniform element of a non-empty array. */
  pick<T>(a: T[]): T {
    return a[this.int(0, a.length - 1)]
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }
}
