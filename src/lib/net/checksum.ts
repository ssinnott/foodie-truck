// The hashing kernel of the desync canary. Peers in a lockstep match exchange a hash of their simulation every
// few frames (lockstep.ts checksumEvery); a game walks its own world with these helpers and the walk stays in
// the game, because what is simulation state is a game's own knowledge. The kernel is here because a mistake
// in it costs a match: it must have ZERO false positives, two correctly synchronised peers must never disagree.
//
// Two traps, both handled below:
//   -0 and 0 are numerically equal but have different bit patterns, and -0 arises easily from multiplying a
//     velocity by zero. Hashing raw bits would report a desync that is not one.
//   NaN has many bit patterns. Any NaN is normalised to one sentinel.

/** The FNV-1a offset basis: the value a walk starts from. */
export const FNV_OFFSET = 2166136261 >>> 0;

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over a uint32. */
export function mix(h: number, v: number): number {
  h ^= v & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  return h >>> 0;
}

/** Hash a number by its exact bits, with -0 and NaN normalised so equal values always hash equally. */
export function mixNum(h: number, n: number): number {
  if (Number.isNaN(n)) return mix(h, 0x7ff80000);
  f64[0] = n === 0 ? 0 : n;                  // n === 0 is true for both 0 and -0
  return mix(mix(h, u32[0]), u32[1]);
}

/** Hash a string, length-prefixed so 'AB','C' cannot collide with 'A','BC'. */
export function mixStr(h: number, s: string): number {
  h = mix(h, s.length);
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return h;
}

/**
 * Hash any simulation field. State machines are often STRINGS, so a number-only path would silently hash a
 * constant and make them invisible to the canary. Each type is tagged so 0, '', false and null cannot collide
 * with one another.
 */
export function mixAny(h: number, v: unknown): number {
  if (v === undefined || v === null) return mix(h, 0);
  if (typeof v === 'number') return mixNum(h, v);
  if (typeof v === 'string') return mixStr(mix(h, 1), v);
  if (typeof v === 'boolean') return mix(h, v ? 2 : 3);
  return mix(h, 4);
}
