// Stateless FX renderers + particle burst helpers (docs/ART_STYLE.md section 7): ground shadows, rings, float text,
// dust, steam, sparkles, crumbs. Ported from the sibling game minus the combat pieces. Screen coords unless noted.
import { particles } from '../engine/particles.ts';
import { pathEllipse } from '../lib/art/shapes.ts';

/** Ground-contact shadow: every sprite draws one before the sorted pass (w*0.5 x w*0.22, alpha 0.4, shrinking with height). */
export function drawShadow(ctx, sx, sy, w = 30, alpha = 0.4, height = 0, color = '#2F2338') {
  const k = Math.max(0.45, 1 - height / 160);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha * k;
  ctx.fillStyle = color;
  pathEllipse(ctx, Math.round(sx), Math.round(sy), w * 0.5 * k, w * 0.22 * k);
  ctx.fill();
  ctx.globalAlpha = prev;
}

/** Expanding ring (a catch, a splash, a bite window). t in [0,1]; `flat` draws it as a floor ellipse. */
export function drawRing(ctx, sx, sy, t, r0 = 4, r1 = 60, color = '#ffffff', width = 3, flat = false) {
  const e = 1 - (1 - t) * (1 - t), r = r0 + (r1 - r0) * e;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * (1 - t));
  ctx.beginPath();
  if (flat) ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, Math.PI * 2); else ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Steam: the only soft mark on a rig or a pot. Three merged discs, no outline, alpha fading with height, rising per
 * tick; `phase` is any counter (rig.tick, scene frame) and `period` the puff cadence. Call per frame; draws nothing
 * between puffs (ART_STYLE section 7 / the sibling's boiler puff).
 */
export function steamPuff(ctx, x, y, phase, period = 20, color = '#EBD9B4', rise = 14) {
  const k = (phase % period) / period;
  const py = y - rise * k, r = 1.5 + 3.5 * k, a = 0.6 - 0.5 * k;
  if (a <= 0.02) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a; ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, py, r, 0, Math.PI * 2); ctx.arc(x - r * 0.7, py + r * 0.4, r * 0.7, 0, Math.PI * 2); ctx.arc(x + r * 0.7, py + r * 0.3, r * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = prev;
}

/** Footstep / landing dust at (x, y) on the ground line. */
export function burstDust(x, y, count = 5, speed = 1.6, screen = false) {
  particles.burst('dust', x, y, count, { speed, up: 0.5, screen });
}
/** Pot / oven steam. */
export function burstSteam(x, y, count = 4, screen = false) {
  particles.burst('steam', x, y, count, { speed: 0.8, up: 1.8, sizeJitter: 1.5, screen });
}
/** Crumbs from a bite (the big hungry one's signature), landing on `floor`. */
export function burstCrumbs(x, y, floor, color = '#F1E4C8', count = 6, screen = false) {
  particles.burst('crumb', x, y, count, { speed: 2.5, up: 2, color, sizeJitter: 1, floor, screen });
}
/** A pickup / success sparkle. */
export function burstSparkle(x, y, count = 5, color = '#FFF6E0', screen = false) {
  particles.burst('sparkle', x, y, count, { speed: 1.4, up: 0.8, color, screen });
}
/** Water droplets from a splash. */
export function burstDrops(x, y, count = 6, screen = false) {
  particles.burst('drop', x, y, count, { speed: 2.4, up: 2.5, screen });
}
/** Floating '+1' / 'PLOP' text rising 12 px over 30 frames. */
export function floatText(x, y, text, color = '#FFF6E0', size = 1, screen = false) {
  particles.spawn('text', x, y, { text, color, size, vy: -0.4, life: 40, screen });
}
/** A ring particle (pooled drawRing) so screens need no per-effect state. */
export function ringAt(x, y, r0, r1, color = '#ffffff', width = 2, life = 14, flat = false, screen = false) {
  particles.spawn('ring', x, y, { size: r0, size1: r1, color, width, life, flat, screen });
}
