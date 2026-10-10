// The hives' props (docs/ART_STYLE.md section 1, section 7; docs/GDD.md section 5): the straw skep full and empty,
// the bee, the drifting swarm in its three states, the honey dipper the crew carries, the crate the party's honey
// goes into, and the honey flood's marks (an overfull skep's ooze, its burp, the pool and the toffee strands; the
// joke itself is screens/hiveGags.ts). Drawn like every prop in the rig style - 1 px warm ink round each OBJECT,
// three tones on a body, a colour change inside one silhouette carrying no line of its own - in screen space at
// integer coordinates, with no allocation per call. The screen draws drawShadow under each of them before its
// sorted pass.
//
// DETERMINISM. Every orbit in here is an integer table built at module load (ORB_C / ORB_S, the map screen's
// BEE_X / BEE_Y pattern) and indexed by a counter the screen advances in update(): nothing in this file calls
// Math.sin at draw time, and nothing in it touches simulation state. The screen owns WHEN the swarm is calm, wary
// or alert and passes the shape in; this file never decides when heat shows, exactly as art/hens.js never decides
// when the rooster's comb goes HOT.
import { PLUM, UI } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { celBall, celCapsule, tones } from '../lib/art/shading.ts';
import type { RigWeapon } from '../lib/art/rig.ts';
import { makeRng } from '../lib/engine/rng.ts';

/**
 * The dipper's wet flag, merged into the library's `Rig` the way game/minigame.ts merges the basket's fields
 * rather than restating them in a wrapper type: the dipper renderer below reads it off a plain rig and the hive
 * screen writes it, so a type only one of them knew about would be no type at all. OPTIONAL, because
 * lib/art/rig.ts buildRig builds a complete `Rig` literal without it.
 */
declare module '../lib/art/rig.ts' {
  interface Rig {
    /** 1 for the frames after the dipper head goes into a skep: the head is re-capped in comb amber and drips. */
    dipperWet?: number;
  }
}

const R = Math.round, TAU = Math.PI * 2;

/**
 * Prop colours. None of them is the scene's signal (SIGNAL.hive gold, which the SCREEN draws as the sparkle over a
 * full skep) and none is SIGNAL.hot: every honey tone in here is held under 0.6 saturation so the one 6x6 gold mark
 * on a skep is the brightest warm thing in the frame. Measured: comb #B08A52 is 0.53 saturated against the gold's
 * 0.68, and two value steps below it.
 */
export const HIVE_PROPS = Object.freeze({
  straw: '#C9A05C', strawLit: '#E3C68F',
  /** Honeycomb in a skep's doorway, the honey on a wet dipper, and the jars in the crate: one muted amber. */
  comb: '#B08A52',
  /** A bee: an ink-dominant body so it reads on the pale sky, with one amber band and a cream wing so it also reads
   *  against the hedgerow. A pale-bodied bee vanished on the sky; an all-ink one vanished on the hedge. */
  bee: '#C29450', wing: '#F1E4C8',
  crate: '#8B5A2B',
});
const STRAW_SH = mix(HIVE_PROPS.straw, PLUM.shadow, 0.34);
const STRAW_COIL = mix(HIVE_PROPS.straw, PLUM.shadow, 0.52);
/**
 * A dipped skep goes duller as well as losing its comb, its drip and its sparkle: four tells, not one. At the first
 * 0.24 mix the two states were 6 % apart by value and the picture could not be read at 1x with the sparkle blinked
 * off; 0.4 puts the empty straw a clear third of the way to the plum shadow, which is the same step the coop takes
 * between its lit nest straw and the cavity behind it.
 */
const STRAW_DULL = mix(HIVE_PROPS.straw, PLUM.shadow, 0.4), DULL_SH = mix(STRAW_DULL, PLUM.shadow, 0.34);
const COMB_SH = mix(HIVE_PROPS.comb, PLUM.shadow, 0.35);
const MOUTH = PLUM.deep;
const CRATE_SH = mix(HIVE_PROPS.crate, PLUM.deep, 0.45);

/** A skep is 36 across and 34 tall with its base on the bench plank; the screen needs both to place its sparkle. */
export const SKEP_W = 36, SKEP_H = 34;

// ---------------------------------------------------------------- the skep

/**
 * One straw skep with its base at (x, y). `full` draws the comb in the doorway, a honey drip on the lip and the
 * brighter straw; an empty one keeps the same silhouette and goes dull, so a player reads WHICH skep changed from
 * the shape of the frame rather than from a missing object.
 *
 * The coils are a colour change INSIDE the dome's own line (ART_STYLE 0.2), five 2 px bands - a 1 px coil would
 * have been the busiest mark in the scene and is under the floor anyway (0.8). The doorway is a separate object and
 * carries its own ink.
 *
 * `swell` (whole px, default 0) is the honey flood's wind-up (screens/hiveGags.ts): the dome grows that much wider
 * each side and that much taller with its base, its doorway and its coils where they were, so a skep about to burp
 * strains outward without one fractional pixel - a ctx.scale() of a 36 px dome blurs every 2 px band in it.
 */
export function drawSkep(ctx, x, y, full, swell = 0) {
  const base = full ? HIVE_PROPS.straw : STRAW_DULL, sh = full ? STRAW_SH : DULL_SH;
  const w = swell, top = y - SKEP_H - w;
  ctx.beginPath();
  ctx.moveTo(x - 18 - w, y);
  ctx.quadraticCurveTo(x - 20 - w, y - 24 - w, x, top);
  ctx.quadraticCurveTo(x + 20 + w, y - 24 - w, x + 18 + w, y);
  ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = base; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = sh; ctx.fillRect(x + 4, top, 22 + w, SKEP_H + w);                 // the one shadow band, away from the light
  ctx.fillStyle = STRAW_COIL;
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 20 - w, y - 5 - i * 6, 40 + w * 2, 2);   // the coiled rope, five 2 px bands
  if (full) { ctx.fillStyle = HIVE_PROPS.strawLit; ctx.fillRect(x - 13 - w, y - 27 - w, 9, 2); ctx.fillRect(x - 10 - w, y - 31 - w, 7, 2); }
  ctx.restore();
  // the twisted knob the coil is finished off at: its own object, its own line
  ctx.fillStyle = INK; ctx.fillRect(x - 5, top - 5, 10, 6);
  ctx.fillStyle = full ? HIVE_PROPS.straw : STRAW_DULL; ctx.fillRect(x - 4, top - 4, 8, 4);
  // the doorway, and what is behind it
  ctx.fillStyle = INK; ctx.fillRect(x - 7, y - 10, 14, 10);
  ctx.fillStyle = MOUTH; ctx.fillRect(x - 6, y - 9, 12, 9);
  if (!full) return;
  ctx.fillStyle = HIVE_PROPS.comb; ctx.fillRect(x - 6, y - 9, 12, 5);
  ctx.fillStyle = COMB_SH; ctx.fillRect(x - 6, y - 6, 12, 2);
  ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 9, 2, 5); ctx.fillRect(x + 2, y - 9, 2, 5);   // two cells, 2 px apart
  // the drip on the lip: the one bit of the skep's silhouette that goes away when the honey does
  ctx.fillStyle = INK; ctx.fillRect(x + 5, y - 2, 4, 6);
  ctx.fillStyle = HIVE_PROPS.comb; ctx.fillRect(x + 6, y - 1, 2, 4);
}

// ---------------------------------------------------------------- the bee and the swarm

/**
 * One bee at (x, y): an inked body 11 long lying on its side - 3 px deep at the tail and at the snout, 5 across the
 * thorax - carrying a 5x3 amber abdomen forward of centre, with ONE cream wing blade humped over the BACK of it and
 * lifting 1 px on `wing`. Everything clears the 2 px floor (ART_STYLE 0.8); a 1 px leg, antenna or ink stripe was
 * tried and is exactly what that rule exists to stop.
 *
 * Round 1 hung two bare cream wings a clear 3 px ABOVE a 5 px body and read as specks of paper. Round 2 fixed the
 * value but drew a flat 9x5 BRICK with a level 5x2 cream lid squared off on top of it, and covered four of the
 * seven amber columns with two identical ink bars - so the amber was a 3x3 patch, the bee had no front, and sixteen
 * of them read as sixteen small crates over the hedge, the same read as the scene's own jars. Three things fix that
 * and none of them is the colour: the body is now LONGER THAN IT IS TALL by 11 to 8, it tapers at both ends, and
 * the cream sits BEHIND the amber instead of on top of it - a pale lid directly over an amber body is a jar at any
 * size. The far wing is not drawn at all: in side view it is behind the body, and drawing it beside the near one
 * squared the top straight back into a lid. The bee stays ink-dominant (it holds on the pale sky) with an amber
 * middle and a cream flash (they hold on the dark hedge).
 */
export function drawBee(ctx, x, y, wing) {
  const wy = y - 5 - wing;
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y - 1, 11, 3); ctx.fillRect(x - 4, y - 2, 7, 5);
  ctx.fillStyle = HIVE_PROPS.bee; ctx.fillRect(x - 2, y - 1, 5, 3);
  // the near wing, over the BACK: the flip lifts it, never drops it - a blade that dropped landed on the abdomen
  // and blanked the amber every other frame
  ctx.fillStyle = INK; ctx.fillRect(x - 5, wy, 6, 4);
  ctx.fillStyle = HIVE_PROPS.wing; ctx.fillRect(x - 4, wy + 1, 4, 2);
}

/**
 * A 32-step orbit as integers (cos/sin x 64), built once at module load: no trig at draw time, and none anywhere
 * near the simulation. Math.cos is used to BUILD the table, which is allowed because the table is read only by
 * draw() - the same call screens/map.js makes for its own BEE_X / BEE_Y. What crosses the wire is the integer
 * counter the screen advances; the bees' pixels are a pure function of it.
 */
const ORBIT_N = 32;
const ORB_C = new Int8Array(ORBIT_N), ORB_S = new Int8Array(ORBIT_N);
for (let i = 0; i < ORBIT_N; i++) { ORB_C[i] = R(Math.cos(i * TAU / ORBIT_N) * 64); ORB_S[i] = R(Math.sin(i * TAU / ORBIT_N) * 64); }
/** How many bees the swarm is. Sixteen reads as a cloud at the calm spread and as a mass at the alert one; eight
 *  read as eight bees, and twenty-four cost 120 rects for no more information. */
export const BEE_N = 16;
/**
 * Each bee's place in the cloud as a unit offset (-64..64), rejection-sampled inside the unit disc from the hive's
 * own seed block so the swarm is an ellipse and not a rectangle of bees, and so every machine draws the same cloud.
 */
const BEE_U = new Int8Array(BEE_N), BEE_V = new Int8Array(BEE_N);
{
  const r = makeRng(198);
  for (let i = 0; i < BEE_N; i++) {
    let u = 0, v = 0;
    for (let k = 0; k < 8; k++) { u = r.range(-1, 1); v = r.range(-1, 1); if (u * u + v * v <= 1) break; }
    BEE_U[i] = R(u * 64); BEE_V[i] = R(v * 64);
  }
}

/**
 * The swarm's three shapes. The read is everything in this mini-game, so the states differ in SILHOUETTE before
 * they differ in colour - a colour-only tell fails the squint test (ART_STYLE 0.10):
 *   CALM   a loose 240 x 28 haze drifting over the hedge crest (rows 104..132).
 *   WARY   the swarm REARS: a 240 x 28 haze pulls into a 32 x 56 COLUMN and climbs (rows 74..130), with the orbit
 *          tightened from 7 px to 4 and the spin tripled. The screen pulses a SIGNAL.hot ring out of it on top of
 *          that. Its top row is held clear of the swarm band's own crest, so the two telegraphs never fuse.
 *   ALERT  it DROPS 42 rows and FANS OUT into a 380 x 16 BAR lying right along the skeps' knobs (rows 128..144),
 *          with the screen's hot rule under it. Loose blob / tall column / flat bar: three silhouettes, and the one
 *          that means danger is the one that is the wrong shape for a cloud.
 * `centre` is how much the cloud ignores its own drift and anchors to the middle of the screen: 0 while it is a
 * cloud over the bench, 1 once it is hanging over the whole meadow (at 400 px wide a drifting centre would push
 * half the swarm off the frame).
 */
export const SWARM_SHAPE = Object.freeze([
  Object.freeze({ cy: 118, halfW: 120, halfH: 14, rx: 7, ry: 4, stride: 5, centre: 0 }),
  Object.freeze({ cy: 102, halfW: 16, halfH: 28, rx: 4, ry: 3, stride: 7, centre: 0 }),
  Object.freeze({ cy: 136, halfW: 190, halfH: 8, rx: 5, ry: 3, stride: 3, centre: 1 }),
]);
/** Orbit steps per frame per state: the drone rising, as motion first (the swarm has no sound of its own). Simulation state. */
export const SWARM_SPIN = Int8Array.of(1, 3, 2);

/**
 * The swarm, from a shape the screen has already morphed between two SWARM_SHAPE entries. `phase` is the screen's
 * integer orbit counter, `frame` only drives the wing flip. Every bee sits at its own unit offset scaled by the
 * shape's half-extents and then rides the shared orbit at its own stride, so sixteen bees never beat in step.
 */
export function drawSwarm(ctx, cx, cy, halfW, halfH, rx, ry, stride, phase, frame) {
  for (let i = 0; i < BEE_N; i++) {
    const k = (phase + i * stride) & (ORBIT_N - 1);
    const bx = cx + ((BEE_U[i] * halfW) >> 6) + ((ORB_C[k] * rx) >> 6);
    const by = cy + ((BEE_V[i] * halfH) >> 6) + ((ORB_S[k] * ry) >> 6);
    drawBee(ctx, bx, by, (frame + i * 3) & 2 ? 1 : 0);
  }
}

// ---------------------------------------------------------------- the honey crate

/** One 8x11 honey jar with a wooden lid, standing with its base at (x, y). */
function jar(ctx, x, y) {
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y - 12, 10, 12);
  ctx.fillStyle = HIVE_PROPS.comb; ctx.fillRect(x - 4, y - 11, 8, 11);
  ctx.fillStyle = COMB_SH; ctx.fillRect(x + 1, y - 11, 3, 11);
  ctx.fillStyle = HIVE_PROPS.crate; ctx.fillRect(x - 5, y - 14, 10, 3);
  ctx.fillStyle = HIVE_PROPS.strawLit; ctx.fillRect(x - 3, y - 9, 2, 5);   // the one highlight (ART_STYLE 0.5)
}

/** How many jars the crate can show: past six the row would run into the last skep. */
export const CRATE_CAP = 6;

/**
 * The party's honey: a slatted crate with the crew's jars standing in it, base at (x, y). `jars` is the PARTY's
 * total, not one seat's - this is the co-op scoreboard on the bench, and it is the only place a player can see the
 * four seats' work as one pile (the clock ticket's count is a number; this is the thing).
 */
export function drawHoneyCrate(ctx, x, y, jars) {
  const n = jars > CRATE_CAP ? CRATE_CAP : jars;
  for (let i = 0; i < n; i++) jar(ctx, x - 9 + (i % 3) * 9, y - 6 - (i > 2 ? 7 : 0));
  ctx.fillStyle = INK; ctx.fillRect(x - 17, y - 14, 34, 14);
  ctx.fillStyle = HIVE_PROPS.crate; ctx.fillRect(x - 16, y - 13, 32, 13);
  ctx.fillStyle = CRATE_SH; ctx.fillRect(x - 16, y - 5, 32, 5);
  ctx.fillStyle = INK; ctx.fillRect(x - 16, y - 9, 32, 2);                 // the middle slat
  for (let i = 0; i < 3; i++) { ctx.fillStyle = INK; ctx.fillRect(x - 14 + i * 12, y - 13, 2, 13); }
}

// ---------------------------------------------------------------- the held item

const DIPPER_WOOD = '#C48A52', DIPPER_GROOVE = '#8B5A2B';
/**
 * The honey dipper, the hive's own `rig.weapon` ({ attach, length, draw }, the RIBBON_BASKET pattern in
 * game/minigame.js): a turned handle along the forearm with a grooved ball on the end. It is NOT added to
 * content/critters/items.js - only this scene holds one, and items.js is the shared cast's kit.
 *
 * It lies along the forearm like the pond's rod rather than hanging `upright` like the basket: a dipper is a wand,
 * the whole point of the dip beat is the arm driving it up into the skep, and a counter-rotated one stayed
 * stubbornly vertical through the reach. The grooves are 2 px (ART_STYLE 0.8); at 1 px they disappeared at 1x and
 * the head read as a plain bead. `rig.dipperWet` is set by the screen for the frames after the head goes in.
 */
export const HONEY_DIPPER: RigWeapon = { attach: 'handR', length: 18, draw(ctx, rig) {
  celCapsule(ctx, rig, 1, 0, 11, 0, 1.6, DIPPER_WOOD, 0);
  celBall(ctx, rig, 14, 0, 4, DIPPER_WOOD);
  if (rig.override) return;
  ctx.fillStyle = rig.col(DIPPER_GROOVE);
  ctx.fillRect(10, -4, 2, 8); ctx.fillRect(16, -4, 2, 8);
  if (!rig.dipperWet) return;
  // honey on the head: the ball is re-capped in comb amber and one drip hangs off it, so the beat pays off on the
  // item as well as in the float text
  const t = tones(rig, HIVE_PROPS.comb);
  ctx.fillStyle = rig.col(t.base); ctx.beginPath(); ctx.arc(14, 0, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = rig.col(t.sh); ctx.fillRect(13, 2, 3, 5);
} };

// ---------------------------------------------------------------- the dip's payoff

/**
 * The honey running out of a skep's doorway down into a raised dipper: a tapered amber ribbon bowed off the
 * straight line inside its own ink, with a bead sliding down it. `k` is the beat's progress in 0..1.
 *
 * This exists because the geometry cannot be honest. The skeps sit on a bench at row 182 and the crew's feet are at
 * 298..322; a 64 px critter with its paw up reaches row 240 at best, so the reach is symbolic, exactly as the coop's
 * `reachNest` is symbolic about nesting boxes 100 px above its floor. Round 1 shipped the reach alone and it read as
 * a critter holding a stick in the air near nothing. The strand is the connection the pose cannot make: it starts at
 * the doorway the honey comes out of and ends at the dipper head, and the whole beat becomes one object.
 *
 * It is muted comb amber, not the scene's gold: gold means "this skep still has some" and must not also mean "this
 * one is being emptied" (ART_STYLE section 4 binds a signal to one meaning).
 */
const STRAND_N = 6;
const STRAND_X = new Int16Array(STRAND_N + 1), STRAND_Y = new Int16Array(STRAND_N + 1);
export function drawHoneyStrand(ctx, x0, y0, x1, y1, k) {
  const dx = x1 - x0, dy = y1 - y0, sag = 8;
  // THE SAG IS PERPENDICULAR TO THE STRAND, and that is the whole of it. Pushed along y - which is the strand's own
  // dominant axis, the doorway being at row 177 and the dipper head around 235 - it only slid the control points
  // DOWN THEIR OWN LINE: at a seat standing directly under the skep, which is exactly where REACH and the dip spot
  // put it, dx was 0 and the offset was 0, so the "curve" came out a dead straight vertical bar. That is the STICK
  // this function exists to stop. The quadratic's control point is pushed 2 x sag along the unit normal, which puts
  // the curve's own belly at 8 px off the chord whatever the geometry, and SIX sampled segments instead of three
  // keep it a curve rather than a bent rod. Math.sqrt is draw-only and exactly rounded; nothing here is simulation.
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cx = x0 + dx / 2 - dy / len * sag * 2, cy = y0 + dy / 2 + dx / len * sag * 2;
  for (let i = 0; i <= STRAND_N; i++) {
    const t = i / STRAND_N, u = 1 - t, a = u * u, b = 2 * u * t, c = t * t;
    STRAND_X[i] = R(a * x0 + b * cx + c * x1); STRAND_Y[i] = R(a * y0 + b * cy + c * y1);
  }
  // A TAPER, not one stroke at a constant width: a line of even weight running 60 px from a hive to a paw is a
  // stick even when it curves. Honey pulls thin as it stretches, so the ribbon is 5 px of amber at the doorway and
  // 2 at the dipper (the old 4/3/2 over 60 px read as one constant weight at 1x). The whole ink underlay is laid
  // down in ONE pass before any amber, or every segment's ink would cut a dark knuckle into the segment before it.
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? HIVE_PROPS.comb : INK;
    for (let i = 0; i < STRAND_N; i++) {
      ctx.lineWidth = 5 - i * 3 / (STRAND_N - 1) + (pass ? 0 : 2);
      ctx.beginPath(); ctx.moveTo(STRAND_X[i], STRAND_Y[i]); ctx.lineTo(STRAND_X[i + 1], STRAND_Y[i + 1]); ctx.stroke();
    }
  }
  // the bead: it leaves the doorway on the first frame and rides the CURVE - the same quadratic at t = k, so it
  // never floats off onto the chord
  const u = 1 - k, a = u * u, b = 2 * u * k, c = k * k;
  const bx = R(a * x0 + b * cx + c * x1), by = R(a * y0 + b * cy + c * y1);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = HIVE_PROPS.comb; ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = HIVE_PROPS.strawLit; ctx.fillRect(bx - 3, by - 3, 2, 2);
}

// ---------------------------------------------------------------- the honey flood (screens/hiveGags.ts)

/**
 * The flood's honey is the coat kit's (game/gags.ts COAT.honey, the amber a step under the hive's gold that the
 * critter it lands on is painted in), and an art module does not reach up into game/, so the screen hands it to
 * every function below. Its one shade, two value steps toward the plum, is worked out on the first call and kept:
 * nothing in this section allocates per frame. Every mark is the honey's OWN object on whatever it lies on, so each
 * carries its own ink (ART_STYLE 0.2) - an un-inked amber run on amber straw was the first thing to vanish at 1x.
 */
let honeyHex = '', honeySh = '';
function shadeOf(hex) {
  if (hex !== honeyHex) { honeyHex = hex; honeySh = mix(hex, PLUM.shadow, 0.35); }
  return honeySh;
}

/**
 * An overfull skep's two runs of honey as [dx, top dy, length] off its base point: the long one on the lit side.
 * Both start under the collar of honey round the knob (drawOoze), inside the dome's own outline - at x - 7 the
 * dome's edge is row y - 29, at x + 3 it is y - 32 - so neither pokes out of the silhouette it is running down.
 */
const RUNS = Int8Array.of(-7, -29, 13, 3, -31, 8);
/** Frames for the glint's slide down the long run, and for the drip on the plank to swell, let go and fall. */
const GLINT_P = 40, DRIP_P = 34, DRIP_FALL = 8;

/** One run of honey down the straw: an inked 3 px stripe from (x, y) down `len` rows, ending in a fat bead. */
function honeyRun(ctx, x, y, len, honey, sh) {
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 5, len + 1);
  ctx.beginPath(); ctx.arc(x + 1.5, y + len + 1, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.fillRect(x, y, 3, len);
  ctx.beginPath(); ctx.arc(x + 1.5, y + len + 1, 2.5, 0, TAU); ctx.fill();
  ctx.fillStyle = sh; ctx.fillRect(x + 1, y + len + 1, 2, 2);
}

/**
 * An OVERFULL skep - the honey flood's TELL (screens/hiveGags.ts) - drawn over drawSkep's full skep at the same
 * base (x, y) and the same `swell`. Four marks, so the skep that is going to burp reads from across the meadow and
 * not only from beside it, and a child who wants to be flooded can pick it out:
 *   - a collar of honey welling up round the knob, and two runs from it down the dome, each ending in a bead, a
 *     cream glint sliding down the long one (the glisten: honey is the one thing on the bench that shines) - the
 *     runs alone, the first cut, read as two sticks propped against the straw;
 *   - the doorway brimming, honey over the comb and bulging out over the lip;
 *   - a pool gathering on the plank at its foot...
 *   - ...and a drip off the plank's front face that swells, lets go and falls every DRIP_P frames.
 * `f` is any frame counter: the glint and the drip are draw-only clocks. The runs stretch upward with `swell`, so a
 * skep that swells takes its honey with it.
 */
export function drawOoze(ctx, x, y, swell, f, honey) {
  const sh = shadeOf(honey);
  // the pool, first: it lies over the skep's foot and the brim spills into it
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 15 + swell, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 14 + swell, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = sh; ctx.fillRect(x - 6, y + 2, 16, 2);
  // the doorway brimming: the honey stands above the comb and bulges out over the lip into the pool
  ctx.fillStyle = INK; ctx.fillRect(x - 7, y - 6, 14, 6);
  ctx.fillStyle = honey; ctx.fillRect(x - 6, y - 5, 12, 6);
  ctx.fillStyle = UI.cream; ctx.fillRect(x - 4, y - 4, 3, 2);
  // the drip off the plank's front face: it swells for most of its cycle, then lets go and falls
  const k = f % DRIP_P, hang = DRIP_P - DRIP_FALL, bead = k < hang ? 2 + ((k * 2 / hang) | 0) : 2;
  ctx.fillStyle = INK; ctx.fillRect(x + 8, y + 2, 5, 6); ctx.beginPath(); ctx.arc(x + 10.5, y + 8, bead + 1, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.fillRect(x + 9, y + 2, 3, 6); ctx.beginPath(); ctx.arc(x + 10.5, y + 8, bead, 0, TAU); ctx.fill();
  if (k >= hang) {
    const dy = y + 12 + (k - hang) * 2;
    ctx.fillStyle = INK; ctx.fillRect(x + 8, dy - 1, 5, 5);
    ctx.fillStyle = honey; ctx.fillRect(x + 9, dy, 3, 3);
  }
  // the runs down the straw, stretched up the dome by the swell, and the collar they spill from over the top of them
  for (let i = 0; i < RUNS.length; i += 3) honeyRun(ctx, x + RUNS[i], y + RUNS[i + 1] - swell, RUNS[i + 2] + swell, honey, sh);
  const cy = y - SKEP_H - swell + 3;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, cy, 9, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.beginPath(); ctx.ellipse(x, cy, 8, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = sh; ctx.fillRect(x + 1, cy + 1, 6, 2);
  ctx.fillStyle = UI.cream; ctx.fillRect(x - 5, cy - 2, 3, 2);
  const g = f % GLINT_P, len = RUNS[2] + swell;
  if (g < len) { ctx.fillStyle = UI.cream; ctx.fillRect(x + RUNS[0], y + RUNS[1] - swell + g, 2, 2); }
}

/** The burp's arc, sampled into these once per draw (the drawHoneyStrand pattern). */
const WAVE_N = 8;
const WAVE_X = new Int16Array(WAVE_N + 1), WAVE_Y = new Int16Array(WAVE_N + 1);

/**
 * The skep's burp - the honey flood's BANG: a fat tongue of honey arcing up and out of the doorway (x0, y0) and
 * over onto a head (x1, y1), WAVE_W0 px thick at the skep and WAVE_W1 at the head, its whole ink underlay laid in one
 * pass before the honey (drawHoneyStrand's reason: no dark knuckle at the joins), with a cap of honey slumped over the
 * head. `gone` (0..1) is how much of it has already let go of the skep: the arc is drawn from t = gone to the head,
 * so over the beat it peels off the doorway and pours down on the critter instead of vanishing.
 *
 * The arc is thrown WAVE_OUT px out toward the critter's side of the skep and WAVE_UP over the doorway. With the bow
 * on the chord's normal alone (the strand's rule) a critter standing square under the doorway got a loop straight up
 * and back down its own line; and the first cut, 9 px thick and bowed 16, read as a second dip strand and not as a
 * skep throwing up its honey.
 */
const WAVE_W0 = 13, WAVE_W1 = 7, WAVE_OUT = 34, WAVE_UP = 22;
export function drawHoneyWave(ctx, x0, y0, x1, y1, gone, honey) {
  const sh = shadeOf(honey);
  const cx = (x0 + x1) / 2 + (x1 >= x0 ? WAVE_OUT : -WAVE_OUT), cy = Math.min(y0, y1) - WAVE_UP;
  for (let i = 0; i <= WAVE_N; i++) {
    const t = gone + (1 - gone) * i / WAVE_N, u = 1 - t, a = u * u, b = 2 * u * t, c = t * t;
    WAVE_X[i] = R(a * x0 + b * cx + c * x1); WAVE_Y[i] = R(a * y0 + b * cy + c * y1);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    // ink, honey, then the shade down the underside of the arc's thick half
    ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? honey : sh;
    for (let i = 0; i < (pass === 2 ? WAVE_N >> 1 : WAVE_N); i++) {
      const w = WAVE_W0 - i * (WAVE_W0 - WAVE_W1) / (WAVE_N - 1);
      ctx.lineWidth = pass === 0 ? w + 2 : pass === 1 ? w : 3;
      const dy = pass === 2 ? R(w / 2) - 2 : 0;
      ctx.beginPath(); ctx.moveTo(WAVE_X[i], WAVE_Y[i] + dy); ctx.lineTo(WAVE_X[i + 1], WAVE_Y[i + 1] + dy); ctx.stroke();
    }
  }
  // one glint riding the top of the arc
  const gi = WAVE_N >> 2;
  ctx.fillStyle = UI.cream; ctx.fillRect(WAVE_X[gi] - 2, WAVE_Y[gi] - 3, 4, 2);
  // the cap it lands as: an inked slump of honey over the crown with its shade under and one glint on top
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x1, y1, 12, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.beginPath(); ctx.ellipse(x1, y1, 11, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = sh; ctx.fillRect(x1 - 7, y1 + 2, 14, 3);
  ctx.fillStyle = UI.cream; ctx.fillRect(x1 - 6, y1 - 4, 4, 2);
}

/**
 * A pool of honey on the ground at (x, y), `rx` either side: an inked flat ellipse, the shade along its near rim and
 * one glint. The flood leaves one under a stuck critter's feet, so the toffee strands have something to come from.
 */
export function drawHoneyPool(ctx, x, y, rx, honey) {
  const sh = shadeOf(honey), ry = rx > 11 ? 3 : 2;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = honey; ctx.beginPath(); ctx.ellipse(x - 1, y - 1, rx - 2, ry - 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = UI.cream; ctx.fillRect(x - (rx >> 1), y - 2, 3, 2);
}

/**
 * One toffee strand from a stuck foot (x0, y0) down to the honey it is stuck in (x1, y1): 2 px of `toffee` inside
 * its own ink (4 px, the inked-band floor of ART_STYLE 0.8), sagging off the straight line so it reads as a
 * stretched string and not a stick. The screen hands it a honey paler than the pool's: honey pulled thin IS paler,
 * and in the pool's own amber the strands were ink lines only.
 */
export function drawToffee(ctx, x0, y0, x1, y1, toffee) {
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.2, my = (y0 + y1) / 2;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? toffee : INK; ctx.lineWidth = pass ? 2 : 4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  }
}
