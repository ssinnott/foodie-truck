// Head portraits and busts drawn FROM THE CRITTER RIGS so every HUD face, lobby seat and select card matches the
// sprite in play (docs/ART_STYLE.md section 6). Ported from the sibling game; no bitmaps anywhere.
import { drawRig, computeJoints } from './rig.js';
import { makePose } from './poses.js';

/** First idle keyframe pose of a critter def (partial pose), or null. */
export function idlePoseOf(def) {
  const a = def && def.anims && def.anims.idle;
  return a && a.frames && a.frames[0] ? a.frames[0].pose : null;
}

/** Root-space head centre / head top of a rig in a (partial) pose. Cached on the rig per pose object. */
function anchor(rig, pose) {
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
export function drawHeadPortrait(ctx, rig, pose, x, y, size, o = {}) {
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
export function drawBust(ctx, rig, pose, anchorPose, x, y, w, h, scale, o = {}) {
  const facing = o.facing || 1, a = anchor(rig, anchorPose || pose), ss = scale * rig.scale;
  const margin = o.margin != null ? o.margin : 12;
  const feetY = y + margin - a.top * ss;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  drawRig(ctx, rig, pose, { x: x + w / 2 - a.headX * facing * ss, y: feetY, facing, scale, still: !!o.still, flash: !!o.flash, tint: o.tint || null, tintAlpha: o.tintAlpha });
  ctx.restore();
}
