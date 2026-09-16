// Keyframe animation player (ARCHITECTURE.md section 4). Frame durations are in fixed steps (60 Hz).
import { lerpPose, makePose, copyPose, ease, faceIndex } from '../art/poses.js';
import { markFull } from '../art/rig.js';

const EMPTY = Object.freeze({ dur: 1, pose: null });

/**
 * Plays named animations from an `anims` table: { name: { loop, frames: [ { dur, pose, interp, hitbox, move, fx, sfx, cancel, event,
 *   ease: 'in'|'out'|'inout'|'overshoot'|'snap',   // easing of the lerp toward the next frame (default linear)
 *   smear: { from, to, a, r, fade },                // weapon smear arc (root-space degrees) drawn by rig.js; alpha fades toward the next frame
 *   face: 'angry'|'hurt'|...                        // facial expression override for this frame (see poses.js FACE)
 * } ] } }.
 * `pose` is a fully populated, interpolated pose object reused every tick (never keep references across frames).
 * `events` accumulates { type: 'event'|'sfx'|'fx', name, value, frameIndex } entries as frames are entered; the owner
 * reads and clears it (`events.length = 0`) each step.
 */
export class AnimPlayer {
  /** @param {object} anims animation table */
  constructor(anims = {}) {
    this.anims = anims;
    this.name = null;
    this.def = null;
    this.frameIndex = 0;
    this.frameTime = 0;
    this.time = 0;
    this.done = false;
    this.speed = 1;
    /** True on the tick a new frame was entered (also right after play()). Use for `once` hitboxes. */
    this.newFrame = false;
    /** Increments every time an attack-like animation (re)starts; used as the hit-instance id. */
    this.instance = 0;
    this.events = [];
    this.pose = markFull(makePose());
    /** Optional table consulted before `anims` (a held pickup weapon's attack1..N; game/weapons.js). */
    this.overlay = null;
  }
  /** Install (or clear with `null`/falsy) the overlay table; see `tableFor`. */
  setOverlay(table) { this.overlay = table || null; }
  /** The table `name` should resolve from: the overlay if it defines `name`, else the base `anims`. */
  tableFor(name) { return this.overlay && this.overlay[name] ? this.overlay : this.anims; }
  /** Current frame object (or a static empty frame). */
  get frame() { return this.def ? this.def.frames[this.frameIndex] || EMPTY : EMPTY; }
  /** Convenience: current frame's hitbox / move / cancel fields. */
  get hitbox() { return this.frame.hitbox || null; }
  get move() { return this.frame.move || null; }
  get cancel() { return this.frame.cancel || null; }
  /** Total frames (steps) in the current animation. */
  get length() { if (!this.def) return 0; let n = 0; for (const f of this.def.frames) n += f.dur || 1; return n; }
  /** True if `name` exists in the table. */
  has(name) { const t = this.tableFor(name); return !!(t && t[name] && t[name].frames && t[name].frames.length); }
  /**
   * Play an animation. Falls back to `fallback` (or idle) when missing. Restarting the same anim requires restart=true.
   * @returns {boolean} true if the animation is (now) playing
   */
  play(name, { restart = false, fallback = 'idle', speed = 1 } = {}) {
    let n = name;
    if (!this.has(n)) n = this.has(fallback) ? fallback : null;
    if (n === null) { this.name = null; this.def = null; this.done = true; return false; }
    if (n === this.name && !restart) return true;
    this.name = n;
    this.def = this.tableFor(n)[n];
    this.frameIndex = 0;
    this.frameTime = 0;
    this.time = 0;
    this.done = false;
    this.speed = speed;
    this.instance++;
    this.newFrame = true;
    this._emitFrameEvents();
    this._updatePose();
    return true;
  }
  /** Advance one fixed step. */
  tick() {
    this.newFrame = false;
    if (!this.def) return;
    const frames = this.def.frames;
    if (this.done) { this._updatePose(); return; }
    this.time += this.speed;
    this.frameTime += this.speed;
    let guard = 0;
    while (this.frameTime >= (frames[this.frameIndex].dur || 1) && guard++ < 64) {
      this.frameTime -= frames[this.frameIndex].dur || 1;
      if (this.frameIndex + 1 < frames.length) { this.frameIndex++; this.newFrame = true; this._emitFrameEvents(); }
      else if (this.def.loop) { this.frameIndex = 0; this.newFrame = true; this._emitFrameEvents(); }
      else { this.done = true; this.frameTime = (frames[this.frameIndex].dur || 1) - 0.0001; break; }
    }
    this._updatePose();
  }
  /** Progress through the current animation in [0,1]. */
  get progress() { const L = this.length; return L ? Math.min(1, this.time / L) : 1; }
  /** Set the pose to a static (partial) pose without an animation table entry. */
  setStaticPose(pose) { this.name = null; this.def = null; this.done = true; copyPose(pose, this.pose, true); }
  _emitFrameEvents() {
    const f = this.frame;
    if (f.sfx) this.events.push({ type: 'sfx', name: f.sfx, value: f.sfx, frameIndex: this.frameIndex });
    if (f.fx) for (const fx of f.fx) this.events.push({ type: 'fx', name: fx.kind, value: fx, frameIndex: this.frameIndex });
    if (f.event) this.events.push({ type: 'event', name: f.event, value: f.event, frameIndex: this.frameIndex });
  }
  _updatePose() {
    const frames = this.def.frames, f = frames[this.frameIndex];
    const interp = f.interp !== false && !this.done;
    let next = f;
    if (interp) next = this.frameIndex + 1 < frames.length ? frames[this.frameIndex + 1] : (this.def.loop ? frames[0] : f);
    let t = interp ? Math.min(1, this.frameTime / (f.dur || 1)) : 0;
    if (f.ease) t = ease(f.ease, t);
    const pose = lerpPose(f.pose, next.pose, t, this.pose);
    // frame-level overrides (authoring convenience): smear arc and facial expression live on the frame, not the pose
    if (f.face != null) pose.face = faceIndex(f.face);
    const sm = f.smear;
    if (sm) {
      const ps = pose.smear;
      ps.from = sm.from || 0; ps.to = sm.to || 0; ps.r = sm.r || 0;
      const a0 = sm.a != null ? sm.a : 0.45, a1 = next !== f && next.smear ? (next.smear.a != null ? next.smear.a : 0.45) : 0;
      ps.a = sm.fade === false ? a0 : a0 + (a1 - a0) * t;
    }
  }
}

/** Helper for authoring: build a frame list from [dur, pose, extra] tuples. */
export function frames(list) {
  return list.map(([dur, pose, extra]) => ({ dur, pose, ...(extra || {}) }));
}

// ---------- frame data (training room: screens/training.js frame-data readout) ----------
const ACTIVE_EVENTS = new Set(['spawnProjectile', 'shockwave', 'area', 'grapple']);
const EMPTY_TIMING = Object.freeze({ startup: 0, active: 0, recovery: 0, total: 0 });
const TIMING = new WeakMap();
/** True for a frame that can connect: a hitbox, an area, a spawn, or an event that spawns one. */
export function isActiveFrame(f) { return !!(f.hitbox || f.hitboxes || f.area || f.spawn || f.projectile || f.hit || ACTIVE_EVENTS.has(f.event)); }
/** Startup / active / recovery frame counts of one anim def (cached per def; a frame with no dur counts 1, like tick()). */
export function animTiming(def) {
  if (!def || !def.frames || !def.frames.length) return EMPTY_TIMING;
  const cached = TIMING.get(def);
  if (cached) return cached;
  let first = -1, last = -1, total = 0;
  for (let i = 0; i < def.frames.length; i++) {
    const f = def.frames[i], dur = f.dur || 1;
    total += dur;
    if (isActiveFrame(f)) { if (first < 0) first = i; last = i; }
  }
  let out;
  if (first < 0) out = Object.freeze({ startup: total, active: 0, recovery: 0, total });
  else {
    let startup = 0, active = 0, recovery = 0;
    for (let i = 0; i < def.frames.length; i++) {
      const dur = def.frames[i].dur || 1;
      if (i < first) startup += dur; else if (i <= last) active += dur; else recovery += dur;
    }
    out = Object.freeze({ startup, active, recovery, total });
  }
  TIMING.set(def, out);
  return out;
}
