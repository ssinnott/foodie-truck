// The mill's props (docs/GDD.md section 5, docs/ART_STYLE.md section 1 "Mill", section 7): the four chutes and
// their spouts, the flour falling out of one, the heap an uncaught pour makes on the planks, the sack a critter
// holds (a `weapon`-slot item, so the rig draws it in hand space like every other held thing), the paper fill tag
// that reads that sack from across the room, the barrow the party's tied sacks land on, the spur wheel and stone
// nut turning overhead, and the sail sweeping past the high window.
//
// Screen space, integer coordinates, no allocation per call, the scene's palette from backgrounds/mill.js and the
// game's warm ink round every object. Four rules this file exists to hold:
//   * SIGNAL.mill (gold) is the ONE saturated colour here and it marks exactly one thing, the thing constants.js
//     binds it to: THE CHUTE THAT IS POURING NOW. It is never painted on a beam, a sack, a plank or a paper ticket
//     (ART_STYLE section 4 bans a signal colour as decor), and the wake telegraph does NOT get it - a warning that
//     wore the scene's signal would leave the pour itself unmarked, so the telegraph moves and strobes in the
//     room's own tones instead (drawChute).
//   * "nearly full, let go" is SIGNAL.good under an ink line, on the fill tag's brim band and on the sack's own tie:
//     the kitchen's stove bar idiom, and the case ART_STYLE section 4 names when it bans gold on paper (0.17).
//   * SIGNAL.hot is the game's reserved danger colour and marks one thing here, the sack about to burst: the tag's
//     zone past the brim post and the sack's tie strobing with it - the same job it does on the rooster's comb.
//   * WHAT is pouring is a per-visit record from GRAINS (flour or rice, docs/GDD.md section 5), picked ONCE by the
//     screen in enter() with `grainFor(ingredient)` and handed into every draw here, the way the garden picks its
//     plant. The mechanic is the same sack under the same spout; the record only changes what the eye is told is
//     falling - flour's dust bands or rice's loose grains - and how the sack it lands in is marked.
// Everything that turns turns on an INDEX STEP read from the scene's frame counter, never on the simulation clock.
import { UI, SIGNAL, PLAYER_COLORS, PLUM } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { pathGear } from '../lib/art/shapes.ts';
import { celPath, pathRR, LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
import { MILL, RICE, ROWS, WINDOW } from './backgrounds/mill.ts';
import { INGREDIENTS } from '../content/recipes.ts';

const R = Math.round, TAU = Math.PI * 2;

// ---------------------------------------------------------------- shared tones (built once, never per frame)
const BEAM_DARK = mix(MILL.beam, PLUM.deep, 0.45);
const BEAM_LIT = mix(MILL.beam, MILL.flour, 0.2);
const IRON_DARK = mix(MILL.iron, PLUM.deep, 0.4);
const DUST_SH = mix(MILL.dust, MILL.timber, 0.34);
const FLOUR_SH = mix(MILL.flour, PLUM.shadow, 0.26);
const SAIL_LATH = mix(INK, MILL.sky, 0.3);
const SLEEVE_SH = mix(MILL.hessian, PLUM.deep, 0.35);
/** The two gears' own shadow band and flour cap, built here because `gearWheel` may not mix inside a draw. */
const GEAR_BEAM_SH = mix(MILL.beam, PLUM.deep, 0.4), GEAR_BEAM_HI = mix(MILL.beam, MILL.flour, 0.28);
const GEAR_IRON_HI = mix(MILL.iron, MILL.flour, 0.28);
/**
 * The sack's canvas and the packed flour inside it. The two are 32 % apart by value (L .57 against L .80), which is
 * what lets the fill level read at 1x as a colour change INSIDE the sack's own outline rather than as a second
 * inked object stuck to it (ART_STYLE 0.2: a boundary inside one silhouette carries no line of its own).
 */
const CANVAS = '#A88E63', PACKED = '#DCCBA2', CANVAS_SH = mix(CANVAS, PLUM.shadow, 0.34);
/**
 * The rice sack's own tones. The packed rice is the ingredient's own near-white stepped a fifth toward the flour's
 * cream (L .88 against the canvas's .57, the same order of ladder as the flour's .80), so the fill level still
 * reads as a colour change INSIDE the sack's line; `STENCIL` is the dark band a rice sack is marked with, the
 * canvas in shadow again, and the one mark that tells the two sacks apart on the cart at 1x.
 */
const RICE_PACKED = mix(RICE.grain, PACKED, 0.2), RICE_PACKED_SH = mix(RICE_PACKED, PLUM.shadow, 0.26);
const STENCIL = mix(CANVAS, PLUM.deep, 0.55);

// ---------------------------------------------------------------- the spur wheel and the stone nut
/**
 * The gearing overhead. Pitch circumference per tooth is identical on both wheels (2*PI*36/12 = 2*PI*18/6 = 18.85 px),
 * which is the only thing that makes teeth LOOK meshed; the nut then has to turn exactly twice as fast and the other
 * way, which is where its `-2` comes from. Both sit in rows 26..92: under the ceiling boards the beam layer blits
 * over them, and a clear four rows above the bressummer at ROWS.joist, so the machinery never lands on the frame.
 */
const BIG_X = 62, BIG_Y = 50, BIG_R = 42, BIG_PITCH = 36, BIG_TEETH = 12;
const NUT_X = BIG_X + BIG_PITCH + 18, NUT_Y = BIG_Y, NUT_R = 22, NUT_TEETH = 6;
/** 36 stops per revolution, one every 3 frames: 108 frames a turn, slow enough to read as a mill and not a fan. */
const GEAR_STOPS = 36, GEAR_DIV = 3;
/** Half a tooth of phase, so the nut's teeth sit in the wheel's gaps at the mesh instead of nose to nose. */
const NUT_PHASE = TAU / (NUT_TEETH * 2);

/**
 * One inked gear: teeth, a shadow band on the lower half, `spokes` arms and a hub. `rot` in radians. `sh` and `hi`
 * are `fill`'s own shadow and flour cap, passed in already mixed - a gear is drawn twice a frame, every frame of
 * the round, and ARCHITECTURE section 8 allows no mix() (two array literals and four strings) inside a draw.
 */
function gearWheel(ctx, cx, cy, r, teeth, rot, fill, sh, hi, spokes) {
  pathGear(ctx, cx, cy, r, teeth, rot, r * 0.24);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = sh; ctx.fillRect(cx - r, cy + r * 0.1, r * 2, r);
  ctx.fillStyle = hi; ctx.fillRect(cx - r, cy - r, r * 2, 3);   // flour caught on the top arc
  ctx.restore();
  // an iron tyre shrunk on the pitch circle: without it a twelve-tooth oak wheel on an oak wall read as a flower
  ctx.strokeStyle = MILL.iron; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, TAU); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, TAU); ctx.stroke();
  if (spokes > 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    for (let i = 0; i < spokes; i++) {
      ctx.rotate(TAU / spokes);
      ctx.fillStyle = INK; ctx.fillRect(-3, -r + 4, 6, r - 4);
      ctx.fillStyle = BEAM_LIT; ctx.fillRect(-2, -r + 5, 4, r - 6);
    }
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.26, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = MILL.iron; ctx.fill();
  ctx.fillStyle = IRON_DARK; ctx.beginPath(); ctx.arc(cx + 1, cy + 1, r * 0.13, 0, TAU); ctx.fill();
}

/**
 * The spur wheel driving the stone nut, stepped one notch every GEAR_DIV frames. `frame` is the scene's counter, so
 * the machinery keeps turning while the round is over and the sign hangs - a mill does not stop for a scoreboard.
 */
export function drawGear(ctx, frame) {
  const stop = ((frame / GEAR_DIV) | 0) % GEAR_STOPS, a = stop * (TAU / GEAR_STOPS);
  gearWheel(ctx, BIG_X, BIG_Y, BIG_R, BIG_TEETH, a, MILL.beam, GEAR_BEAM_SH, GEAR_BEAM_HI, 6);
  gearWheel(ctx, NUT_X, NUT_Y, NUT_R, NUT_TEETH, NUT_PHASE - a * 2, MILL.iron, IRON_DARK, GEAR_IRON_HI, 0);
}

// ---------------------------------------------------------------- the sail past the window
/** The sail's hub is off frame beyond the window's top right; the arms are long enough to cross the whole opening. */
const SAIL_CX = 612, SAIL_CY = -46, SAIL_LEN = 178, SAIL_PERIOD = 240, SAIL_BAR = 14, SAIL_HALF = 13;

/**
 * One turn of the sails every SAIL_PERIOD frames, clipped to the window's opening: an arm crosses the light about
 * every 75 frames. The only reason the mill's outside exists in this scene, and it costs one clip and four rotated
 * bars a frame.
 */
export function drawSail(ctx, frame) {
  const a = (frame % SAIL_PERIOD) / SAIL_PERIOD * TAU;
  ctx.save();
  ctx.beginPath(); ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h); ctx.clip();
  ctx.translate(SAIL_CX, SAIL_CY);
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(a + i * (TAU / 4));
    ctx.fillStyle = INK; ctx.fillRect(-4, 0, 8, SAIL_LEN);
    ctx.fillStyle = SAIL_LATH; ctx.fillRect(-2, 2, 4, SAIL_LEN - 4);
    ctx.fillStyle = INK;
    for (let k = SAIL_BAR; k < SAIL_LEN; k += SAIL_BAR) ctx.fillRect(-SAIL_HALF, k, SAIL_HALF * 2, 3);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the chutes
/** Chute states, shared with the screen: the spout is asleep, warning, or pouring. */
export const DORMANT = 0, WAKING = 1, POURING = 2;
/** Spout geometry, measured off ROWS: the hopper head, the neck it necks down to, and the lip's opening. */
const HOP_W = 21, NECK_W = 12, LIP_W = 15, LIP_H = 7, HEAD_H = 28;
/** The mouth's opening: 16x4 is the biggest a signal emitter gets in this scene, and it is the only gold in it. */
const MOUTH_W = 16, MOUTH_H = 4;

/**
 * One chute hanging out of the bressummer: an oak hopper head necking down into a spout with two iron hoops and a
 * canvas sleeve at the joint, and an inked lip at ROWS.mouth whose opening carries the state.
 *
 * `state` is DORMANT / WAKING / POURING; `shake` is the 1 px offset the screen alternates through the telegraph
 * (ART_STYLE 0.9 wants the warning to MOVE, and a shake is the cheapest move a static prop has); `blink` strobes
 * the wake so the warning is not a steady lamp.
 *
 * The mouth carries the state and it is the one gold in the scene, spent on the one meaning constants.js gives it:
 * POURING is SIGNAL.mill, the wake is a VALUE strobe between the spout's own shadow and lit flour, and a sleeping
 * spout is dark. The wake therefore reads as three cheap moving things - the shake, the dust falling out of the lip
 * and the strobe - while gold means "flour is falling HERE" and nothing else (ART_STYLE section 4).
 */
export function drawChute(ctx, x, state, shake, blink, g) {
  const cx = R(x) + shake, top = ROWS.chuteTop, neck = top + HEAD_H, lip = ROWS.mouth;
  // the hopper head: a tapered oak box, inked as one object
  ctx.beginPath();
  ctx.moveTo(cx - HOP_W, top); ctx.lineTo(cx + HOP_W, top); ctx.lineTo(cx + NECK_W, neck); ctx.lineTo(cx - NECK_W, neck); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = MILL.beam; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = BEAM_DARK; ctx.fillRect(cx + 2, top, HOP_W, HEAD_H);
  ctx.fillStyle = BEAM_LIT; ctx.fillRect(cx - HOP_W, top, 4, HEAD_H);
  ctx.restore();
  // the canvas sleeve at the joint: hessian, its own line, so the two woods are not one long plank
  ctx.fillStyle = INK; ctx.fillRect(cx - NECK_W - 2, neck - 3, NECK_W * 2 + 4, 11);
  ctx.fillStyle = MILL.hessian; ctx.fillRect(cx - NECK_W - 1, neck - 2, NECK_W * 2 + 2, 9);
  ctx.fillStyle = SLEEVE_SH; ctx.fillRect(cx - NECK_W - 1, neck + 3, NECK_W * 2 + 2, 4);
  // the spout: a straight oak box down to the lip, with two iron hoops
  ctx.fillStyle = INK; ctx.fillRect(cx - NECK_W + 1, neck + 8, (NECK_W - 1) * 2, lip - neck - 8);
  ctx.fillStyle = MILL.beam; ctx.fillRect(cx - NECK_W + 2, neck + 8, (NECK_W - 2) * 2, lip - neck - 8);
  ctx.fillStyle = BEAM_DARK; ctx.fillRect(cx + 3, neck + 8, NECK_W - 5, lip - neck - 8);
  ctx.fillStyle = BEAM_LIT; ctx.fillRect(cx - NECK_W + 2, neck + 8, 3, lip - neck - 8);
  for (let k = 0; k < 2; k++) {
    const hy = neck + 14 + k * 16;
    ctx.fillStyle = INK; ctx.fillRect(cx - NECK_W, hy, NECK_W * 2, 6);
    ctx.fillStyle = MILL.iron; ctx.fillRect(cx - NECK_W + 1, hy + 1, NECK_W * 2 - 2, 4);
    ctx.fillStyle = IRON_DARK; ctx.fillRect(cx - NECK_W + 1, hy + 3, NECK_W * 2 - 2, 2);
  }
  // the lip and its opening: the one place SIGNAL.mill is allowed to appear in this scene, and only while it pours
  ctx.fillStyle = INK; ctx.fillRect(cx - LIP_W, lip - LIP_H, LIP_W * 2, LIP_H + 2);
  const waking = state === WAKING && blink;
  ctx.fillStyle = waking ? MILL.dust : MILL.beam; ctx.fillRect(cx - LIP_W + 1, lip - LIP_H + 1, LIP_W * 2 - 2, 3);
  // the wake's strobe shows what is about to fall: lit flour filling the mouth, or on a rice day three grains
  // sitting in a dark mouth (the same 2x3 ovals the pour is made of, so the telegraph reads as grain too)
  const mouth = state === POURING ? SIGNAL.mill : waking ? (g.grains ? g.core : g.lit) : MILL.seam;
  ctx.fillStyle = mouth; ctx.fillRect(cx - MOUTH_W / 2, lip - MOUTH_H, MOUTH_W, MOUTH_H);
  if (waking && g.grains) {
    ctx.fillStyle = g.lit;
    ctx.fillRect(cx - 7, lip - MOUTH_H, 2, 3); ctx.fillRect(cx - 1, lip - MOUTH_H + 1, 2, 3); ctx.fillRect(cx + 4, lip - MOUTH_H, 2, 3);
  }
}

/**
 * The stream is a CONE: 6 px across at the lip and 16 px where it lands. A pour that keeps one width down 130 rows
 * is a plank however it is shaded, and the taper is what a viewer reads as "falling" before the bands even move.
 * Eight bands over a 150-frame cycle puts one every 16 px of a full-height column - dense enough that the motion
 * reads at a glance, cheap enough to stay eight fillRects.
 */
const POUR_W0 = 3, POUR_W1 = 5, POUR_BANDS = 8, POUR_CYCLE = 150;
/**
 * The stream's core, a step DOWN from MILL.dust rather than up toward cream. The travelling bands are painted in
 * MILL.flour on it, so the core is what decides whether they read at all: mixed halfway to cream it came out 12 %
 * off them, the bands vanished and the column went straight back to reading as a pale post. At L .62 the bands
 * clear it by 31 % - more than the ladder step ART_STYLE 0.1 asks of two touching parts - and the column's own
 * body clears Barley's wool by 31 % into the bargain, which is what lets it fall behind her head at all.
 */
const POUR_CORE = mix(MILL.dust, MILL.timber, 0.15);
/**
 * The rice stream's body: hessian pulled a third toward the wall's timber, L .37. Rice is the OPPOSITE problem to
 * flour. Flour is a dust that fills its column, so the body is pale and the motion is bands running through it;
 * rice is loose grain with air between the grains, so the body is the DARK of the spout's inside showing through
 * and the motion is the grains themselves. Painted the flour way - white ovals on the pale POUR_CORE - the grains
 * would sit the same 31 % off the body that the bands do, and at the 1x squint that is the flour pour with spots.
 * At L .37 the grains (L .90) clear it by more than double the ladder step, the trickle reads as a trickle of
 * separate things, and the column is darker than every fur in the cast instead of a step under the lightest one.
 */
const RICE_CORE = mix(MILL.hessian, MILL.timber, 0.35), RICE_EDGE = mix(RICE_CORE, PLUM.deep, 0.35);
/** The heap loose rice makes on the planks: the grain toned toward the hessian, a lit cap of the grain itself. */
const RICE_HEAP = mix(RICE.grain, MILL.hessian, 0.4);
/** The oat flake: the ingredient's own buff, heaped a step darker; the sack packs a shade lighter than jute. */
const OAT = INGREDIENTS.oats.hex, OAT_HEAP = mix(OAT, MILL.hessian, 0.4), OAT_PACKED = mix(OAT, PACKED, 0.3), OAT_PACKED_SH = mix(OAT_PACKED, PLUM.shadow, 0.26);
/**
 * The grains in a pouring rice chute: GRAIN_N 2x3 ovals (the smallest oval that reads at 1x, ART_STYLE 0.8), each
 * on its own index-hashed beat down the column and at its own fixed lateral slot from GRAIN_DX, in thirds of the
 * column's half-width. 31 is coprime with POUR_CYCLE, so the 32 phases spread evenly down the column instead of
 * bunching; the DX table is a fixed scatter and not a hash so a grain never jumps sideways between frames. 24 was
 * tried first and at 1x the column was a dotted line with more gap than grain; 32 puts one every 4 px of a
 * full-height column, which is a stream, and is still 32 fillRects.
 */
const GRAIN_N = 32;
const GRAIN_DX = Int8Array.of(0, -2, 2, -3, 1, 3, -1, 2, -2, 0, 3, -3, 1, -1, 2, -2, 3, 0, -3, 1, -1, 2, 1, -2, 3, -1, 0, 2, -3, 1, -2, 3);

/**
 * What a visit pours: the per-ingredient record every draw in this file reads (the garden's per-plant table is
 * the precedent). `grains` picks the pour's motion (0: flour's full-width bands; 1: rice's loose ovals) and the
 * telegraph's mouth; `lit` is the ingredient's own lightest tone (what the bands and the grains are painted in,
 * and what the waking mouth strobes to); `core`/`edge` the column's body and shadow strip; `heap`/`heapCap` the
 * pile an uncaught pour builds; `packed`/`packedSh` what fills the sack; `band` whether the sack carries the
 * stencilled band a rice sack is marked with; `mote`/`moteSize` what hangs in the light shaft (flour dust, or
 * straw chaff on a rice day); and the `puff*` fields what the wake coughs out of the lip - a dust cloud, or on a
 * rice day 3 px grains ('crumb', drawn flat with a shaded underside) that drop a short way and vanish.
 * Everything in it is built ONCE here; the screen copies the puff fields into its own options object in enter().
 */
export const GRAINS = Object.freeze({
  flour: Object.freeze({
    id: 'flour', grains: 0, lit: MILL.flour, core: POUR_CORE, edge: DUST_SH, heap: MILL.dust, heapCap: POUR_CORE,
    packed: PACKED, packedSh: FLOUR_SH, band: 0, mote: MILL.flour, moteSize: 2,
    puffKind: 'dust', puff: MILL.dust, puffSize: 3, puffGravity: 0.02, puffLife: 0,
  }),
  rice: Object.freeze({
    id: 'rice', grains: 1, lit: RICE.grain, core: RICE_CORE, edge: RICE_EDGE, heap: RICE_HEAP, heapCap: RICE.grain,
    packed: RICE_PACKED, packedSh: RICE_PACKED_SH, band: 1, mote: RICE.straw, moteSize: 2,
    puffKind: 'crumb', puff: RICE.grain, puffSize: 3, puffGravity: 0.12, puffLife: 22,
  }),
  /** Oats: the flour room (the chutes pour flakes, separate like grains but the flour's own colour), and a banded jute sack. */
  oats: Object.freeze({
    id: 'oats', grains: 1, lit: OAT, core: RICE_CORE, edge: RICE_EDGE, heap: OAT_HEAP, heapCap: OAT,
    packed: OAT_PACKED, packedSh: OAT_PACKED_SH, band: 1, mote: OAT, moteSize: 3,
    puffKind: 'crumb', puff: OAT, puffSize: 3, puffGravity: 0.08, puffLife: 24,
  }),
});
/** The record for an ingredient id; anything the mill does not know how to pour is poured as flour. */
export function grainFor(id) { return GRAINS[id] || GRAINS.flour; }

/**
 * The falling flour, from the spout's lip to wherever it is landing: (x0, y0) to (x1, y1). It LEANS, because when a
 * seat is filling, the bottom of the column is that seat's sack hanging beside its hip, not the floor - a column
 * that stayed rigid while the sack it is filling stood 12 px to one side was the single loudest lie in the scene.
 *
 * The body is POUR_CORE and not cream on purpose (see backgrounds/mill.js MILL.flour): a wide cream column falling
 * behind Barley's cream wool is a sheep-shaped hole. The only cream in it is the eight travelling bands, which are
 * what make it fall rather than hang; the 2 px DUST_SH strip left down its RIGHT edge is the shadow side of the
 * top-left light (ART_STYLE section 3). `k` in 0..1 fades the column in over its first frames so a pour starts
 * rather than appears. `g` is the visit's GRAINS record: on a rice day the same cone is the dark inside of the
 * spout with GRAIN_N separate grains falling down it, and there are no bands.
 */
export function drawPour(ctx, x0, y0, x1, y1, frame, k0, g) {
  const k = k0 < 0 ? 0 : k0 > 1 ? 1 : k0;
  const wTop = POUR_W0, wBot = POUR_W0 + R(POUR_W1 * k), h = y1 - y0;
  if (h <= 2) return;
  // Round 1 drew this 12 px wide in one flat cream and the panel read it as a stone pillar standing in a room that
  // already has four posts. Two things fixed it. WIDTH: 6 px at the lip, widening to 16 where it lands, so the top
  // of the column is half a critter's head across and can never be a plane behind one - that is what lets the body
  // sit a step under MILL.dust and still be the lightest falling thing in the frame (ART_STYLE 7).
  // MOTION: eight full-width bands of bright flour running down it on an index hash. A stream is only falling if
  // something IN it moves; a shaded edge down one side is just a highlight on a post.
  ctx.beginPath();
  ctx.moveTo(x0 - wTop, y0); ctx.lineTo(x0 + wTop, y0); ctx.lineTo(x1 + wBot, y1); ctx.lineTo(x1 - wBot, y1); ctx.closePath();
  // a 2 px line, not the usual 1 px: this is the coop's `airEgg` problem (a cream shell crossing cream wool), and
  // a pouring chute stands DIRECTLY behind whoever is filling from it, so the stream needs the heavier boundary
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = g.edge; ctx.fill();
  ctx.fillStyle = g.core;
  ctx.beginPath();
  ctx.moveTo(x0 - wTop, y0); ctx.lineTo(x0 + wTop - 2, y0); ctx.lineTo(x1 + wBot - 2, y1); ctx.lineTo(x1 - wBot, y1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = g.lit;
  if (g.grains) {
    // rice: separate 2x3 grains, each at its own phase down the column and its own slot across it, following the
    // lean and the taper the same way the bands do. Thirty-two fillRects and no clip.
    for (let i = 0; i < GRAIN_N; i++) {
      const t = ((frame * 5 + i * 31) % POUR_CYCLE) / POUR_CYCLE;
      if (t > k) continue;
      const w = wTop + (wBot - wTop) * t;
      ctx.fillRect(R(x0 + (x1 - x0) * t + GRAIN_DX[i] * (w - 1) / 3) - 1, R(y0 + h * t), 2, 3);
    }
    return;
  }
  // the bands follow the LEAN and the taper, so they stay on the flour when the column bends 20 px across to a
  // sack, and they cost eight fillRects and no clip
  for (let i = 0; i < POUR_BANDS; i++) {
    const t = ((frame * 5 + i * 19) % POUR_CYCLE) / POUR_CYCLE;
    if (t > k) continue;
    const w = wTop + (wBot - wTop) * t;
    ctx.fillRect(R(x0 + (x1 - x0) * t - w) + 1, R(y0 + h * t), R(w * 2) - 2, 3);
  }
}

/**
 * The heap an uncaught pour builds on the planks: one inked flat ellipse growing with `k` (0..1), a lit cap, and
 * two flecks kicking out sideways so the flour lands rather than simply being there. `g` is the visit's GRAINS
 * record: a rice heap is the grain's tone with the grain itself for a cap, its flecks are 2x3 grains, and three
 * more grains lie on its face so it is a heap of THINGS and not a paler flour pile.
 */
export function drawPile(ctx, x, y, k0, g) {
  const k = k0 < 0 ? 0 : k0 > 1 ? 1 : k0;
  const rx = 9 + R(17 * k), ry = 4 + R(4 * k);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, TAU); ctx.ellipse(x, y - ry, rx * 0.6 + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = g.heap;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.ellipse(x, y - ry, rx * 0.6, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = g.heapCap; ctx.beginPath(); ctx.ellipse(x - 2, y - ry - 1, rx * 0.4, ry * 0.5, 0, 0, TAU); ctx.fill();
  if (g.grains) {
    ctx.fillStyle = g.lit;
    ctx.fillRect(x - rx - 5, y - 4, 2, 3); ctx.fillRect(x + rx + 2, y - 5, 2, 3);
    ctx.fillRect(x - 6, y - 1, 2, 3); ctx.fillRect(x + 4, y - 2, 2, 3); ctx.fillRect(x + 1, y - ry - 3, 2, 3);
    return;
  }
  ctx.fillStyle = g.heap;   // two flecks kicking out sideways, so the flour LANDS instead of simply being there
  ctx.fillRect(x - rx - 5, y - 4, 3, 3); ctx.fillRect(x + rx + 2, y - 5, 3, 3);
}

// ---------------------------------------------------------------- the sack, held and flying
/**
 * Sack geometry, as a SHOULDER width and a BASE width that move apart as it fills.
 *
 * Empty it is a limp rag, 12 across the shoulder and 14 at the hem, 18 long. Full it is 16 across the shoulder and
 * 24 at the hem, 26 long, and past the brim the hem alone bulges out to 32. Two rounds were spent on a plain
 * rounded box that only grew: at 1x it read first as a wooden mallet and then as a paper bag, because a sack is
 * recognised by its PROFILE - narrow and slack at the neck, heavy and wide at the foot - and a box has the same
 * profile at every size. Held beside the hip like the willow basket (22x14), the full bag is the same order of mark.
 *
 * The EMPTY bag is the one the sack spends most of the round in, so it is the one the numbers are set by: at 12/14
 * it is comfortably wider than its own 8 px neck band at every fill (round 2 had a 12 px band on an 8 px bag and
 * the held item read as a coloured block balanced on a tan peg).
 */
const SACK_TOP0 = 6, SACK_TOP1 = 2, SACK_BOT0 = 7, SACK_BOT1 = 5, SACK_BULGE = 4;
const SACK_H0 = 18, SACK_H1 = 8, SACK_TOP = 12;
/**
 * The gathered neck and its tie: an 8 px band at y 3..16, hanging from just inside the paw. art/rig.js draws the
 * PAW after the weapon so it closes over the grip, and a band drawn at the origin is a band under a paw - round 1's
 * slot-colour tie was invisible on every critter in the cast. Three rows down the biggest paw in the cast (Barley's
 * handR 5) still covers its top, which is what makes the sack read as HELD, and thirteen rows deep carries its
 * bottom four rows into the bag's own top (SACK_TOP 12), so the neck bridges paw to bag instead of floating between
 * them. Narrower than the shoulder at every fill (8 against 12..16), which is what makes it read as a gathered neck
 * rather than a belt round the bag's middle.
 */
const TIE_Y = 3, TIE_H = 13, TIE_HALF = 4;

/** Trace the bag: shoulders `wt` wide, hem `wb` wide, `h` long, hanging from SACK_TOP with softened corners. */
function sackPath(ctx, wt, wb, h) {
  const y0 = SACK_TOP, y1 = SACK_TOP + h;
  ctx.beginPath();
  ctx.moveTo(-wt + 2, y0);
  ctx.lineTo(wt - 2, y0);
  ctx.quadraticCurveTo(wt, y0, wt, y0 + 3);
  ctx.lineTo(wb, y1 - 4);
  ctx.quadraticCurveTo(wb, y1, wb - 4, y1);
  ctx.lineTo(-wb + 4, y1);
  ctx.quadraticCurveTo(-wb, y1, -wb, y1 - 4);
  ctx.lineTo(-wt, y0 + 3);
  ctx.quadraticCurveTo(-wt, y0, -wt + 2, y0);
  ctx.closePath();
}

/**
 * The sack a critter fills, as a `weapon`-slot item (art/rig.js draws it in hand space, +x along the forearm, and
 * the paw closes over the gathered neck afterwards). The screen sets three fields before drawing the rig, and a
 * fourth once in enter():
 *   rig.sackFill  0..BURST, the raw fill
 *   rig.sackZone  0 under the brim band | 1 in the brim band | 2 over the brim, about to burst
 *   rig.sackBlink 0/1, the strobe the screen alternates while zone 2 is on
 *   rig.sackGrain the visit's GRAINS record: what is packed in the sack and whether it wears the stencilled band
 *
 * Two reads, both at 1x and both on the critter itself: the sack's SHAPE (it grows from a rag to a fat bag, and
 * bulges past the brim) and its FILL (the packed flour is a lighter fill inside the sack's own outline, no second
 * line - ART_STYLE 0.2). The tie band at the neck is the seat's own colour, which is what makes a heap of four
 * critters legible, and it is the only thing that ever changes hue: SIGNAL.good in the brim band (the kitchen's
 * stove bar says "let go now" in exactly that green), HOT on the strobe once the sack is over it. Gold belongs to
 * the chute and never comes near the sack. The tag over the head (drawFillTag) is the precise gauge; this is the
 * one you read without looking away from your paws.
 *
 * A rice sack is the same hessian with the STENCIL band across it, over whatever is packed in it: a miller marks
 * the sacks that must not be mixed, and a 3 px dark band inside the sack's own line is the cheapest mark that
 * survives the 1x squint. It sits LOW, two-thirds down the bag, so it lies inside the packed rice for most of the
 * round (a dark stripe across white is the marked-sack read) and the fill's leading edge crosses it early, at a
 * third full, long before the level means anything. It was 38 % down first, to keep it out of the fill's way, and
 * that was the wrong way round: from half full to the brim the band and the fill's edge ran together into one dark
 * cap under the tie, and the level - the one thing this sack is for - was the thing hidden.
 */
const STENCIL_AT = 0.66, STENCIL_H = 3;
export const MILL_SACK = { attach: 'handR', length: 16, draw(ctx, rig) {
  // the same counter-rotation items.js `upright` uses, so the sack hangs down whatever the arm is doing
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  const fill = rig.sackFill || 0, k = fill < 1 ? fill : 1, over = fill > 1 ? fill - 1 : 0;
  const g = rig.sackGrain || GRAINS.flour;
  const wt = SACK_TOP0 + SACK_TOP1 * k, wb = SACK_BOT0 + SACK_BOT1 * k + SACK_BULGE * over, h = SACK_H0 + SACK_H1 * k;
  ctx.save(); ctx.rotate(a);
  sackPath(ctx, wt, wb, h);
  celPath(ctx, rig, CANVAS, 0, SACK_TOP + h / 2, wb > h / 2 ? wb : h / 2, 0.4, 0.26);
  if (!rig.override) {
    // the packed flour: clipped inside the sack's own path, filling from the bottom, with one shadow band
    ctx.save(); sackPath(ctx, wt, wb, h); ctx.clip();
    const packed = R((h - 2) * k);
    if (packed > 0) {
      ctx.fillStyle = g.packed; ctx.fillRect(-wb, SACK_TOP + h - packed, wb * 2, packed);
      ctx.fillStyle = g.packedSh; ctx.fillRect(1, SACK_TOP + h - packed, wb, packed);
    }
    ctx.fillStyle = CANVAS_SH; ctx.fillRect(1, SACK_TOP, wb, h - packed);
    if (g.band) { ctx.fillStyle = STENCIL; ctx.fillRect(-wb, SACK_TOP + R(h * STENCIL_AT), wb * 2, STENCIL_H); }
    ctx.restore();
  }
  // the gathered neck and its tie: its own inked object, above the bag, in the seat's colour unless the sack is
  // warning. `rig.palette.primary` IS PLAYER_COLORS[slot] (critterRig), so no extra field is needed for it.
  const tie = rig.override ? rig.override
    // the burst zone STROBES between the brim's green and HOT rather than between HOT and cream: cream is the room's
    // neutral, so half of every strobe said nothing, and good/hot reads as the brim's warning escalating
    : rig.sackZone === 2 ? (rig.sackBlink ? SIGNAL.hot : SIGNAL.good)
      : rig.sackZone === 1 ? SIGNAL.good : rig.palette.primary;
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(-TIE_HALF, TIE_Y, TIE_HALF * 2, TIE_H);
  ctx.fillStyle = tie; ctx.fillRect(-TIE_HALF + 1, TIE_Y + 1, TIE_HALF * 2 - 2, TIE_H - 2);
  ctx.restore();
} };

/**
 * A tied sack in the air on its way to the barrow, or sitting on it: 20x22, inked, full, with a slot-colour tie.
 * `g` is the visit's GRAINS record: a rice sack is packed in the rice's own near-white and wears the STENCIL band
 * across its middle, which is what makes the pile on the cart say "rice" from across the room.
 */
export function drawTiedSack(ctx, x, y, slot, g) {
  const col = PLAYER_COLORS[slot] != null ? PLAYER_COLORS[slot] : UI.paperDark;
  ctx.fillStyle = INK; pathRR(ctx, x - 11, y - 20, 22, 22, 7); ctx.fill();
  ctx.fillStyle = g.packed; pathRR(ctx, x - 10, y - 19, 20, 20, 6); ctx.fill();
  ctx.fillStyle = g.packedSh; ctx.fillRect(x + 1, y - 14, 9, 14);
  if (g.band) { ctx.fillStyle = STENCIL; ctx.fillRect(x - 10, y - 12, 20, 4); }
  ctx.fillStyle = INK; ctx.fillRect(x - 6, y - 25, 12, 8);
  ctx.fillStyle = col; ctx.fillRect(x - 5, y - 24, 10, 6);
}

// ---------------------------------------------------------------- the fill tag
/**
 * The paper fill tag that hangs over a seat: a 44x12 ticket with a 6 px tab in the seat's own colour and a 32 px
 * trough the sack's fill runs across.
 *
 * The bar's COLOUR is the zone, the way the kitchen's stove bar turns hot in its last fifth (GDD section 6): the
 * seat's colour up to the brim band, SIGNAL.good through it, SIGNAL.hot past the brim. Green and not gold, because
 * this is paper: ART_STYLE section 4 puts "good timing" on paper UI in UI.green under an ink line and names gold on
 * paper (0.17 contrast) as the case it is banned for, and the trough's ink frame here is that line. Painting the
 * zones into the empty trough instead was tried and lost: a bar whose leading edge butted straight into a coloured
 * band was one smear. Colouring the BAR means the two never touch - there is only ever one colour at the moving
 * edge - and the 2 px ink post standing at the brim says where the prize is even when the tag is empty.
 */
export const TAG_W = 44, TAG_H = 12;
/** The trough starts at 9 so its ink frame lands ON the tab's ink post and still leaves a row of paper at the tag's right edge. */
const TAG_TAB = 6, TROUGH_X = 9, TROUGH_W = 32, TROUGH_Y = 3, TROUGH_H = 6;
/** Half the tag's width: the screen centres it over the seat's head. */
const TAG_HALF = TAG_W / 2;

/**
 * @param {number} fill the sack's raw fill
 * @param {string} colour the seat's player colour
 * @param {{ brim: number, full: number, cap: number }} zones fractions of the trough, built once in the screen's
 *        enter(): where the brim band starts, where the brim is, and the fill the trough's full width stands for.
 */
export function drawFillTag(ctx, cx, y, fill, colour, zones) {
  const x = R(cx) - TAG_HALF, ty = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x, ty, TAG_W, TAG_H);
  ctx.fillStyle = UI.paper; ctx.fillRect(x + 1, ty + 1, TAG_W - 2, TAG_H - 2);
  ctx.fillStyle = colour; ctx.fillRect(x + 1, ty + 1, TAG_TAB, TAG_H - 2);
  ctx.fillStyle = INK; ctx.fillRect(x + 1 + TAG_TAB, ty + 1, 2, TAG_H - 2);
  const tx = x + TROUGH_X, tyy = ty + TROUGH_Y;
  ctx.fillStyle = INK; ctx.fillRect(tx - 1, tyy - 1, TROUGH_W + 2, TROUGH_H + 2);   // the ink line every fill on paper carries
  ctx.fillStyle = UI.paperLine; ctx.fillRect(tx, tyy, TROUGH_W, TROUGH_H);
  const brimX = R(TROUGH_W * zones.brim), fullX = R(TROUGH_W * zones.full);
  const w = R(TROUGH_W * (fill < zones.cap ? fill / zones.cap : 1));
  if (w > 0) {
    ctx.fillStyle = colour; ctx.fillRect(tx, tyy, w < brimX ? w : brimX, TROUGH_H);
    if (w > brimX) { ctx.fillStyle = SIGNAL.good; ctx.fillRect(tx + brimX, tyy, (w < fullX ? w : fullX) - brimX, TROUGH_H); }
    if (w > fullX) { ctx.fillStyle = SIGNAL.hot; ctx.fillRect(tx + fullX, tyy, w - fullX, TROUGH_H); }
  }
  ctx.fillStyle = INK; ctx.fillRect(tx + fullX - 1, tyy - 1, 2, TROUGH_H + 2);   // the brim post
}

// ---------------------------------------------------------------- the barrow and the burst
/** The barrow: wheel contact at (x, y), 54 wide. `n` tied sacks are stacked on its bed (five drawn, then it is a pile). */
const BARROW_SLOT_X = Int8Array.of(-15, 2, -7, 9, 1), BARROW_SLOT_Y = Int8Array.of(0, 0, -14, -14, -27);
/** The cart's box, measured off its wheel's ground contact (x, y): a tapered body over one wheel with two shafts. */
const CART_TOP = -30, CART_BOT = -11, CART_L0 = -26, CART_R0 = 20, CART_L1 = -21, CART_R1 = 15;

/**
 * The sack cart the party's tied sacks land on: a wheel, a tapered plank box, two shafts and a prop leg, with `n`
 * tied sacks stacked in the box (five drawn, then it is just a pile).
 *
 * Round 1 drew the body as one flat 54x15 slab with a handle laid ACROSS it and it read as two planks and a wheel.
 * A cart is recognised by its BOX - a body wider at the rim than at the floor, with the plank seams running up it -
 * and by the shafts leaving the box's end rather than crossing it. `g` is the visit's GRAINS record, handed on to
 * every sack in the box.
 */
export function drawBarrow(ctx, x, y, n, g) {
  const bx = R(x), by = R(y);
  // the wheel, behind the box: an oak disc with an iron tyre and a hub
  ctx.beginPath(); ctx.arc(bx - 14, by - 10, 11, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = MILL.beam; ctx.fill();
  ctx.strokeStyle = MILL.iron; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bx - 14, by - 10, 8, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(bx - 14, by - 10, 3.5, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = MILL.iron; ctx.fill();
  // the two shafts leaving the box's right end, and the prop leg under them
  ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx + 14, by - 22); ctx.lineTo(bx + 40, by - 27); ctx.stroke();
  ctx.strokeStyle = MILL.beam; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(bx + 14, by - 22); ctx.lineTo(bx + 40, by - 27); ctx.stroke();
  ctx.fillStyle = INK; ctx.fillRect(bx + 14, by - 12, 5, 12);
  ctx.fillStyle = MILL.beam; ctx.fillRect(bx + 15, by - 12, 3, 11);
  // the box: one inked object, lit along its rim, dark along its foot, two plank seams up the face
  ctx.beginPath();
  ctx.moveTo(bx + CART_L0, by + CART_TOP); ctx.lineTo(bx + CART_R0, by + CART_TOP);
  ctx.lineTo(bx + CART_R1, by + CART_BOT); ctx.lineTo(bx + CART_L1, by + CART_BOT); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = MILL.beam; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = BEAM_DARK; ctx.fillRect(bx + CART_L0, by + CART_BOT - 6, 60, 8);
  ctx.fillStyle = BEAM_LIT; ctx.fillRect(bx + CART_L0, by + CART_TOP, 60, 3);
  ctx.fillStyle = BEAM_DARK;
  ctx.fillRect(bx - 10, by + CART_TOP, 2, 22); ctx.fillRect(bx + 5, by + CART_TOP, 2, 22);
  ctx.restore();
  const drawn = n > BARROW_SLOT_X.length ? BARROW_SLOT_X.length : n;
  for (let i = 0; i < drawn; i++) drawTiedSack(ctx, bx + BARROW_SLOT_X[i], by + CART_TOP + 6 + BARROW_SLOT_Y[i], -1, g);
}

/**
 * The burst cloud: four soft discs stepping up a size, gone in BURST_STEPS * BURST_EVERY frames. Round 1 ran
 * 7..21 px at 0.75 alpha and the cloud simply ate the critter - which is the wrong way round, because the beat's
 * whole joke is the critter WHITENED and standing in it (rig.override, ART_STYLE section 3). The cloud is now a
 * halo round the sack that was, and the flour particles and the flat white critter carry the rest.
 */
const BURST_R = Int8Array.of(6, 10, 13, 16), BURST_EVERY = 4;
export const BURST_STEPS = BURST_R.length;

export function drawBurstCloud(ctx, x, y, t) {
  const k = (t / BURST_EVERY) | 0;
  if (k < 0 || k >= BURST_STEPS) return;
  const r = BURST_R[k], a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.62 * (1 - k / BURST_STEPS);
  ctx.fillStyle = MILL.dust;
  ctx.beginPath();
  ctx.arc(x - r * 0.7, y + 2, r * 0.7, 0, TAU);
  ctx.arc(x + r * 0.7, y, r * 0.75, 0, TAU);
  ctx.arc(x, y - r * 0.5, r * 0.85, 0, TAU);
  ctx.fill();
  ctx.fillStyle = MILL.flour;
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.6, r * 0.4, 0, TAU); ctx.fill();
  ctx.globalAlpha = a;
}
