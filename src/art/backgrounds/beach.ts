// COCKLE COVE'S BEACH, painted once (docs/ART_STYLE.md section 1, section 7; docs/GDD.md section 5). Golden hour
// on the shore, the same hour and the same sea as the cove's jetty (art/backgrounds/pond.js COVE, whose tones this
// file borrows so the cove is one place from either side): the crew looks out over the dry sand to the water.
// Four layers with seeds from the beach's block 220..229, side view, every one blitted at x 0:
//
//   far     rows   0..236   sky, the low sun, the open sea to the horizon with one headland, the near swell and
//                           the BREAKERS: the foam line where the sea meets the sand (the screen twinkles it)
//   mid     rows 200..250   the WET SAND the last wave left, darker and glossy, with the rowing boat pulled up at
//                           one end and two crab pots at the other
//   ground  rows 250..360   the DRY SAND the crew runs on (the clean walk band, no scatter), then the STRAND LINE
//                           in front of it - the strip the crabs scuttle along, the weed washes onto and the salt
//                           pans crust on - with the shells and pebbles the tide left, and the marram fringe
//   near    rows 340..360   marram tufts in both bottom corners, over everything
//
// The camera never moves here - a cove is exactly one frame wide, like the farm's kitchen garden - so the layers
// are VIEW_W across and carry no bleed and no parallax factors. Nothing in here animates: the crabs, the weed, the
// pans, the burrows, the crew and the sea's twinkle are the screen's per-frame marks (game/screens/beach.js,
// art/beachProps.js).
import { makeLayer, vGradient, boxShaded, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { makeRng } from '../../lib/engine/rng.ts';
import { PLUM, UI } from '../../constants.ts';
import { COVE, SUN_X, SUN_Y, SUN_R } from './pond.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The beach's muted constants: the cove's own sea, sand and marram (art/backgrounds/pond.js COVE) plus the three
 * this side of the shore needs. The one saturated colour in the scene is SIGNAL.pond, the cove's mint, on the ring
 * a catch opens and the sparkle over a pan that has crusted - and it appears NOWHERE in here (ART_STYLE section 4).
 * The crab's own red is absent too: a red fleck painted into the strand line is a crab that never runs.
 */
export const BEACH = Object.freeze({
  skyTop: COVE.skyTop, skyLow: COVE.skyLow, sun: COVE.sun,
  sea: COVE.hillFar, seaDeep: COVE.waterShade, seaNear: COVE.water, swell: COVE.surface,
  headland: COVE.plumNear,
  /**
   * Dry sand: the cove's dune sand, L .76. Barley's wool is .897 (relDiff .16) - UNDER the 25 % ladder - so the
   * band the crew's torsos stand against is not this: it is `sandWalk`, a value step down at L .63 (relDiff .30
   * against the wool, .38 against Cress's .389), the trodden sand of a path along the beach. The pale sand is
   * kept for the strand line in front of the feet and the dune's edge, where only shins and shells stand on it.
   */
  sand: COVE.turf, sandWalk: '#BFA574', sandDark: COVE.turfShade,
  /** The wet sand the last wave left: darker, and glossy where it catches the sun. */
  wet: '#A88E66', wetGloss: '#D9C9A8',
  foam: COVE.glint,
  marram: COVE.tuft, marramHead: COVE.reedHead,
  /** The rowing boat, the crab pots and the strand line's pebbles. */
  hull: UI.wood, hullDark: UI.woodDark, rock: '#8E9AA0', rockDark: '#6E7A80', shell: '#F1E4C8',
  plum: PLUM.shadow,
});

/** Seed block 220..229 belongs to the beach (ART_STYLE section 7). */
const SEED = 220;

/**
 * Row bands (screen y). These are the contract the screen stands its crew and its quarry on:
 *   sky..horizon      the sky and the sun
 *   horizon..swell    the open sea; `swell` is where the near water starts to break
 *   breakers          the foam line: the sea's edge, and where the twinkle sits
 *   wet..ground       the wet sand
 *   bandTop..bandBot  the CLEAN WALK BAND: the crew's four lanes and their shadows, no scatter of any kind
 *   strand            the STRAND LINE's top edge; `quarry` is the row the crabs run on and the weed lies on
 *   fringe            the marram fringe along the bottom of the frame
 */
export const ROWS = Object.freeze({
  sky: 146, horizon: 148, swell: 196, breakers: 226, wet: 236, ground: 250,
  bandTop: 282, bandBot: 322, strand: 322, quarry: 338, fringe: 350, bottom: VIEW_H,
});
/** The mid layer's window: blitted at 200, 50 rows deep, so it reaches the ground layer's top edge exactly. */
const MID_Y = 200, MID_H = ROWS.ground - MID_Y;

/**
 * 30 twinkle positions on the breakers and the swell (screen coords + width), index-hashed alight by the screen:
 * the one thing that moves on 80 rows of sea. Seeded from the beach's own block, so every machine twinkles the
 * same pixels.
 */
export const GLINTS = (() => {
  const r = makeRng(SEED + 5), out = [];
  for (let i = 0; i < 30; i++) out.push([r.int(6, VIEW_W - 12), r.int(ROWS.swell + 4, ROWS.breakers + 6), r.int(3, 8)]);
  return out;
})();

// ---------------------------------------------------------------- far: sky, sun, the sea, the breakers

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.sky, [[0, BEACH.skyTop], [1, BEACH.skyLow]]);
  g.fillStyle = BEACH.skyLow; g.fillRect(0, ROWS.sky, w, h - ROWS.sky);
  // the low sun over the water, the pond's own disc and ink (the same hour on the same coast)
  g.beginPath(); g.arc(SUN_X, SUN_Y, SUN_R, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = BEACH.sun; g.fill();
  // the open sea: a flat band under its 2 px ink horizon, a lit line where the sun's column meets it, the deep
  // band, then the near water a step greener where the bottom shelves up to the beach
  g.fillStyle = INK; g.fillRect(0, ROWS.horizon - 2, w, 2);
  g.fillStyle = BEACH.sea; g.fillRect(0, ROWS.horizon, w, ROWS.swell - ROWS.horizon);
  g.fillStyle = BEACH.foam; for (let x = 0; x < w; x += 9) if ((x / 9) & 1) g.fillRect(x, ROWS.horizon + 1, 5, 1);
  g.fillStyle = BEACH.seaDeep; g.fillRect(0, ROWS.horizon + 14, w, 16);
  g.fillStyle = BEACH.seaNear; g.fillRect(0, ROWS.swell, w, ROWS.breakers - ROWS.swell);
  // the headland: one low plum-sand mound closing the left end of the bay on the horizon, so the horizon is not a
  // bare rule. Low and far: a big one painted first read as a dune fallen into the sea.
  g.beginPath(); g.ellipse(20, ROWS.horizon + 4, 96, 14, 0, 0, TAU); g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.fillStyle = BEACH.headland; g.fill();
  g.fillStyle = mix(BEACH.headland, BEACH.foam, 0.3); g.fillRect(-10, ROWS.horizon - 8, 60, 2);
  // the sun's reflection: 2 px cream dashes straight down from the disc, wider toward the near edge
  for (let ry = ROWS.horizon + 4; ry < ROWS.breakers; ry += 5 + R(rnd() * 3)) {
    const t = (ry - ROWS.horizon) / (ROWS.breakers - ROWS.horizon), half = 3 + R(t * 18), off = R((rnd() - 0.5) * half);
    g.globalAlpha = 0.35 + t * 0.3; g.fillStyle = BEACH.foam; g.fillRect(SUN_X + off - R(half / 2), ry, half + R(rnd() * half), 2);
  }
  g.globalAlpha = 1;
  // the swell: lit ripple dashes across the near water, 30..80 px, so the band is water and not a slab
  g.fillStyle = BEACH.swell;
  for (let i = 0; i < 22; i++) g.fillRect(R(rnd() * (w - 40)), ROWS.swell + 3 + R(rnd() * (ROWS.breakers - ROWS.swell - 8)), 30 + R(rnd() * 50), 2);
  // THE BREAKERS: the sea's edge as an inked line of foam, cream over the water and lipping onto the wet sand in
  // scallops - the one edge in the scene that has to read as an edge, because everything the crew wants is on the
  // land side of it
  g.fillStyle = INK; g.fillRect(0, ROWS.breakers - 1, w, 3);
  g.fillStyle = BEACH.foam;
  for (let x = -6; x < w + 8; x += 14) { g.beginPath(); g.arc(x, ROWS.breakers + 1, 7, 0, TAU); g.fill(); }
  g.fillRect(0, ROWS.breakers - 4, w, 5);
  for (let x = -6 - R(rnd() * 12); x < w; ) { const run = 8 + R(rnd() * 16); g.fillRect(x, ROWS.breakers - 8 - R(rnd() * 3), run, 2); x += run + 6 + R(rnd() * 12); }
}

// ---------------------------------------------------------------- mid: the wet sand, the boat, the pots

/** A crab pot: a small willow cage on the sand, its ribs inked, a float tied to it. */
function pot(g, x, y) {
  boxShaded(g, x, y - 10, 16, 10, BEACH.hull, BEACH.hullDark, INK, 1, 0.4);
  g.fillStyle = INK; g.fillRect(x + 4, y - 10, 1, 10); g.fillRect(x + 8, y - 10, 1, 10); g.fillRect(x + 12, y - 10, 1, 10); g.fillRect(x, y - 6, 16, 1);
  g.fillStyle = INK; g.beginPath(); g.arc(x + 20, y - 4, 4, 0, TAU); g.fill();
  g.fillStyle = BEACH.shell; g.beginPath(); g.arc(x + 20, y - 4, 3, 0, TAU); g.fill();
}

function paintMid(g, w, h, rnd) {
  const wet = ROWS.wet - MID_Y;
  // the wet sand starts under the breakers' foam, which the far layer paints: the rows above `wet` stay clear so
  // the foam line shows through, and the sand's own edge is scalloped to the foam's shape
  g.fillStyle = INK; g.fillRect(0, wet - 1, w, 2);
  g.fillStyle = BEACH.wet; g.fillRect(0, wet + 1, w, h - wet - 1);
  for (let x = -6; x < w + 8; x += 14) { g.fillStyle = INK; g.beginPath(); g.arc(x + 7, wet + 1, 6, 0, Math.PI); g.fill(); g.fillStyle = BEACH.wet; g.beginPath(); g.arc(x + 7, wet + 1, 5, 0, Math.PI); g.fill(); }
  // gloss: horizontal pale dashes where the sun sits on the wet sand, densest under the sun's column
  g.fillStyle = BEACH.wetGloss;
  for (let i = 0; i < 40; i++) { const x = R(rnd() * w), near = x > SUN_X - 90 && x < SUN_X + 90; if (near || rnd() < 0.4) g.fillRect(x, wet + 3 + R(rnd() * (h - wet - 5)), 6 + R(rnd() * 16), 1); }
  g.fillStyle = mix(BEACH.wet, BEACH.plum, 0.35);
  for (let i = 0; i < 30; i++) g.fillRect(R(rnd() * w), wet + 2 + R(rnd() * (h - wet - 4)), 3 + R(rnd() * 6), 1);
  // the rowing boat pulled up above the wet line at the left end: hull, gunwale, two thwarts, an oar laid across
  const bx = 22, by = h - 4;
  g.beginPath(); g.moveTo(bx, by - 18); g.lineTo(bx + 74, by - 18); g.quadraticCurveTo(bx + 84, by - 18, bx + 80, by - 6); g.lineTo(bx + 12, by); g.quadraticCurveTo(bx - 4, by - 4, bx, by - 18); g.closePath();
  g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke(); g.fillStyle = BEACH.hull; g.fill();
  g.save(); g.clip(); g.fillStyle = BEACH.hullDark; g.fillRect(bx - 4, by - 9, 90, 10); g.fillStyle = UI.woodLight; g.fillRect(bx, by - 17, 78, 2); g.restore();
  g.fillStyle = INK; g.fillRect(bx + 24, by - 19, 3, 6); g.fillRect(bx + 50, by - 19, 3, 6);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(bx + 6, by - 24); g.lineTo(bx + 62, by - 14); g.stroke();
  g.strokeStyle = BEACH.hull; g.lineWidth = 2; g.stroke();
  // two crab pots at the right end, stacked a little
  pot(g, w - 62, h - 4); pot(g, w - 44, h - 12);
}

// ---------------------------------------------------------------- ground: the dry sand, the strand line

/** A shell: a 5 px cream scallop with an ink line, ribs in the sand tone. */
function shell(g, x, y) {
  g.fillStyle = INK; g.beginPath(); g.arc(x, y, 4, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = BEACH.shell; g.beginPath(); g.arc(x, y - 1, 3, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = BEACH.sandDark; g.fillRect(x - 1, y - 3, 1, 3); g.fillRect(x + 1, y - 3, 1, 3);
}

/**
 * The floor. Three bands, and the middle one is the contract the screen stands the crew on:
 *   250..282  the top of the dry sand, drifted, with the odd shell above the lanes
 *   282..322  the CLEAN WALK BAND. Not one mark lands in it (ART_STYLE section 7). The crew's four lanes (292..316)
 *             and their contact shadows sit here on the plain `sandWalk` tone; the band reads as a path along the
 *             beach from its two scuffed EDGES, outside any row a foot or a shadow lands on.
 *   322..350  the STRAND LINE: the pale sand in front of the feet with the tide's leavings on it - shells, a
 *             pebble or two, a scrap of dry weed. This is the row the quarry lives on (ROWS.quarry), in front of the
 *             whole cast, so a crab is never hidden by the critter chasing it; what it covers is feet and shins.
 */
function paintGround(g, w, h, rnd) {
  const top = ROWS.ground;
  const band0 = ROWS.bandTop - top, band1 = ROWS.bandBot - top, fringe = ROWS.fringe - top;
  g.fillStyle = BEACH.sand; g.fillRect(0, 0, w, h);
  g.fillStyle = INK; g.fillRect(0, 0, w, 1);
  g.fillStyle = BEACH.sandWalk; g.fillRect(0, band0 - 6, w, band1 - band0 + 12);
  // the path's two scuffed edges: the lane is read from these, never from a tone under the feet
  const scuff = mix(BEACH.sandWalk, BEACH.sandDark, 0.5);
  g.fillStyle = scuff; g.fillRect(0, band0 - 3, w, 3); g.fillRect(0, band1, w, 3);
  for (let i = 0; i < 26; i++) g.fillRect(R(rnd() * w), band0 - 12 + R(rnd() * 7), 6 + R(rnd() * 12), 1);
  // drift lines in the dry sand above the path, and a shell or two
  g.fillStyle = BEACH.sandDark;
  for (let i = 0; i < 20; i++) g.fillRect(R(rnd() * w), 3 + R(rnd() * (band0 - 14)), 10 + R(rnd() * 24), 1);
  for (let i = 0; i < 3; i++) shell(g, 20 + R(rnd() * (w - 40)), 8 + R(rnd() * (band0 - 20)));
  // THE STRAND LINE: the tide's leavings across the pale sand in front of the feet, kept off the quarry's own row
  // where a pebble would read as a crab standing still
  g.fillStyle = BEACH.sandDark;
  for (let i = 0; i < 30; i++) g.fillRect(R(rnd() * w), band1 + 5 + R(rnd() * (fringe - band1 - 8)), 4 + R(rnd() * 12), 1);
  for (let i = 0; i < 5; i++) shell(g, 12 + R(rnd() * (w - 24)), fringe - 4 - R(rnd() * 4));
  for (let i = 0; i < 4; i++) {
    const x = 30 + R(rnd() * (w - 60)), y = fringe - 3;
    g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, 5, 3, 0, 0, TAU); g.fill();
    g.fillStyle = BEACH.rock; g.beginPath(); g.ellipse(x, y - 1, 4, 2, 0, 0, TAU); g.fill();
    g.fillStyle = BEACH.rockDark; g.fillRect(x - 2, y, 5, 1);
  }
  // the fringe's foot: a dark drift under the marram
  g.fillStyle = BEACH.sandDark; g.fillRect(0, fringe + 2, w, h - fringe - 2);
}

// ---------------------------------------------------------------- near: the marram fringe

/** A clump of marram rising off the bottom edge; `x0` is its left stem, `n` how many. */
function marram(g, rnd, x0, n, bottom) {
  for (let i = 0; i < n; i++) {
    const rx = x0 + i * 5 + R(rnd() * 3), top = 2 + R(rnd() * 12), lean = i & 1 ? 1 : -1;
    g.fillStyle = INK; g.fillRect(rx - 1, top - 1, 4, bottom - top + 1);
    g.fillStyle = BEACH.marram; g.fillRect(rx, top, 2, bottom - top);
    g.fillStyle = INK; g.fillRect(rx + lean * 2 - 1, top - 4, 4, 5);
    g.fillStyle = BEACH.marramHead; g.fillRect(rx + lean * 2, top - 3, 2, 3);
  }
}

/** Marram in each bottom corner (they frame the beach) and a sand edge along the bottom. */
function paintNear(g, w, h, rnd) {
  const bottom = h - 4;
  g.fillStyle = INK; g.fillRect(0, h - 4, w, 4);
  g.fillStyle = BEACH.sandDark; g.fillRect(0, h - 3, w, 3);
  marram(g, rnd, 2, 7, bottom);
  marram(g, rnd, 600, 8, bottom);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { far, mid, ground, near }, each with the y the screen blits it at. */
export function beachLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.wet, paintFar, SEED), y: 0 },
    mid: { L: makeLayer(VIEW_W, MID_H, paintMid, SEED + 1), y: MID_Y },
    ground: { L: makeLayer(VIEW_W, VIEW_H - ROWS.ground, paintGround, SEED + 2), y: ROWS.ground },
    near: { L: makeLayer(VIEW_W, VIEW_H - ROWS.fringe, paintNear, SEED + 3), y: ROWS.fringe },
  };
  return LAYERS;
}
