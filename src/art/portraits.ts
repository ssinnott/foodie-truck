// Head portraits and busts drawn FROM THE CRITTER RIGS so every HUD face, lobby seat and select card matches the
// sprite in play (docs/ART_STYLE.md section 6). Ported from the sibling game; no bitmaps anywhere.
import { drawRig, computeJoints } from '../lib/art/rig.ts';
import type { DrawPose, Rig } from '../lib/art/rig.ts';
import { makePose } from '../lib/art/poses.ts';
import type { PartialPose } from '../lib/art/poses.ts';
import type { AnimSet } from '../lib/art/animation.ts';

/**
 * The head anchor of one rig in one pose, cached on the rig itself, merged into the library's `Rig` the way
 * game/minigame.ts merges the basket's fields rather than restating them in a wrapper type: this file both writes
 * and reads it on a plain rig, and a type only half the file knew about would be no type at all. OPTIONAL,
 * because lib/art/rig.ts buildRig builds a complete `Rig` literal without it.
 */
declare module '../lib/art/rig.ts' {
  interface Rig {
    /** The last anchor `anchor()` solved for this rig; valid only for the pose object it was solved from. */
    _portraitAnchor?: PortraitAnchor;
  }
}

/** What `idlePoseOf` reads off a cast entry: game/game.ts's CritterDef and the customers both satisfy it. */
export interface PortraitSource {
  /** The animation table (content/critters/common.ts makeCritterAnims). */
  anims: AnimSet;
}

/** Where a rig's head sits in root space for one pose: what the framing below is solved from, cached per pose. */
export interface PortraitAnchor {
  /** The pose object this was solved from; the cache is live only while the very same object comes back. */
  pose: PartialPose | null;
  /** Head centre x in root space (the solved joint plus pose.root). */
  headX: number;
  /** Head centre y in root space. */
  headY: number;
  /** Top of the silhouette in root space, with the headroom for ears and hats already taken off. */
  top: number;
  /** The rig's head radius (rig.p.headR), which sets how much of a portrait square the head fills. */
  headR: number;
}

/** The options of `drawHeadPortrait` (`o`). */
export interface HeadPortraitOpts {
  /** 1 = facing right (default), -1 = facing left. */
  facing?: number;
  /** The window behind the head; `null` draws none, absent draws the default cream. */
  bg?: string | null;
  /** Hit flash: the head in white. */
  flash?: boolean;
  /** Tint colour composited over the head. */
  tint?: string | null;
  /** Tint strength (drawRig's own default when absent). */
  tintAlpha?: number;
  /** How much of the square the head fills (default 0.7). */
  fill?: number;
  /** The head centre's height down the square, 0..1 (default 0.54). */
  cy?: number;
}

/** The options of `drawBust` (`o`). */
export interface BustOpts {
  /** 1 = facing right (default), -1 = facing left. */
  facing?: number;
  /** Rows of headroom above the crown inside the box (default 12). */
  margin?: number;
  /** Tint colour composited over the bust. */
  tint?: string | null;
  /** Tint strength (drawRig's own default when absent). */
  tintAlpha?: number;
  /** true skips the secondary-motion step. */
  still?: boolean;
  /** Hit flash: the bust in white. */
  flash?: boolean;
}

/** First idle keyframe pose of a critter def (partial pose), or null. */
export function idlePoseOf(def: PortraitSource): PartialPose | null {
  const a = def && def.anims && def.anims.idle;
  return a && a.frames && a.frames[0] ? a.frames[0].pose : null;
}

/** Root-space head centre / head top of a rig in a (partial) pose. Cached on the rig per pose object. */
function anchor(rig: Rig, pose: PartialPose | null): PortraitAnchor {
  const c = rig._portraitAnchor;
  if (c && c.pose === pose) return c;
  const full = makePose(pose);
  const J = computeJoints(rig, full);
  // `top` allows for ears and hats: a critter's silhouette reaches ~0.5 headR above the skull (content/critters/common.js EAR_*).
  const a = { pose, headX: J.head.x + full.root.x, headY: J.head.y + full.root.y, top: J.top + full.root.y - Math.round(rig.p.headR * 0.5), headR: rig.p.headR };
  rig._portraitAnchor = a;
  return a;
}

/**
 * Head-and-shoulders portrait clipped to a `size` square (HUD 24px, ticket 32px, results 64px).
 * @param {{ facing?: number, bg?: string|null, flash?: boolean, tint?: string|null, tintAlpha?: number, fill?: number, cy?: number }} [o]
 */
export function drawHeadPortrait(ctx: CanvasRenderingContext2D, rig: Rig, pose: DrawPose, x: number, y: number, size: number, o: HeadPortraitOpts = {}): void {
  const facing = o.facing || 1, a = anchor(rig, pose);
  const sc = (size * (o.fill || 0.7)) / (a.headR * 2 * rig.scale);
  const fs = facing * sc * rig.scale, ss = sc * rig.scale;
  const cx = x + size / 2, cy = y + size * (o.cy != null ? o.cy : 0.54);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  if (o.bg !== null) { ctx.fillStyle = o.bg || '#f7e9c9'; ctx.fillRect(x, y, size, size); }
  drawRig(ctx, rig, pose, { x: cx - a.headX * fs, y: cy - a.headY * ss, facing, scale: sc, still: true, flash: !!o.flash, tint: o.tint || null, tintAlpha: o.tintAlpha });
  ctx.restore();
}

/**
 * Bust for a select card / lobby seat: the rig at `scale` clipped to (x, y, w, h) with the head near the top.
 * `anchorPose` (default: the drawn pose) fixes the feet so an animated pose does not bob the framing.
 * @param {{ facing?: number, margin?: number, tint?: string|null, tintAlpha?: number, still?: boolean, flash?: boolean }} [o]
 */
export function drawBust(ctx: CanvasRenderingContext2D, rig: Rig, pose: DrawPose, anchorPose: PartialPose | null, x: number, y: number, w: number, h: number, scale: number, o: BustOpts = {}): void {
  const facing = o.facing || 1, a = anchor(rig, anchorPose || pose), ss = scale * rig.scale;
  const margin = o.margin != null ? o.margin : 12;
  const feetY = y + margin - a.top * ss;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  drawRig(ctx, rig, pose, { x: x + w / 2 - a.headX * facing * ss, y: feetY, facing, scale, still: !!o.still, flash: !!o.flash, tint: o.tint || null, tintAlpha: o.tintAlpha });
  ctx.restore();
}
