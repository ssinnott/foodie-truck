// The millpond's backdrop (docs/ART_STYLE.md section 1 "Pond", section 7; docs/GDD.md section 5): golden hour, side
// view. Four layers painted ONCE with the pond's seed block (110..119) and blitted at integer offsets by the screen:
//   far    sky gradient, a low sun disc, two hill tiers              (rows 0..200)
//   mid    the plum tree-line behind the critters, its foot strip     (rows 112..200)
//   ground the near bank, the lip, the boardwalk the crew stands on, the water, ripples, lily pads (200..360)
//   near   reed clumps in both bottom corners and a turf edge along the bottom (300..360)
// There is no camera on the pond, so every blit lands at offset 0. The per-frame marks on the water are all
// index-hashed twinkles at positions this module seeds: the 26 ambient glints (GLINTS) and the 16 brighter, faster
// ones inside the sun's reflection column (SUN_GLINTS), which is painted into the ground layer under SUN_X.
//
// COMPOSITION (round 2, director note 8). The first pass put a short jetty in the left third and the four float
// columns in the right two thirds, so the crew crowded one end and the other two thirds were one flat blue slab.
// The boardwalk now runs in from the left edge and ends at x 596; the four seats sit on it 130 px apart across the
// whole width, and each seat's float lands in its OWN water 80 px to its right and at its own depth, so the marks
// are spread over all 640 px instead of pooled at one end. The reeds are a clump in each bottom corner (they frame
// the water instead of decorating one edge), and the lily pads, ripples and glints are seeded across the full width.
import { makeLayer, vGradient, INK } from '../layers.ts';
import { makeRng } from '../../lib/engine/rng.ts';
import { VIEW_W, PLUM } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The pond's muted constants (six ground tones + the sky). The one saturated colour on the pond is SIGNAL.pond. */
export const POND = Object.freeze({
  skyTop: '#FBE3C4', skyLow: '#F4C9A0', sun: '#FDF0CC', hillFar: '#C9AE9A', hillNear: '#A89C82',
  // `reflection` is the lit edge where the far bank meets the water behind the crew. It used to be #F1E4C8 — the
  // sheep's exact wool hex — painted as one unbroken band right behind four chins, so the cast's heads fused into
  // it (ART_STYLE section 7 wants that plane 25 % off the lightest fur). It is now a value step down and painted
  // in dashes, so it reads as a glinting edge instead of a rule ruled through the faces.
  plum: PLUM.shadow, plumLit: '#6B4A54', plumNear: PLUM.deep, foot: '#4F5A40', reflection: '#C9B79A',
  turf: '#6E7A5A', turfShade: '#5C684C', tuft: '#8A9B4E',
  water: '#4E7A8C', waterShade: '#3D6577', surface: '#6F9FB0', lily: '#7FA36A', lilyShade: '#5F8A50',
  jetty: '#9A6234', jettyDark: '#5E3A1B', reed: '#8A9B4E', reedHead: '#6B4E3A', glint: '#F1E4C8',
});
/** Seed block 110..119 belongs to the pond (ART_STYLE section 7). */
const SEED0 = 110;

/**
 * Row bands (screen y). `feet` is the boardwalk's top plank: GDD section 5 stands the crew on a jetty.
 * The water reads in three value steps below the deck: `shade` (the bank's shadow) -> `surface` (the lit ripple
 * band) -> `deep` (the body of the pond), so the deck's bottom edge is not one hard rule across 640 px.
 */
export const ROWS = Object.freeze({
  sky: 110, trees: 112, bank: 200, lip: 235, feet: 232, water: 237, shade: 246, surface: 260, deep: 268,
  near: 300, edge: 350, bottom: 360,
});
/** The gap between two seats on the boardwalk, and how far right of its seat a float lands. */
export const SEAT_PITCH = 130, FLOAT_DX = 80;
/** Where each seat stands (x of the feet centre) and the float column it owns; both in seat order, left to right. */
export const SEAT_X = Object.freeze([90, 220, 350, 480]);
export const FLOAT_X = Object.freeze(SEAT_X.map((x) => x + FLOAT_DX));
/**
 * Each seat's float rests at its own depth as well as its own column, so no two floats share a patch of water and
 * the four tags never line up into a row. All four clear the deck's bottom edge by more than the tag's 20 px.
 */
export const FLOAT_Y = Object.freeze([278, 302, 286, 310]);
/**
 * The boardwalk the crew fishes from (GDD section 5 "fixed standing spots on a jetty"): in from the left edge and
 * ending at x 596, rows 232..246, so it runs along the bank's lip and juts 9 rows out over the water with open
 * water and reeds beyond its end. Every seat in SEAT_X stands on it with its feet on ROWS.feet, which puts the
 * contact shadows on planks instead of in the pond.
 */
const JETTY = Object.freeze({ x: -6, y: ROWS.feet, w: 602, h: 14, post: 72 });
/** Half-width of a float column that ripples and lily pads keep out of. */
const COLUMN_HALF = 18;
function inColumn(x, w) { for (let i = 0; i < FLOAT_X.length; i++) if (x + w > FLOAT_X[i] - COLUMN_HALF && x < FLOAT_X[i] + COLUMN_HALF) return true; return false; }

/** 26 glint positions on the deep water (screen coords), seeded so every machine twinkles the same pixels. */
export const GLINTS = (() => {
  const r = makeRng(SEED0 + 5), out = [];
  for (let i = 0; i < 26; i++) out.push([r.int(14, VIEW_W - 26), r.int(ROWS.deep + 6, ROWS.edge - 14)]);
  return out;
})();
/**
 * The sun disc and the water it lands on. The first pass hung a big pale sun over the tree-line and then painted
 * the pond as one flat slab under it: the scene the game names after golden hour never put the gold on the water.
 * `SUN_X` anchors both the disc and a reflection column dropped straight down from it in `paintGround`, widening
 * toward the near edge the way a glitter path does.
 */
export const SUN_X = 508, SUN_Y = 78, SUN_R = 15;
/** Where the column's dashes sit and how wide it is at row `y` (half-width, 0 at the far edge). */
const SUN_TOP = ROWS.shade + 2, SUN_BOT = ROWS.edge - 6;
function sunHalf(y) { return 3 + R((y - SUN_TOP) / (SUN_BOT - SUN_TOP) * 17); }
/**
 * 16 twinkle positions INSIDE the reflection column (screen coords + width), drawn brighter and on a faster beat
 * than GLINTS by the screen: the column is where the water is actually catching the light, so that is where it
 * moves. Seeded from the pond's own block, so every machine twinkles the same pixels.
 */
export const SUN_GLINTS = (() => {
  const r = makeRng(SEED0 + 6), out = [];
  for (let i = 0; i < 16; i++) {
    const y = r.int(SUN_TOP + 6, SUN_BOT - 4), h = sunHalf(y), w = r.int(3, 7);
    out.push([SUN_X + r.int(-h, h - w), y, w]);
  }
  return out;
})();

/** One inked ellipse: the 2 px line of a big backdrop block (ART_STYLE section 3). */
function inkEllipse(g, cx, cy, rx, ry, fill, lw = 2) {
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.strokeStyle = INK; g.lineWidth = lw * 2; g.stroke();
  g.fillStyle = fill; g.fill();
}

function paintFar(g, w, h, rnd, P, sea) {
  vGradient(g, 0, 0, w, ROWS.sky, [[0, P.skyTop], [1, P.skyLow]]);
  g.fillStyle = P.skyLow; g.fillRect(0, ROWS.sky, w, h - ROWS.sky);
  // the low sun: a pale disc with the scene's 1 px ink, sitting just above the tree-line
  g.beginPath(); g.arc(SUN_X, SUN_Y, SUN_R, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = P.sun; g.fill();
  if (sea) {
    // the cove: open sea to the horizon in place of the hills - a flat band with its 2 px ink edge, a lit line
    // where the sun's column meets it, and one headland at the left so the horizon is not a bare rule
    g.fillStyle = INK; g.fillRect(0, 146, w, 2);
    g.fillStyle = P.hillFar; g.fillRect(0, 148, w, 176 - 148);
    g.fillStyle = P.glint; for (let x2 = 0; x2 < w; x2 += 9) if ((x2 / 9) & 1) g.fillRect(x2, 149, 5, 1);
    inkEllipse(g, 40, 168, 150, 46, P.hillNear);
    g.fillStyle = P.hillNear; g.fillRect(0, 176, w, h - 176);
    return;
  }
  // two hill tiers: the far one dusty rose, the near one olive-tan, both cresting where the tree-line dips
  inkEllipse(g, 150, 150, 260, 62, P.hillFar); inkEllipse(g, 560, 156, 300, 68, P.hillFar);
  inkEllipse(g, 330, 178, 250, 74, P.hillNear); inkEllipse(g, 40, 176, 160, 66, P.hillNear);
  g.fillStyle = P.hillNear; g.fillRect(0, 176, w, h - 176);
}

/**
 * One row of the tree-line's crowns, seeded once: round crowns of mixed size with the odd poplar spire, so the
 * band's top edge is a silhouette rather than a straight run of identical bumps (director note 7).
 */
function makeCrowns(w, rnd, top0, span, rMin, rSpan, spires) {
  const out = [];
  let x = -10;
  while (x < w + 10) {
    const r = rMin + Math.floor(rnd() * rSpan);
    const top = top0 + Math.floor(rnd() * span);
    out.push({ x, r, top, spire: spires && r >= 12 && rnd() < 0.3 ? 12 + Math.floor(rnd() * 14) : 0 });
    x += r * 2 - 4;
  }
  return out;
}
/** Trace a crown row with every crown pushed `dy` down; used twice, so the lit rim follows the silhouette. */
function traceCrowns(g, crowns, w, foot, dy) {
  g.beginPath(); g.moveTo(-10, foot);
  for (let i = 0; i < crowns.length; i++) {
    const c = crowns[i], cx = c.x + c.r, cy = c.top + c.r + dy;
    g.lineTo(c.x, cy);
    if (c.spire) { g.lineTo(cx - 6, cy - c.r); g.lineTo(cx, cy - c.r - c.spire); g.lineTo(cx + 6, cy - c.r); g.lineTo(cx + c.r, cy); }
    else g.arc(cx, cy, c.r, Math.PI, 0);
  }
  g.lineTo(w + 10, foot); g.closePath();
}

/**
 * The plum tree-line. The first pass filled one crown path flat and it read as a 100-row empty maroon mass
 * (director note 7). It is now 22 rows shorter (more sky, less mass) and carries THREE values and TWO silhouettes:
 *   - the far row: mixed crown sizes with poplar spires along its top edge, filled in the lit plum and then again,
 *     shifted 9 px down, in the base plum, which leaves a lit rim hugging every crown;
 *   - a nearer row of smaller crowns in the deep plum, its own inked edge running just above the crew's hats, so
 *     the mass the heads sit against is a step darker again and the band has a middle to look at.
 */
function paintMid(g, w, h, rnd, P, sea) {
  const foot = ROWS.bank - 6;
  // the cove's tree-line is a row of dunes: wider, lower mounds with no spires, in sand instead of plum
  const far = sea ? makeCrowns(w, rnd, ROWS.trees + 30, 10, 22, 16, false) : makeCrowns(w, rnd, ROWS.trees + 4, 16, 8, 15, true);
  traceCrowns(g, far, w, foot, 0);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = P.plumLit; g.fill();
  g.save(); traceCrowns(g, far, w, foot, 0); g.clip();
  traceCrowns(g, far, w, foot + 9, 9); g.fillStyle = P.plum; g.fill();
  g.restore();
  const near = sea ? makeCrowns(w, rnd, ROWS.trees + 52, 8, 18, 12, false) : makeCrowns(w, rnd, ROWS.trees + 34, 14, 9, 9, false);
  traceCrowns(g, near, w, foot, 0);
  g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.fillStyle = P.plumNear; g.fill();
  // The far bank's foot: a dark olive strip (the separator) and, under it, the lit edge in 40..80 px dashes with
  // 20..60 px gaps. Unbroken it was a hard rule across all four jaws; broken it reads as light catching a far edge.
  g.fillStyle = P.foot; g.fillRect(0, foot, w, 6);
  g.fillStyle = P.reflection;
  for (let x2 = -10 - Math.floor(rnd() * 40); x2 < w; ) {
    const run = 40 + Math.floor(rnd() * 41);
    g.fillRect(x2, foot + 4, run, 2);
    x2 += run + 20 + Math.floor(rnd() * 41);
  }
}

/** A clump of inked rushes standing on the bank, roots on `base`, drawn left to right from `x0`. */
function bankRushes(g, rnd, x0, n, base, P) {
  for (let i = 0; i < n; i++) {
    const rx = x0 + i * 6 + R(rnd() * 3), tall = 10 + R(rnd() * 9), lean = i & 1 ? 1 : -1;
    g.fillStyle = INK; g.fillRect(rx - 1, base - tall - 1, 4, tall + 1);
    g.fillStyle = P.tuft; g.fillRect(rx, base - tall, 2, tall);
    g.fillStyle = INK; g.fillRect(rx + lean * 2 - 1, base - tall - 4, 4, 5);
    g.fillStyle = P.reed; g.fillRect(rx + lean * 2, base - tall - 3, 2, 3);
  }
}

function paintGround(g, w, h, rnd, P, sea) {
  const y0 = ROWS.bank;   // this layer is blitted at ROWS.bank
  // the near bank: 2 px ink top edge, a tree-shadow band under the tree-line, turf, tufts, the 2 px ink lip
  g.fillStyle = INK; g.fillRect(0, 0, w, 2);
  g.fillStyle = P.turfShade; g.fillRect(0, 2, w, 10);
  g.fillStyle = P.turf; g.fillRect(0, 12, w, ROWS.lip - y0 - 12);
  g.fillStyle = P.tuft;
  for (let i = 0; i < 46; i++) { const tx = R(rnd() * w), ty = 6 + R(rnd() * 20); g.fillRect(tx, ty, 2, 3); }
  // a rush clump on the bank at each end, where no seat stands: the turf band is 32 rows and was otherwise bare
  bankRushes(g, rnd, 6, 6, ROWS.lip - y0, P);
  bankRushes(g, rnd, 600, 6, ROWS.lip - y0, P);
  g.fillStyle = INK; g.fillRect(0, ROWS.lip - y0, w, ROWS.water - ROWS.lip);
  // the water in three value steps: the lit waterline, the bank's shadow, the lit ripple band, then the body
  g.fillStyle = P.water; g.fillRect(0, ROWS.water - y0, w, h - (ROWS.water - y0));
  g.fillStyle = P.surface; g.fillRect(0, ROWS.water - y0, w, ROWS.shade - ROWS.water);
  g.fillStyle = P.waterShade; g.fillRect(0, ROWS.shade - y0, w, ROWS.surface - ROWS.shade);
  // the lit ripple band beyond the bank's shadow, in 50..110 px dashes: unbroken it was a rule ruled across 640 px
  g.fillStyle = P.surface;
  for (let x2 = -20 - R(rnd() * 40); x2 < w; ) {
    const run = 50 + R(rnd() * 60);
    g.fillRect(x2, ROWS.surface - y0, run, ROWS.deep - ROWS.surface);
    x2 += run + 16 + R(rnd() * 26);
  }
  // The sun's reflection, straight down from the disc at SUN_X: a stack of 2 px cream dashes, narrow at the far
  // edge and widening toward the near one, each with a brighter core and a little jitter so the column is a glitter
  // path and not a ladder. Painted before the pads, the posts and the deck, so all three break it up.
  for (let ry = SUN_TOP; ry < SUN_BOT; ry += 5 + R(rnd() * 3)) {
    const t = (ry - SUN_TOP) / (SUN_BOT - SUN_TOP), half = sunHalf(ry), off = R((rnd() - 0.5) * half);
    const w = half + R(rnd() * half);
    g.globalAlpha = 0.32 + t * 0.28;
    g.fillStyle = P.glint; g.fillRect(SUN_X + off - R(w / 2), ry - y0, w, 2);
    g.globalAlpha = 0.6 + t * 0.35;
    g.fillRect(SUN_X + off - 2, ry - y0, 4 + R(rnd() * 4), 2);
  }
  g.globalAlpha = 1;
  g.fillStyle = P.surface;
  // 14 pre-painted 20x1 ripples across the whole pond, kept off the float columns
  let n = 0, guard = 0;
  while (n < 14 && guard++ < 160) {
    const rx = R(rnd() * (w - 30)), ry = ROWS.deep + 6 + R(rnd() * 66);
    if (inColumn(rx, 20)) continue;
    g.fillRect(rx, ry - y0, 20, 1); n++;
  }
  // the sea has no lily pads: it has foam, cream dashes breaking in the deck's shadow band just under its front
  // edge (the waterline itself is under the planks) and a second, sparser line further out where the swell turns
  if (sea) {
    g.fillStyle = P.glint;
    for (let x2 = -6 - R(rnd() * 12); x2 < w; ) { const run = 8 + R(rnd() * 14); g.fillRect(x2, ROWS.shade - y0 + 5, run, 2); x2 += run + 6 + R(rnd() * 10); }
    for (let x2 = -6 - R(rnd() * 30); x2 < w; ) { const run = 10 + R(rnd() * 20); if (!inColumn(x2, run)) g.fillRect(x2, ROWS.deep - y0 + 30 + R(rnd() * 3), run, 1); x2 += run + 24 + R(rnd() * 40); }
  }
  // five lily pads spread over the full width and off the float columns: an inked disc, a shade crescent, a notch
  const pads = sea ? [] : [[120, 330], [258, 274], [386, 338], [498, 276], [586, 296]];
  for (let i = 0; i < pads.length; i++) {
    const px = pads[i][0], py = pads[i][1] - y0;
    g.beginPath(); g.ellipse(px, py, 7, 5, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = P.lily; g.fill();
    g.save(); g.beginPath(); g.ellipse(px, py, 7, 5, 0, 0, TAU); g.clip(); g.fillStyle = P.lilyShade; g.fillRect(px - 8, py + 1, 16, 5); g.restore();
    g.fillStyle = P.water; g.fillRect(px + 3, py + 1, 2, 5);
  }
  // the boardwalk the crew stands on: posts every JETTY.post px down into the water with a reflection streak under
  // each, then the deck with its lower shade band and a plank seam every 26 px. Painted after the water so the
  // deck's front edge overlaps it; the post rhythm carries the eye the whole way across.
  const J = JETTY, jy = J.y - y0;
  for (let px = J.x + 14; px < J.x + J.w - 8; px += J.post) {
    g.fillStyle = INK; g.fillRect(px - 1, jy + J.h, 6, 15);
    g.fillStyle = P.jettyDark; g.fillRect(px, jy + J.h, 4, 14);
    g.fillRect(px + 1, jy + J.h + 15, 2, 12);
  }
  g.fillStyle = INK; g.fillRect(J.x - 2, jy - 2, J.w + 4, J.h + 4);
  g.fillStyle = P.jetty; g.fillRect(J.x, jy, J.w, J.h);
  g.fillStyle = P.jettyDark; g.fillRect(J.x, jy + J.h - 4, J.w, 4);
  for (let sx = J.x + 26; sx < J.x + J.w; sx += 26) g.fillRect(sx - 1, jy, 2, J.h - 4);
}

/** One clump of reeds rising off the bottom edge; `x0` is its left stem, `n` how many. */
function reedClump(g, rnd, x0, n, bottom, P) {
  for (let i = 0; i < n; i++) {
    const rx = x0 + i * 6 + R(rnd() * 3), top = 2 + R(rnd() * 26);
    g.fillStyle = INK; g.fillRect(rx - 1, top - 1, 4, bottom - top + 1);
    g.fillStyle = P.reed; g.fillRect(rx, top, 2, bottom - top);
    if (i & 1) { g.fillStyle = INK; g.fillRect(rx - 2, top - 4, 6, 8); g.fillStyle = P.reedHead; g.fillRect(rx - 1, top - 3, 4, 6); }
  }
}

/** A reed clump in each bottom corner (they frame the water) and a 10-row turf edge along the bottom. */
function paintNear(g, w, h, rnd, P) {
  const y0 = ROWS.near, bottom = ROWS.edge - y0 + 2;
  g.fillStyle = INK; g.fillRect(0, ROWS.edge - y0, w, 2);
  g.fillStyle = P.turf; g.fillRect(0, ROWS.edge - y0 + 2, w, h);
  reedClump(g, rnd, 2, 5, bottom, P);
  reedClump(g, rnd, 598, 7, bottom, P);
}

/**
 * Cockle Cove's palette: the same painters with the sea in the pond's place. The plum tree-line becomes a row of
 * sand dunes with cream-lit crests, the turf becomes sand with marram grass for tufts and rushes, the water goes a
 * step deeper and greener, and the hills give way to the open sea (paintFar). The sky, the sun and the jetty are
 * the pond's own, so the cove is unmistakably the same hour on a different shore. Seed block shared with the pond:
 * the layout is the same rnd stream, only the colours differ.
 */
export const COVE = Object.freeze({
  skyTop: POND.skyTop, skyLow: POND.skyLow, sun: POND.sun, hillFar: '#5E93A8', hillNear: '#C9B287',
  plum: '#C4AA78', plumLit: '#D9C393', plumNear: '#B09466', foot: '#8E7A55', reflection: '#F1E4C8',
  turf: '#D9C393', turfShade: '#C4AA78', tuft: '#A9B26A',
  water: '#3F7E8E', waterShade: '#2F6577', surface: '#5FA3B0', lily: POND.lily, lilyShade: POND.lilyShade,
  jetty: POND.jetty, jettyDark: POND.jettyDark, reed: '#A9B26A', reedHead: '#C9B287', glint: POND.glint,
});

/** The pre-rendered layers per variant: 'pond' (the millpond) and 'cove' (Cockle Cove, which borrows the screen). */
const layers = { pond: null, cove: null };
/** The four pre-rendered layers, painted on first use: { far, mid, ground, near } with the y each blits at. */
export function pondLayers(variant = 'pond') {
  const key = variant === 'cove' ? 'cove' : 'pond';
  if (layers[key]) return layers[key];
  const P = key === 'cove' ? COVE : POND, sea = key === 'cove';
  layers[key] = {
    far: { L: makeLayer(VIEW_W, ROWS.bank, (g, w, h, rnd) => paintFar(g, w, h, rnd, P, sea), SEED0), y: 0 },
    mid: { L: makeLayer(VIEW_W, ROWS.bank, (g, w, h, rnd) => paintMid(g, w, h, rnd, P, sea), SEED0 + 1), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.bank, (g, w, h, rnd) => paintGround(g, w, h, rnd, P, sea), SEED0 + 2), y: ROWS.bank },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.near, (g, w, h, rnd) => paintNear(g, w, h, rnd, P), SEED0 + 3), y: ROWS.near },
  };
  return layers[key];
}
