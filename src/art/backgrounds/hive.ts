// Clover Hives, painted once (docs/ART_STYLE.md section 1, section 7; docs/GDD.md section 5). An open clover meadow
// at the warm end of the afternoon, side view, with a row of straw skeps on a low bench along the back.
//
// THREE layers with seeds from the hive block 190..199, every one blitted at offset 0 by the screen. There is no
// camera in this scene, so the parallax factors would only ever multiply zero and a fourth "mid" plane would be one
// more canvas to no purpose (the pond and the coop make the same call):
//   far     rows 0..200    sky gradient, two hill tiers, the hedgerow with its standards and a five-bar gate, the
//                          hazed far meadow it stands in, and the SKEP BENCH the screen stands its skeps on
//   ground  rows 200..360  the clover meadow: five worn tracks running from the bench down to the five dip spots,
//                          the trodden walk band (no scatter in it), tufts and clover heads OUTSIDE it
//   near    rows 330..360  long grass along the bottom edge, below the front lane's feet
// Nothing here animates: the skeps, the swarm, the honey crate, the crew and the particles are the screen's
// per-frame marks. This scene is deliberately NOT the orchard: no canopy overhead, a low horizon with half the
// frame given to sky and hills, and one long horizontal rhythm (hedge / bench / skeps / tracks / band) instead of
// the orchard's vertical trunks.
import { makeLayer, vGradient, boxShaded, boxOutlined, polyOutlined, INK, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM, UI } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The hives' muted constants: eight scene-only tones plus two shared ladder colours (ART_STYLE section 4 asks for
 * 6-8 per backdrop). The scene's ONE saturated colour is SIGNAL.hive, the gold sparkle on a skep that still has
 * honey in it, and it appears NOWHERE in this file - a gold fleck painted into a meadow the player is scanning for
 * gold IS a false skep. The honey in this backdrop is the muted straw of the skeps themselves, which the prop module
 * owns; here even the clover heads are held to a dusty rose and a paper cream.
 */
export const HIVE = Object.freeze({
  /** Late afternoon: a step deeper and pinker than the orchard's noon sky, so the two green scenes never twin. */
  skyTop: '#F9DDB8', skyLow: '#F2C39A',
  /** The downs behind the hedge: a dry olive-tan, hazed toward the sky for the far tier. */
  hill: '#B3AE7E',
  /** The hedgerow mass. Darker than the orchard's canopy (#4F6B3A) because it is a clipped hedge in its own shadow,
   *  and because the meadow in front of it has to be the lighter of the two greens. */
  hedge: '#3F5A34',
  /** Clover meadow. Every L in this file is tools/art-check.js's `lum()` (rec-601), the metric the project actually
   *  enforces, so these numbers are comparable to ART_STYLE's cast table: L .39 against Barley's #F1E4C8 wool at
   *  .90 is 56 % off, well past the 25 % ART_STYLE section 7 asks of the plane behind the torsos - and a cooler,
   *  bluer green than the orchard's #5E7A3E so the two read as different fields. */
  meadow: '#55743C', tuft: '#6B8A48',
  /** Clover heads: dusty rose and paper cream, both under 0.35 saturation. Red clover at full chroma would have been
   *  a second saturated family in a scene that is allowed exactly two (SIGNAL.hive and SIGNAL.hot). */
  clover: '#C9949E', cloverPale: '#DCCDAC',
  /** Shared ladder colours, so the scene-only list stays at eight. */
  bench: UI.wood, plum: PLUM.shadow,
});

/** Seed block 190..199 belongs to the hives (ART_STYLE section 7). */
const SEED = 190;

/**
 * The heel marks inside a dip spot as fixed [dx, dy, w] triples off the skep's own x, the way SPLAT_RX / SPLAT_RY
 * in game/screens/orchard.js are a fixed table. They are 2 px tall and NOT rnd()-placed, because they lie inside
 * the trodden walk band: the band carries no scatter (ART_STYLE section 7) and nothing goes under 2 px at 1x (0.8).
 * They shipped as five 1 px hairlines scattered in x and y, which broke both rules in one line. Every triple is
 * inside the inner ellipse (rx 10, ry 6).
 */
const SCUFF = Int8Array.of(-8, -2, 5, -2, 1, 6, 4, -3, 4, -6, 2, 4, 1, -4, 5);

/**
 * Row bands (screen y). `bench` is the plank the skeps stand on; `ground` is where the ground layer starts; `band`
 * and `bandBot` bracket the trodden walk band the four lanes live in.
 */
export const ROWS = Object.freeze({
  sky: 112, hedge: 104, hedgeFoot: 176, bench: 182, benchFoot: 199,
  ground: 200, band: 290, bandBot: 328, fringe: 330, bottom: VIEW_H,
});
/**
 * Where the five skeps stand (centre x of each), 126 px apart across the whole width. The pitch is the number the
 * whole mini-game is timed off: at the screen's 1.8 px/frame creep a seat crosses it in 70 frames, which is what
 * makes a calm window worth about two dips (see the arithmetic in game/screens/hive.js).
 */
export const SKEP_X = Object.freeze([60, 186, 312, 438, 564]);
export const SKEP_PITCH = 126;
/** The honey crate stands on the right-hand end of the bench, past the last skep and clear of every seat's head. */
export const CRATE_X = 606;

/** One scalloped crown row traced as a single path: `dy` pushes every bump down so a second pass leaves a lit rim. */
function traceHedge(g, w, bumps, foot, dy) {
  g.beginPath();
  g.moveTo(-8, foot);
  for (let i = 0; i < bumps.length; i += 3) {
    const cx = bumps[i], cy = bumps[i + 1] + dy, r = bumps[i + 2];
    g.lineTo(cx - r, foot);
    g.arc(cx, cy, r, Math.PI, 0);
  }
  g.lineTo(w + 8, foot);
  g.closePath();
}

/**
 * A standard: one of the four trees the hedge has been allowed to grow out of. They are what stop the hedgerow from
 * being a 72-row rectangle with a bumpy lid - measured across the visible width the crest only varies 14 px, so
 * without the standards the whole top third of the frame was two straight edges (sky/hill and hill/hedge).
 */
function standard(g, x, top, r, fill, cap) {
  g.fillStyle = INK; g.fillRect(x - 4, top, 8, ROWS.hedgeFoot - top);
  g.fillStyle = mix(HIVE.hedge, PLUM.deep, 0.35); g.fillRect(x - 2, top, 4, ROWS.hedgeFoot - top);
  g.fillStyle = INK;
  for (let i = 0; i < 5; i++) { const a = i * 1.257; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.7, top + Math.sin(a) * r * 0.5, r * 0.62 + 2, 0, TAU); g.fill(); }
  g.fillStyle = fill;
  for (let i = 0; i < 5; i++) { const a = i * 1.257; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.7, top + Math.sin(a) * r * 0.5, r * 0.62, 0, TAU); g.fill(); }
  g.fillStyle = cap;
  for (let i = 0; i < 3; i++) { const a = 3.4 + i * 0.7; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.7, top + Math.sin(a) * r * 0.5 - 2, r * 0.36, 0, TAU); g.fill(); }
}

/**
 * A five-bar gate hung in a gap in the hedge, its foot on the hedge's own foot line.
 *
 * Round 1 filled the gap with a dark green, gave the gate five FULL-WIDTH rails and stacked three fat brace blocks
 * across them: it read as a bookcase standing in a hedge. Round 2 lit the gap and broke the brace into five small
 * stepped blocks, and it read as a slatted CRATE - the same object as hiveProps.js drawHoneyCrate, which stands on
 * the same shelf line 221 px to its right and is the party's score. Rails are not what says "gate"; a crate has
 * those too. Two things do, and this pass is both of them:
 *   PROPORTION  a gate is far wider than it is tall (78 x 30 here, 2.6:1). The 54 x 36 of round 2 was a box.
 *   THE DIAGONAL  one unbroken brace from the heel of the hanging post to the head of the shutting stile, 4 px
 *                 thick across the slope and drawn OVER the rails, where it can be seen. Five 4 px blocks stepping
 *                 corner to corner are five planks lying on shelves; a crate has no diagonal and cannot grow one.
 * The hanging post also stands proud of the top rail, so the gate reads as a thing that swings off something.
 */
function gate(g, x, y, w, h) {
  // 2 px rails, not 3: inked top and bottom a rail is a 4 px band either way (ART_STYLE 0.8), and at 3 the five of
  // them plus their ink swallowed the whole opening - the gate went back to being a slab. At 2 there are 2 px of lit
  // field between every pair, which is the light BEHIND a gate that says it is a gate and not a plank.
  const dark = mix(UI.wood, PLUM.deep, 0.45), rail = 2, gap = R((h - 4 - rail * 5) / 4);
  g.fillStyle = INK; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = mix(HIVE.hill, HIVE.meadow, 0.34); g.fillRect(x, y, w, h);        // the field the gateway opens onto
  g.fillStyle = mix(HIVE.hill, HIVE.meadow, 0.62); g.fillRect(x, y + h - 8, w, 8);
  for (let i = 0; i < 5; i++) boxShaded(g, x + 3, y + 2 + i * (rail + gap), w - 7, rail, UI.wood, dark, INK, 1, 0.5);
  polyOutlined(g, [x + 5, y + h - 3, x + 17, y + h - 3, x + w - 5, y + 2, x + w - 17, y + 2], UI.wood, INK, 1);
  boxShaded(g, x - 1, y - 6, 5, h + 6, UI.wood, dark, INK, 1, 0.35);              // the hanging post, standing proud
  boxShaded(g, x + w - 4, y, 4, h, UI.wood, dark, INK, 1, 0.4);                   // the shutting stile
}

/**
 * A beekeeper's barrow standing on the far meadow, wheel at the front, heaped with the straw the skeps are coiled
 * from. It and the water butt below are the only two objects between the bench and the walk band: without them that
 * strip is 90 rows of flat green behind four heads, and with more than two it would be clutter a critter has to be
 * read against. Both stand BETWEEN skeps, where no seat starts and no dip happens.
 */
function barrow(g, x, y) {
  const dark = mix(UI.wood, PLUM.deep, 0.5), straw = mix(HIVE.hill, UI.woodLight, 0.4);
  g.fillStyle = mix(HIVE.meadow, PLUM.deep, 0.28); g.beginPath(); g.ellipse(x, y, 22, 4, 0, 0, TAU); g.fill();
  g.fillStyle = INK; g.fillRect(x + 6, y - 20, 3, 20); g.fillRect(x - 16, y - 20, 3, 20);           // handles
  g.fillStyle = UI.woodLight; g.fillRect(x + 7, y - 19, 2, 18); g.fillRect(x - 15, y - 19, 2, 18);
  g.fillStyle = INK; g.beginPath(); g.arc(x - 11, y - 6, 7, 0, TAU); g.fill();                      // wheel
  g.fillStyle = dark; g.beginPath(); g.arc(x - 11, y - 6, 5, 0, TAU); g.fill();
  g.fillStyle = UI.woodLight; g.fillRect(x - 12, y - 7, 3, 3);
  boxOutlined(g, x - 8, y - 9, 6, 9, dark, INK, 1);                                                 // the leg
  polyOutlined(g, [x - 13, y - 22, x + 11, y - 22, x + 7, y - 9, x - 9, y - 9], UI.wood, INK, 1);   // the tray
  g.fillStyle = dark; g.fillRect(x - 10, y - 14, 18, 5);
  g.fillStyle = straw;                                                                              // the straw in it
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x - 9 + k * 7, y - 23, 6, 4, 0, 0, TAU); g.fill(); }
  g.fillStyle = mix(straw, PLUM.shadow, 0.3); g.fillRect(x - 13, y - 22, 24, 2);
}

/**
 * A water butt on the far meadow, the bees' drinking water: a staved barrel with two iron hoops.
 *
 * Round 1 drew it as a plain rectangle with THREE evenly spaced hoops and it read as a stack of planks. A barrel
 * reads from its bulge, so the body is a tapered polygon (wider at the waist than at either end), the staves are
 * vertical seams inside that one silhouette, and there are two hoops with the bulge between them.
 */
function butt(g, x, y) {
  const dark = mix(UI.wood, PLUM.deep, 0.5), hoop = mix('#8C8A93', PLUM.shadow, 0.3);
  g.fillStyle = mix(HIVE.meadow, PLUM.deep, 0.28); g.beginPath(); g.ellipse(x, y, 15, 4, 0, 0, TAU); g.fill();
  polyOutlined(g, [x - 9, y, x - 12, y - 13, x - 9, y - 26, x + 9, y - 26, x + 12, y - 13, x + 9, y], UI.wood, INK, 1);
  g.save();
  g.beginPath();
  g.moveTo(x - 9, y); g.lineTo(x - 12, y - 13); g.lineTo(x - 9, y - 26); g.lineTo(x + 9, y - 26); g.lineTo(x + 12, y - 13); g.lineTo(x + 9, y); g.closePath();
  g.clip();
  g.fillStyle = dark; g.fillRect(x + 3, y - 28, 10, 30);
  g.fillStyle = mix(UI.wood, PLUM.deep, 0.28);
  for (let k = -1; k < 2; k++) g.fillRect(x + k * 6 - 1, y - 28, 2, 30);   // staves: a seam inside the one line
  g.restore();
  for (let k = 0; k < 2; k++) {
    const hy = y - 22 + k * 15;
    g.fillStyle = INK; g.fillRect(x - 12, hy - 1, 24, 5);
    g.fillStyle = hoop; g.fillRect(x - 11, hy, 22, 3);
  }
  boxOutlined(g, x - 10, y - 29, 20, 4, dark, INK, 1);
  g.fillStyle = '#6F9FB0'; g.fillRect(x - 8, y - 28, 16, 2);   // the water's lit edge under the rim
}

/**
 * Far: sky, downs, hedgerow, the far meadow and the skep bench.
 *
 * The bench is one plank across 640 px, which is exactly the unbroken rule ART_STYLE keeps warning about, so it is
 * broken four ways: a seam every 118 px, a shade band on its front face, five legs standing in their own contact
 * shadows, and - the real fix - the five skeps and the honey crate the screen stands on top of it every frame.
 */
function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.sky, [[0, HIVE.skyTop], [1, HIVE.skyLow]]);
  const farHill = mix(HIVE.hill, HIVE.skyLow, 0.5);
  g.fillStyle = farHill;
  for (let x = -40; x < w + 40; x += 120) { g.beginPath(); g.ellipse(x + rnd() * 30, 94, 100, 20 + rnd() * 8, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 92, w, ROWS.sky - 92);
  g.fillStyle = HIVE.hill;
  for (let x = -20; x < w + 40; x += 96) { g.beginPath(); g.ellipse(x + rnd() * 24, 106, 76, 13 + rnd() * 6, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 104, w, ROWS.sky - 104);
  // a pale lane cutting across the far down, so the hills are a place and not a pair of humps
  g.fillStyle = mix(HIVE.hill, HIVE.skyTop, 0.35);
  for (let x = 120; x < 430; x += 26) g.fillRect(x, 100 - R((x - 120) / 34), 18, 3);
  // the hedgerow: one inked mass with a scalloped crest, filled in the lit green and then again 8 px lower in the
  // base green, which leaves a lit rim following every bump (the pond's tree-line trick, at a hedge's scale)
  const bumps = [];
  for (let x = -6; x < w + 16; x += 22) bumps.push(R(x + rnd() * 8), ROWS.hedge + 6 + R(rnd() * 10), 9 + R(rnd() * 7));
  traceHedge(g, w, bumps, ROWS.hedgeFoot, 0);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = mix(HIVE.hedge, HIVE.tuft, 0.45); g.fill();
  g.save(); traceHedge(g, w, bumps, ROWS.hedgeFoot, 0); g.clip();
  traceHedge(g, w, bumps, ROWS.hedgeFoot, 8); g.fillStyle = HIVE.hedge; g.fill();
  // the hedge's own foot shadow, inside its clip so it never spills onto the meadow
  g.fillStyle = mix(HIVE.hedge, PLUM.deep, 0.4); g.fillRect(0, ROWS.hedgeFoot - 14, w, 14);
  g.restore();
  standard(g, 104, 62, 30, mix(HIVE.hedge, HIVE.tuft, 0.3), mix(HIVE.hedge, HIVE.tuft, 0.62));
  standard(g, 268, 74, 24, mix(HIVE.hedge, HIVE.tuft, 0.3), mix(HIVE.hedge, HIVE.tuft, 0.62));
  standard(g, 470, 58, 32, mix(HIVE.hedge, HIVE.tuft, 0.3), mix(HIVE.hedge, HIVE.tuft, 0.62));
  standard(g, 596, 78, 22, mix(HIVE.hedge, HIVE.tuft, 0.3), mix(HIVE.hedge, HIVE.tuft, 0.62));
  gate(g, 346, 146, 78, 30);
  // the far meadow the hedge stands in, hazed toward the hills, with the hedge's cast shadow lying across it
  g.fillStyle = mix(HIVE.meadow, HIVE.hill, 0.3); g.fillRect(0, ROWS.hedgeFoot, w, h - ROWS.hedgeFoot);
  g.fillStyle = mix(HIVE.meadow, PLUM.shadow, 0.22); g.fillRect(0, ROWS.hedgeFoot, w, 7);
  // the bench: legs and their contact shadows first, then the plank over them
  const dark = mix(UI.wood, PLUM.deep, 0.5), lit = mix(UI.wood, UI.woodLight, 0.6);
  g.fillStyle = mix(HIVE.meadow, PLUM.deep, 0.28);
  for (let i = 0; i < 5; i++) { const lx = 40 + i * 140; g.beginPath(); g.ellipse(lx + 4, ROWS.benchFoot, 16, 3, 0, 0, TAU); g.fill(); }
  for (let i = 0; i < 5; i++) boxShaded(g, 40 + i * 140, ROWS.bench + 8, 9, ROWS.benchFoot - ROWS.bench - 8, UI.wood, dark, INK, 1, 0.5);
  boxShaded(g, -2, ROWS.bench, w + 4, 9, UI.wood, dark, INK, 1, 0.42);
  g.fillStyle = lit; g.fillRect(0, ROWS.bench + 1, w, 2);
  g.fillStyle = dark; for (let x = 58; x < w; x += 118) g.fillRect(x, ROWS.bench, 2, 9);   // plank seams
}

/**
 * Ground: the clover meadow.
 *
 * The five WORN TRACKS are the composition's job of work. The dip geometry (stand within REACH of a skep's x) is
 * invisible on a flat green field, so the meadow carries the path the beekeeper has worn from each skep down to the
 * spot it is reached from: a trodden trapezoid under every SKEP_X, ending in a scuffed dip spot inside the walk
 * band. It teaches the whole rule without spending the scene's signal colour on the floor, which is where the coop
 * had to put its nest cue.
 *
 * The band itself is the orchard's fix, re-measured here: Cress is a green frog (#3F7D3B) and this meadow is
 * #55743C - 0.03 apart by value and 22 deg by hue, which fails both clauses of ART_STYLE 0.1 - so the rows the cast
 * walks are trodden a step toward the plum shadow, which lifts every seat off the floor, and carry no scatter.
 */
function paintGround(g, w, h, rnd) {
  const y0 = ROWS.ground;
  g.fillStyle = HIVE.meadow; g.fillRect(0, 0, w, h);
  g.fillStyle = mix(HIVE.meadow, HIVE.hill, 0.24); g.fillRect(0, 0, w, 9);   // the haze join with the far meadow
  // THE WORN PATHS ARE GONE, twice over. Round 1 ran a pale trapezoid from each skep down to its dip spot and the
  // five of them read as SPOTLIGHTS on the grass; round 2 mixed them toward the bench's wood instead and they read
  // as five brown POSTS planted in the field. A 90-row hard-edged vertical shape is a solid object at this scale
  // whatever colour it is, and the geometry it was teaching is already taught twice - by the scuffed dip spot in the
  // band directly under each skep, and by the honey strand the screen draws from doorway to dipper during a dip.
  // What the strip keeps is the DEPTH it was missing: a dashed field edge at row 224 (above every head in the cast,
  // so it never rules a line through a face the way the pond's first reflection band did) and tufts that thin out
  // toward the viewer.
  const track = mix(HIVE.meadow, UI.wood, 0.2);
  const top = ROWS.band - y0, bot = ROWS.bandBot - y0, mid = R((top + bot) / 2);
  const edgeRow = 224 - y0;
  g.fillStyle = mix(HIVE.meadow, HIVE.plum, 0.14);
  for (let x2 = -20 - R(rnd() * 40); x2 < w; ) { const run = 50 + R(rnd() * 60); g.fillRect(x2, edgeRow, run, 3); x2 += run + 18 + R(rnd() * 34); }
  g.fillStyle = mix(HIVE.meadow, HIVE.hill, 0.1); g.fillRect(0, 9, w, edgeRow - 9);
  // the trodden band, painted OVER the tracks so the lane stays one value all the way across.
  // 0.3, the orchard's own step. This shipped at 0.26 with a comment claiming 0.3 fell under the L .30 floor
  // ART_STYLE section 1 sets for Barley's hooves and Chicory's paws; measured with tools/art-check.js's lum(), 0.26
  // is L .348 and 0.3 is L .344 - the 0.04 bought four thousandths of L and neither is anywhere near that floor (the
  // mix that reaches it is 0.55). What the band really buys, stated straight: the meadow is L .39 and Cress is L
  // .39, 1 % apart, which fails ART_STYLE 0.1; trodden it is L .34, 12 % off her. That is as far as this can go -
  // 25 % against Cress needs L .29, which IS under the floor - so the rest of the frog's read is her apron and ink.
  const trodden = mix(HIVE.meadow, HIVE.plum, 0.3), edge = mix(HIVE.meadow, trodden, 0.5);
  g.fillStyle = edge; g.fillRect(0, top - 5, w, bot - top + 10);
  g.fillStyle = trodden; g.fillRect(0, top - 2, w, bot - top + 4);
  // ...and the five DIP SPOTS scuffed back into it, one under each skep: a deliberate mark at a fixed x, not
  // scatter, and the only thing in the backdrop that says where the REACH of 16 px actually is. The outer ellipse
  // is EXACTLY the reach: rx 16 makes the bare ground 32 px across and the dip window is 2 x REACH = 32, so the
  // widest edge of the mark and the last x that can dip are the same pixel. It shipped at rx 22, which promised
  // 6 px of ground on each side where the press does nothing - the mis-teaching this mark exists to prevent.
  for (let i = 0; i < SKEP_X.length; i++) {
    const x = SKEP_X[i];
    g.fillStyle = mix(trodden, track, 0.55);
    g.beginPath(); g.ellipse(x, mid, 16, 9, 0, 0, TAU); g.fill();
    g.fillStyle = track;
    g.beginPath(); g.ellipse(x, mid, 10, 6, 0, 0, TAU); g.fill();
    g.fillStyle = mix(trodden, HIVE.plum, 0.2);
    for (let k = 0; k < SCUFF.length; k += 3) g.fillRect(x + SCUFF[k], mid + SCUFF[k + 1], SCUFF[k + 2], 2);
  }
  barrow(g, 118, 252 - y0);
  butt(g, 502, 248 - y0);
  // tufts and clover, everywhere BUT the band (ART_STYLE section 7: the walk lane carries no scatter)
  for (let i = 0; i < 150; i++) {
    const x = R(rnd() * w), y = 10 + R(rnd() * (h - 14));
    if (y >= top - 6 && y <= bot + 5) continue;
    // the far half of the strip gets the taller three-blade clumps, the near half the small ones: a density
    // gradient is the cheapest depth there is, and it costs no new colour
    g.fillStyle = HIVE.tuft;
    g.fillRect(x, y, 2, 3); g.fillRect(x + 3, y + 1, 2, 2);
    if (y < edgeRow) { g.fillRect(x - 3, y + 1, 2, 3); g.fillRect(x + 1, y - 2, 2, 3); }
  }
  for (let i = 0; i < 58; i++) {
    const x = R(rnd() * w), y = 12 + R(rnd() * (h - 16));
    if (y >= top - 6 && y <= bot + 5) continue;
    // a clover head is a 3x2 crown over a 2x3 stem, both over the 2 px floor (ART_STYLE 0.8); two thirds are the
    // pale kind so the rose ones read as the odd flower rather than a second scatter colour
    g.fillStyle = mix(HIVE.tuft, HIVE.plum, 0.2); g.fillRect(x + 1, y + 2, 2, 3);
    g.fillStyle = rnd() < 0.34 ? HIVE.clover : HIVE.cloverPale; g.fillRect(x, y, 4, 3);
  }
}

/**
 * Near: long grass along the bottom edge. It rises to row 330 at most, which is 8 px below the front lane's feet at
 * 322, so nothing solid stands at critter height (ART_STYLE section 7) and the crew is never hidden by its own
 * foreground - the blades read as depth in front of the trodden band and nothing else.
 *
 * `tall` tops out at 25 and NOT at 30, which is where the layer's own height would put it: the seed head is drawn
 * 5 rows above the blade, so a 30 px blade asked for row 325 - five rows outside a layer that is only 30 tall, and
 * every blade over 25 had its head clipped to a 1 px stub by the top edge. 25 is the tallest blade whose head still
 * lands on row 330. The ceiling stays where the contract puts it rather than being moved up into the lane, and the
 * seed head starts one step lower (over 20, not over 22) so the same share of the fringe carries one.
 */
function paintNear(g, w, h, rnd) {
  const base = h;
  for (let x = -4; x < w + 8; x += 5) {
    const tall = 10 + R(rnd() * 15), lean = ((x >> 2) & 1) ? 1 : -1;
    g.fillStyle = INK; g.fillRect(x - 1, base - tall - 1, 4, tall + 1);
    g.fillStyle = ((x >> 1) & 1) ? HIVE.tuft : mix(HIVE.tuft, HIVE.meadow, 0.5); g.fillRect(x, base - tall, 2, tall);
    if (tall > 20) {   // a seed head on the tallest blades only, leaning off the stem
      g.fillStyle = INK; g.fillRect(x + lean * 2 - 1, base - tall - 5, 4, 6);
      g.fillStyle = mix(HIVE.cloverPale, HIVE.tuft, 0.4); g.fillRect(x + lean * 2, base - tall - 4, 2, 4);
    }
  }
  g.fillStyle = INK; g.fillRect(0, h - 10, w, 2);
  g.fillStyle = mix(HIVE.meadow, HIVE.plum, 0.4); g.fillRect(0, h - 8, w, 8);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { far, ground, near }, each with the y the screen blits it at. */
export function hiveLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.ground, paintFar, SEED), y: 0 },
    ground: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.ground, paintGround, SEED + 1), y: ROWS.ground },
    near: { L: makeLayer(VIEW_W, ROWS.bottom - ROWS.fringe, paintNear, SEED + 2), y: ROWS.fringe },
  };
  return LAYERS;
}
