// Pippin Orchard, painted once (docs/ART_STYLE.md section 1 "Orchard", section 7; docs/GDD.md section 5).
//
// Five layers with seeds from the orchard block 100..109, side view, daylight. Row bands are the contract the screen
// stands its critters on: sky 0..SKY_H, the canopy mass above the trunks, grass from GRASS_Y, the play band
// (BAND_TOP..BAND_BOT) trodden a step darker and kept free of scatter, and the fence rail pinned to
// FENCE_Y..360 in the near layer. Nothing here animates: the petals, the apples, the splats and the critters are the
// screen's per-frame marks. Every canopy is one inked mass (ink pass, fill pass, then caps and crescents clipped per
// blob) so a reader sees one tree-line, not a heap of outlined circles.
//
// THE TREES ARE THE FRUIT'S OWN. The orchard drops pears, peaches and avocados as well as apples (content/recipes.js
// names it on four ingredients), and for a while every one of them fell out of the same apple trees, so a pear visit
// was the apple orchard with the glyph swapped. The two layers that ARE the trees - `mid` (the trunks and canopies)
// and `eaves` (the crown edges hanging in at the top corners) - are painted from a per-fruit TREES entry: the same
// painter and the same rnd stream (seeds 101 and 104 for every fruit, exactly as the cove repaints the pond's layout
// in another palette), a different shape and leaf tone. The sky, the plum wood, the grass and the fence are one
// orchard whichever tree stands in it, so those three layers are painted once and shared between the variants.
// Layers are cached PER FRUIT (`orchardLayers`, the pond's `pondLayers(variant)` pattern), so a day that visits for
// apples and then for pears repaints nothing on the second visit and the two never fight over one cache.
import { makeLayer, vGradient, boxShaded, INK, PARALLAX, VIEW_W, VIEW_H } from '../layers.ts';
import { mix } from '../palettes.ts';
import { PLUM, UI } from '../../constants.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The orchard's muted constants. The one saturated colour in the scene is SIGNAL.orchard, the ripe apple, and it
 * appears NOWHERE in here: a 2x2 fleck of a near-apple red on the grass the player is scanning IS a false apple
 * (ART_STYLE section 4 binds the signal to one meaning and bans it as decor), so the windfall scatter is painted in
 * the orchard's own browns instead. `plum` and `fence` are shared ladder colours, so the scene-only list is nine.
 */
export const ORCHARD = Object.freeze({
  skyTop: '#FBE3C4', skyLow: '#F4C9A0', hill: '#B4A48C', plum: PLUM.shadow,
  grass: '#5E7A3E', tuft: '#6E8A48', canopy: '#4F6B3A', trunk: '#6B4E3A', fence: UI.wood,
  /** Windfall: a dull dry-grass brown, 0.42 off the grass by value and 0.42 off the map/coop signal gold. */
  fallen: '#B39A62',
  /**
   * A wormy apple: a bruised brown a long way below the floor it falls across (0.62 relative luminance from the
   * grass, 0.50 from the canopy, 0.30 from the trunks), because "not the signal colour" is too weak a tell on its
   * own - the screen adds a bitten silhouette and a grub on top of it.
   */
  wormy: '#5E4030',
});

/** Row bands (screen y). */
export const SKY_H = 120, GRASS_Y = 220, FENCE_Y = 340;
/**
 * Inside the plum wood: its top edge, the value-step line where the dark tree mass gives way to the far orchard
 * floor, and the far fence's top rail. The mid trees' canopies hang down to about row 142, so the rows a player
 * actually sees of this band are 142..220 and every mark in here is aimed at that window.
 */
const WOOD_Y = SKY_H + 2, HAZE_Y = 166, FENCE_FAR_Y = 188;
/** The clean band: no tuft or windfall lands here, so four lanes of feet (292..316) and their shadows stand on plain grass. */
export const BAND_TOP = 284, BAND_BOT = 322;
/** Layers are painted this much wider than the screen on each side so a parallax blit never shows an edge. */
export const BLEED_X = 64;
const LW = VIEW_W + BLEED_X * 2;
const SEED = 100;

/** What makeLayer hands back: the offscreen canvas and its size. */
type Layer = ReturnType<typeof makeLayer>;

/**
 * One tree per fruit the orchard drops: the shape and the leaf tone of `mid` and `eaves`. Read ONCE, at paint time,
 * so plain named fields cost nothing per frame (the pond's COVE is the same shape of table).
 *
 * The geometry fields drive paintMid's one loop: trees stand `pitch + rnd * pitchJit` apart, the canopy's centre
 * sits at row `cy + rnd * cyJit`, and each crown is `blobs` (+1 on a coin flip) discs thrown `spread..spread+spreadJit`
 * px from the centre, stretched by `sx` across and `sy` down, of radius `r..r+rJit`, plus one core disc of `coreR`
 * at `coreDy` under the centre. `capR` is the highlight cap's radius as a fraction of the blob's, `trunk` the trunk's
 * width, and `eaveR`/`eaveJit`/`eaveStep` the corner eaves' discs.
 *
 *   apple    the shipped tree, untouched: its numbers are the literals the painter used to hold, consumed from the
 *            stream in the same order, so the apple orchard is pixel-identical to the one every screenshot and
 *            scenario was judged on.
 *   pear     TALLER AND NARROWER. The blobs are thrown 0.55 across and 1.3 down, so each crown is an upright egg
 *            about 90 px wide and 120 tall, and the trees stand a tighter 84..100 apart so the row still closes
 *            above the hang row. A yellower, lighter leaf than the apple's (#587A3C with #82A04E caps), because a
 *            pear tree in leaf IS a paler green and because the hanging pear (#B9C24A) has to sit on it.
 *   peach    ROUNDER, and pink-tinged. The spread is a wider, shallower ellipse and the core disc is a full 44 px
 *            ball, so each crown is one round head about 150 px wide. The leaf is a warmer olive (#5F7040) and the
 *            highlight cap a dusty rose (#C49488, sat .30): a storybook peach tree carries its blossom and its fruit
 *            at once, and the pink cap on every blob is what says "peach" at the squint. Measured: peach #F5A66B is
 *            L .48 against the cap's .33 (relDiff .31) and the fill's .14 (.70), so the fruit still pops.
 *   avocado  A BIG DARK GLOSSY CANOPY: fewer, bigger trees (140..160 apart, blobs r 36..44, a 46 px core) on a
 *            thick 16 px trunk, in a deep cool green (#3A5A48, L .09 - a hue step off the hive's hedge #3F5A34, so
 *            the two dark greens never twin) with a larger, cooler cap (#6E9070 at 0.72 r) for the gloss. The
 *            fruit's own green #5C7A3B (L .165) clears the fill by .47, and at the falling size the glyph shows its
 *            cut flesh and stone anyway, which is what reads.
 * Every tone is under the .65 saturation ceiling (ART_STYLE section 1). None of the four fruit hexes is painted in:
 * a fruit in the leaves that never falls is a false target, for a pear exactly as for the signal-red apple, so the
 * only fruit in any canopy is the screen's own hanging one, one beat before it lets go.
 */
export interface TreeStyle {
  canopy: string; cap: string; capR: number;
  pitch: number; pitchJit: number; cy: number; cyJit: number; blobs: number;
  spread: number; spreadJit: number; sx: number; sy: number; r: number; rJit: number; coreDy: number; coreR: number;
  trunk: number; eaveR: number; eaveJit: number; eaveStep: number;
}
export const TREES: Readonly<Record<string, TreeStyle>> = Object.freeze({
  apple: Object.freeze({ canopy: ORCHARD.canopy, cap: ORCHARD.tuft, capR: 0.62, pitch: 104, pitchJit: 24, cy: 84, cyJit: 12, blobs: 4,
    spread: 20, spreadJit: 10, sx: 1, sy: 0.7, r: 30, rJit: 8, coreDy: 6, coreR: 38, trunk: 12, eaveR: 22, eaveJit: 6, eaveStep: 34 }),
  pear: Object.freeze({ canopy: '#587A3C', cap: '#82A04E', capR: 0.62, pitch: 84, pitchJit: 16, cy: 82, cyJit: 10, blobs: 5,
    spread: 18, spreadJit: 10, sx: 0.55, sy: 1.3, r: 22, rJit: 6, coreDy: 8, coreR: 28, trunk: 10, eaveR: 16, eaveJit: 6, eaveStep: 26 }),
  peach: Object.freeze({ canopy: '#5F7040', cap: '#C49488', capR: 0.6, pitch: 124, pitchJit: 20, cy: 90, cyJit: 8, blobs: 5,
    spread: 24, spreadJit: 8, sx: 1.1, sy: 0.85, r: 30, rJit: 6, coreDy: 0, coreR: 44, trunk: 12, eaveR: 24, eaveJit: 6, eaveStep: 36 }),
  avocado: Object.freeze({ canopy: '#3A5A48', cap: '#6E9070', capR: 0.72, pitch: 140, pitchJit: 20, cy: 88, cyJit: 10, blobs: 6,
    spread: 26, spreadJit: 12, sx: 1.15, sy: 0.85, r: 36, rJit: 8, coreDy: 4, coreR: 46, trunk: 16, eaveR: 26, eaveJit: 6, eaveStep: 40 }),
});
/** The tree for an ingredient id; anything the table does not name (or no ingredient at all) stands in the apple orchard. */
export function treeFor(ing: string): TreeStyle { return TREES[ing] || TREES.apple; }

/** One canopy blob list: [cx, cy, r, ...] in layer space; `capR` is the highlight cap's radius as a fraction of the blob's. */
function crowns(g, list, fill, cap, shade, capR = 0.62) {
  g.fillStyle = INK;
  for (let i = 0; i < list.length; i += 3) { g.beginPath(); g.arc(list[i], list[i + 1], list[i + 2] + 2, 0, TAU); g.fill(); }
  g.fillStyle = fill;
  for (let i = 0; i < list.length; i += 3) { g.beginPath(); g.arc(list[i], list[i + 1], list[i + 2], 0, TAU); g.fill(); }
  // caps toward the top-left light and one shadow crescent away from it, each clipped inside its own blob
  for (let i = 0; i < list.length; i += 3) {
    const cx = list[i], cy = list[i + 1], r = list[i + 2];
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    g.fillStyle = cap; g.beginPath(); g.arc(cx - r * 0.22, cy - r * 0.26, r * capR, 0, TAU); g.fill();
    g.fillStyle = shade; g.beginPath(); g.arc(cx + r * 0.34, cy + r * 0.4, r * 0.8, 0, TAU); g.fill();
    g.fillStyle = fill; g.beginPath(); g.arc(cx - r * 0.1, cy - r * 0.05, r * 0.66, 0, TAU); g.fill();
    g.restore();
  }
}

/**
 * A cottage on the far side of the wood, standing on the haze floor: a dark plum roof with a chimney over a pale
 * wall and one dark window. No ink - at this depth every backdrop object is a silhouette in two plum steps, and a
 * 1 px line on a 30 px house would be the busiest mark on the plane the name plates sit on.
 */
function cottage(g, x, y, flip) {
  const roof = mix(ORCHARD.plum, PLUM.deep, 0.5), wall = mix(ORCHARD.plum, ORCHARD.hill, 0.45);
  // chimney, door and window, mirrored inside the 32 px footprint so the two cottages are not one stamp twice
  const chim = flip ? x + 5 : x + 22, door = flip ? x + 15 : x + 12, win = flip ? x + 7 : x + 21;
  g.fillStyle = wall; g.fillRect(x + 4, y - 12, 24, 12);
  g.fillStyle = roof;
  g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 16, y - 23); g.lineTo(x + 32, y - 10); g.closePath(); g.fill();
  g.fillRect(chim, y - 25, 5, 9);
  g.fillRect(door, y - 9, 5, 6); g.fillRect(win, y - 8, 4, 4);
}

/**
 * Far: the sky gradient, two hill tiers, and the plum wood the trunks stand against.
 *
 * The wood used to be one flat plum rectangle a hundred rows deep - the right colour, the right idea and nothing in
 * it. It is now the same mass in two value steps with a silhouette on the join: dark wood down to HAZE_Y, a distant
 * tree-line whose crowns and trunks dip out of it, then the far orchard floor one step lighter (L .33 against the
 * wood's .22 - a 33 % step, and still 66 % below Barley's wool, which is what keeps the two pale critters reading).
 * Standing on that floor are two cottages and a post-and-rail fence, the same fence the near layer carries four
 * depth lanes closer. Everything here is flat silhouette in the plum ladder: no ink, no third tone.
 */
function paintFar(g, w, h, rnd) {
  vGradient(g, 0, 0, w, SKY_H, [[0, ORCHARD.skyTop], [1, ORCHARD.skyLow]]);
  const farHill = mix(ORCHARD.hill, ORCHARD.skyLow, 0.5);
  g.fillStyle = farHill;
  for (let x = -40; x < w + 40; x += 110) { g.beginPath(); g.ellipse(x + rnd() * 30, 108, 90, 26 + rnd() * 8, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 106, w, SKY_H - 106);
  g.fillStyle = ORCHARD.hill;
  for (let x = -20; x < w + 40; x += 90) { g.beginPath(); g.ellipse(x + rnd() * 24, 116, 70, 16 + rnd() * 6, 0, 0, TAU); g.fill(); }
  g.fillRect(0, 114, w, SKY_H - 114);
  // the plum tree-line's top edge: leaf clumps small enough to read as foliage in the gaps between the mid trees
  g.fillStyle = ORCHARD.plum;
  for (let x = -12; x < w + 24; x += 13) { const r = 5 + rnd() * 9; g.beginPath(); g.arc(x, WOOD_Y + 4, r, 0, TAU); g.fill(); }
  g.fillRect(0, WOOD_Y + 2, w, h - WOOD_Y - 2);
  // the one value step inside the band: the far orchard floor, warmer and lighter as it goes back into the haze
  g.fillStyle = mix(ORCHARD.plum, ORCHARD.hill, 0.26);
  g.fillRect(0, HAZE_Y, w, h - HAZE_Y);
  // ...and the silhouette that makes the join a shape rather than a ruled line: distant crowns on short trunks
  g.fillStyle = ORCHARD.plum;
  for (let x = -10; x < w + 20; x += 25) {
    const cx = R(x + rnd() * 8), r = 8 + R(rnd() * 8), cy = HAZE_Y - R(r * 0.3) + R(rnd() * 5);
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    g.fillRect(cx - 1, cy + r - 3, 3, 5 + R(rnd() * 6));
  }
  cottage(g, 92, FENCE_FAR_Y - 2, false);
  cottage(g, 534, FENCE_FAR_Y - 4, true);
  // the far fence: two rails and posts, dark on the lighter floor, well above the rows the name plates land on
  g.fillStyle = mix(ORCHARD.plum, PLUM.deep, 0.5);
  g.fillRect(0, FENCE_FAR_Y, w, 2); g.fillRect(0, FENCE_FAR_Y + 6, w, 2);
  for (let x = 6; x < w; x += 29) g.fillRect(x, FENCE_FAR_Y - 3, 3, 14);
}

/**
 * Mid: the lollipop trees, in the shape and tone `T` (one TREES entry) gives them. Trunks first (behind), then every
 * canopy as one mass that overlaps into its neighbours.
 *
 * The rnd stream is consumed in exactly the order the apple painter always consumed it (the pitch, then the trunk's
 * jitter, the centre row, the coin flip, then per blob the angle, the throw and the radius), and the apple entry's
 * numbers are the ones that used to be literals here, so TREES.apple paints the orchard that shipped.
 */
function paintMid(g, w, h, rnd, T: TreeStyle) {
  const shade = mix(T.canopy, ORCHARD.plum, 0.45), trunkShade = mix(ORCHARD.trunk, ORCHARD.plum, 0.4);
  const blobs = [];
  for (let x = 24; x < w; x += T.pitch + R(rnd() * T.pitchJit)) {
    const tx = x + R(rnd() * 16), tw = T.trunk;
    // trunk: one inked block with its shadow band on the right, flaring at the root into the grass line
    g.fillStyle = INK; g.fillRect(tx - tw / 2 - 2, 120, tw + 4, GRASS_Y - 120 + 2);
    g.fillStyle = ORCHARD.trunk; g.fillRect(tx - tw / 2, 122, tw, GRASS_Y - 122 + 2);
    g.fillStyle = trunkShade; g.fillRect(tx + 1, 122, tw / 2 - 1, GRASS_Y - 122 + 2);
    g.fillStyle = INK; g.fillRect(tx - tw / 2 - 5, GRASS_Y - 8, tw + 10, 10);
    g.fillStyle = ORCHARD.trunk; g.fillRect(tx - tw / 2 - 3, GRASS_Y - 6, tw + 6, 8);
    g.fillStyle = trunkShade; g.fillRect(tx + 1, GRASS_Y - 6, tw / 2 + 2, 8);
    // canopy: T.blobs or one more, big enough that the row closes into one mass. For the apple tree the measured
    // coverage across the visible width is 18 % at row 40, 58 % at row 50 and 78 % at row 60, so the screen hangs
    // its apples at row 66 (its FALL table) - that is where an apple is inside the leaves rather than balanced on
    // the rim of them. The other three trees are measured the same way and each hangs its fruit on its own row.
    const cy = T.cy + R(rnd() * T.cyJit), n = T.blobs + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.8, d = T.spread + rnd() * T.spreadJit;
      blobs.push(R(tx + Math.cos(a) * d * T.sx), R(cy + Math.sin(a) * d * T.sy), R(T.r + rnd() * T.rJit));
    }
    blobs.push(tx, cy + T.coreDy, T.coreR);
  }
  crowns(g, blobs, T.canopy, T.cap, shade, T.capR);
}

/**
 * Ground: grass with the trees' shade at its top edge, a trodden band under the four lanes, then tufts and windfall
 * OUTSIDE that band.
 *
 * The band is the fix for the one pale-on-pale in the scene: Cress is a green frog (`#3F7D3B`) standing on green
 * grass (`#5E7A3E`) - 0.04 apart by value, 28 deg apart by hue, which fails both clauses of ART_STYLE 0.1. Both
 * hexes are pinned by ART_STYLE section 1, so the separation has to come from the layer: the rows the cast walks are
 * trodden flat and a step toward the plum shadow, which lifts every seat off the floor by 0.28 and gives the
 * scatter-free band a reason to be there. It stays at L .31 so Barley's and Chicory's dark feet still read on it.
 */
function paintGround(g, w, h, rnd) {
  g.fillStyle = ORCHARD.grass; g.fillRect(0, 0, w, h);
  g.fillStyle = mix(ORCHARD.grass, ORCHARD.plum, 0.4); g.fillRect(0, 0, w, 6);
  g.fillStyle = INK; g.fillRect(0, 0, w, 1);
  const top = BAND_TOP - GRASS_Y, bot = BAND_BOT - GRASS_Y;
  const trodden = mix(ORCHARD.grass, ORCHARD.plum, 0.3), edge = mix(ORCHARD.grass, trodden, 0.5);
  g.fillStyle = edge; g.fillRect(0, top - 5, w, bot - top + 10);
  g.fillStyle = trodden; g.fillRect(0, top - 2, w, bot - top + 4);
  for (let i = 0; i < 150; i++) {
    const x = R(rnd() * w), y = 8 + R(rnd() * (h - 12));
    if (y >= top - 6 && y <= bot + 5) continue;
    g.fillStyle = ORCHARD.tuft; g.fillRect(x, y, 2, 3); g.fillRect(x + 3, y + 1, 2, 2);
  }
  // windfall: the orchard's own browns, never the apple's red - at 2x2 px a near-signal fleck is a false apple
  for (let i = 0; i < 40; i++) {
    const x = R(rnd() * w), y = 8 + R(rnd() * (h - 12));
    if (y >= top - 6 && y <= bot + 5) continue;
    g.fillStyle = rnd() < 0.5 ? ORCHARD.trunk : ORCHARD.fallen; g.fillRect(x, y, 2, 2);
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

/** Near, top: two edges of the fruit's own canopy hanging into the frame at the corners (the centre stays clear for the clock). */
function paintEaves(g, w, h, rnd, T: TreeStyle) {
  const shade = mix(T.canopy, ORCHARD.plum, 0.45), blobs = [];
  for (let x = 0; x < 250; x += T.eaveStep) blobs.push(x + R(rnd() * 8), R(rnd() * 6) - 14, T.eaveR + R(rnd() * T.eaveJit));
  for (let x = w - 250; x < w; x += T.eaveStep) blobs.push(x + R(rnd() * 8), R(rnd() * 6) - 14, T.eaveR + R(rnd() * T.eaveJit));
  crowns(g, blobs, T.canopy, T.cap, shade, T.capR);
}

/** The five layers a visit blits: `mid` and `eaves` are the fruit's own tree, the other three are the one orchard. */
export interface OrchardLayers { far: Layer; mid: Layer; ground: Layer; near: Layer; eaves: Layer }
/** The three layers every fruit shares, painted on the first visit of any kind. */
let shared: { far: Layer; ground: Layer; near: Layer } | null = null;
/** The pre-rendered set per fruit (TREES keys), painted on the first visit for that fruit and kept for every visit after. */
const layers: Record<string, OrchardLayers | null> = { apple: null, pear: null, peach: null, avocado: null };

/**
 * The layers for a visit that gathers `ing`, painted on first use and cached per fruit. Each is blitted by the
 * screen at `-BLEED_X - round(cam * f)` for its parallax factor f (PARALLAX.far/mid/ground/near). The scene is one
 * screen wide so the camera never actually moves; the factors are wired so a wider orchard is a one-line change.
 * `mid` and `eaves` are painted from the fruit's TREES entry on the same seeds whichever fruit it is (the layout is
 * one rnd stream; only the table differs); far, ground and near are painted once and handed to every set.
 */
export function orchardLayers(ing: string): OrchardLayers {
  const key = TREES[ing] ? ing : 'apple';
  if (layers[key]) return layers[key];
  if (!shared) {
    shared = {
      far: makeLayer(LW, GRASS_Y + 8, paintFar, SEED),
      ground: makeLayer(LW, VIEW_H - GRASS_Y, paintGround, SEED + 2),
      near: makeLayer(LW, VIEW_H - FENCE_Y, paintFence, SEED + 3),
    };
  }
  const T = TREES[key];
  layers[key] = {
    far: shared.far,
    mid: makeLayer(LW, GRASS_Y + 8, (g, w, h, rnd) => paintMid(g, w, h, rnd, T), SEED + 1),
    ground: shared.ground,
    near: shared.near,
    eaves: makeLayer(LW, 30, (g, w, h, rnd) => paintEaves(g, w, h, rnd, T), SEED + 4),
  };
  return layers[key];
}

export { PARALLAX };
