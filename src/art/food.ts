// Food and ingredient glyphs, one function per INGREDIENTS icon id (content/recipes.js), drawn in the rig style:
// 1 px ink outline, base + shadow band, a 2 px highlight on the big ones. Every place an apple appears - falling in
// the orchard, on the HUD ticket, in a paw, on the chopping board - calls the same function at a different `s`, so
// the player learns each shape once. Origin is the item's centre; `s` is its half-size in px (8 = a 16 px apple).
import { pathRR } from '../lib/art/shading.ts';

const INK = '#2A1F1A';
const R = Math.round;
function shadeOf(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const c = (v) => Math.max(0, Math.min(255, R(v))).toString(16).padStart(2, '0');
  return f < 1 ? '#' + c(r * f) + c(g * (f + 0.03)) + c(b * (f + 0.12) + 8) : '#' + c(r * f + 14) + c(g * f + 6) + c(b * (f - 0.08));
}
const cache = new Map();
/** Cached 3-tone ramp for a hex colour. */
export function foodTones(hex) {
  let t = cache.get(hex);
  if (!t) { t = { base: hex, hi: shadeOf(hex, 1.22), sh: shadeOf(hex, 0.66) }; cache.set(hex, t); }
  return t;
}
function ball(ctx, cx, cy, r, hex, hi = true) {
  const t = foodTones(hex);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = t.base; ctx.fill();
  if (r >= 4) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = t.sh; ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.3, r * 0.85, 0, Math.PI * 2); ctx.fill();
    if (hi && r >= 6) { ctx.fillStyle = t.hi; ctx.fillRect(R(cx - r * 0.45) - 1, R(cy - r * 0.45) - 1, 2, 2); }
    ctx.restore();
  }
}

export const FOOD = {
  apple(ctx, cx, cy, s, hex = '#D9463B') {
    ball(ctx, cx, cy + s * 0.08, s * 0.92, hex);
    ctx.fillStyle = INK; ctx.fillRect(R(cx - 1), R(cy - s * 0.95), 2, R(s * 0.45));           // stem
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx + 1), R(cy - s * 0.85), R(s * 0.45), R(s * 0.28)); // leaf
  },
  egg(ctx, cx, cy, s, hex = '#F7EAD0') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.7, s, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.beginPath(); ctx.ellipse(cx + s * 0.25, cy + s * 0.3, s * 0.65, s * 0.95, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  },
  fish(ctx, cx, cy, s, hex = '#7FA7C4') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx - s * 0.15, cy, s * 0.75, s * 0.42, 0, 0, Math.PI * 2);
    ctx.moveTo(cx + s * 0.5, cy); ctx.lineTo(cx + s, cy - s * 0.42); ctx.lineTo(cx + s, cy + s * 0.42); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.05), R(s * 2), R(s)); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.15), 2, 2);   // eye
  },
  milk(ctx, cx, cy, s, hex = '#FFFFFF') {
    const t = foodTones('#E8EEF2');
    pathRR(ctx, R(cx - s * 0.5), R(cy - s), R(s), R(s * 2), 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = hex; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.1), R(cy - s * 0.4), R(s * 0.4), R(s * 1.4));
    ctx.fillStyle = '#4A8FD6'; ctx.fillRect(R(cx - s * 0.5) + 1, R(cy - s * 0.1), R(s) - 2, R(s * 0.3));
  },
  sack(ctx, cx, cy, s, hex = '#EBDCC0') {
    const t = foodTones(hex);
    pathRR(ctx, R(cx - s * 0.8), R(cy - s * 0.6), R(s * 1.6), R(s * 1.6), R(s * 0.4)); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.8) + 1, R(cy + s * 0.4), R(s * 1.6) - 2, R(s * 0.6) - 1);
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.35), R(cy - s), R(s * 0.7), R(s * 0.45));   // tied neck
  },
  jar(ctx, cx, cy, s, hex = '#F2A83B') {
    const t = foodTones(hex);
    pathRR(ctx, R(cx - s * 0.6), R(cy - s * 0.5), R(s * 1.2), R(s * 1.5), 3); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.1), R(cy - s * 0.4), R(s * 0.45), R(s * 1.3));
    ctx.fillStyle = '#9A6234'; ctx.fillRect(R(cx - s * 0.7), R(cy - s), R(s * 1.4), R(s * 0.5));   // lid
  },
  carrot(ctx, cx, cy, s, hex = '#F08A2E') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx, cy + s); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx), R(cy - s), R(s), R(s * 2)); ctx.restore();
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.3), R(cy - s), R(s * 0.6), R(s * 0.5));
  },
};

/** Draw an ingredient by icon id; unknown ids get a plain ball. */
export function drawFood(ctx, icon, cx, cy, s, hex?) {
  const f = FOOD[icon];
  if (f) f(ctx, cx, cy, s, hex); else ball(ctx, cx, cy, s, hex || '#C8C0B0');
}
