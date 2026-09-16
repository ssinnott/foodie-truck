// Seedable deterministic RNG (mulberry32). All gameplay randomness must go through this.

let state = 0x2f6e2b1;

/** Seedable RNG singleton. */
export const rng = {
  /** Seed the generator with an integer. */
  seed(n) { state = (Number(n) | 0) >>> 0 || 0x9e3779b9; },
  /** Next float in [0, 1). */
  next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  /** Float in [a, b). */
  range(a, b) { return a + (b - a) * rng.next(); },
  /** Integer in [a, b] inclusive. */
  int(a, b) { return a + Math.floor(rng.next() * (b - a + 1)); },
  /** Random element of a non-empty array (undefined if empty). */
  pick(arr) { return arr.length ? arr[Math.floor(rng.next() * arr.length)] : undefined; },
  /** True with probability p. */
  chance(p) { return rng.next() < p; },
  /** Random sign (-1 or 1). */
  sign() { return rng.next() < 0.5 ? -1 : 1; },
  /** Current internal state (for debugging). */
  get state() { return state; },
};

/** Create an independent RNG instance (e.g. for non-gameplay sparkle). */
export function makeRng(seed = 1) {
  let s = (seed | 0) >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next, seed(n) { s = (n | 0) >>> 0 || 1; },
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    chance: (p) => next() < p,
  };
}
