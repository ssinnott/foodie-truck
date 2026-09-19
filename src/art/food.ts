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
  // ---- the second pass (docs/GDD.md section 3): same rules, one function per new INGREDIENTS icon ----
  pear(ctx, cx, cy, s, hex = '#B9C24A') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.7, 0, Math.PI * 2); ctx.arc(cx, cy - s * 0.4, s * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.15), R(cy - s), R(s), R(s * 2)); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 2, R(s * 0.35));
  },
  peach(ctx, cx, cy, s, hex = '#F5A66B') {
    ball(ctx, cx, cy + s * 0.05, s * 0.92, hex);
    ctx.fillStyle = foodTones(hex).sh; ctx.fillRect(R(cx - 1), R(cy - s * 0.7), 2, R(s * 0.9));           // the crease
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.5), R(cy - s * 0.95), R(s * 0.5), R(s * 0.28));   // leaf
  },
  avocado(ctx, cx, cy, s, hex = '#5C7A3B') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.72, s, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    if (s >= 4) {
      ctx.fillStyle = '#C9D46A'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.05, s * 0.45, s * 0.72, 0, 0, Math.PI * 2); ctx.fill();   // the cut flesh
      ctx.fillStyle = '#7A4A2A'; ctx.beginPath(); ctx.arc(cx, cy + s * 0.25, s * 0.3, 0, Math.PI * 2); ctx.fill();               // the stone
    }
  },
  butter(ctx, cx, cy, s, hex = '#F5D66B') {
    const t = foodTones(hex);
    pathRR(ctx, R(cx - s * 0.9), R(cy - s * 0.45), R(s * 1.8), R(s * 1.1), 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.9) + 1, R(cy + s * 0.25), R(s * 1.8) - 2, R(s * 0.4) - 1);
    if (s >= 4) { ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.25), R(s * 0.5), 2); }
  },
  rice(ctx, cx, cy, s, hex = '#F7F3E6') {
    const t = foodTones(hex);
    // a bowl with a white mound heaped over its rim: the grain is the ingredient, the bowl is the lid the sack has
    ctx.beginPath(); ctx.moveTo(cx - s * 0.9, cy); ctx.lineTo(cx + s * 0.9, cy); ctx.lineTo(cx + s * 0.6, cy + s * 0.85); ctx.lineTo(cx - s * 0.6, cy + s * 0.85); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = '#4A8FD6'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.1, s * 0.85, s * 0.6, 0, Math.PI, 0); ctx.closePath();
    ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    if (s >= 4) { ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.2), R(cy - s * 0.45), 2, 2); ctx.fillRect(R(cx - s * 0.4), R(cy - s * 0.3), 2, 2); }
  },
  potato(ctx, cx, cy, s, hex = '#C29A5B') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.95, s * 0.7, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.15), R(s * 2), R(s)); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.45), R(cy - s * 0.3), 2, 2); ctx.fillRect(R(cx + s * 0.3), R(cy + s * 0.05), 2, 2);   // the eyes
  },
  onion(ctx, cx, cy, s, hex = '#E7C58C') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx + s * 0.95, cy - s * 0.4, cx + s * 0.8, cy + s * 0.4);
    ctx.quadraticCurveTo(cx, cy + s * 1.15, cx - s * 0.8, cy + s * 0.4); ctx.quadraticCurveTo(cx - s * 0.95, cy - s * 0.4, cx, cy - s); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.25), R(cy - s), 2, R(s * 2)); ctx.fillRect(R(cx - s * 0.35), R(cy - s), 2, R(s * 2)); ctx.restore();
  },
  leek(ctx, cx, cy, s, hex = '#7DB35A') {
    const t = foodTones(hex);
    pathRR(ctx, R(cx - s * 0.35), R(cy - s * 0.2), R(s * 0.7), R(s * 1.2), 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#F1E4C8'; ctx.fill();   // the white
    ctx.beginPath(); ctx.moveTo(cx - s * 0.35, cy - s * 0.1); ctx.lineTo(cx - s * 0.7, cy - s); ctx.lineTo(cx, cy - s * 0.6); ctx.lineTo(cx + s * 0.7, cy - s); ctx.lineTo(cx + s * 0.35, cy - s * 0.1); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.1), R(cy - s * 0.5), 2, R(s * 0.4));
  },
  beetroot(ctx, cx, cy, s, hex = '#8E2F5E') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.75, Math.PI * 1.15, Math.PI * 1.85, true); ctx.lineTo(cx, cy + s * 1.05); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.15), R(cy - s), R(s), R(s * 2.2)); ctx.restore();
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.35), R(cy - s * 1.05), R(s * 0.3), R(s * 0.45)); ctx.fillRect(R(cx + s * 0.05), R(cy - s * 1.1), R(s * 0.3), R(s * 0.5));
  },
  pumpkin(ctx, cx, cy, s, hex = '#D9661F') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.1, s, s * 0.78, 0, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh;
    ctx.fillRect(R(cx - s * 0.4), R(cy - s), 2, R(s * 2.2)); ctx.fillRect(R(cx + s * 0.3), R(cy - s), 2, R(s * 2.2)); ctx.fillRect(R(cx - s), R(cy + s * 0.5), R(s * 2), R(s * 0.6));
    ctx.restore();
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 3, R(s * 0.45));   // the stalk
  },
  cabbage(ctx, cx, cy, s, hex = '#A9C86A') {
    ball(ctx, cx, cy, s * 0.95, hex, false);
    if (s >= 4) {
      const t = foodTones(hex);
      ctx.strokeStyle = t.sh; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx - s * 0.3, cy + s * 0.1, s * 0.5, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();    // the outer leaf's veins
      ctx.beginPath(); ctx.arc(cx + s * 0.25, cy + s * 0.2, s * 0.45, Math.PI * 1.3, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.45) - 1, R(cy - s * 0.45) - 1, 2, 2);
    }
  },
  crab(ctx, cx, cy, s, hex = '#D9603B') {
    const t = foodTones(hex);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    // the legs and the claws go under the shell: two ink strokes a side, and a ball a side
    ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.2); ctx.lineTo(cx - s, cy + s * 0.7); ctx.moveTo(cx + s * 0.5, cy + s * 0.2); ctx.lineTo(cx + s, cy + s * 0.7);
    ctx.moveTo(cx - s * 0.6, cy - s * 0.1); ctx.lineTo(cx - s * 1.05, cy); ctx.moveTo(cx + s * 0.6, cy - s * 0.1); ctx.lineTo(cx + s * 1.05, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - s * 0.85, cy - s * 0.55, s * 0.3, 0, Math.PI * 2); ctx.arc(cx + s * 0.85, cy - s * 0.55, s * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.05, s * 0.72, s * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.25), R(s * 2), R(s)); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.35), R(cy - s * 0.3), 2, 2); ctx.fillRect(R(cx + s * 0.15), R(cy - s * 0.3), 2, 2);   // the eyes
  },
  seaweed(ctx, cx, cy, s, hex = '#3F7A4E') {
    const t = foodTones(hex);
    // three fronds waving up from one holdfast, inked first so the outline reads at the basket's 3.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? INK : t.base; ctx.lineWidth = pass === 0 ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy + s); ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.2, cx - s * 0.55, cy - s * 0.9);
      ctx.moveTo(cx, cy + s); ctx.quadraticCurveTo(cx + s * 0.35, cy, cx + s * 0.05, cy - s);
      ctx.moveTo(cx, cy + s); ctx.quadraticCurveTo(cx + s * 0.95, cy + s * 0.3, cx + s * 0.7, cy - s * 0.7);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.5), 2, 2);
  },
  salt(ctx, cx, cy, s, hex = '#EAF0F2') {
    const t = foodTones(hex);
    // a salt cellar: a squat white pot with a grey cap and three holes
    pathRR(ctx, R(cx - s * 0.55), R(cy - s * 0.35), R(s * 1.1), R(s * 1.35), 3); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.15), R(cy - s * 0.2), R(s * 0.35), R(s * 1.1));
    pathRR(ctx, R(cx - s * 0.65), R(cy - s), R(s * 1.3), R(s * 0.7), 2); ctx.stroke(); ctx.fillStyle = '#8E9AA0'; ctx.fill();
    if (s >= 4) { ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.35), R(cy - s * 0.8), 2, 2); ctx.fillRect(R(cx), R(cy - s * 0.8), 2, 2); ctx.fillRect(R(cx + s * 0.35) - 1, R(cy - s * 0.8), 2, 2); }
  },
  strawberry(ctx, cx, cy, s, hex = '#E8405A') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy - s * 0.4); ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.5, cx, cy + s);
    ctx.quadraticCurveTo(cx + s * 0.9, cy + s * 0.5, cx + s * 0.8, cy - s * 0.4); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.2), R(cy - s), R(s), R(s * 2)); ctx.restore();
    if (s >= 4) { ctx.fillStyle = '#F7EAD0'; ctx.fillRect(R(cx - s * 0.4), R(cy), 2, 2); ctx.fillRect(R(cx + s * 0.1), R(cy + s * 0.35), 2, 2); ctx.fillRect(R(cx + s * 0.3), R(cy - s * 0.15), 2, 2); }
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.75), R(s * 1.2), R(s * 0.35)); ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 2, R(s * 0.4));   // the calyx and stalk
  },
  blueberry(ctx, cx, cy, s, hex = '#4A5BA8') {
    // a cluster of three, so it never reads as one small plum
    ball(ctx, cx - s * 0.45, cy + s * 0.35, s * 0.5, hex, false);
    ball(ctx, cx + s * 0.5, cy + s * 0.25, s * 0.5, hex, false);
    ball(ctx, cx, cy - s * 0.35, s * 0.55, hex, false);
    ctx.fillStyle = INK; ctx.fillRect(R(cx - 1), R(cy - s * 0.5), 2, 2);   // the crown on the top one
  },
  // ---- the third pass (docs/CONTENT_ROADMAP.md section D) ----
  /** Cherries: two on one stem, the stems meeting above. */
  cherry(ctx, cx, cy, s, hex = '#C0273A') {
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(R(cx - s * 0.45), R(cy + s * 0.2)); ctx.lineTo(R(cx), R(cy - s)); ctx.lineTo(R(cx + s * 0.5), R(cy + s * 0.25)); ctx.stroke();
    ball(ctx, cx - s * 0.45, cy + s * 0.45, s * 0.5, hex); ball(ctx, cx + s * 0.5, cy + s * 0.5, s * 0.5, hex);
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx), R(cy - s), R(s * 0.45), 2);   // the leaf at the join
  },
  /** A plum: a dark round with a crease down it and the bloom's shine. */
  plum(ctx, cx, cy, s, hex = '#6B3A7A') {
    ball(ctx, cx, cy + s * 0.05, s * 0.9, hex);
    ctx.fillStyle = foodTones(hex).sh; ctx.fillRect(R(cx - 1), R(cy - s * 0.6), 2, R(s * 0.9));
    ctx.fillStyle = INK; ctx.fillRect(R(cx - 1), R(cy - s * 1.0), 2, R(s * 0.3));
  },
  /** A wedge of cheese, the holes inked. */
  cheese(ctx, cx, cy, s, hex = '#F0C860') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.6); ctx.lineTo(cx + s, cy + s * 0.6); ctx.lineTo(cx + s, cy - s * 0.2); ctx.lineTo(cx - s * 0.2, cy - s * 0.8); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s) + 1, R(cy + s * 0.25), R(s * 2) - 2, R(s * 0.35));
    if (s >= 4) { ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.4), R(cy - s * 0.1), 2, 2); ctx.fillRect(R(cx + s * 0.3), R(cy + s * 0.05), 2, 2); ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.1), R(cy - s * 0.55), 2, 2); }
  },
  /** Oats: the mill's sack with a plain jute band round it. */
  oats(ctx, cx, cy, s, hex = '#D9C39A') {
    FOOD.sack(ctx, cx, cy, s, hex);
    ctx.fillStyle = foodTones(hex).sh; ctx.fillRect(R(cx - s * 0.7), R(cy + s * 0.05), R(s * 1.4), 2);
  },
  /** A tomato: a red round with a green calyx star on top. */
  tomato(ctx, cx, cy, s, hex = '#D8402E') {
    ball(ctx, cx, cy + s * 0.1, s * 0.9, hex);
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.5), R(cy - s * 0.75), R(s), 2); ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 2, R(s * 0.5));
  },
  /** A pea pod: a curved green pod, its peas showing as inked rounds along it. */
  pea(ctx, cx, cy, s, hex = '#7CB342') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.05, s * 0.5, -0.3, 0, Math.PI * 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 1.1), R(cy + s * 0.15), R(s * 2.2), R(s)); ctx.restore();
    ctx.fillStyle = t.hi;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + i * s * 0.5, cy - i * s * 0.15, s * 0.22, 0, Math.PI * 2); ctx.fill(); }
  },
  /** A raspberry: a rounder strawberry made of drupelets, the highlight on three of them. */
  raspberry(ctx, cx, cy, s, hex = '#C4325F') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.85, cy - s * 0.3); ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.6, cx, cy + s * 0.95);
    ctx.quadraticCurveTo(cx + s * 0.9, cy + s * 0.6, cx + s * 0.85, cy - s * 0.3); ctx.quadraticCurveTo(cx, cy - s * 0.7, cx - s * 0.85, cy - s * 0.3); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + s * 0.2), R(cy - s), R(s), R(s * 2)); ctx.restore();
    if (s >= 4) { ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.45), R(cy - s * 0.1), 2, 2); ctx.fillRect(R(cx + s * 0.05), R(cy + s * 0.3), 2, 2); ctx.fillRect(R(cx - s * 0.1), R(cy - s * 0.4), 2, 2); }
    ctx.fillStyle = '#5FA652'; ctx.fillRect(R(cx - s * 0.5), R(cy - s * 0.7), R(s), R(s * 0.3));
  },
  /** A cockle: a ribbed fan of shell, its hinge at the bottom. */
  cockle(ctx, cx, cy, s, hex = '#E0C9A6') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.7); ctx.arc(cx, cy + s * 0.2, s * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.strokeStyle = t.sh; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.6); ctx.lineTo(cx - s * 0.5, cy - s * 0.45); ctx.moveTo(cx, cy + s * 0.6); ctx.lineTo(cx, cy - s * 0.7); ctx.moveTo(cx, cy + s * 0.6); ctx.lineTo(cx + s * 0.5, cy - s * 0.45); ctx.stroke();
    if (s >= 4) { ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.3), R(cy - s * 0.35), 2, 2); }
  },
  // ---- Hazel Holt's nuts ----
  /** A hazelnut: a round nut in a paler cup, the point at the top. */
  hazelnut(ctx, cx, cy, s, hex = '#B07A3A') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.9); ctx.quadraticCurveTo(cx + s * 0.95, cy - s * 0.2, cx + s * 0.7, cy + s * 0.6); ctx.lineTo(cx - s * 0.7, cy + s * 0.6); ctx.quadraticCurveTo(cx - s * 0.95, cy - s * 0.2, cx, cy - s * 0.9); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.75), R(cy + s * 0.2), R(s * 1.5), R(s * 0.4));   // the cup, paler
    if (s >= 4) { ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.3), R(cy - s * 0.4), 2, 2); }
  },
  /** A walnut: a wrinkled round with the seam down the middle. */
  walnut(ctx, cx, cy, s, hex = '#8C6A48') {
    ball(ctx, cx, cy, s * 0.9, hex);
    const t = foodTones(hex);
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - 1), R(cy - s * 0.8), 2, R(s * 1.6));
    if (s >= 4) { ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.2), 2, 2); ctx.fillRect(R(cx + s * 0.35), R(cy + s * 0.2), 2, 2); }
  },
  /** A chestnut: a dark glossy dome with a flat pale base and the tuft at the top. */
  chestnut(ctx, cx, cy, s, hex = '#6E3B2A') {
    const t = foodTones(hex);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.85, cy + s * 0.5); ctx.quadraticCurveTo(cx - s * 0.6, cy - s * 0.9, cx, cy - s * 0.85); ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.9, cx + s * 0.85, cy + s * 0.5); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = t.base; ctx.fill();
    ctx.fillStyle = '#D9C39A'; ctx.fillRect(R(cx - s * 0.7), R(cy + s * 0.2), R(s * 1.4), R(s * 0.3));
    ctx.fillStyle = t.hi; ctx.fillRect(R(cx - s * 0.35), R(cy - s * 0.45), 2, 2);
    ctx.fillStyle = INK; ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 2, 2);
  },
};

/** Draw an ingredient by icon id; unknown ids get a plain ball. */
export function drawFood(ctx, icon, cx, cy, s, hex?) {
  const f = FOOD[icon];
  if (f) f(ctx, cx, cy, s, hex); else ball(ctx, cx, cy, s, hex || '#C8C0B0');
}
