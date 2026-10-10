// Cockle Cove's jokes, drawn (docs/GDD.md section 5; docs/ART_STYLE.md section 3, section 7): the GULL that lands on
// the mooring post and snatches a catch out of a paw, its shadow sweeping the sand as it dives, the catch held up,
// carried, dropped and bounced, the FISH the seventh wave leaves flopping on the sand, and the SEA itself - drawn
// back off the beach before the big wave, then rushing up over the crew and draining away.
//
// Screen space, integer coordinates, no allocation per call: every polygon is a module typed array and every
// colour a module constant. Nothing here decides WHEN or WHERE: the screen (game/screens/beachGags.ts) owns the
// beats and passes every number in, so a headless peer steps without drawing. The gull is drawn in the rig's own
// style - 1 px warm ink round each object, a base and one shadow band - and in the beach's own muted tones: a warm
// white, the rocks' grey on its back, soot wingtips, an ochre beak. None of it is the cove's mint, which stays the
// one mark that means "take this now".
import { VIEW_W, PLUM } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood } from './food.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { BEACH, ROWS } from './backgrounds/beach.ts';
import { drawCrab, drawFlyingCatch } from './beachProps.ts';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The gull's colours. White a step under the cream paper so the cards stay the brightest thing on screen; its
 * shadow band the sea's grey-blue mixed in; the back the beach's own rock grey; wingtips the soot of the jokes;
 * the beak a darkened ochre (the hen's lesson: a bright yellow beak reads as a gold signal from across a room).
 */
export const GULL = Object.freeze({
  white: '#F4EEE0', whiteSh: mix('#F4EEE0', BEACH.sea, 0.28), grey: BEACH.rock, greyFar: BEACH.rockDark, tip: '#3A3340',
  beak: '#C99A45', leg: '#C08A78',
});

/** The gull's wing poses, for `drawGull`: folded on the post, and the three strokes and the dive in the air. */
export const PERCH = 0, WING_UP = 1, WING_GLIDE = 2, WING_DOWN = 3, WING_DIVE = 4;
/**
 * The near wing in each flying pose, facing +x with the feet point at (0, 0): shoulder first, round the leading
 * edge to the tip and back along the trailing edge. The far wing is the same outline set back and up a little, a
 * step darker, drawn behind the body. The tip point (the soot primaries are painted round it) is the pair at TIP.
 */
const WINGS = [
  null,
  Int8Array.of(4, -16, 0, -29, -8, -39, -18, -43, -11, -31, -6, -22, -4, -15),
  Int8Array.of(4, -16, -2, -22, -12, -27, -26, -27, -16, -21, -6, -15),
  Int8Array.of(4, -14, 1, -5, -4, 4, -11, 11, -11, 3, -7, -6, -4, -12),
  Int8Array.of(5, -16, -5, -19, -17, -17, -29, -15, -17, -12, -5, -11),
];
const TIP = Int8Array.of(0, 6, 6, 6, 6);
/** The far wing's offset behind the near one, and the radius of soot painted round a wing's tip. */
const FAR_DX = 4, FAR_DY = -2, TIP_R = 10;
/**
 * The body ([centre row, x radius, y radius]) on the post and in the air; the tail wedge off its back (perched rows:
 * in the air it drops AIR_TAIL rows with the body); the soot primaries that show past the tail on a folded wing; and
 * the head's centre on the post and in the air, and its radius.
 */
const PERCH_BODY = Int8Array.of(-15, 12, 8), AIR_BODY = Int8Array.of(-11, 12, 6), AIR_TAIL = 4;
const TAIL = Int8Array.of(-10, -16, -21, -16, -20, -11, -10, -10);
const PRIMARIES = Int8Array.of(-11, -20, -27, -18, -15, -15);
const PERCH_HEAD = Int8Array.of(10, -25), AIR_HEAD = Int8Array.of(13, -16), HEAD_R = 7;

/** Trace a closed polygon from a flat typed array, offset by (dx, dy). */
function poly(ctx: CanvasRenderingContext2D, p: Int8Array, dx: number, dy: number): void {
  ctx.beginPath(); ctx.moveTo(p[0] + dx, p[1] + dy);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] + dx, p[i + 1] + dy);
  ctx.closePath();
}

/** Ink 1 px outside the current path, then fill it: the props' two-pass outline. */
function inked(ctx: CanvasRenderingContext2D, fill: string): void {
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill();
}

/** One wing: inked, filled, and its outer third painted soot round the tip. */
function wing(ctx: CanvasRenderingContext2D, p: Int8Array, tip: number, dx: number, dy: number, fill: string): void {
  poly(ctx, p, dx, dy); inked(ctx, fill);
  ctx.save(); ctx.clip();
  ctx.fillStyle = GULL.tip; ctx.beginPath(); ctx.arc(p[tip * 2] + dx, p[tip * 2 + 1] + dy, TIP_R, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * The gull's head: a white ball on the front of the body with the eye and the hooked beak, the beak pointing
 * `look` (1 forward, -1 back over the shoulder - the head turning on the post) and opened when `call` is set.
 */
function head(ctx: CanvasRenderingContext2D, hx: number, hy: number, look: number, call: boolean): void {
  const bx = hx + look * 5;
  // the beak first, inked, so the skull's fill covers its root
  ctx.fillStyle = INK;
  if (call) {
    ctx.beginPath(); ctx.moveTo(bx, hy - 4); ctx.lineTo(bx + look * 11, hy - 4); ctx.lineTo(bx, hy + 1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, hy + 1); ctx.lineTo(bx + look * 10, hy + 6); ctx.lineTo(bx, hy + 5); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(look > 0 ? bx : bx - 11, hy - 3, 11, 5); ctx.fillRect(look > 0 ? bx + 8 : bx - 11, hy, 3, 5);
  }
  ctx.beginPath(); ctx.arc(hx, hy, HEAD_R + 1, 0, TAU); ctx.fill();
  ctx.fillStyle = GULL.beak;
  if (call) {
    ctx.beginPath(); ctx.moveTo(bx, hy - 3); ctx.lineTo(bx + look * 9, hy - 3); ctx.lineTo(bx, hy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, hy + 2); ctx.lineTo(bx + look * 8, hy + 5); ctx.lineTo(bx, hy + 4); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(look > 0 ? bx : bx - 10, hy - 2, 10, 3); ctx.fillRect(look > 0 ? bx + 8 : bx - 10, hy + 1, 2, 3);
  }
  ctx.fillStyle = GULL.white; ctx.beginPath(); ctx.arc(hx, hy, HEAD_R, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(hx + look * 3 - 1, hy - 3, 2, 3);
}

/**
 * A herring gull with its feet (or, in the air, the point under its body where the feet are tucked and a catch
 * hangs) at (x, y), facing `dir`. `wing` is PERCH or a flying pose; `look` turns the head (1 the way it faces,
 * -1 back over its shoulder - the post's "watching" beat); `call` opens the beak. About 50 px beak to tail and 33 px
 * feet to crown on the post: a big bird beside a 56 px critter, which a gull is, and the tell has to be seen from
 * across a room against the sea it stands in front of.
 */
export function drawGull(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, wing0: number, look: number, call: boolean): void {
  ctx.save(); ctx.translate(R(x), R(y)); if (dir < 0) ctx.scale(-1, 1);
  const w = WINGS[wing0];
  if (w) wing(ctx, w, TIP[wing0], FAR_DX, FAR_DY, GULL.greyFar);
  else {
    // on the post: the legs, and the soot primaries crossed past the tail
    ctx.fillStyle = INK; ctx.fillRect(-5, -9, 4, 10); ctx.fillRect(1, -9, 4, 10); ctx.fillRect(-5, -2, 8, 3); ctx.fillRect(1, -2, 8, 3);
    ctx.fillStyle = GULL.leg; ctx.fillRect(-4, -8, 2, 8); ctx.fillRect(2, -8, 2, 8); ctx.fillRect(-4, -1, 6, 1); ctx.fillRect(2, -1, 6, 1);
    poly(ctx, PRIMARIES, 0, 0); inked(ctx, GULL.tip);
    ctx.fillStyle = GULL.white; ctx.fillRect(-24, -19, 2, 2);
  }
  // the body and the tail as ONE inked shape, the shadow band low on the belly, and on the post the folded grey
  // wing as a colour change inside the body's own line (the hen's rule)
  const b = w ? AIR_BODY : PERCH_BODY, by = b[0], ty = w ? AIR_TAIL : 0;
  ctx.beginPath(); ctx.ellipse(0, by, b[1], b[2], 0, 0, TAU);
  ctx.moveTo(TAIL[0], TAIL[1] + ty);
  for (let i = 2; i < TAIL.length; i += 2) ctx.lineTo(TAIL[i], TAIL[i + 1] + ty);
  ctx.closePath();
  inked(ctx, GULL.white);
  ctx.save(); ctx.clip();
  ctx.fillStyle = GULL.whiteSh; ctx.fillRect(-22, by + 3, 36, 8);
  if (!w) { ctx.fillStyle = GULL.grey; ctx.beginPath(); ctx.ellipse(-5, by - 4, 13, 5.5, 0.08, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (w) wing(ctx, w, TIP[wing0], 0, 0, GULL.grey);
  const h = w ? AIR_HEAD : PERCH_HEAD;
  head(ctx, h[0], h[1], look, call);
  ctx.restore();
}

/**
 * The gull's shadow on the sand under it: a body along the line of flight crossed by the wings reaching into the
 * depth, in the world's plum shadow at `alpha` - the soft ground-contact mark every sprite draws (art/fx.js
 * drawShadow), stretched by `w` (wider and paler while the bird is high, tight and dark as it comes down).
 */
export function drawGullShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha: number): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha; ctx.fillStyle = PLUM.deep;
  ctx.beginPath(); ctx.ellipse(R(x), R(y), w * 0.5, 3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(R(x) - 2, R(y), 4, w * 0.2, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = prev;
}

/**
 * The catch out of the strand, centred on (x, y): a crab is the crab itself, claws up and legs going (`f` beats
 * them), facing `dir`; anything else is its glyph inside the airborne ink line the hop draws, so the thing in the
 * paw, in the gull's feet and on the critter's head is the thing that lands in the basket.
 */
export function drawCatch(ctx: CanvasRenderingContext2D, ing: string, icon: string, hex: string, x: number, y: number, dir: number, f: number): void {
  if (ing === 'crab') drawCrab(ctx, x, y + 5, dir, (f >> 2) & 1, 1);
  else drawFlyingCatch(ctx, x, y, icon, hex);
}

/**
 * The fish the seventh wave leaves on the sand: the trout's own glyph at FISH_S (a 16 px fish), `lift` px off the sand
 * and turned `rot` (radians) mid-flop.
 */
const FISH = INGREDIENTS.fish, FISH_S = 8;
export function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, lift: number, rot: number): void {
  ctx.save(); ctx.translate(R(x), R(y - lift)); ctx.rotate(rot); if (dir > 0) ctx.scale(-1, 1);
  drawFood(ctx, FISH.icon, 0, 0, FISH_S, FISH.hex);
  ctx.restore();
}

// ---------------------------------------------------------------- the sea, drawn back and coming in
/** The bared sand's gloss: [x, rows below the receded edge, width], fixed so it never crawls. */
const GLOSS = Int16Array.of(30, 6, 14, 92, 14, 9, 170, 4, 18, 236, 20, 12, 300, 9, 16, 362, 16, 8, 410, 5, 20, 470, 22, 10, 534, 11, 16, 596, 3, 12);
/** The stranded leavings on the bared sand: [x, rows below the receded edge]: shells the sea has just let go of. */
const LEFT = Int16Array.of(58, 18, 214, 24, 388, 14, 512, 27);
/**
 * The foam along the drawn-back edge (scallops FOAM_STEP apart, FOAM_R round), the swell's lit lip (LIP rows, its
 * curls LIP_R round), and the wave's front as it comes in (a RUSH_BAND-row band of foam, scallops RUSH_STEP apart
 * and RUSH_R round, inked).
 */
const FOAM_STEP = 12, FOAM_R = 5, LIP = 3, LIP_R = 4, RUSH_BAND = 10, RUSH_STEP = 14, RUSH_R = 6;
/** The swell's dark water (the deep band deepened toward plum) and the damp shade along the bared sand's top, mixed once. */
const SWELL = mix(BEACH.seaDeep, PLUM.deep, 0.25), WET_SH = mix(BEACH.wet, PLUM.shadow, 0.3);

/**
 * THE TELL of the seventh wave: the sea drawn back off the beach. The water's edge has gone up the beach to row
 * `edge` (from the breakers at ROWS.breakers), leaving the wet sand bare and glossy between it and the old tide line,
 * with a shell or two stranded on it; along the new edge, a thin inked line of foam; and above it, `swell` rows of
 * dark water piling up into the wave that is coming, its lip lit cream. Drawn between the far layer and the mid
 * layer, so the boat and its post stand on the bared sand and in front of the swell.
 */
export function drawSeaDrawn(ctx: CanvasRenderingContext2D, edge: number, swell: number, f: number): void {
  const bottom = ROWS.wet;
  if (edge >= bottom) return;
  ctx.fillStyle = BEACH.wet; ctx.fillRect(0, edge, VIEW_W, bottom - edge);
  ctx.fillStyle = WET_SH; ctx.fillRect(0, edge, VIEW_W, 3);
  ctx.fillStyle = BEACH.wetGloss;
  for (let i = 0; i < GLOSS.length; i += 3) { const y = edge + 4 + GLOSS[i + 1]; if (y < bottom - 2) ctx.fillRect(GLOSS[i], y, GLOSS[i + 2], 2); }
  for (let i = 0; i < LEFT.length; i += 2) {
    const y = edge + 4 + LEFT[i + 1];
    if (y >= bottom - 3) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(LEFT[i], y, 4, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = BEACH.shell; ctx.beginPath(); ctx.arc(LEFT[i], y - 1, 3, Math.PI, 0); ctx.closePath(); ctx.fill();
  }
  // the swell standing up behind the edge: dark water, an inked top, a cream lip that curls at the scallops
  if (swell > 0) {
    const top = edge - swell;
    ctx.fillStyle = INK; ctx.fillRect(0, top - 2, VIEW_W, 2);
    ctx.fillStyle = SWELL; ctx.fillRect(0, top, VIEW_W, swell);
    ctx.fillStyle = BEACH.foam; ctx.fillRect(0, top, VIEW_W, Math.min(LIP, swell));
    for (let x = -((f >> 1) % FOAM_STEP); x < VIEW_W + FOAM_STEP; x += FOAM_STEP) { ctx.beginPath(); ctx.arc(x, top + 1, LIP_R, Math.PI, 0); ctx.fill(); }
  }
  // the edge itself: an inked line with the foam hanging off it, sliding seaward as it goes
  ctx.fillStyle = INK; ctx.fillRect(0, edge - 1, VIEW_W, 2);
  ctx.fillStyle = BEACH.foam;
  for (let x = (f >> 2) % FOAM_STEP - FOAM_STEP; x < VIEW_W + FOAM_STEP; x += FOAM_STEP) { ctx.beginPath(); ctx.arc(x, edge + 1, FOAM_R, 0, Math.PI); ctx.fill(); }
}

/**
 * THE BANG and its wash: the wave's water over the beach from row `top` (the sea's edge) down to its front at
 * `front`, the water translucent so the crew show through it (the one soft mark here; the old wave drew its foam
 * the same way), and along the front an opaque band of foam with an inked, scalloped leading edge. `thin` (0..1)
 * breaks the foam up as the water drains back off the sand.
 */
export function drawSeaRush(ctx: CanvasRenderingContext2D, top: number, front: number, thin: number, f: number): void {
  if (front <= top) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * (0.55 - 0.25 * thin); ctx.fillStyle = BEACH.seaNear; ctx.fillRect(0, top, VIEW_W, front - top);
  ctx.globalAlpha = prev * (0.95 - 0.45 * thin);
  const band = Math.min(RUSH_BAND, front - top);
  ctx.fillStyle = BEACH.foam; ctx.fillRect(0, front - band, VIEW_W, band);
  const skip = thin > 0.5 ? 1 : 0;
  for (let x = ((f >> 1) % RUSH_STEP) - RUSH_STEP, k = 0; x < VIEW_W + RUSH_STEP; x += RUSH_STEP, k++) {
    if (skip && (k & 1)) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, front, RUSH_R + 1, 0, Math.PI); ctx.fill();
    ctx.fillStyle = BEACH.foam; ctx.beginPath(); ctx.arc(x, front - 1, RUSH_R, 0, Math.PI); ctx.fill();
  }
  ctx.globalAlpha = prev;
}
