// Hazel Holt's two jokes, the drawing half (docs/GDD.md section 5; the sim half is game/screens/holtGags.ts): the
// squirrel in every pose its beat needs and the tail it gives itself away by, and the avalanche's crop - falling,
// heaped over a critter, and rolling away. Every function here is draw-only and allocation-free: the point lists
// are typed tables built once, the poses are numbers, and every position is handed in by the screen from the sim's
// timers and the rig's joints.
//
// The squirrel is one of the scene's muted props (docs/ART_STYLE.md section 4): rust fur and a cream front, inked
// like everything else, three tones - never the gold SIGNAL.holt, which only marks a tree you can shake. The heap and
// the falling nuts are the visit's own nut glyph (art/food.ts), so a walnut avalanche buries a critter in walnuts.
import { INK } from './layers.ts';
import { drawFood, foodTones } from './food.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The squirrel's own three tones: the tail a shade darker than the body, and a cream front. */
const SQ = Object.freeze({ tail: '#A8623A', fur: '#B8703F', lit: '#CF9060', belly: '#F1E4C8' });

/**
 * The squirrel's poses, feet at its (x, y):
 *   sit      sat up on its haunches, forepaws on its knees;
 *   chatter  scolding: leaning out over the brow, stamping 2 px up and down, mouth snapping, one paw shaken, tail
 *            flicking - the "chatters furiously" of the beat;
 *   raise    up on its toes with a nut held over its head in both paws;
 *   bonk     the nut brought down hard in front of its feet - on the head it is standing on;
 *   leap     stretched out in the air, tail streaming, the nut in its mouth;
 *   tumble   `sit` turned through the air as it falls out of the canopy.
 */
export const SQUIRREL_POSE = Object.freeze({ sit: 0, chatter: 1, raise: 2, bonk: 3, leap: 4, tumble: 5 });
const SQ_CHATTER = SQUIRREL_POSE.chatter, SQ_RAISE = SQUIRREL_POSE.raise, SQ_BONK = SQUIRREL_POSE.bonk, SQ_LEAP = SQUIRREL_POSE.leap, SQ_TUMBLE = SQUIRREL_POSE.tumble;
/** The nut the squirrel holds is drawn at this glyph size (6 px): its own size, not a +1's. */
const SQ_NUT = 3;

/** A forepaw: a 2x2 of fur in its 1 px ink. */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 4, 4);
  ctx.fillStyle = SQ.fur; ctx.fillRect(x, y, 2, 2);
}

/**
 * The squirrel at (x, y) (its feet), facing `facing`, in `pose`; `f` is any frame counter (the stamp, the snapping
 * mouth, the flicking tail and the tumble are read off it). About 25 px tall with its tail up. `icon`/`hex` are
 * the nut it carries in `raise`, `bonk`, `leap` and `sit` once it has one (`nut` true).
 */
export function drawSquirrel(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, pose: number, f: number, nut: boolean, icon: string, hex: string): void {
  ctx.save(); ctx.translate(R(x), R(y)); if (facing < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  if (pose === SQ_LEAP) { drawLeap(ctx, nut, icon, hex); ctx.restore(); return; }
  if (pose === SQ_TUMBLE) { ctx.translate(0, -9); ctx.rotate(f * 0.8); ctx.translate(0, 9); }
  const chat = pose === SQ_CHATTER;
  if (chat && ((f >> 2) & 1)) ctx.translate(0, -2);   // the stamp
  const lean = pose === SQ_BONK ? 3 : chat ? 2 : 0, up = pose === SQ_RAISE ? -2 : 0;
  // the tail: a fat S standing up behind it; chattering, the tip flicks over every other pair of frames
  const fl = chat && ((f >> 1) & 1) ? 3 : 0;
  ctx.beginPath(); ctx.moveTo(-5, -2); ctx.quadraticCurveTo(-18, -5, -14, -18 + up);
  ctx.quadraticCurveTo(-11 + fl, -27 + up, -3 + fl, -22 + up); ctx.quadraticCurveTo(-9, -14, -3, -6); ctx.closePath();
  ctx.stroke(); ctx.fillStyle = SQ.tail; ctx.fill();
  ctx.fillStyle = SQ.lit; ctx.fillRect(-14, -18 + up, 3, 5);   // the light on the tail's top-left
  // the body, sat up (stretched up on its toes to RAISE)
  const bx = lean >> 1;
  ctx.beginPath(); ctx.ellipse(bx, -7 + up, 6, 6 - up, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = SQ.fur; ctx.fill();
  ctx.fillStyle = SQ.belly; ctx.fillRect(bx + 1, -10 + up, 4, 7);
  // the head, forward of the body; BONK has it ducked down with the blow
  const hx = 5 + lean, hy = -14 + up * 2 + (pose === SQ_BONK ? 3 : 0);
  ctx.fillStyle = INK; ctx.fillRect(hx - 4, hy - 8, 3, 4); ctx.fillRect(hx, hy - 8, 3, 4);   // the ear tufts
  ctx.beginPath(); ctx.arc(hx, hy, 5, 0, TAU); ctx.stroke(); ctx.fillStyle = SQ.fur; ctx.fill();
  ctx.fillStyle = SQ.lit; ctx.fillRect(hx - 3, hy - 3, 2, 2);
  ctx.fillStyle = INK; ctx.fillRect(hx + 1, hy - 2, 2, 2); ctx.fillRect(hx + 4, hy, 2, 2);   // the eye and the nose
  if (chat && (f & 2)) ctx.fillRect(hx + 2, hy + 2, 3, 2);   // the mouth, snapping open and shut
  // the forepaws, and the nut in them
  if (pose === SQ_RAISE) {
    paw(ctx, hx - 3, hy - 9); paw(ctx, hx + 1, hy - 9);
    drawFood(ctx, icon, hx, hy - 13, SQ_NUT, hex);
  } else if (pose === SQ_BONK) {
    paw(ctx, hx + 2, -3);
    drawFood(ctx, icon, hx + 5, -2, SQ_NUT, hex);
  } else if (chat) {
    paw(ctx, hx + 2, hy + 5 - (((f >> 1) & 1) << 1));   // shaken at the critter below
  } else {
    paw(ctx, 3, -6);
    if (nut) drawFood(ctx, icon, 6, -6, SQ_NUT, hex);
  }
  ctx.fillStyle = INK; ctx.fillRect(-4, -1, 4, 2); ctx.fillRect(2, -1, 4, 2);   // the feet
  ctx.restore();
}

/** LEAP, in the squirrel's own space (facing +x, feet line at 0): stretched long, the tail streaming up behind. */
function drawLeap(ctx: CanvasRenderingContext2D, nut: boolean, icon: string, hex: string): void {
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(-17, -7, -21, -15); ctx.quadraticCurveTo(-22, -22, -15, -20);
  ctx.quadraticCurveTo(-12, -12, -4, -3); ctx.closePath();
  ctx.stroke(); ctx.fillStyle = SQ.tail; ctx.fill();
  ctx.fillStyle = SQ.lit; ctx.fillRect(-19, -19, 3, 4);
  ctx.beginPath(); ctx.ellipse(0, -6, 8, 4, -0.2, 0, TAU); ctx.stroke(); ctx.fillStyle = SQ.fur; ctx.fill();
  ctx.fillStyle = SQ.belly; ctx.fillRect(-2, -4, 6, 2);
  ctx.fillStyle = INK; ctx.fillRect(4, -16, 3, 4); ctx.fillRect(8, -16, 3, 4);   // the ear tufts
  ctx.beginPath(); ctx.arc(8, -10, 4.5, 0, TAU); ctx.stroke(); ctx.fillStyle = SQ.fur; ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(9, -12, 2, 2);
  paw(ctx, 10, -3); paw(ctx, -9, -3);   // forepaws reaching, hind feet trailing
  if (nut) drawFood(ctx, icon, 13, -8, SQ_NUT, hex);   // carried off in its mouth
}

/**
 * The tail tell's plume as a run of fluffy blobs, root to tip - [dx, dy, r] - hanging down out of the leaves and
 * curling up at the end like a question mark, fattening as it goes, the way a squirrel's tail does. The last
 * TAIL_CURL blobs are the curl, which a flick lifts.
 */
const TAIL_BLOBS = Int8Array.of(0, 0, 4, -1, 6, 4, -2, 12, 5, -1, 18, 5, 2, 23, 6, 8, 25, 6, 13, 21, 5, 14, 14, 5);
const TAIL_CURL = 3;

/**
 * The squirrel's TELL: its big bushy tail hanging out of a tree's leaves. (x, y) is the root, which the canopy drawn
 * after it covers, so the plume comes out of the leaves rather than lying on them; `flick` (0..1) whips the curl up
 * for the few frames the screen asks. Built like the canopy it hangs from - ink silhouette, fill, lit caps - so it
 * reads as fur, and fur is what a sharp eye is looking for.
 */
export function drawSquirrelTail(ctx: CanvasRenderingContext2D, x: number, y: number, flick: number): void {
  x = R(x); y = R(y);
  const n = TAIL_BLOBS.length / 3, lift = flick * 3;
  for (let pass = 0; pass < 3; pass++) {
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? SQ.tail : SQ.lit;
    for (let i = 0; i < n; i++) {
      if (pass === 2 && (i & 1)) continue;   // the light catches every other tuft, so the plume is not a string of beads
      const up = i >= n - TAIL_CURL ? lift * (i - n + TAIL_CURL + 1) : 0;
      const bx = x + TAIL_BLOBS[i * 3], by = y + TAIL_BLOBS[i * 3 + 1] - up, r = TAIL_BLOBS[i * 3 + 2];
      ctx.beginPath();
      if (pass === 0) ctx.arc(bx, by, r + 1, 0, TAU);
      else if (pass === 1) ctx.arc(bx, by, r, 0, TAU);
      else ctx.arc(bx - 2, by - 2, r * 0.4, 0, TAU);
      ctx.fill();
    }
  }
}

/** The heap's nuts: rows HEAP_ROW apart, nuts HEAP_COL apart along a row, each a size-HEAP_S glyph (~8 px). */
const HEAP_ROW = 5, HEAP_COL = 7, HEAP_S = 4;
/** Each nut in the heap is turned a little, from this table in turn, so the heap is a jumble and not a print. */
const HEAP_TILT = Float32Array.of(0, 0.6, -0.5, 1.1, -0.9, 0.25, -0.2, 1.4, -1.2, 0.8, 0.4);

/** Nuts spilled on the litter round the heap's foot, [dx past the heap's edge, rows up] each side, mirrored. */
const SPILL = Int8Array.of(3, 1, 10, 0, 6, 4);

/**
 * The heap a critter is buried under: a mound of the visit's nuts standing on `foot`, peaking at `top`, `w` px
 * either side of `x`, built up to `grow` (0..1) of its height, with a few spilled round its foot. A dome, so that
 * its rounded cap covers the whole skull under `top`; drawn OVER the critter, so whatever of the rig stands above
 * `top` - long ears, a toque, a frog's eyes, a sheep's wool cap - pokes out of it. The screen puts `top` on the
 * crown of the skull.
 */
export function drawNutHeap(ctx: CanvasRenderingContext2D, x: number, foot: number, top: number, w: number, grow: number, icon: string, hex: string): void {
  const H = R((foot - top) * grow);
  if (H < 6) return;
  x = R(x);
  // the mound's body: inked, then the nut's own shade - the dark between the nuts
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, foot, w + 1, H + 1, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.fillStyle = foodTones(hex).sh; ctx.beginPath(); ctx.ellipse(x, foot, w - 1, H - 1, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  // the nuts on its face, the top row first so that every row down lies over the one behind it
  let n = 0;
  for (let h = H - 3, row = 0; h >= 1; h -= HEAP_ROW, row++) {
    const k = h / H, half = w * Math.sqrt(1 - k * k) - 3;
    for (let dx = row & 1 ? HEAP_COL / 2 : 0; dx <= half; dx += HEAP_COL) {
      drawTurnedNut(ctx, x + dx, foot - h, HEAP_TILT[n++ % HEAP_TILT.length], HEAP_S, icon, hex);
      if (dx > 0) drawTurnedNut(ctx, x - dx, foot - h, HEAP_TILT[n++ % HEAP_TILT.length], HEAP_S, icon, hex);
    }
  }
  if (grow < 1) return;
  for (let i = 0; i < SPILL.length; i += 2) {
    drawTurnedNut(ctx, x - w - SPILL[i], foot - SPILL[i + 1], HEAP_TILT[n++ % HEAP_TILT.length], HEAP_S, icon, hex);
    drawTurnedNut(ctx, x + w + SPILL[i], foot - SPILL[i + 1], HEAP_TILT[n++ % HEAP_TILT.length], HEAP_S, icon, hex);
  }
}

/**
 * The crop letting go: CROP_N nuts, each from its own place in the canopy and after its own delay, falling on a
 * gravity curve onto the heap - converging on the critter, which is the joke. [dx, dy] about the crown, the dx
 * about the critter each lands at, and the frames each hangs on before it lets go (a ripple, not a slab).
 */
const CROP_FROM = Int8Array.of(
  -22, -6, -4, -26, 14, -14, 26, 4, -10, 10, 8, 18, -30, 14, -14, -16, 4, -8, 20, -4, -24, 4, 16, 10, -2, 22,
  30, 14, -16, 20, 0, -18, 24, -10, -28, -4, -6, -36, 10, -30, -34, 0, 34, 0, -18, 26, 18, 24, 6, 2, -8, -2,
);
const CROP_TO = Int8Array.of(-16, 2, 12, 20, -6, 6, -20, -10, 14, -2, 22, -14, 8, -22, 18, 0, -8, 10, 4, -4, -24, 24, -12, 16, 0, -18);
const CROP_DELAY = Uint8Array.of(0, 2, 1, 3, 0, 1, 4, 2, 0, 3, 5, 1, 2, 6, 4, 1, 3, 5, 2, 4, 0, 1, 6, 3, 5, 2);
const CROP_N = CROP_TO.length;
/** The fall: px/frame^2. From the crown to a head on the band is ~140 rows, which this covers in ~11 frames. */
const CROP_G = 2.3;

/**
 * The falling crop `k` frames after it let go, from the crown at (cx, cy) down onto the heap whose top is `land`
 * over x. A nut that reaches its landing row is part of the heap and is not drawn again.
 */
export function drawFallingCrop(ctx: CanvasRenderingContext2D, cx: number, cy: number, x: number, land: number, k: number, icon: string, hex: string): void {
  for (let j = 0; j < CROP_N; j++) {
    const kk = k - CROP_DELAY[j], x0 = cx + CROP_FROM[j * 2], y0 = cy + CROP_FROM[j * 2 + 1];
    const y1 = land + (j % 3) * 6;   // landing rows staggered over the heap's top, so they sink in at different heights
    const y = kk <= 0 ? y0 : y0 + 0.5 * CROP_G * kk * kk;
    if (y >= y1) continue;
    const e = (y - y0) / (y1 - y0);
    drawFood(ctx, icon, R(x0 + (x + CROP_TO[j] - x0) * e), R(y), HEAP_S, hex);
  }
}

/** One nut glyph turned through `rot` about its centre, at size `s`: a nut lying any way up in the heap, or rolling away. */
export function drawTurnedNut(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number, icon: string, hex: string): void {
  ctx.save(); ctx.translate(R(x), R(y)); ctx.rotate(rot); drawFood(ctx, icon, 0, 0, s, hex); ctx.restore();
}
