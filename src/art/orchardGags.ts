// Pippin Orchard's two jokes, drawn (docs/GDD.md section 5; docs/ART_STYLE.md sections 0, 4, 7): the bomb apple's
// fuse, the wormy apple and the grub that lives in it, and the litter the jokes leave behind them - a wormy apple
// flung over a shoulder, and a grub on the grass that wriggles off and burrows back in.
//
// Screen space, integer coordinates, no allocation per call (docs/ARCHITECTURE.md section 8). Nothing in here decides
// WHEN anything happens: the jokes (game/screens/orchardGags.ts) own the beats and pass in how far along each one
// is, so a headless peer steps without drawing. The litter is the one thing here with state, and it is cosmetic under
// the particles' contract (docs/ARCHITECTURE.md section 4): one module pool, stepped by stepLitter() from the screen's
// update(), emptied by clearLitter() in enter(), no rng read, nothing in checksumFields() - where a flung apple lands
// decides nothing.
//
// The grub is drawn in the rig's style: one 1 px ink line round the whole stack of beads (every bead's ink first,
// then every fill - the bramble bush's recipe), cream beads with one shade band each, 2 px eyes. Its tongue is the
// cast's own mouth red (content/critters/common.ts critterFace's `shout`), never a SIGNAL hex: a raspberry is not a
// danger and not the thing you want.
import { UI, SIGNAL } from '../constants.ts';
import { drawFood } from './food.ts';
import { ORCHARD } from './backgrounds/orchard.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The grub's beads, the shade band under each one (a warm step down, not the food ramp's cool grey), and its tongue. */
const GRUB = UI.cream, GRUB_SH = '#E2CDA6', TONGUE = '#A03030';
/** The bite hole: this far along the apple's shoulder from its centre, and this far up; its radius. */
const HOLE_DX = 3, HOLE_DY = 2, HOLE_R = 3;
/** The grub's beads: a body bead's radius, its head's, and its head's puffed up while it blows a raspberry, in px. */
const BEAD_R = 3, HEAD_R = 4, PUFF_R = 5;
/** The mood a grub's head is drawn in: looking about, or blowing a raspberry at whoever is holding it. */
export const PLAIN = 0, RASPBERRY = 1;
/** The fuse: a bent 2 px wick standing this far off the stem, with a spark at its tip. It burns to nothing through the hold. */
export const FUSE_H = 7;

/** One filled disc at whole pixels. */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.arc(R(x), R(y), r, 0, TAU); ctx.fill();
}

/** The fuse: a bent 2 px wick `h` px tall off the stem at (x, y), and a 3 px spark flickering on its tip. */
export function drawFuse(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, f: number): void {
  if (h <= 0) return;
  const bend = h > 3 ? 3 : h;
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x + 1, y - bend, 2, bend + 1);
  if (h > 3) ctx.fillRect(x + 2, y - h, 3, h - bend + 1);
  ctx.fillStyle = f & 1 ? SIGNAL.hot : UI.cream;
  ctx.fillRect(x + 3 - (h > 3 ? 0 : 2), y - h - 2, 3, 3);
}

/**
 * A wormy fruit centred on (x, y), half-size `s`: the visit's glyph in the bruised ORCHARD.wormy with an ink bite
 * hole on the shoulder toward `side` (+1 right, -1 left) that takes the stem and the leaf with it. `tell` adds the
 * grub climbing out over the rim, two inked cream beads: a falling one's tell, the broken silhouette that survives
 * the squint where a colour swap did not. In a paw the grub has ducked back in, and drawGrub brings it out.
 */
export function drawWormyApple(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, s: number, side: number, tell: boolean): void {
  drawFood(ctx, icon, x, y, s, ORCHARD.wormy);
  ctx.fillStyle = UI.ink; disc(ctx, x + side * HOLE_DX, y - HOLE_DY, HOLE_R);
  if (!tell) return;
  disc(ctx, x + side * 3, y - 4, 3); disc(ctx, x + side * 6, y - 7, 3);          // the grub, inked...
  ctx.fillStyle = UI.cream;
  disc(ctx, x + side * 3, y - 4, 2); disc(ctx, x + side * 6, y - 7, 2);          // ...then its two beads
}

/** Where the bite hole is on a fruit centred on (x, y) whose hole faces `side`: drawGrub stands the grub on it. */
export function holeX(x: number, side: number): number { return x + side * HOLE_DX; }
export function holeY(y: number): number { return y - HOLE_DY; }

/**
 * The grub standing `rise` px up out of a hole whose centre is (x, y), its face toward `dir` (+1 right, -1 left):
 * two body beads and a head, the head `lean` px over to one side. Clipped at the hole's centre row, so a grub on its
 * way up comes OUT of the apple (or a mouth) rather than being stuck on the front of it. RASPBERRY puffs its head a
 * size bigger and sticks its tongue out toward `dir`.
 */
export function drawGrub(ctx: CanvasRenderingContext2D, x: number, y: number, rise: number, dir: number, lean: number, mood: number): void {
  if (rise <= 0) return;
  const hr = mood === RASPBERRY ? PUFF_R : HEAD_R;
  const hx = R(x + lean), hy = R(y - rise);
  const b1x = x + lean * 0.25, b1y = y - rise * 0.3, b2x = x + lean * 0.6, b2y = y - rise * 0.62;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 24, y - 48, 48, 48); ctx.clip();
  ctx.fillStyle = UI.ink;
  disc(ctx, b1x, b1y, BEAD_R + 1); disc(ctx, b2x, b2y, BEAD_R + 1); disc(ctx, hx, hy, hr + 1);
  ctx.fillStyle = GRUB;
  disc(ctx, b1x, b1y, BEAD_R); disc(ctx, b2x, b2y, BEAD_R); disc(ctx, hx, hy, hr);
  // one shade mark per bead, low on the side away from the light (top-left): a 2 px fleck of the warm shade
  ctx.fillStyle = GRUB_SH;
  ctx.fillRect(R(b1x), R(b1y) + 1, 2, 2); ctx.fillRect(R(b2x), R(b2y) + 1, 2, 2); ctx.fillRect(hx + 1, hy + hr - 3, 2, 2);
  ctx.restore();
  // the face, toward dir: two 2 px eyes a pixel apart, both inside the head's cream (a disc of radius 4 on a whole
  // pixel covers the columns hx-4..hx+3, so the far eye sits on hx+2 one way and on its mirror, hx-4, the other)
  ctx.fillStyle = UI.ink;
  ctx.fillRect(hx - 1, hy - 2, 2, 2);
  ctx.fillRect(dir > 0 ? hx + 2 : hx - 4, hy - 2, 2, 2);
  if (mood !== RASPBERRY) return;
  const tx = dir > 0 ? hx + hr - 1 : hx - hr - 4;
  ctx.fillRect(tx, hy + 1, 5, 4);
  ctx.fillStyle = TONGUE; ctx.fillRect(tx + 1, hy + 2, 3, 2);
}

/**
 * Shiver marks: the comic's tremble strokes, two short 2 px ink ticks either side of a thing `half` px wide centred
 * on (x, y), stepping out a pixel every other pair of frames (`f`), so a shudder or a shaking paw reads in a still
 * frame and not only in motion.
 */
export function drawShiver(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, f: number): void {
  const j = (f >> 1) & 1;
  x = R(x); y = R(y);
  ctx.fillStyle = UI.ink;
  ctx.fillRect(x - half - 3 - j, y - 5, 2, 4); ctx.fillRect(x - half - 6 - j, y + 1, 2, 4);
  ctx.fillRect(x + half + 1 + j, y - 5, 2, 4); ctx.fillRect(x + half + 4 + j, y + 1, 2, 4);
}

/**
 * A grub lying on the grass at (x, y) with its head toward `dir`: three beads in a row, the middle one humped up by
 * `hump` px (the inchworm's step), sunk `sink` px into the ground (it burrows at the end), clipped at the ground row.
 */
function drawCrawler(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, hump: number, sink: number): void {
  const gy = y - BEAD_R + sink;
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 16, y - 20, 32, 20); ctx.clip();
  ctx.fillStyle = UI.ink;
  disc(ctx, x - dir * 8, gy, BEAD_R + 1); disc(ctx, x - dir * 4, gy - hump, BEAD_R + 1); disc(ctx, x, gy - 1, HEAD_R + 1);
  ctx.fillStyle = GRUB;
  disc(ctx, x - dir * 8, gy, BEAD_R); disc(ctx, x - dir * 4, gy - hump, BEAD_R); disc(ctx, x, gy - 1, HEAD_R);
  ctx.fillStyle = UI.ink;
  ctx.fillRect(R(x) + (dir > 0 ? 1 : -3), R(gy) - 3, 2, 2);
  ctx.restore();
}

// ---------------------------------------------------------------- the litter: a cosmetic pool

/** What a bit of litter is doing: nothing, flying (a flung apple), falling (a grub off a muzzle), crawling away. */
const FREE = 0, TOSS = 1, FALL = 2, CRAWL = 3;
/** One per joke at most, and a grub outlives its joke by a couple of seconds: eight is room for four seats. */
const MAX_LITTER = 8;
/** Gravity on anything in the air, px/frame^2, and how fast a flung apple tumbles, radians a frame. */
const GRAVITY = 0.3, SPIN = 0.3;
/** The crawl: px/frame, the frames it lasts, the last frames of them spent burrowing back in, and its step. */
const CRAWL_SPEED = 0.35, CRAWL_FRAMES = 110, BURROW = 12, STEP = 8;
/** A flung apple lies squashed where it landed for MARK_FRAMES, a size smaller for the second half (stepped, not faded). */
const MARK_FRAMES = 30;
const MARK_RX = Int8Array.of(8, 5), MARK_RY = Int8Array.of(3, 2);

/** One piece of litter: a slot of the pool, reused in place. */
export interface Litter {
  /** FREE, TOSS, FALL or CRAWL. */
  kind: number;
  /** Frames since it was thrown, dropped or landed. */
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The row it lands on: the lane of the seat it came from. */
  floor: number;
  /** Which way it is going, and so which way the grub crawls when it lands. */
  dir: number;
  /** Where it landed: the squashed apple stays there while the grub crawls away from it. */
  x0: number;
  /** True for a flung apple: it leaves a squashed apple behind it when it lands. */
  apple: boolean;
}

const litter: Litter[] = [];
for (let i = 0; i < MAX_LITTER; i++) litter.push({ kind: FREE, t: 0, x: 0, y: 0, vx: 0, vy: 0, floor: 0, dir: 1, x0: 0, apple: false });
let cursor = 0;

/** Empty the pool: the screen's enter(), next to particles.clear(). */
export function clearLitter(): void { for (let i = 0; i < litter.length; i++) litter[i].kind = FREE; cursor = 0; }

function spawn(kind: number, x: number, y: number, vx: number, vy: number, floor: number, dir: number): Litter {
  const b = litter[cursor]; cursor = (cursor + 1) % litter.length;
  b.kind = kind; b.t = 0; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.floor = floor; b.dir = dir; b.x0 = x; b.apple = kind === TOSS;
  return b;
}

/**
 * A wormy apple flung from (x, y) at (vx, vy) px/frame, to land on row `floor`. Returns the frames it will be in
 * the air, so the screen can time the landing's thud: the flight is stepped here exactly as stepLitter steps it.
 */
export function tossApple(x: number, y: number, vx: number, vy: number, floor: number): number {
  spawn(TOSS, x, y, vx, vy, floor, vx < 0 ? -1 : 1);
  let n = 0;
  for (let yy = y, v = vy; yy < floor && n < 240; n++) { v += GRAVITY; yy += v; }
  return n;
}

/** A grub let go at (x, y) - off a muzzle - to land on row `floor` and crawl off toward `dir`. */
export function dropGrub(x: number, y: number, floor: number, dir: number): void { spawn(FALL, x, y, dir * 0.6, -1.2, floor, dir); }

/** One fixed step of every piece of litter: the screen's update(), next to particles.update(). */
export function stepLitter(): void {
  for (let i = 0; i < litter.length; i++) {
    const b = litter[i];
    if (b.kind === FREE) continue;
    b.t++;
    if (b.kind === CRAWL) { if (b.t >= CRAWL_FRAMES) b.kind = FREE; continue; }
    b.vy += GRAVITY; b.x += b.vx; b.y += b.vy;
    if (b.y >= b.floor) { b.kind = CRAWL; b.t = 0; b.y = b.floor; b.x0 = b.x; }
  }
}

/** Every piece of litter that is out: after the seats (it lands in front of their feet), before the falling apples. */
export function drawLitter(ctx: CanvasRenderingContext2D, icon: string, s: number): void {
  for (let i = 0; i < litter.length; i++) {
    const b = litter[i];
    if (b.kind === TOSS) {
      ctx.save(); ctx.translate(R(b.x), R(b.y)); ctx.rotate(b.t * SPIN * b.dir);
      drawWormyApple(ctx, icon, 0, 0, s, 1, false);
      ctx.restore();
    } else if (b.kind === FALL) {
      drawCrawler(ctx, R(b.x), R(b.y), b.dir, 0, 0);
    } else if (b.kind === CRAWL) {
      const t = b.t, y = R(b.y);
      if (b.apple && t < MARK_FRAMES) {
        const k = t < MARK_FRAMES / 2 ? 0 : 1;
        ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.ellipse(R(b.x0), y, MARK_RX[k] + 1, MARK_RY[k] + 1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = ORCHARD.wormy; ctx.beginPath(); ctx.ellipse(R(b.x0), y, MARK_RX[k], MARK_RY[k], 0, 0, TAU); ctx.fill();
      }
      // the inchworm: a step every STEP frames, the middle bead humped up while the front reaches forward
      const steps = (t / STEP) | 0, half = t % STEP < STEP / 2;
      const x = b.x0 + b.dir * (steps * STEP + (half ? 0 : STEP / 2)) * CRAWL_SPEED;
      const sink = t > CRAWL_FRAMES - BURROW ? t - (CRAWL_FRAMES - BURROW) : 0;
      drawCrawler(ctx, R(x), y, b.dir, half ? 2 : 0, sink);
    }
  }
}

/** Pieces of litter out (the tests read it). */
export function litterOut(): number {
  let n = 0;
  for (let i = 0; i < litter.length; i++) if (litter[i].kind !== FREE) n++;
  return n;
}
