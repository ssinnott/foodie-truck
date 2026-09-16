// Offscreen layer helpers for backdrops (docs/ARCHITECTURE.md section 4, docs/ART_STYLE.md section 7).
// Convention, inherited from the sibling game: a scene is painted ONCE into a few offscreen canvases with a
// seeded rng (so the art is identical on every machine and every reload), blitted per frame at integer
// offsets with a parallax factor, and only cheap things (a windmill, water sparkle, smoke, birds) draw on
// top per frame. Gradients are allowed HERE, in the pre-render, never in a per-frame draw.
import { VIEW_W, VIEW_H } from '../constants.js';
import { makeRng } from '../engine/rng.js';

/** Parallax factors: what fraction of the camera a layer moves by. */
export const PARALLAX = Object.freeze({ sky: 0, far: 0.2, mid: 0.5, ground: 1, near: 1.2 });
/** Extra rows/cols painted around a layer so a camera shake or a sub-tile offset never reveals a gap. */
export const BLEED = 16;
/** Outline colour for backdrop objects: the rig ink, so props and critters share one line weight and tone. */
export const INK = '#2A1F1A';

/** Create an offscreen canvas. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Pre-render a layer once. `paint(g, w, h, rnd)` draws into the layer; `rnd()` is a seeded random in [0,1).
 * @returns {{canvas: HTMLCanvasElement, w: number, h: number}}
 */
export function makeLayer(w, h, paint, seed = 1) {
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  paint(g, canvas.width, canvas.height, makeRng(seed).next);
  return { canvas, w: canvas.width, h: canvas.height };
}

/** Blit a layer tiled horizontally across the screen. `originX` = screen x where layer x 0 lands. */
export function blitTiled(ctx, L, originX, y) {
  const w = L.w;
  let x = ((Math.round(originX) % w) + w) % w - w;
  const yy = Math.round(y);
  for (; x < VIEW_W; x += w) ctx.drawImage(L.canvas, x, yy);
}
/** Blit a layer once at an integer position (the canvas clips whatever is off screen). */
export function blitAt(ctx, L, x, y) { ctx.drawImage(L.canvas, Math.round(x), Math.round(y)); }
/**
 * Blit the part of a large layer that a camera at (camX, camY) can see. Layer x 0 is world x `worldX0`.
 * Used by the world map, whose ground is one big pre-rendered sheet rather than a tile.
 */
export function blitWorld(ctx, L, camX, camY, worldX0 = 0, worldY0 = 0, f = 1) {
  const sx = Math.round(camX * f - worldX0), sy = Math.round(camY * f - worldY0);
  const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
  const w = Math.min(L.w - x0, VIEW_W - (x0 - sx)), h = Math.min(L.h - y0, VIEW_H - (y0 - sy));
  if (w > 0 && h > 0) ctx.drawImage(L.canvas, x0, y0, w, h, x0 - sx, y0 - sy, w, h);
}

/** Vertical gradient fill (pre-render only: allocates a gradient). */
export function vGradient(g, x, y, w, h, stops) {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
}
/** Radial glow fill (pre-render only). */
export function radialGlow(g, cx, cy, r, inner, outer = 'rgba(0,0,0,0)') {
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
}
/** Pre-render a soft glow sprite so a per-frame glow is a single drawImage. */
export function makeGlowSprite(r, inner, mid = null) {
  return makeLayer(r * 2, r * 2, (g) => {
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, inner);
    if (mid) grad.addColorStop(0.45, mid);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
  });
}

/** Outlined rectangle: `lw` px ink border outside the fill (the chunky backdrop look; rigs use 1 px). */
export function boxOutlined(g, x, y, w, h, fill, ink = INK, lw = 1) {
  g.fillStyle = ink;
  g.fillRect(x - lw, y - lw, w + lw * 2, h + lw * 2);
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}
/** Outlined rectangle with a darker lower band (the one-shadow-band rule for backdrop blocks). */
export function boxShaded(g, x, y, w, h, fill, shade, ink = INK, lw = 1, band = 0.4) {
  boxOutlined(g, x, y, w, h, fill, ink, lw);
  const bh = Math.floor(h * band);
  g.fillStyle = shade;
  g.fillRect(x, y + h - bh, w, bh);
}
/** Outlined disc with a shadow crescent away from the top-left light (a tree crown, a bush, a hay bale end). */
export function discShaded(g, cx, cy, r, fill, shade, ink = INK, lw = 1) {
  g.fillStyle = ink; g.beginPath(); g.arc(cx, cy, r + lw, 0, Math.PI * 2); g.fill();
  g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = shade; g.beginPath(); g.arc(cx + r * 0.28, cy + r * 0.28, r * 0.85, 0, Math.PI * 2); g.fill();
  g.restore();
}
/** Outlined polygon (flat [x0,y0,...] list). */
export function polyOutlined(g, pts, fill, ink = INK, lw = 1) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (ink && lw) { g.strokeStyle = ink; g.lineWidth = lw * 2; g.lineJoin = 'round'; g.stroke(); }
  g.fillStyle = fill; g.fill();
}

/** Simple particle pool backed by typed arrays (no per-frame allocation). */
export function makePool(n) {
  return { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), life: new Float32Array(n), seed: new Float32Array(n) };
}
/** Frame-based pulse in 0..1 with period `period` frames (0 at frame 0, peak mid-period). */
export function pulse(frame, period) { return 0.5 - 0.5 * Math.cos((frame % period) / period * Math.PI * 2); }

export { VIEW_W, VIEW_H };
