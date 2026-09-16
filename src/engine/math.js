// Small math helpers (ARCHITECTURE.md section 3).

/** Clamp v to [a, b]. */
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
/** Linear interpolation. */
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Move v toward target by at most step. */
export function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}
/** Sign of v (-1, 0, 1). */
export function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
/** Degrees to radians. */
export function rad(deg) { return deg * Math.PI / 180; }
/** Radians to degrees. */
export function deg(r) { return r * 180 / Math.PI; }
/** Axis-aligned rectangle overlap test ({x,y,w,h}). */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
/** 1D interval overlap test. */
export function spansOverlap(a0, a1, b0, b1) { return a0 <= b1 && a1 >= b0; }
/** Euclidean distance. */
export function dist(x0, y0, x1, y1) { const dx = x1 - x0, dy = y1 - y0; return Math.sqrt(dx * dx + dy * dy); }
/** Map v from [a,b] to [c,d] (unclamped). */
export function mapRange(v, a, b, c, d) { return c + (d - c) * ((v - a) / (b - a)); }
/** Smoothstep 0..1. */
export function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
/** Triangle wave 0..1..0 over period p at time t. */
export function pingpong(t, p = 1) { const u = (t / p) % 2; return u < 1 ? u : 2 - u; }
/** Wrap v into [0, m). */
export function wrap(v, m) { return ((v % m) + m) % m; }
/** Easing helpers, all take t in [0,1]. */
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
