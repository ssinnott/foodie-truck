// GAGS - the shared furniture of the mini-games' jokes (docs/GDD.md section 5, "Every mini-game has two jokes").
// A joke has four beats - a TELL a sharp eye can see coming, a WIND-UP the critter stands in, the BANG, and a LOOK
// that stays on the critter afterwards - and the bang and the look are what this module draws, the same way in every
// scene, so a joke reads from across a room at 1x and not only to the player whose seat it hit:
//   * the word card: a comic STARBURST for the bang (BOOM!, SPLUT!, FWUMP!) and a speech BUBBLE for the beats
//     around it (!, ?!, MMM!), popped in big, held, and shrunk away - the size-1 float text the jokes used to
//     shout with was the smallest thing on the screen at the very moment it most wanted to be read;
//   * the dizzy stars: three little inked stars circling a head;
//   * the bump: the world nudged down and up a couple of rows for a few frames on the biggest bangs;
//   * the coats: what a critter is painted in after the bang (soot, flour, honey, mud). A coat is the rig's
//     `override` with `coatEyes` set, which content/critters/common.ts critterRig turns into a coat that keeps the
//     rig's INK and the face's WHITES AND PUPILS - a sooty critter blinking out of the soot, not a flat silhouette.
//
// All of it is COSMETIC, under the particles' contract (docs/ARCHITECTURE.md section 4): one module pool, stepped by
// stepGags() from a screen's update() next to particles.update(), drawn by drawGags() after the name plates and
// before the tally ticket, emptied by clearGags() in enter(). No rng is read, nothing here reaches checksumFields(),
// and a joke's TIMING always lives on the screen's own sim fields - a card is never what ends a beat.
//
// Zero allocation per draw (docs/ARCHITECTURE.md section 8): the cards are a fixed pool written in place, the star
// outlines are unit tables built once, and the text options are module objects.
import { VIEW_W, UI } from '../constants.ts';
import { drawText, measureText } from '../engine/text.ts';
import type { Rig } from '../lib/art/rig.ts';
import type { Seat } from './minigame.ts';

const R = Math.round, TAU = Math.PI * 2;

/** The two card kinds: the starburst for a bang, the bubble for a remark. */
export const BURST = 0, BUBBLE = 1;
/** Frames a card is up: a burst stays long enough to read across a room, a bubble is a remark. */
const BURST_LIFE = 56, BUBBLE_LIFE = 44;
/** The pop: from POP_FROM to OVER over POP frames, settled to 1 by SETTLE, shrunk away over the last OUT frames. */
const POP = 5, SETTLE = 9, OUT = 6, POP_FROM = 0.35, OVER = 1.25;
/** A card hops this many rows up while it pops, then holds. */
const RISE = 6;
const MAX_CARDS = 8;
/** The starburst: POINTS spikes, each valley at INNER of the outer radius, PAD px round the word. */
const POINTS = 12, INNER = 0.78, PAD_X = 19, PAD_Y = 13;
/** The bubble: PAD px round the word, its tail TAIL rows long. */
const BPAD_X = 8, BPAD_Y = 6, TAIL = 7;
/** Card text is size 2 (10x14 glyphs): the size a word has to be to be read at 1x across a room. */
const TEXT_SIZE = 2, GLYPH_H = 7;
/** A card is kept clear of the screen's edges and below the tally ticket (minigame.ts drawClock, rows 6..46). */
const EDGE = 4, TOP = 52;
/** The default rim, for a card nobody's seat owns (a room joke in the kitchen): the paper's own dark tan. */
const RIM = UI.paperDark;
/** Rows from the top of a head part to the row over its name plate: the plate (minigame.ts) and a little air. */
const PLATE_CLEAR = 20;

/** One word card of the pool. */
export interface GagCard {
  /** False while the slot is free. */
  active: boolean;
  /** BURST or BUBBLE. */
  kind: number;
  /** Frames since it popped. */
  t: number;
  /** Frames it is up for. */
  life: number;
  /** Where it was asked for: the burst's centre, the bubble's tail tip. */
  x: number;
  y: number;
  /** The word, built once by the caller (a module constant: never a template string per frame). */
  text: string;
  /** The rim colour: the seat's player colour, so whose joke it was reads at a glance. */
  rim: string;
  /** The word's width at TEXT_SIZE, measured once when it popped. */
  w: number;
  /** A small tilt, alternating card to card, so two bangs side by side never print as one stamp. */
  tilt: number;
}

const cards: GagCard[] = [];
for (let i = 0; i < MAX_CARDS; i++) cards.push({ active: false, kind: BURST, t: 0, life: 0, x: 0, y: 0, text: '', rim: RIM, w: 0, tilt: 0 });
let cursor = 0, tiltSign = 1;

/** The bump: frames left, and its amplitude in rows. The shape is read backwards off BUMP_SHAPE as it counts down. */
let bumpT = 0, bumpAmp = 2;
const BUMP_SHAPE = Int8Array.of(0, 1, -1, 1, -1, 2, -2, 2, -2, 2);
const BUMP_FRAMES = BUMP_SHAPE.length - 1;

/** Unit tables, built once: the starburst's 2 * POINTS vertices and a five-point star's 10. */
const BURST_PTS = new Float32Array(POINTS * 4);
for (let i = 0; i < POINTS * 2; i++) {
  const a = (i * Math.PI) / POINTS - Math.PI / 2, r = i & 1 ? INNER : 1;
  BURST_PTS[i * 2] = Math.cos(a) * r; BURST_PTS[i * 2 + 1] = Math.sin(a) * r;
}
const STAR_PTS = new Float32Array(20);
for (let i = 0; i < 10; i++) {
  const a = (i * Math.PI) / 5 - Math.PI / 2, r = i & 1 ? 0.45 : 1;
  STAR_PTS[i * 2] = Math.cos(a) * r; STAR_PTS[i * 2 + 1] = Math.sin(a) * r;
}
const TEXT_OPTS = { size: TEXT_SIZE, color: UI.ink, align: 'center' as const, shadow: false };
const SMALL_TEXT = { size: 1, color: UI.ink, align: 'center' as const, shadow: false };

/**
 * The coats a critter is painted in after a bang: one flat fill over the whole rig, its ink and its eyes kept
 * (see `coat`). Muted on purpose: a coat is the size of a critter, so it must never be a scene's SIGNAL hex (the
 * honey is an amber a step under the hive's gold, not the gold itself; docs/ART_STYLE.md section 4).
 */
export const COAT = Object.freeze({
  /** The orchard bomb's soot: near-ink plum. */
  soot: '#3A3340',
  /** Flour, dust, a ghost: the mill's own cream, a step under the paper. */
  flour: '#EFE7D6',
  /** Honey: amber, a step under the hive's gold. */
  honey: '#C98B2C',
  /** Mud and wet earth. */
  mud: '#6B4A33',
  /** Pond water and weed: a dull green. */
  pond: '#5B7A52',
});

/**
 * Paint a rig in a coat for the next drawRig, or take it off (`null`). Set before the draw and cleared after it,
 * the orchard's soot pattern: `coat(rig, COAT.soot); drawRig(...); coat(rig, null);`.
 */
export function coat(rig: Rig, colour: string | null): void {
  rig.override = colour;
  rig.coatEyes = colour !== null;
}

/** Empty the pool and stop any bump: a screen's enter(), next to particles.clear(). */
export function clearGags(): void {
  for (let i = 0; i < cards.length; i++) cards[i].active = false;
  cursor = 0; bumpT = 0;
}

/** Age every card and the bump by one fixed step: a screen's update(), next to particles.update(). */
export function stepGags(): void {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.active && ++c.t >= c.life) c.active = false;
  }
  if (bumpT > 0) bumpT--;
}

function spawn(kind: number, x: number, y: number, text: string, rim: string | undefined, life: number): GagCard {
  const c = cards[cursor]; cursor = (cursor + 1) % cards.length;
  c.active = true; c.kind = kind; c.t = 0; c.life = life; c.x = x; c.y = y; c.text = text; c.rim = rim || RIM;
  c.w = measureText(text, TEXT_SIZE);
  tiltSign = -tiltSign; c.tilt = tiltSign * 0.07;
  return c;
}

/**
 * The bang's card: a comic starburst with the word on it, centred on (x, y) and clamped on screen. `rim` is the
 * seat's colour (Seat.colour). Call it on the frame the bang lands, from update().
 */
export function gagBurst(x: number, y: number, text: string, rim?: string): GagCard { return spawn(BURST, x, y, text, rim, BURST_LIFE); }

/**
 * A remark: a speech bubble with its tail's tip at (x, y) - put that just over the head it belongs to. For the
 * notice before a bang ('!', '?!'), a mutter after one ('MMM!', 'ZZZ'), never for the bang itself.
 */
export function gagBubble(x: number, y: number, text: string, rim?: string): GagCard { return spawn(BUBBLE, x, y, text, rim, BUBBLE_LIFE); }

/**
 * The row just over a seat's name plate - feet, minus the rig's height, its crown and the plate - which is where
 * a bubble's tail tip goes; a burst's centre goes about 16 rows above it. Built from the rig's proportions alone, so
 * update() can call it on the frame a joke lands without a draw having run. Ragged per critter, like the plates.
 */
export function overHead(seat: Seat): number { return R(seat.y - seat.rig.height * seat.rig.scale - seat.crown - PLATE_CLEAR); }

/** Nudge the world: `amp` rows (2 is a thump, 3 a big one), for the biggest bangs only. From update(). */
export function gagBump(amp: number = 2): void { bumpT = BUMP_FRAMES; bumpAmp = amp; }

/**
 * The bump's offset this frame, in whole rows: a screen translates its WORLD (backdrop, props, critters,
 * particles) by it and never its paper (plates, tally ticket, cards, the end sign). 0 when nothing is bumping.
 */
export function gagShakeY(): number { return bumpT > 0 ? R((BUMP_SHAPE[bumpT] * bumpAmp) / 2) : 0; }

/** True while any card is up (the tests read it). */
export function gagsUp(): number {
  let n = 0;
  for (let i = 0; i < cards.length; i++) if (cards[i].active) n++;
  return n;
}

/** The card's scale this frame: the pop, the settle, the hold and the shrink. */
function cardScale(c: GagCard): number {
  const t = c.t, left = c.life - t;
  if (left < OUT) return left / OUT;
  if (t < POP) return POP_FROM + ((OVER - POP_FROM) * t) / POP;
  if (t < SETTLE) return OVER - ((OVER - 1) * (t - POP)) / (SETTLE - POP);
  return 1;
}

/** One starburst polygon, `rx` by `ry`, about (0, 0) in the current transform. */
function burstPath(ctx: CanvasRenderingContext2D, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.moveTo(BURST_PTS[0] * rx, BURST_PTS[1] * ry);
  for (let i = 1; i < POINTS * 2; i++) ctx.lineTo(BURST_PTS[i * 2] * rx, BURST_PTS[i * 2 + 1] * ry);
  ctx.closePath();
}

/** A rounded pill `w` by `h` centred on (0, 0). */
function pillPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x = -w / 2, y = -h / 2, r = Math.min(h / 2, 8);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBurst(ctx: CanvasRenderingContext2D, c: GagCard, s: number): void {
  const rx = (c.w / 2 + PAD_X) * OVER, ry = ((GLYPH_H * TEXT_SIZE) / 2 + PAD_Y) * OVER;
  // clamped with the overshoot's size, so a card at the edge does not slide as it settles
  const cx = Math.max(EDGE + rx, Math.min(VIEW_W - EDGE - rx, c.x));
  const cy = Math.max(TOP + ry, c.y) - Math.min(c.t, SETTLE) * (RISE / SETTLE);
  const ax = (rx / OVER) * s, ay = (ry / OVER) * s;
  ctx.save();
  ctx.translate(R(cx), R(cy)); ctx.rotate(c.tilt);
  ctx.fillStyle = UI.ink; burstPath(ctx, ax + 3, ay + 3); ctx.fill();          // the ink line, 2-3 px outside
  ctx.fillStyle = c.rim; burstPath(ctx, ax + 1, ay + 1); ctx.fill();           // the seat's colour, a band inside it
  ctx.fillStyle = UI.cream; burstPath(ctx, ax - 3, ay - 3); ctx.fill();        // the card
  ctx.restore();
  if (s >= 0.8) drawText(ctx, c.text, R(cx), R(cy) - GLYPH_H, TEXT_OPTS);
  else if (s >= 0.45) drawText(ctx, c.text, R(cx), R(cy) - 3, SMALL_TEXT);
}

function drawBubble(ctx: CanvasRenderingContext2D, c: GagCard, s: number): void {
  const w = c.w + BPAD_X * 2, h = GLYPH_H * TEXT_SIZE + BPAD_Y * 2;
  const cx = Math.max(EDGE + w / 2, Math.min(VIEW_W - EDGE - w / 2, c.x + 6));
  const cy = Math.max(TOP + h / 2, c.y - TAIL - h / 2) - Math.min(c.t, SETTLE) * (RISE / SETTLE);
  const bw = w * s, bh = h * s;
  ctx.save();
  ctx.translate(R(cx), R(cy));
  // the tail: a wedge from the bubble's foot down to the head it belongs to, inked like the bubble
  const tx = R(c.x - cx), ty = R(bh / 2 + TAIL * s);
  ctx.fillStyle = UI.ink;
  ctx.beginPath(); ctx.moveTo(-6, bh / 2 - 2); ctx.lineTo(tx, ty + 2); ctx.lineTo(5, bh / 2 - 2); ctx.closePath(); ctx.fill();
  pillPath(ctx, bw + 4, bh + 4); ctx.fill();
  ctx.fillStyle = c.rim; pillPath(ctx, bw + 1, bh + 1); ctx.fill();
  ctx.fillStyle = UI.cream; pillPath(ctx, bw - 3, bh - 3); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, bh / 2 - 3); ctx.lineTo(tx, ty - 1); ctx.lineTo(3, bh / 2 - 3); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (s >= 0.8) drawText(ctx, c.text, R(cx), R(cy) - GLYPH_H, TEXT_OPTS);
  else if (s >= 0.45) drawText(ctx, c.text, R(cx), R(cy) - 3, SMALL_TEXT);
}

/** Every card that is up, oldest first: a screen's draw(), after its name plates and before its tally ticket. */
export function drawGags(ctx: CanvasRenderingContext2D): void {
  for (let k = 0; k < cards.length; k++) {
    const c = cards[(cursor + k) % cards.length];
    if (!c.active) continue;
    const s = cardScale(c);
    if (s <= 0.05) continue;
    if (c.kind === BURST) drawBurst(ctx, c, s); else drawBubble(ctx, c, s);
  }
}

/** One five-point star, inked, of outer radius `r`, at (x, y). */
export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string = UI.cream): void {
  ctx.fillStyle = UI.ink;
  ctx.beginPath(); ctx.moveTo(x + STAR_PTS[0] * (r + 1.5), y + STAR_PTS[1] * (r + 1.5));
  for (let i = 1; i < 10; i++) ctx.lineTo(x + STAR_PTS[i * 2] * (r + 1.5), y + STAR_PTS[i * 2 + 1] * (r + 1.5));
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(x + STAR_PTS[0] * r, y + STAR_PTS[1] * r);
  for (let i = 1; i < 10; i++) ctx.lineTo(x + STAR_PTS[i * 2] * r, y + STAR_PTS[i * 2 + 1] * r);
  ctx.closePath(); ctx.fill();
}

/**
 * The dizzy stars: `n` inked stars circling a flat ellipse `rx` wide centred on (x, y) - put it just over the
 * head (the head joint, up a head radius). `f` is any frame counter; the near half of the orbit draws its stars a
 * size bigger, so they read as going round the head and not across it. Draw-only.
 */
export function drawDizzy(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, n: number = 3, rx: number = 13): void {
  for (let i = 0; i < n; i++) {
    const a = f * 0.13 + (i * TAU) / n, sn = Math.sin(a);
    drawStar(ctx, R(x + Math.cos(a) * rx), R(y + sn * rx * 0.32), sn > 0 ? 4 : 3);
  }
}
