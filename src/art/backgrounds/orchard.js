// Pippin Orchard, painted once (docs/ART_STYLE.md section 1 "Orchard", section 7; docs/GDD.md section 5).
//
// Four layers with seeds from the orchard block 100..109, side view, daylight. Row bands are the contract the screen
// stands its critters on: sky 0..SKY_H, the canopy mass above the trunks, grass from GRASS_Y, the play band
// (BAND_TOP..BAND_BOT) kept free of scatter so four rows of feet never stand on a leaf, and the fence rail pinned to
// FENCE_Y..360 in the near layer. Nothing here animates: the petals, the apples, the splats and the critters are the
// screen's per-frame marks. Every canopy is one inked mass (ink pass, fill pass, then caps and crescents clipped per
// blob) so a reader sees one tree-line, not a heap of outlined circles.
import { makeLayer, vGradient, boxShaded, INK, PARALLAX, VIEW_W, VIEW_H } from '../layers.js';
import { mix } from '../palettes.js';
import { PLUM, UI } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;

/** The orchard's muted constants. The one saturated colour in the scene is SIGNAL.orchard, the ripe apple. */
export const ORCHARD = Object.freeze({
  skyTop: '#FBE3C4', skyLow: '#F4C9A0', hill: '#B4A48C', plum: PLUM.shadow,
  grass: '#5E7A3E', tuft: '#6E8A48', canopy: '#4F6B3A', trunk: '#6B4E3A', fence: UI.wood,
  leaf: '#A65A48', straw: '#D9B15E',
  /** A wormy apple: the same glyph in a dull brown, so "not the signal colour" is the whole tell. */
  wormy: '#8A6A3A',
});

/** Row bands (screen y). */
export const SKY_H = 120, GRASS_Y = 220, FENCE_Y = 340;
/** The clean band: no tuft or leaf lands here, so four lanes of feet (292..316) and their shadows stand on plain grass. */
export const BAND_TOP = 284, BAND_BOT = 322;
/** Layers are painted this much wider than the screen on each side so a parallax blit never shows an edge. */
export const BLEED_X = 64;
const LW = VIEW_W + BLEED_X * 2;
const SEED = 100;

/** One canopy blob list: [cx, cy, r, ...] in layer space. */
function crowns(g, list, fill, cap, shade) {
  g.fillStyle = INK;
  for (let i = 0; i < list.length; i += 3) { g.beginPath(); g.arc(list[i], list[i + 1], list[i + 2] + 2, 0, TAU); g.fill(); }
  g.fillStyle = fill;
  for (let i = 0; i < list.length; i += 3) { g.beginPath(); g.arc(list[i], list[i + 1], list[i + 2], 0, TAU); g.fill(); }
  // caps toward the top-left light and one shadow crescent away from it, each clipped inside its own blob
  for (let i = 0; i < list.length; i += 3) {
    const cx = list[i], cy = list[i + 1], r = list[i + 2];
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    g.fillStyle = cap; g.beginPath(); g.arc(cx - r * 0.22, cy - r * 0.26, r * 0.62, 0, TAU); g.fill();
    g.fillStyle = shade; g.beginPath(); g.arc(cx + r * 0.34, cy + r * 0.4, r * 0.8, 0, TAU); g.fill();
    g.fillStyle = fill; g.beginPath(); g.arc(cx - r * 0.1, cy - r * 0.05, r * 0.66, 0, TAU); g.fill();
    g.restore();
  }
}

/** Far: the sky gradient, two hill tiers, and the plum wood the trunks stand against. */
function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, SKY_H, [[0, ORCHARD.skyTop], [1, ORCHARD.skyLow]]);
  const farHill = mix(ORCHARD.hill, ORCHARD.skyLow, 0.5);
  g.fillStyle = farHill;
  for (let x = -40; x < w + 40; x += 110) { g.beginPath(); g.ellipse(x + rnd() * 30, 108, 90, 26 + rnd() * 8, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 106, w, SKY_H - 106);
  g.fillStyle = ORCHARD.hill;
  for (let x = -20; x < w + 40; x += 90) { g.beginPath(); g.ellipse(x + rnd() * 24, 116, 70, 16 + rnd() * 6, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 114, w, SKY_H - 114);
  // the plum tree-line: bumps along the sky's foot, then solid wood down to the grass (the plane behind every head)
  g.fillStyle = ORCHARD.plum;
  for (let x = -10; x < w + 20; x += 22) { const r = 10 + rnd() * 8; g.beginPath(); g.arc(x, SKY_H + 2, r, 0, TAU); g.fill(); }
  g.fillRect(0, SKY_H + 2, w, h - SKY_H - 2);
  // a lighter row of distant canopies inside the wood so it has depth without a second outline
  g.fillStyle = mix(ORCHARD.plum, ORCHARD.canopy, 0.35);
  for (let x = 0; x < w + 30; x += 46) { const r = 16 + rnd() * 10; g.beginPath(); g.arc(x + rnd() * 12, 150 + rnd() * 20, r, 0, TAU); g.fill(); }
}

/** Mid: the lollipop trees. Trunks first (behind), then every canopy as one mass that overlaps into its neighbours. */
function paintMid(g, w, h, rnd) {
  const shade = mix(ORCHARD.canopy, ORCHARD.plum, 0.45), trunkShade = mix(ORCHARD.trunk, ORCHARD.plum, 0.4);
  const blobs = [];
  for (let x = 24; x < w; x += 104 + R(rnd() * 24)) {
    const tx = x + R(rnd() * 16), tw = 12;
    // trunk: one inked block with its shadow band on the right, flaring at the root into the grass line
    g.fillStyle = INK; g.fillRect(tx - tw / 2 - 2, 120, tw + 4, GRASS_Y - 120 + 2);
    g.fillStyle = ORCHARD.trunk; g.fillRect(tx - tw / 2, 122, tw, GRASS_Y - 122 + 2);
    g.fillStyle = trunkShade; g.fillRect(tx + 1, 122, tw / 2 - 1, GRASS_Y - 122 + 2);
    g.fillStyle = INK; g.fillRect(tx - tw / 2 - 5, GRASS_Y - 8, tw + 10, 10);
    g.fillStyle = ORCHARD.trunk; g.fillRect(tx - tw / 2 - 3, GRASS_Y - 6, tw + 6, 8);
    g.fillStyle = trunkShade; g.fillRect(tx + 1, GRASS_Y - 6, tw / 2 + 2, 8);
    // canopy: four or five blobs, big enough that the row closes into one mass whose top edge sits around row 40,
    // so an apple spawning at y 40 drops out of the leaves rather than out of the sky
    const cy = 84 + R(rnd() * 12), n = 4 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.8, d = 20 + rnd() * 10;
      blobs.push(R(tx + Math.cos(a) * d), R(cy + Math.sin(a) * d * 0.7), R(30 + rnd() * 8));
    }
    blobs.push(tx, cy + 6, 38);
  }
  crowns(g, blobs, ORCHARD.canopy, ORCHARD.tuft, shade);
}

/** Ground: grass with the trees' shade at its top edge, tufts and fallen leaves OUTSIDE the clean band. */
function paintGround(g, w, h, rnd) {
  g.fillStyle = ORCHARD.grass; g.fillRect(0, 0, w, h);
  g.fillStyle = mix(ORCHARD.grass, ORCHARD.plum, 0.4); g.fillRect(0, 0, w, 6);
  g.fillStyle = INK; g.fillRect(0, 0, w, 1);
  const top = BAND_TOP - GRASS_Y, bot = BAND_BOT - GRASS_Y;
  for (let i = 0; i < 150; i++) {
    const x = R(rnd() * w), y = 8 + R(rnd() * (h - 12));
    if (y >= top - 3 && y <= bot) continue;
    g.fillStyle = ORCHARD.tuft; g.fillRect(x, y, 2, 3); g.fillRect(x + 3, y + 1, 2, 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = R(rnd() * w), y = 8 + R(rnd() * (h - 12));
    if (y >= top - 3 && y <= bot) continue;
    g.fillStyle = rnd() < 0.5 ? ORCHARD.leaf : ORCHARD.straw; g.fillRect(x, y, 2, 2);
  }
}

/** Near: the open two-rail fence along the bottom rows only. */
function paintFence(g, w, h) {
  const dark = UI.woodDark;
  for (let x = 20; x < w; x += 96) boxShaded(g, x, 0, 8, h, ORCHARD.fence, dark, INK, 1, 0.3);
  boxShaded(g, 0, 3, w, 6, ORCHARD.fence, dark, INK, 1, 0.34);
  boxShaded(g, 0, 12, w, 6, ORCHARD.fence, dark, INK, 1, 0.34);
  for (let x = 20; x < w; x += 96) { g.fillStyle = ORCHARD.fence; g.fillRect(x, 1, 8, h - 3); g.fillStyle = dark; g.fillRect(x + 5, 1, 3, h - 3); }
}

/** Near, top: two canopy edges hanging into the frame at the corners (the centre stays clear for the clock). */
function paintEaves(g, w, h, rnd) {
  const shade = mix(ORCHARD.canopy, ORCHARD.plum, 0.45), blobs = [];
  for (let x = 0; x < 250; x += 34) blobs.push(x + R(rnd() * 8), R(rnd() * 6) - 14, 22 + R(rnd() * 6));
  for (let x = w - 250; x < w; x += 34) blobs.push(x + R(rnd() * 8), R(rnd() * 6) - 14, 22 + R(rnd() * 6));
  crowns(g, blobs, ORCHARD.canopy, ORCHARD.tuft, shade);
}

/**
 * Pre-render every layer once. Returns { far, mid, ground, near, eaves }; each is blitted by the screen at
 * `-BLEED_X - round(cam * f)` for its parallax factor f (PARALLAX.far/mid/ground/near). The scene is one screen wide so
 * the camera never actually moves; the factors are wired so a wider orchard is a one-line change.
 */
export function makeOrchardLayers() {
  return {
    far: makeLayer(LW, GRASS_Y + 8, paintFar, SEED),
    mid: makeLayer(LW, GRASS_Y + 8, paintMid, SEED + 1),
    ground: makeLayer(LW, VIEW_H - GRASS_Y, paintGround, SEED + 2),
    near: makeLayer(LW, VIEW_H - FENCE_Y, paintFence, SEED + 3),
    eaves: makeLayer(LW, 30, paintEaves, SEED + 4),
  };
}

export { PARALLAX };
