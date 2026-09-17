// THE SATURDAY MARKET'S KITCHEN GARDEN, painted once (docs/ART_STYLE.md section 1, section 7; docs/GDD.md
// section 5). Afternoon light in a walled garden of worked ground: three layers with seeds from the market-garden
// block 200..209 (ART_STYLE section 7's table), side view, every one blitted at x 0:
//
//   far     rows   0..212   sky, the distant tree line, the garden's south wall with its gate and two fan-trained
//                           fruit trees, the bunting strung across it, and a market stall at each edge of the frame
//   mid     rows 160..250   the currant hedge along the wall's foot, the water butt, a crate stack, and the BACK
//                           BED - a boarded raised bed of dark tilled earth with four runner-bean wigwams in it
//   ground  rows 250..360   the trodden path the crew works from (the clean walk band, no scatter), the dark
//                           tilled CROP RIDGE the carrots stand in, and the hazel hurdle along the bottom edge
//
// The camera never moves here - a walled garden is exactly one frame wide - so the layers are VIEW_W across and
// carry no bleed and no parallax factors, the way the coop's interior does. Adding a second screen of garden is a
// one-line change (widen LW, blit at -BLEED_X) and until something asks for it the machinery stays out.
//
// Nothing in here animates: the crop, the crew, the tug gauges, the thistledown and the flying soil are the
// screen's per-frame marks (game/screens/garden.js, art/gardenProps.js).
import { makeLayer, vGradient, boxShaded, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.js';
import { mix } from '../palettes.js';
import { PLUM, UI } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The garden's muted constants (nine; `plum` is the shared ladder colour). The one saturated colour in the scene is
 * SIGNAL.garden, the ripe root's sparkle, and it appears NOWHERE in here - ART_STYLE section 4 binds a signal to one
 * meaning and bans it as decor, and a gold fleck painted into a bed the player is scanning for ripe tops IS a false
 * carrot. The carrot's own orange (INGREDIENTS.carrot.hex) is likewise absent: a root only ever shows once it is out
 * of the ground.
 */
export const GARDEN = Object.freeze({
  /** Afternoon, an hour past its height: a pale straw sky over the orchard's own dusk peach at the horizon. */
  skyTop: '#E9DCBE', skyLow: '#F4C9A0',
  /**
   * The wall: lime-washed stone, deliberately almost colourless (saturation 0.13). Old brick was drawn first and
   * lost: at #8E6E5E it is 19 degrees of hue from P2's marmalade apron, and 70 rows of it across the whole frame is
   * exactly the "large block of a player hue" the brief bans. Lime wash is also what an English kitchen garden's
   * south wall actually wears, so the honest colour is the safe one.
   */
  wall: '#8A8478', wallDark: '#6E6A60',
  /**
   * Dark tilled earth: the beds. L .25, so it is 72 % below Barley's wool and the crop's green reads out of it by
   * 57 %. Nobody walks on it - see `path` for why the crew's own band cannot be this dark.
   */
  soil: '#4A3C32',
  /**
   * The trodden path between the beds, and the plane the crew's torsos stand against. L .551, measured against the
   * cast: Barley's wool .897 (relDiff .39), Sorrel's .878 (.37), Chicory's peat .344 (.38), Cress's frog green .389
   * (.29) and the two dark feet at .239 (.57) - every one clears the 25 % ladder of ART_STYLE 0.1, and it stays well
   * above the L .30 floor section 1 sets for Barley's hooves and Chicory's dark paws. A darker, earthier band was
   * tried twice (L .30 and L .49) and both collapsed Cress to under .23 against it: the green frog is the binding
   * constraint on this scene's floor, exactly as it was on the orchard's grass.
   */
  path: '#9C8A70',
  /** Hedge, bean foliage and the stalls' greens: the orchard's canopy tone, so one countryside green runs through. */
  leaf: '#4F6B3A',
  /** Dry hazel: the bean canes, the hurdle along the bottom edge, the stalls' poles. */
  hazel: '#B9A47A',
  /**
   * The place's own accent from the map (content/places.js `garden`): bunting and one stall's awning stripe, and
   * nowhere else. It is 21 degrees of hue from P4's raspberry, so it is never allowed to be a block - the bunting
   * flags are 10 px and the awning stripe is cut with cream - and it never lands below row 200, which is sixty rows
   * clear of the nearest apron.
   */
  rose: '#C96B7A',
  plum: PLUM.shadow,
});

/** Seed block 200..209 belongs to the market garden (ART_STYLE section 7). */
const SEED = 200;

/**
 * Row bands (screen y). These are the contract the screen stands its crew and its crop on:
 *   sky..wallTop   the sky and the tree line over the wall
 *   wallTop..foot  the wall, its gate, the bunting and the stalls
 *   backBed        the raised bed at the back, dark soil, bean wigwams
 *   ground         where the layer that carries the floor begins
 *   bandTop..bandBot  the CLEAN WALK BAND: the crew's four lanes and their shadows, no scatter of any kind
 *   ridge          the crop ridge's top edge; `root` is the soil line every leafy top stands on
 *   hurdle         the woven hazel edging along the bottom of the frame
 */
export const ROWS = Object.freeze({
  sky: 88, wallTop: 100, wallBot: 180, foot: 180, backBed: 212, ground: 250,
  bandTop: 282, bandBot: 322, ridge: 322, root: 330, hurdle: 348, bottom: VIEW_H,
});

/** The gate in the wall: centred, and low enough that the clock ticket (rows 6..46) never lands on it. */
const GATE_X = 320, GATE_W = 30, GATE_TOP = 118;
/** Where the two stalls stand: their awning ridge, their counter top, and how far in from each edge they reach. */
const STALL_AWN = 126, STALL_COUNTER = 180, STALL_IN = 150;
/** The mid layer's window: blitted at 160, 90 rows deep, so it reaches the ground layer's top edge exactly. */
const MID_Y = 160, MID_H = ROWS.ground - MID_Y;

// ---------------------------------------------------------------- far: sky, wall, bunting, stalls

/** One course of the wall: a mortar line and the staggered vertical joints above it, both in the mortar tone. */
function course(g, w, y, offset) {
  g.fillRect(0, y, w, 1);
  for (let x = offset; x < w; x += 26) g.fillRect(x, y - 8, 1, 8);
}

/**
 * A fan-trained fruit tree on the wall: a short trunk with five branches fanning up and out, tied flat to the
 * stone. Two plum tones and no ink - at this depth everything is silhouette (the orchard's cottages set the rule),
 * and a 1 px line on a 60 px tree would be the busiest mark on the plane the name plates ride over.
 */
function espalier(g, x, y) {
  const wood = mix(GARDEN.plum, GARDEN.wallDark, 0.3), leaf = mix(GARDEN.leaf, GARDEN.hazel, 0.18);
  g.fillStyle = wood;
  g.fillRect(x - 2, y - 16, 4, 16);
  for (let i = 0; i < 5; i++) {
    const a = -2.55 + i * 0.5, len = 26 + (i === 2 ? 8 : 0);
    g.save(); g.translate(x, y - 14); g.rotate(a);
    g.fillRect(0, -2, len, 3);
    g.restore();
  }
  const leafSh = mix(leaf, GARDEN.plum, 0.4);
  for (let i = 0; i < 5; i++) {
    const a = -2.55 + i * 0.5;
    for (let k = 1; k <= 5; k++) {
      const d = 6 + k * 5, lx = x + Math.cos(a) * d, ly = y - 14 + Math.sin(a) * d;
      g.fillStyle = leaf; g.beginPath(); g.arc(lx, ly, 4.5, 0, TAU); g.fill();
      g.fillStyle = leafSh; g.beginPath(); g.arc(lx + 1.5, ly + 1.5, 2.5, 0, TAU); g.fill();
    }
  }
}

/**
 * A swag of bunting from (x0, y0) to (x1, y1) with `n` flags hanging off it. The cord is 2 px (ART_STYLE 0.8's
 * floor: a 1 px cord is the mark the judges threw out of the pond) and every flag carries its own ink, because a
 * flag and the cord it hangs from are two objects (ART_STYLE 0.2).
 */
function bunting(g, x0, y0, x1, y1, n, sag) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + sag;
  g.strokeStyle = INK; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
  const flags = [GARDEN.rose, UI.cream, GARDEN.leaf];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const fx = R(u * u * x0 + 2 * u * t * cx + t * t * x1), fy = R(u * u * y0 + 2 * u * t * cy + t * t * y1);
    g.fillStyle = INK;
    g.beginPath(); g.moveTo(fx - 6, fy); g.lineTo(fx + 6, fy); g.lineTo(fx, fy + 14); g.closePath(); g.fill();
    g.fillStyle = flags[i % flags.length];
    g.beginPath(); g.moveTo(fx - 4, fy + 1); g.lineTo(fx + 4, fy + 1); g.lineTo(fx, fy + 11); g.closePath(); g.fill();
  }
}

/**
 * A market stall at one edge of the frame: four hazel poles, a striped awning with a scalloped valance, a counter
 * under a cloth and three crates of produce on it. `dir` 1 puts the open side toward the middle of the frame.
 * The stripes are cut with cream so no single hue holds more than four pixels in a row.
 */
function stall(g, x, dir, stripe, rnd) {
  const wood = UI.wood, dark = UI.woodDark, cloth = mix(UI.cream, GARDEN.wall, 0.6);
  const left = dir > 0 ? x : x - STALL_IN;
  // the four poles: two at the front, two set back and a step shorter
  g.fillStyle = dark;
  g.fillRect(left + 6, STALL_AWN, 4, STALL_COUNTER - STALL_AWN + 26);
  g.fillRect(left + STALL_IN - 12, STALL_AWN + 4, 4, STALL_COUNTER - STALL_AWN + 22);
  g.fillStyle = mix(dark, GARDEN.plum, 0.4);
  g.fillRect(left + 22, STALL_AWN + 6, 3, STALL_COUNTER - STALL_AWN + 18);
  g.fillRect(left + STALL_IN - 30, STALL_AWN + 8, 3, STALL_COUNTER - STALL_AWN + 16);
  // the awning: one inked slab, then the stripes clipped inside it (ART_STYLE section 1's truck awning does the
  // same), then a 5 px scalloped valance along its front edge
  const aw = STALL_IN - 4, ay = STALL_AWN - 12;
  g.fillStyle = INK; g.fillRect(left, ay - 2, aw + 4, 26);
  g.fillStyle = UI.cream; g.fillRect(left + 2, ay, aw, 22);
  g.save(); g.beginPath(); g.rect(left + 2, ay, aw, 22); g.clip();
  g.fillStyle = stripe;
  for (let sx = left + 2; sx < left + aw + 2; sx += 16) g.fillRect(sx, ay - 2, 8, 26);
  g.restore();
  g.fillStyle = INK;
  for (let sx = left + 2; sx < left + aw + 4; sx += 10) { g.beginPath(); g.arc(sx, ay + 23, 5, 0, TAU); g.fill(); }
  g.fillStyle = cloth;
  for (let sx = left + 2; sx < left + aw + 4; sx += 10) { g.beginPath(); g.arc(sx, ay + 22, 4, 0, TAU); g.fill(); }
  // the counter and the cloth over its front
  boxShaded(g, left + 2, STALL_COUNTER, STALL_IN, 8, wood, dark, INK, 1, 0.5);
  g.fillStyle = cloth; g.fillRect(left + 4, STALL_COUNTER + 8, STALL_IN - 4, 20);
  g.fillStyle = mix(cloth, GARDEN.plum, 0.3); g.fillRect(left + 4, STALL_COUNTER + 22, STALL_IN - 4, 6);
  // three crates of produce, muted: cabbages, roots in their skins, a punnet of something pale
  const crateHex = mix(wood, GARDEN.hazel, 0.45), cabbage = mix(GARDEN.leaf, GARDEN.wall, 0.25);
  for (let i = 0; i < 3; i++) {
    const cx = left + 14 + i * 42;
    boxOutlined(g, cx, STALL_COUNTER - 14, 34, 14, crateHex, INK, 1);
    g.fillStyle = mix(crateHex, GARDEN.plum, 0.4); g.fillRect(cx, STALL_COUNTER - 5, 34, 5);
    g.fillStyle = i === 1 ? mix(GARDEN.hazel, UI.cream, 0.3) : cabbage;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + 8 + k * 9, STALL_COUNTER - 15 + R(rnd() * 2), 5, 0, TAU); g.fill(); }
  }
}

function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, ROWS.wallTop, [[0, GARDEN.skyTop], [1, GARDEN.skyLow]]);
  // the tree line beyond the wall: flat plum clumps whose tops break the wall's straight coping
  g.fillStyle = GARDEN.plum;
  for (let x = -12; x < w + 24; x += 15) { const r = 5 + rnd() * 9; g.beginPath(); g.arc(x, ROWS.wallTop - 5, r, 0, TAU); g.fill(); }
  g.fillRect(0, ROWS.wallTop - 6, w, 8);
  // the wall: coping course, then the stone field with its mortar lines and a weathered patch here and there
  boxShaded(g, -2, ROWS.wallTop, w + 4, 9, mix(GARDEN.wall, UI.cream, 0.22), GARDEN.wallDark, INK, 2, 0.45);
  g.fillStyle = GARDEN.wall; g.fillRect(0, ROWS.wallTop + 11, w, ROWS.wallBot - ROWS.wallTop - 11);
  g.fillStyle = GARDEN.wallDark;
  for (let y = ROWS.wallTop + 20, i = 0; y < ROWS.wallBot; y += 9, i++) course(g, w, y, i & 1 ? 0 : 13);
  g.fillStyle = mix(GARDEN.wall, GARDEN.wallDark, 0.45);
  for (let i = 0; i < 40; i++) g.fillRect(R(rnd() * w), ROWS.wallTop + 12 + R(rnd() * 60), 6 + R(rnd() * 12), 2);
  // the gate: an arched opening with the lane beyond it in two plum steps, and a plank door standing half open
  g.fillStyle = INK;
  g.beginPath(); g.arc(GATE_X, GATE_TOP + GATE_W / 2, GATE_W / 2 + 3, Math.PI, 0); g.fill();
  g.fillRect(GATE_X - GATE_W / 2 - 3, GATE_TOP + GATE_W / 2, GATE_W + 6, ROWS.wallBot - GATE_TOP - GATE_W / 2);
  g.fillStyle = PLUM.deep;
  g.beginPath(); g.arc(GATE_X, GATE_TOP + GATE_W / 2, GATE_W / 2, Math.PI, 0); g.fill();
  g.fillRect(GATE_X - GATE_W / 2, GATE_TOP + GATE_W / 2, GATE_W, ROWS.wallBot - GATE_TOP - GATE_W / 2);
  boxShaded(g, GATE_X - 2, GATE_TOP + 6, GATE_W / 2 + 2, ROWS.wallBot - GATE_TOP - 6, UI.wood, UI.woodDark, INK, 1, 0.3);
  espalier(g, 190, ROWS.wallBot - 2);
  espalier(g, 452, ROWS.wallBot - 2);
  // the bunting: two swags from each stall's front pole to the gate's head, hung clear of the wall's top rows
  bunting(g, 40, ROWS.wallTop + 14, GATE_X - 6, GATE_TOP - 6, 6, 26);
  bunting(g, GATE_X + 6, GATE_TOP - 6, w - 40, ROWS.wallTop + 14, 6, 26);
  stall(g, -6, 1, GARDEN.rose, rnd);
  stall(g, w + 6, -1, GARDEN.leaf, rnd);
}

// ---------------------------------------------------------------- mid: the wall's foot and the back bed

/** A runner-bean wigwam: three hazel canes crossed at the top with foliage clumped up their length. */
function wigwam(g, x, base, top, rnd) {
  const lean = 13, shade = mix(GARDEN.leaf, GARDEN.plum, 0.4);
  g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - lean, base); g.lineTo(x + 2, top);
  g.moveTo(x + lean, base); g.lineTo(x - 2, top);
  g.moveTo(x, base); g.lineTo(x, top + 2);
  g.stroke();
  g.strokeStyle = GARDEN.hazel; g.lineWidth = 2; g.stroke();
  // foliage: leaf clumps threaded up the canes, the lit tone on the top-left of each. It stops short of the tie at
  // the top so the three canes CROSS in open air - that crossing is the whole silhouette of a bean wigwam, and
  // without it a column of green blobs is just a cypress.
  for (let i = 0; i < 13; i++) {
    const t = 0.16 + i * 0.062, cx = x + (i & 1 ? -1 : 1) * R(lean * (1 - t)) + R(rnd() * 5) - 2, cy = R(base + (top - base) * t);
    const r = 5 + R(rnd() * 3);
    g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, r + 1, 0, TAU); g.fill();
    g.fillStyle = GARDEN.leaf; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.fillStyle = shade; g.beginPath(); g.arc(cx + 2, cy + 2, r * 0.7, 0, TAU); g.fill();
  }
}

function paintMid(g, w, h, rnd) {
  const foot = ROWS.foot - MID_Y, bed = ROWS.backBed - MID_Y;
  // the currant hedge along the wall's foot, in the middle third only so the stalls at the edges stay clear
  const hedgeSh = mix(GARDEN.leaf, GARDEN.plum, 0.45), hedgeHi = mix(GARDEN.leaf, GARDEN.hazel, 0.3);
  g.fillStyle = INK;
  for (let x = STALL_IN - 4; x < w - STALL_IN + 4; x += 14) { g.beginPath(); g.arc(x, foot + 10, 13, 0, TAU); g.fill(); }
  g.fillRect(STALL_IN - 6, foot + 10, w - STALL_IN * 2 + 12, bed - foot - 8);
  g.fillStyle = GARDEN.leaf;
  for (let x = STALL_IN - 4; x < w - STALL_IN + 4; x += 14) { g.beginPath(); g.arc(x, foot + 10, 11, 0, TAU); g.fill(); }
  g.fillRect(STALL_IN - 4, foot + 10, w - STALL_IN * 2 + 8, bed - foot - 10);
  g.fillStyle = hedgeHi;
  for (let x = STALL_IN; x < w - STALL_IN; x += 14) { g.beginPath(); g.arc(x - 3, foot + 5, 5, 0, TAU); g.fill(); }
  g.fillStyle = hedgeSh; g.fillRect(STALL_IN - 4, bed - 10, w - STALL_IN * 2 + 8, 8);
  // the water butt and a crate stack standing against it
  const dark = mix(UI.wood, PLUM.deep, 0.45);
  boxShaded(g, 470, foot - 2, 30, bed - foot + 2, UI.wood, dark, INK, 1, 0.4);
  g.fillStyle = INK; g.fillRect(468, foot + 4, 34, 3); g.fillRect(468, foot + 22, 34, 3);
  boxOutlined(g, 466, foot - 6, 38, 5, mix(UI.wood, GARDEN.hazel, 0.4), INK, 1);
  for (let i = 0; i < 3; i++) boxShaded(g, 132 + i * 4, bed - 16 - i * 13, 40, 13, mix(UI.wood, GARDEN.hazel, 0.45), dark, INK, 1, 0.35);
  // the BACK BED: its board, the dark tilled soil behind it, and the wigwams standing in it
  boxShaded(g, -2, bed, w + 4, 6, UI.wood, dark, INK, 1, 0.5);
  g.fillStyle = GARDEN.soil; g.fillRect(0, bed + 6, w, h - bed - 6);
  g.fillStyle = mix(GARDEN.soil, GARDEN.path, 0.22);
  for (let i = 0; i < 70; i++) g.fillRect(R(rnd() * w), bed + 9 + R(rnd() * (h - bed - 12)), 4 + R(rnd() * 7), 1);
  for (let i = 0; i < 4; i++) wigwam(g, 86 + i * 156, h - 2, 10 + R(rnd() * 8), rnd);
}

// ---------------------------------------------------------------- ground: the path, the crop ridge, the hurdle

/**
 * The floor. Three bands, and the middle one is the whole reason the other two look the way they do:
 *
 *   250..282  the working ground behind the crew: the path tone, combed into furrow lines with a little scatter -
 *             pebbles, a footprint, a dropped trowel - so the garden reads as worked.
 *   282..322  the CLEAN WALK BAND. Not one mark lands in it (ART_STYLE section 7). The crew's four lanes (292..316)
 *             and their contact shadows sit here, and it keeps the plain `path` tone rather than the trodden step
 *             the orchard uses: every darker band tried here collapsed Cress's green against it (see GARDEN.path).
 *             The band reads as a lane from its two 3 px scuffed EDGES instead, which are outside the rows any foot
 *             or shadow lands on.
 *   322..360  the CROP RIDGE: dark tilled earth, combed left-to-right, with clods and a woven hazel hurdle along
 *             the very bottom. Every leafy top the screen plants stands on ROWS.root, in this band, in front of the
 *             whole cast - which is what stops a critter ever hiding the thistle that is about to cost it a carrot.
 */
function paintGround(g, w, h, rnd) {
  const top = ROWS.ground;
  const band0 = ROWS.bandTop - top, band1 = ROWS.bandBot - top, ridge = ROWS.ridge - top, hurdle = ROWS.hurdle - top;
  g.fillStyle = GARDEN.path; g.fillRect(0, 0, w, ridge);
  g.fillStyle = mix(GARDEN.path, GARDEN.plum, 0.4); g.fillRect(0, 0, w, 5);
  g.fillStyle = INK; g.fillRect(0, 0, w, 1);
  // combing and scatter, back band only
  const comb = mix(GARDEN.path, GARDEN.soil, 0.3), pebble = mix(GARDEN.path, UI.cream, 0.35);
  g.fillStyle = comb;
  for (let i = 0; i < 60; i++) {
    const y = 7 + R(rnd() * (band0 - 12));
    g.fillRect(R(rnd() * w), y, 10 + R(rnd() * 22), 1);
  }
  for (let i = 0; i < 34; i++) {
    const y = 8 + R(rnd() * (band0 - 14));
    g.fillStyle = rnd() < 0.5 ? pebble : comb;
    g.fillRect(R(rnd() * w), y, 2, 2);
  }
  // the band's two scuffed edges: the lane is read from these, never from a tone under the feet
  g.fillStyle = comb;
  g.fillRect(0, band0 - 3, w, 3); g.fillRect(0, band1, w, 3);
  // Footprints, and nothing else. A dropped trowel and a coil of twine were painted here first and thrown out: in a
  // side view a 20 px object "lying on the ground" at row 267 has no ground under it to lie on, so both of them read
  // as tools floating at the crew's head height. Anything on this plane has to be FLAT and small (the orchard's
  // windfall scatter is the same 2 px rule), or it has to be a prop that stands up - which is what the barrow, the
  // water butt and the crate stack are for.
  g.fillStyle = mix(GARDEN.path, GARDEN.soil, 0.45);
  for (let i = 0; i < 9; i++) {
    const fx = R(rnd() * w), fy = 10 + R(rnd() * (band0 - 18));
    g.fillRect(fx, fy, 4, 2); g.fillRect(fx + 6, fy + 3, 4, 2);
  }
  // the CROP RIDGE
  g.fillStyle = INK; g.fillRect(0, ridge, w, 2);
  g.fillStyle = GARDEN.soil; g.fillRect(0, ridge + 2, w, h - ridge - 2);
  g.fillStyle = mix(GARDEN.soil, GARDEN.path, 0.3);
  for (let i = 0; i < 90; i++) g.fillRect(R(rnd() * w), ridge + 4 + R(rnd() * (hurdle - ridge)), 5 + R(rnd() * 12), 1);
  g.fillStyle = mix(GARDEN.soil, PLUM.deep, 0.35);
  for (let i = 0; i < 46; i++) g.fillRect(R(rnd() * w), ridge + 4 + R(rnd() * (hurdle - ridge)), 3, 2);
  // the hurdle: woven hazel along the bottom edge, two rails and the uprights threaded through them
  g.fillStyle = INK; g.fillRect(0, hurdle, w, h - hurdle);
  g.fillStyle = GARDEN.hazel;
  for (let y = hurdle + 2; y < h; y += 5) g.fillRect(0, y, w, 3);
  g.fillStyle = mix(GARDEN.hazel, GARDEN.plum, 0.4);
  for (let x = 0; x < w; x += 18) g.fillRect(x, hurdle + 2, 3, h - hurdle - 2);
  g.fillStyle = INK;
  for (let x = 9; x < w; x += 18) g.fillRect(x, hurdle, 2, h - hurdle);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { far, mid, ground }, each with the y the screen blits it at. */
export function gardenLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    far: { L: makeLayer(VIEW_W, ROWS.backBed, paintFar, SEED), y: 0 },
    mid: { L: makeLayer(VIEW_W, MID_H, paintMid, SEED + 1), y: MID_Y },
    ground: { L: makeLayer(VIEW_W, VIEW_H - ROWS.ground, paintGround, SEED + 2), y: ROWS.ground },
  };
  return LAYERS;
}
