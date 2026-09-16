// Pose objects and interpolation helpers (ARCHITECTURE.md section 4). Angles in degrees.
// Convention: armR/legR are the NEAR limbs (closest to the viewer), armL/legL the FAR limbs.

/** Fully specified default pose. Any partial pose is resolved against this. */
export const DEFAULT_POSE = Object.freeze({
  root: Object.freeze({ x: 0, y: 0, rot: 0 }),
  torso: Object.freeze({ rot: 0, x: 0, y: 0 }),
  head: Object.freeze({ rot: 0, x: 0, y: 0 }),
  armR: Object.freeze({ upper: 20, lower: 10 }),
  armL: Object.freeze({ upper: -20, lower: 10 }),
  legR: Object.freeze({ upper: 0, lower: 0 }),
  legL: Object.freeze({ upper: 0, lower: 0 }),
  handR: Object.freeze({ rot: 0 }),
  handL: Object.freeze({ rot: 0 }),
  footR: Object.freeze({ rot: 0 }),
  footL: Object.freeze({ rot: 0 }),
  weapon: Object.freeze({ rot: 0 }),
  squash: 1,
  stretch: 1,
  /** 0..1 blend of the far arm onto a two-handed weapon's grip (2-bone IK; only used when build.weapon.twoHanded). */
  grip: 0,
  /** Facial expression index (see FACE); stepped, never interpolated. */
  face: 0,
  /** 1 = the weapon is drawn in the back layer (behind the body: rested on the shoulder / slung); stepped, never interpolated. */
  weaponBack: 0,
  /** Weapon smear arc in root space: from/to angles in degrees (0 = forward, -90 = up), a = alpha, r = radius (0 = auto). from/to step, a/r lerp. */
  smear: Object.freeze({ from: 0, to: 0, a: 0, r: 0 }),
});

/** Named facial expressions for `pose.face` (P() accepts the names). */
export const FACE = Object.freeze({ neutral: 0, angry: 1, hurt: 2, happy: 3, shout: 4, dazed: 5, grit: 6, closed: 7 });
/** Resolve a face name or number to an index. */
export function faceIndex(v) { return typeof v === 'number' ? v : (v != null && FACE[v] != null ? FACE[v] : 0); }

const KEYS = Object.keys(DEFAULT_POSE);
/** Keys whose numbers are held (stepped) rather than interpolated. */
const STEP = Object.freeze({ face: true, from: true, to: true, weaponBack: true });

/** Allocate a fresh, fully populated pose object. */
export function makePose(partial = null) {
  const out = {};
  for (const k of KEYS) {
    const d = DEFAULT_POSE[k];
    if (typeof d === 'number') out[k] = d;
    else { out[k] = {}; for (const s of Object.keys(d)) out[k][s] = d[s]; }
  }
  if (partial) copyPose(partial, out);
  return out;
}

/** Overlay a (partial) pose onto `out` (which must be fully populated). Missing values in `src` become defaults when `reset` is true. */
export function copyPose(src, out, reset = false) {
  for (const k of KEYS) {
    const d = DEFAULT_POSE[k];
    const v = src ? src[k] : undefined;
    if (typeof d === 'number') { out[k] = v != null ? (k === 'face' ? faceIndex(v) : v) : (reset ? d : out[k]); continue; }
    const o = out[k];
    for (const s of Object.keys(d)) {
      const sv = v && v[s] != null ? v[s] : undefined;
      o[s] = sv != null ? sv : (reset ? d[s] : o[s]);
    }
  }
  return out;
}

/** Scratch pose used when no `out` is given (do not keep references across frames). */
export const SCRATCH_POSE = makePose();

/**
 * Deep-interpolate two (possibly partial) poses into `out` (default: shared scratch object; no allocation).
 * @returns {object} out
 */
export function lerpPose(a, b, t, out = SCRATCH_POSE) {
  for (const k of KEYS) {
    const d = DEFAULT_POSE[k];
    const av = a ? a[k] : undefined, bv = b ? b[k] : undefined;
    if (typeof d === 'number') {
      if (STEP[k]) { out[k] = av != null ? (k === 'face' ? faceIndex(av) : av) : d; continue; }
      const x = av != null ? av : d, y = bv != null ? bv : d;
      out[k] = x + (y - x) * t;
      continue;
    }
    const o = out[k];
    for (const s of Object.keys(d)) {
      const x = av && av[s] != null ? av[s] : d[s];
      if (STEP[s]) { o[s] = x; continue; }
      const y = bv && bv[s] != null ? bv[s] : d[s];
      o[s] = x + (y - x) * t;
    }
  }
  return out;
}

/** Easing curves for keyframes (frame.ease). t in [0,1]. */
export const EASE = Object.freeze({
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  overshoot: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  snap: (t) => (t < 0.5 ? 0 : 1),
});
/** Apply a named easing to t (unknown names = linear). */
export function ease(name, t) { const f = name && EASE[name]; return f ? f(t) : t; }

/** Swap near/far limbs (armR<->armL, legR<->legL, handR<->handL, footR<->footL) into `out`. */
export function mirrorPose(pose, out = makePose()) {
  copyPose(pose, out, true);
  const swap = (a, b) => { const tmp = out[a]; out[a] = out[b]; out[b] = tmp; };
  swap('armR', 'armL'); swap('legR', 'legL'); swap('handR', 'handL'); swap('footR', 'footL');
  return out;
}

/** Add `delta` (partial pose, numbers are added) onto `pose` in place. Handy for procedural bob/lean. */
export function addPose(pose, delta) {
  for (const k of Object.keys(delta)) {
    const d = delta[k];
    if (typeof d === 'number') pose[k] += d;
    else if (pose[k]) for (const s of Object.keys(d)) pose[k][s] = (pose[k][s] || 0) + d[s];
  }
  return pose;
}

/** Shorthand builder for authoring anims: P({ armR: [upper, lower], legL: [u, l], torso: rot, head: rot, root: [x, y, rot] ... }). */
export function P(spec = {}) {
  const o = {};
  for (const k of Object.keys(spec)) {
    const v = spec[k];
    if (k === 'armR' || k === 'armL' || k === 'legR' || k === 'legL') o[k] = Array.isArray(v) ? { upper: v[0], lower: v[1] } : v;
    else if (k === 'torso' || k === 'head') o[k] = typeof v === 'number' ? { rot: v } : Array.isArray(v) ? { rot: v[0], x: v[1], y: v[2] } : v;
    else if (k === 'root') o[k] = Array.isArray(v) ? { x: v[0], y: v[1], rot: v[2] || 0 } : v;
    else if (k === 'handR' || k === 'handL' || k === 'weapon' || k === 'footR' || k === 'footL') o[k] = typeof v === 'number' ? { rot: v } : v;
    else if (k === 'smear') o[k] = Array.isArray(v) ? { from: v[0], to: v[1], a: v[2] != null ? v[2] : 0.45, r: v[3] || 0 } : v;
    else if (k === 'face') o[k] = faceIndex(v);
    else o[k] = v;
  }
  return o;
}
