// BRAMBLE BANK, painted once (docs/ART_STYLE.md section 1, section 7; docs/GDD.md section 5). Late afternoon on
// the south lane: a turf bank under a tall hedgerow, the berry bushes standing along its foot, and the trodden path
// the crew picks from. Three layers with seeds from the bank's block 210..219, side view, every one blitted at x 0:
//
//   far     rows   0..190   sky, the downs, the HEDGEROW behind the bank - a tall dark hedge with a five-bar gate
//                           in it and the pick-your-own board hung on the gate post
//   mid     rows 160..250   the BANK: a turf slope with a hazel wattle along its top, tufts and a few daisies, and
//                           the bare earth strip at its foot the bushes stand on (art/brambleProps.js draws the
//                           bushes themselves, because their berries change)
//   ground  rows 250..360   the trodden path (the clean walk band, no scatter), the grass verge in front of it and
//                           the ditch's edge along the bottom of the frame
//
// The camera never moves here - a bank is exactly one frame wide, like the farm's kitchen garden - so the layers are
// VIEW_W across and carry no bleed and no parallax factors. Nothing in here animates: the bushes, the berries, the
// crew and the flying berries are the screen's per-frame marks (game/screens/bramble.js, art/brambleProps.js).
import { makeLayer, vGradient, boxShaded, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM, UI } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The bank's muted constants. The one saturated colour in the scene is SIGNAL.garden, the ripe berry's sparkle
 * (the bank shares the farm's signal, as it shared its screen: gold means "the thing you want"), and it appears
 * NOWHERE in here. The berries' own hexes are absent too: a red fleck painted into a hedge a player is scanning
 * for ripe strawberries is a strawberry that never picks.
 */
export const BRAMBLE = Object.freeze({
  /** The farm's own afternoon: a straw sky over the dusk peach, so the two south-lane scenes share an hour. */
  skyTop: '#E9DCBE', skyLow: '#F4C9A0',
  /** The downs beyond the hedge, the hive's own tone. */
  downs: '#B3AE7E',
  /** The hedgerow: the hive's clipped hedge, darker than the orchard's canopy, so the bushes in front of it can be the lighter green. */
  hedge: '#3F5A34', hedgeLit: '#54703F',
  /**
   * The bank's turf, and the tufts on it. L .53 against Cress's frog green .389 (relDiff .27) and Barley's wool
   * .897 (relDiff .41): the plane behind the crew's heads on the front lane clears the 25 % ladder both ways.
   */
  turf: '#8A9459', turfShade: '#6E7A4A', tuft: '#A9B26A',
  /**
   * The trodden path the crew walks. L .58: Barley's wool .897 (relDiff .35), Sorrel's .878 (.33), Chicory's peat
   * .344 (.41), Cress's .389 (.33) and the dark feet .239 (.59). The farm's path is the precedent and the frog is
   * the binding constraint here too.
   */
  path: '#A8946E',
  /** Bare earth at the bank's foot where the bushes root, and the path's scuffed edges. */
  earth: '#6B5A45',
  /** Dry hazel: the wattle along the bank's top, the gate. */
  hazel: '#B9A47A',
  /** A daisy's petals: the cast's cream, 3 px, never a block. */
  daisy: '#F1E4C8',
  /**
   * The place's own accent from the map (content/places.js `bramble`): the pick-your-own board on the gate post
   * and nowhere else. 21 degrees from P4's raspberry, so it is a 30 px board at row 130, sixty rows clear of the
   * nearest apron, and never a block.
   */
  rose: '#C96B7A',
  plum: PLUM.shadow,
});

/** Seed block 210..219 belongs to Bramble Bank (ART_STYLE section 7). */
const SEED = 210;

/**
 * Row bands (screen y). These are the contract the screen stands its crew and its bushes on:
 *   sky..hedgeTop     the sky and the downs over the hedge
 *   hedgeTop..bankTop the hedgerow, its gate and the board
 *   bankTop..foot     the turf bank; `foot` is the bare strip every bush stands on (BUSH_Y is the bushes' base)
 *   ground            where the layer that carries the floor begins
 *   bandTop..bandBot  the CLEAN WALK BAND: the crew's four lanes and their shadows, no scatter of any kind
 *   verge             the grass verge in front of the path; `ditch` the inked edge along the bottom of the frame
 */
export const ROWS = Object.freeze({
  sky: 96, hedgeTop: 104, bankTop: 190, foot: 244, bushBase: 262, ground: 250,
  bandTop: 282, bandBot: 322, verge: 322, ditch: 350, bottom: VIEW_H,
});
/** Where the six bushes stand along the bank's foot, and how far apart: one every 100 px, in from both edges. */
export const BUSH_X = Object.freeze([70, 170, 270, 370, 470, 570]);
/** The gate in the hedge: right of centre, so the clock ticket (x 254..386) never lands on the board. */
const GATE_X = 470, GATE_W = 56;
/** The mid layer's window: blitted at 160, 90 rows deep, so it reaches the ground layer's top edge exactly. */
const MID_Y = 160, MID_H = ROWS.ground - MID_Y;

// ---------------------------------------------------------------- far: sky, downs, the hedgerow and its gate

/**
 * The five-bar gate in the hedge, hung on two posts, with the pick-your-own board on the left post: a rose plank
 * with three cream stripes for its lettering (a 30 px board cannot carry readable type at 1x and does not need to;
 * a painted board on a gate post says what it says). The gate is the one place the hazel reads at this depth.
 */
function gate(g, x, top, bot) {
  const w = GATE_W, post = mix(BRAMBLE.hazel, BRAMBLE.plum, 0.35);
  boxShaded(g, x - 4, top - 6, 6, bot - top + 6, BRAMBLE.hazel, post, INK, 1, 0.4);
  boxShaded(g, x + w - 2, top - 6, 6, bot - top + 6, BRAMBLE.hazel, post, INK, 1, 0.4);
  for (let i = 0; i < 5; i++) boxShaded(g, x + 2, top + 4 + i * 12, w - 4, 4, BRAMBLE.hazel, post, INK, 1, 0.5);
  boxShaded(g, x + 4, top + 4, 4, 50, BRAMBLE.hazel, post, INK, 1, 0.5);
  boxShaded(g, x + w - 8, top + 4, 4, 50, BRAMBLE.hazel, post, INK, 1, 0.5);
  // the diagonal brace, inked at 2 px like every diagonal in the world (the map's roof rakes set the rule)
  g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + 6, top + 52); g.lineTo(x + w - 6, top + 8); g.stroke();
  g.strokeStyle = BRAMBLE.hazel; g.lineWidth = 3; g.stroke();
  // the board: a rose plank on the left post, hung from a nail, its "lettering" three cream stripes
  boxOutlined(g, x - 18, top - 2, 30, 16, BRAMBLE.rose, INK, 1);
  g.fillStyle = mix(BRAMBLE.rose, BRAMBLE.plum, 0.3); g.fillRect(x - 17, top + 10, 28, 3);
  g.fillStyle = UI.cream; g.fillRect(x - 14, top + 2, 12, 2); g.fillRect(x - 14, top + 6, 20, 2); g.fillRect(x + 1, top + 2, 8, 2);
  g.fillStyle = INK; g.fillRect(x - 4, top - 5, 2, 3);
}

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.sky, [[0, BRAMBLE.skyTop], [1, BRAMBLE.skyLow]]);
  g.fillStyle = BRAMBLE.skyLow; g.fillRect(0, ROWS.sky, w, h - ROWS.sky);
  // the downs: two long low mounds cresting where the hedge dips, flat, no ink at this depth
  g.fillStyle = BRAMBLE.downs;
  g.beginPath(); g.ellipse(180, ROWS.hedgeTop + 22, 260, 34, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(520, ROWS.hedgeTop + 26, 220, 30, 0, 0, TAU); g.fill();
  g.fillRect(0, ROWS.hedgeTop + 22, w, h - ROWS.hedgeTop - 22);
  // THE HEDGEROW: one inked mass whose top edge is a row of clumps of mixed size, filled in the lit hedge tone
  // and then again 8 px lower in the base tone, so a lit rim hugs every clump (the pond's tree-line does the
  // same); the gate cuts a gap in it, and the mass reaches down behind the bank's wattle
  const clumps = [];
  for (let x = -12; x < w + 24; ) { const r = 12 + R(rnd() * 12); clumps.push(x, r, R(rnd() * 8)); x += r * 2 - 6; }
  const trace = (dy) => {
    g.beginPath(); g.moveTo(-20, h);
    for (let i = 0; i < clumps.length; i += 3) { const cx = clumps[i] + clumps[i + 1], cy = ROWS.hedgeTop + 18 + clumps[i + 2] + clumps[i + 1] + dy; g.lineTo(clumps[i], cy); g.arc(cx, cy, clumps[i + 1], Math.PI, 0); }
    g.lineTo(w + 20, h); g.closePath();
  };
  trace(0); g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fillStyle = BRAMBLE.hedgeLit; g.fill();
  g.save(); trace(0); g.clip(); trace(8); g.fillStyle = BRAMBLE.hedge; g.fill();
  // leaf texture: a scatter of lit 2x2 flecks in the upper third and dark ones lower down, never a line
  g.fillStyle = BRAMBLE.hedgeLit; for (let i = 0; i < 90; i++) g.fillRect(R(rnd() * w), ROWS.hedgeTop + 30 + R(rnd() * 40), 2, 2);
  g.fillStyle = mix(BRAMBLE.hedge, BRAMBLE.plum, 0.4); for (let i = 0; i < 120; i++) g.fillRect(R(rnd() * w), ROWS.hedgeTop + 60 + R(rnd() * (h - ROWS.hedgeTop - 62)), 3, 2);
  g.restore();
  // the gate's gap: the downs show through it above the bars, the plum lane beyond below them
  g.fillStyle = BRAMBLE.downs; g.fillRect(GATE_X, ROWS.hedgeTop + 24, GATE_W, 40);
  g.fillStyle = mix(BRAMBLE.plum, BRAMBLE.downs, 0.35); g.fillRect(GATE_X, ROWS.hedgeTop + 64, GATE_W, h - ROWS.hedgeTop - 64);
  gate(g, GATE_X, ROWS.hedgeTop + 28, h);
}

// ---------------------------------------------------------------- mid: the bank

/**
 * A daisy: four cream petals in a cross inside their own ink, a hazel eye. A 3x3 cream square was painted first
 * and the capture read the bank as littered with paper; a cross of petals is a flower at 1x and a square is not.
 * The eye is hazel and never the signal gold (ART_STYLE section 4).
 */
function daisy(g, x, y) {
  g.fillStyle = INK; g.fillRect(x - 2, y - 3, 5, 7); g.fillRect(x - 3, y - 2, 7, 5);
  g.fillStyle = BRAMBLE.daisy; g.fillRect(x - 1, y - 2, 3, 5); g.fillRect(x - 2, y - 1, 5, 3);
  g.fillStyle = BRAMBLE.hazel; g.fillRect(x - 1, y - 1, 2, 2);
}

function paintMid(g, w, h, rnd) {
  const top = ROWS.bankTop - MID_Y, foot = ROWS.foot - MID_Y;
  // the wattle along the bank's top: two hazel rails with uprights threaded through, the hedge's foot behind it
  g.fillStyle = INK; g.fillRect(0, top - 2, w, 12);
  g.fillStyle = BRAMBLE.hazel; g.fillRect(0, top, w, 3); g.fillRect(0, top + 6, w, 3);
  g.fillStyle = mix(BRAMBLE.hazel, BRAMBLE.plum, 0.4); for (let x = 4; x < w; x += 16) g.fillRect(x, top - 1, 3, 11);
  // the bank: turf sloping to a bare foot, its top edge in shadow under the wattle
  g.fillStyle = BRAMBLE.turf; g.fillRect(0, top + 10, w, foot - top - 10);
  g.fillStyle = BRAMBLE.turfShade; g.fillRect(0, top + 10, w, 8);
  g.fillStyle = BRAMBLE.tuft;
  for (let i = 0; i < 70; i++) { const x = R(rnd() * w), y = top + 20 + R(rnd() * (foot - top - 26)); g.fillRect(x, y, 2, 3); g.fillRect(x + 3, y + 1, 2, 2); }
  for (let i = 0; i < 6; i++) daisy(g, 10 + R(rnd() * (w - 20)), top + 22 + R(rnd() * (foot - top - 32)));
  // the bank's foot: an inked edge and a strip of bare earth the bushes root in, combed like the farm's beds
  g.fillStyle = INK; g.fillRect(0, foot - 2, w, 2);
  g.fillStyle = BRAMBLE.earth; g.fillRect(0, foot, w, h - foot);
  g.fillStyle = mix(BRAMBLE.earth, BRAMBLE.path, 0.3);
  for (let i = 0; i < 50; i++) g.fillRect(R(rnd() * w), foot + 2 + R(rnd() * (h - foot - 3)), 5 + R(rnd() * 10), 1);
}

// ---------------------------------------------------------------- ground: the path, the verge, the ditch

/**
 * The floor. The middle band is the whole reason the other two look the way they do:
 *   250..282  the earth strip's continuation and the path's back edge, scuffed
 *   282..322  the CLEAN WALK BAND. Not one mark lands in it (ART_STYLE section 7). The crew's four lanes
 *             (292..316) and their contact shadows sit here on the plain `path` tone; the band reads as a lane
 *             from its two scuffed EDGES, outside any row a foot or a shadow lands on.
 *   322..360  the grass VERGE in front, with the ditch's inked edge along the very bottom.
 */
function paintGround(g, w, h, rnd) {
  const top = ROWS.ground;
  const band0 = ROWS.bandTop - top, band1 = ROWS.bandBot - top, ditch = ROWS.ditch - top;
  g.fillStyle = BRAMBLE.earth; g.fillRect(0, 0, w, ROWS.bushBase - top + 4);
  g.fillStyle = BRAMBLE.path; g.fillRect(0, ROWS.bushBase - top + 4, w, band1 - (ROWS.bushBase - top + 4));
  g.fillStyle = mix(BRAMBLE.path, BRAMBLE.earth, 0.5); g.fillRect(0, ROWS.bushBase - top + 4, w, 3);
  // the band's two scuffed edges: the lane is read from these, never from a tone under the feet
  const comb = mix(BRAMBLE.path, BRAMBLE.earth, 0.4);
  g.fillStyle = comb;
  g.fillRect(0, band0 - 3, w, 3); g.fillRect(0, band1, w, 3);
  for (let i = 0; i < 30; i++) g.fillRect(R(rnd() * w), band0 - 10 + R(rnd() * 6), 8 + R(rnd() * 14), 1);
  // the verge: turf in front of the path with tufts, a daisy or two, and the ditch's edge
  g.fillStyle = BRAMBLE.turf; g.fillRect(0, band1 + 3, w, h - band1 - 3);
  g.fillStyle = BRAMBLE.tuft;
  for (let i = 0; i < 60; i++) { const x = R(rnd() * w), y = band1 + 6 + R(rnd() * (ditch - band1 - 10)); g.fillRect(x, y, 2, 3); }
  for (let i = 0; i < 4; i++) daisy(g, 10 + R(rnd() * (w - 20)), band1 + 8 + R(rnd() * (ditch - band1 - 16)));
  g.fillStyle = INK; g.fillRect(0, ditch, w, 2);
  g.fillStyle = BRAMBLE.turfShade; g.fillRect(0, ditch + 2, w, h - ditch - 2);
  g.fillStyle = mix(BRAMBLE.turfShade, BRAMBLE.plum, 0.4); g.fillRect(0, ditch + 6, w, h - ditch - 6);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { far, mid, ground }, each with the y the screen blits it at. */
export function brambleLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.bankTop + 4, paintFar, SEED), y: 0 },
    mid: { L: makeLayer(VIEW_W, MID_H, paintMid, SEED + 1), y: MID_Y },
    ground: { L: makeLayer(VIEW_W, VIEW_H - ROWS.ground, paintGround, SEED + 2), y: ROWS.ground },
  };
  return LAYERS;
}
