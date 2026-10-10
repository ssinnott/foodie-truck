// The pond's joke props (docs/GDD.md section 5; game/screens/pondGags.ts plays them): everything the old boot and the
// big one draw that the fishing kit (art/fishing.ts) does not - the big one's shadow circling under a float, the rod
// bent nearly double by it, the whopper itself, the lily pad and the very small frog that come up out of the pond on
// a critter's head, and the bubbles where it went in; and for the boot, the torrent out of it, the puddle it leaves
// on the planks and the tiny fish that was living in it. Screen space, integer coordinates, inked like every other
// prop on the pond (docs/ART_STYLE.md section 0.2) - the shadow alone carries no line, because a shadow under the
// water is not a thing - and no allocation per call: the joints a bent rod reads are module scratch points.
import { UI } from '../constants.ts';
import { jointScreen } from '../lib/art/rig.ts';
import type { Rig, RigWeapon } from '../lib/art/rig.ts';
import type { Point } from '../lib/art/rigParts.ts';
import { ITEMS } from '../content/critters/items.ts';
import { INK, TROUT } from './fishing.ts';
import { POND } from './backgrounds/pond.ts';

/**
 * The bend a seat's rod is drawn with, merged into the library's `Rig` the way game/minigame.ts merges the basket
 * state: the screen writes it before the drawRig, BENT_ROD reads it back. OPTIONAL, because lib/art/rig.ts buildRig
 * builds a complete `Rig` literal without it.
 */
declare module '../lib/art/rig.ts' {
  interface Rig {
    /** How far the rod's tip is pulled down toward the line, in rig px (BENT_ROD); 0 or unset is a straight rod. */
    rodBend?: number;
  }
}

const R = Math.round, TAU = Math.PI * 2;

/**
 * The jokes' own tones, all muted (docs/ART_STYLE.md section 4: the mint is the bite's and nothing else's):
 *   shadow    the big one under the water, two value steps under the deep water it swims in;
 *   frog      the very small frog, a dark leaf green well under the pad it sits on (the pad is the backdrop's own),
 *             with the paper's cream for its eyes and a pale green throat;
 *   water     what pours out of the boot - the drop particles' blue - with a lit fleck running down it;
 *   puddle    the same water lying on the planks, a step darker so the stream landing in it still reads.
 */
export const GAG = Object.freeze({
  shadow: '#2C4B59', frog: '#3E6A2B', frogEye: '#F1E4C8', belly: '#CFE3A6', pad: POND.lily, padShade: POND.lilyShade,
  water: '#A9D8EE', waterLit: '#E8F6FB', puddle: '#86BCD3',
});

// ---------------------------------------------------------------- the big one
/**
 * The big one's shadow under the water, nose toward `dir` (1 = right): a dark shape half as long again as a trout,
 * a body and a forked tail filled flat in GAG.shadow. Drawn before the float, so the float sits over it.
 */
export function drawFishShadow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  ctx.save(); ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = GAG.shadow;
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-20, -5); ctx.lineTo(-17, 0); ctx.lineTo(-20, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * The rod's own look (content/critters/items.ts ITEMS.rod, whose tones are private to it): its length read off the
 * item, its wood (the game's UI.wood), and the darker grip and pale tip eye it paints over that.
 */
const ROD_LEN = ITEMS.rod.length, ROD = UI.wood, ROD_GRIP = '#8B5A2B', ROD_EYE = '#C8C0B0';
/** The bend runs from BEND_FROM px up the rod (the quadratic's control point); a bent rod reaches BEND_SHORTEN of its bend less far. */
const BEND_FROM = 18, BEND_SHORTEN = 0.3;
/**
 * The rod with something on it too big for it: ITEMS.rod exactly while `rig.rodBend` is 0 (a 4 px capsule in the
 * rod's wood from 0 to 36 along the forearm, the grip, the tip eye), and with a bend, the same rod drawn as a
 * quadratic whose tip is pulled `rodBend` px down toward the line (+y in hand space is the clockwise side, the
 * water's side, for a rod held up over it). The line's end is moved to match by `bentTip`.
 */
export const BENT_ROD: RigWeapon = { attach: 'handR', length: ROD_LEN, draw(ctx, rig) {
  const b = rig.rodBend || 0, tx = ROD_LEN - b * BEND_SHORTEN;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(BEND_FROM, 0, tx, b);
  ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 4 + rig.ow * 2; ctx.stroke();
  ctx.strokeStyle = rig.col(ROD); ctx.lineWidth = 4; ctx.stroke();
  if (rig.override) return;
  ctx.fillStyle = rig.col(ROD_GRIP); ctx.fillRect(-2, -2, 6, 4);
  // the tip eye rides the curve, nine tenths of the way out
  const ex = 0.18 * BEND_FROM + 0.81 * tx, ey = 0.81 * b;
  ctx.fillStyle = rig.col(ROD_EYE); ctx.fillRect(R(ex) - 2, R(ey) - 3, 3, 2);
} };

const HAND: Point = { x: 0, y: 0 }, TIP: Point = { x: 0, y: 0 };
/**
 * Where a BENT_ROD's tip is on screen after the drawRig that drew it, written into `out`: the hand joint plus the
 * curve's end, carried along the rod (handN -> weaponTip) and across it (that, turned a quarter clockwise; a
 * mirrored rig turns the other way). With no bend this is the weaponTip joint itself.
 */
export function bentTip(rig: Rig, out: Point): Point {
  jointScreen(rig, 'handN', HAND); jointScreen(rig, 'weaponTip', TIP);
  const b = rig.rodBend || 0, tx = ROD_LEN - b * BEND_SHORTEN, side = rig.facing < 0 ? -1 : 1;
  const ux = (TIP.x - HAND.x) / ROD_LEN, uy = (TIP.y - HAND.y) / ROD_LEN;
  out.x = HAND.x + ux * tx - uy * b * side; out.y = HAND.y + uy * tx + ux * b * side;
  return out;
}

/**
 * The big one itself: the trout (art/fishing.ts drawTrout) at a size and a half - 34 px of fish, nose at -x like
 * the trout's - turned `rot` radians about its middle. The same three tones inside the same 2 px ink.
 */
export function drawBigTrout(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.beginPath(); ctx.ellipse(-3, 0, 13, 7, 0, 0, TAU);
  ctx.moveTo(8, 0); ctx.lineTo(17, -7); ctx.lineTo(14, 0); ctx.lineTo(17, 7); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = TROUT.body; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = TROUT.back; ctx.fillRect(-17, -8, 36, 6); ctx.restore();
  ctx.fillStyle = TROUT.gill; ctx.fillRect(-9, 0, 3, 3);
  ctx.fillStyle = INK; ctx.fillRect(-13, -3, 3, 3); ctx.fillRect(-16, 2, 3, 2);   // the eye, and a gape
  ctx.restore();
}

/** The frog's two eye bumps, [x, y] on its back in hat space: the far one first, so the near one overlaps it. */
const FROG_EYES = Int8Array.of(2, -8, 6, -8);
/**
 * The lily pad hat and the very small frog sat on it, on a crown point (x, y) and turned `ang` radians with the
 * head: a flat inked pad with its shade crescent and its notch, and on its far half a frog a dozen px across - a
 * dark inked body under two pale eye bumps, an ink pupil in each, looking the way the crew looks. Dark body and
 * pale eyes, because the frog has to read on a pad that sits on a head that is often pond-green itself (the coat).
 * `puff` blows the frog's throat out into a pale bubble: its RIBBIT.
 */
export function drawLilyHat(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, puff: boolean): void {
  ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang);
  ctx.beginPath(); ctx.ellipse(0, -1, 11, 4, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = GAG.pad; ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = GAG.padShade; ctx.fillRect(-12, 0, 24, 4); ctx.restore();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(-4, -1); ctx.lineTo(-2, 3); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3, -4, 6, 3.5, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = GAG.frog; ctx.fill();
  if (puff) { ctx.beginPath(); ctx.arc(9, -3, 3, 0, TAU); ctx.stroke(); ctx.fillStyle = GAG.belly; ctx.fill(); }
  for (let i = 0; i < FROG_EYES.length; i += 2) {
    const ex = FROG_EYES[i], ey = FROG_EYES[i + 1];
    ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.stroke(); ctx.fillStyle = GAG.frogEye; ctx.fill();
    ctx.fillStyle = INK; ctx.fillRect(ex, ey - 1, 2, 2);
  }
  ctx.restore();
}

/** The bubbles where something went under: three inked rings rising off (x, y) on staggered starts, `k` frames in. */
const BUBBLE_LIFE = 18, BUBBLE_STAGGER = 7, BUBBLE_RISE = 0.8;
export function drawBubbles(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = GAG.water;
  for (let i = 0; i < 3; i++) {
    const age = (k + i * BUBBLE_STAGGER) % BUBBLE_LIFE;
    const bx = x + (i - 1) * 6 + ((age >> 2) & 1), by = y - R(age * BUBBLE_RISE), r = age < 6 ? 2 : 3;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke(); ctx.fill();
  }
}

// ---------------------------------------------------------------- the old boot
/** The torrent's fall: it leaves the boot at GUSH_VX px a frame forward and falls at GUSH_G, drawn in GUSH_SEGS strokes. */
const GUSH_VX = 1.6, GUSH_G = 0.36, GUSH_SEGS = 8;
/** How far forward of its start a torrent poured from row `y0` lands on row `floorY`. */
export function gushReach(y0: number, floorY: number): number { return GUSH_VX * Math.sqrt(2 * Math.max(0, floorY - y0) / GUSH_G); }
/**
 * The boot's torrent: a band of water from the boot's mouth (x0, y0) arcing forward and down to `floorY`, inked
 * either side, glugging a px wider every few frames, with three lit flecks running down it so it reads as pouring
 * and not as a glass rod. `f` is any frame counter.
 */
export function drawGush(ctx: CanvasRenderingContext2D, x0: number, y0: number, floorY: number, f: number): void {
  const T = Math.sqrt(2 * Math.max(1, floorY - y0) / GUSH_G);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i <= GUSH_SEGS; i++) { const t = (T * i) / GUSH_SEGS; ctx.lineTo(R(x0 + GUSH_VX * t), R(y0 + (GUSH_G * t * t) / 2)); }
  const w = (f >> 2) & 1 ? 6 : 5;
  ctx.strokeStyle = INK; ctx.lineWidth = w + 2; ctx.stroke();
  ctx.strokeStyle = GAG.water; ctx.lineWidth = w; ctx.stroke();
  ctx.fillStyle = GAG.waterLit;
  for (let j = 0; j < 3; j++) {
    const t = (f * 0.7 + (j * T) / 3) % T;
    ctx.fillRect(R(x0 + GUSH_VX * t) - 1, R(y0 + (GUSH_G * t * t) / 2) - 1, 2, 2);
  }
}

/** The puddle the torrent leaves on the planks: a flat inked pool `rx` px across the long way, with a lit streak. */
export function drawPuddle(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  if (rx < 3) return;
  const ry = Math.max(2, R(rx * 0.28));
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = GAG.puddle; ctx.fill();
  ctx.fillStyle = GAG.waterLit; ctx.fillRect(x - R(rx / 2), y - 1, R(rx / 3) + 2, 2);
}

/** The tiny fish that was living in the boot: ten px of trout facing `dir` (1 = nose right), flipped each flop. */
export function drawTinyFish(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  ctx.save(); ctx.translate(x, y); if (dir > 0) ctx.scale(-1, 1);
  ctx.beginPath(); ctx.ellipse(-1, 0, 4, 2.5, 0, 0, TAU); ctx.moveTo(2, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = TROUT.body; ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(-4, -1, 2, 2);
  ctx.restore();
}
