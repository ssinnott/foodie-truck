// The truck: a rounded 1950s milk-float drawn from primitives (docs/ART_STYLE.md section 1 "The truck"). One function,
// self-contained and allocation-free, shared by the map token (scale 0.5, 40x24), the title and results (scale 2) and
// the lobby (scale 4). Master art is 80x48 with the tyre line at y = 0 and the body facing +x; `o.facing` mirrors it,
// `o.bob` lifts it, `o.squash` (1.1 on a honk) squashes it about the tyre line, `o.wheel` (0..3) turns the spokes.
// The crew's heads (`o.heads`: up to four { rig, pose }) ride in the windows - the driver in the cab, the rest at the
// hatch - drawn in SCREEN space after the body so their 1 px ink survives the token's half scale.
//
// The windows are sized around the heads, not the other way round: a critter's silhouette runs ~2.3 head radii from
// the eye row to an ear tip (Chicory's ears, Sorrel's toque), so each head is clipped to its glass PLUS the plum and
// awning above it - the ears break the frame, which is the species cue the map token is read by - and the glass is
// dark plum so the two pale furs are not pale-on-pale (ART_STYLE section 0.1).
//
// THE LIVERY (`o.style`, docs/GDD.md section 13): what the garage sells. Three slots - the paint, the awning over the
// hatch and whatever rides on the roof - each with a stock option the truck is built with and two to buy. The art
// for every option lives here; the names and prices live in content/garage.ts. A style is COSMETIC ONLY: it is
// handed to drawTruck and read by nothing else, so two peers wearing different paint play the same frames.
import { drawHeadPortrait } from './portraits.ts';
import { drawText } from '../engine/text.ts';
import { pathRR } from '../lib/art/shading.ts';

const INK = '#2A1F1A';
/** The truck's own colours (ART_STYLE section 1); exported so the title's parked truck and the kitchen agree. */
export const TRUCK = Object.freeze({
  body: '#7E3A56', bodyShade: '#5A2A40', bodyHi: '#9A5470', cream: '#F1E4C8', mustard: '#E2B44A', window: '#D9C9A8',
  reflect: '#FBE3C4', brass: '#E2B44A', lamp: '#FFD27A', board: '#2F4B3C', wood: '#9A6234', woodDark: '#5E3A1B', chalk: '#F2EFE6',
  // dusk glass: a warm MID value (L .31) on purpose - pale glass lost the two light furs and dark glass loses the two dark
  // ones, and only a middle tone clears all four by the 25 % ladder (ART_STYLE section 0.1)
  glass: '#A8907E', glassLow: '#87705F',
});
/** What the truck is wearing: one option id per slot (PAINTS, AWNINGS, ROOFS). */
export interface TruckStyle {
  paint: string;
  awning: string;
  roof: string;
}
/** The truck as it leaves the works: beetroot, mustard stripes and the wooden FOODIE TRUCK board. */
export const STOCK_STYLE: TruckStyle = Object.freeze({ paint: 'beetroot', awning: 'stripes', roof: 'board' });

/** One paint job: the body's three tones, and the sill band's own fill and the squiggle along it ('' for none). */
export interface TruckPaint { body: string; shade: string; hi: string; sill: string; squiggle: string }
/**
 * The paint jobs. Every body has to clear the dusk glass the way the beetroot does - by value, or by a hue family
 * with both colours saturated (ART_STYLE section 0.1) - because the crew's heads break out of the windows onto it;
 * tools/art-check.js measures that. The sill is the one band of body a paint job owns outright (the rest is
 * windows and awning), so it is where KETCHUP AND MUSTARD puts its mustard and its red squiggle.
 */
export const PAINTS: Readonly<Record<string, TruckPaint>> = Object.freeze({
  beetroot: { body: TRUCK.body, shade: TRUCK.bodyShade, hi: TRUCK.bodyHi, sill: TRUCK.bodyShade, squiggle: '' },
  mint: { body: '#4E8C75', shade: '#356553', hi: '#74B096', sill: '#356553', squiggle: '' },
  ketchup: { body: '#B8352C', shade: '#86241E', hi: '#D8584A', sill: TRUCK.mustard, squiggle: '#B8352C' },
});
/** The awnings over the hatch: stock stripes, a cherry gingham and a lettuce frill with tomato slices on it. */
export const AWNINGS: readonly string[] = Object.freeze(['stripes', 'gingham', 'salad']);
/** What rides on the roof: the stock sign board, a giant apple, or a giant hot dog. */
export const ROOFS: readonly string[] = Object.freeze(['board', 'apple', 'hotdog']);
/** The garage's own food colours: the gingham's cherry, the salad's leaves and tomato, the apple, the hot dog. */
export const LIVERY = Object.freeze({
  cherry: '#C8423A', cherryLight: '#E8A29A',
  lettuce: '#6FA243', lettuceLight: '#A5CE6A', tomato: '#D9463B', tomatoSeed: '#F6D38A',
  apple: '#D9463B', appleHi: '#EE7A66', leaf: '#5FA652', stem: '#5E3A1B',
  bun: '#DDA35C', bunShade: '#B27A3A', sausage: '#A9412B', sausageHi: '#C9624A',
});

/** Master size (scale 1). */
export const TRUCK_W = 80, TRUCK_H = 48;
/**
 * The head portrait in master units. drawHeadPortrait clips to its own `size` square, so the square has to be big
 * enough for the ears (a critter reaches ~2.3 head radii above the eye row) and `fill` then sets the head inside it:
 * 38 x 0.37 is a 14 px head in a 38 px box. What the reader actually sees is bounded by the window clip below.
 */
const HEAD = 38, HEAD_FILL = 0.37;
/** Window rects in master units [x, y, w, h]: the cab (driver) and the hatch (the rest of the crew). */
const CAB = [16, -35, 20, 21], HATCH = [-36, -33, 46, 20];
/** How far above each window a head may paint (master y): the awning band over the hatch, the cab roof over the cab. */
const CAB_CLIP_TOP = -37, HATCH_CLIP_TOP = -39;
/** Master y of each head's centre - chosen so the ear tips land on the clip top and the eyes sit in the glass. */
const CAB_HEAD_Y = -23, HATCH_HEAD_Y = -24;
/** Hatch heads are spread about the window's centre on this pitch: 15 px leaves a 1 px gap between three 14 px heads. */
const HATCH_PITCH = 15;
const R = Math.round;

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-38, -30);
  ctx.arcTo(-38, -42, -30, -42, 6);
  ctx.lineTo(8, -42);
  ctx.arcTo(12, -42, 12, -38, 3);
  ctx.lineTo(30, -38);
  ctx.arcTo(40, -38, 40, -28, 8);
  ctx.lineTo(40, -11);
  ctx.arcTo(40, -9, 38, -9, 2);
  ctx.lineTo(-36, -9);
  ctx.arcTo(-38, -9, -38, -11, 2);
  ctx.closePath();
}
function inkFill(ctx, ow, fill) { ctx.strokeStyle = INK; ctx.lineWidth = ow; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); }
function wheel(ctx, cx, step, ow) {
  ctx.beginPath(); ctx.arc(cx, -7, 7, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, -7, 4.5, 0, Math.PI * 2); ctx.fillStyle = TRUCK.cream; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, -7, 2.5, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  ctx.save(); ctx.translate(cx, -7); ctx.rotate(step * Math.PI / 4);
  ctx.fillStyle = TRUCK.cream; ctx.fillRect(-4, -1, 8, 2);
  ctx.restore();
  void ow;
}

/**
 * The cream roof slab. It is 8 master px so 4 device px of cream survive between its two ink lines at the map
 * token (ART_STYLE section 12: 4 px on every inked band).
 */
function roofSlab(ctx, ow) { pathRR(ctx, -40, -48, 52, 8, 2); inkFill(ctx, ow, TRUCK.cream); }

/** The two sign posts a roof sign stands on, drawn before the slab so its ink closes over their feet. */
function roofPosts(ctx) { ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-28, -58, 2, 11); ctx.fillRect(24, -58, 2, 11); }

/** The stock roof: two sign posts, the slab, and the wooden FOODIE TRUCK board, lettered from scale 2 up. */
function roofBoard(ctx, ow, S, facing) {
  roofPosts(ctx);
  roofSlab(ctx, ow);
  pathRR(ctx, -38, -60, 74, 11, 2); inkFill(ctx, ow, TRUCK.wood);
  ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-36, -52, 70, 2);
  if (S >= 2) {
    // the lettering is a size-1 pixel font, readable from scale 2 up; below that a cream stripe stands in for it
    ctx.save(); ctx.scale(facing, 1);
    drawText(ctx, 'FOODIE TRUCK', 0, -58, { size: 1, color: TRUCK.cream, align: 'center', shadow: false });
    ctx.restore();
  } else { ctx.fillStyle = TRUCK.cream; ctx.fillRect(-32, -57, 28, 3); ctx.fillRect(2, -57, 30, 3); }
}

/** A giant apple sat on the roof slab: the orchard's own red, a highlight toward the light, a stem and a leaf. */
function roofApple(ctx, ow) {
  ctx.beginPath(); ctx.arc(-18, -58, 10, 0, Math.PI * 2); inkFill(ctx, ow, LIVERY.apple);
  ctx.fillStyle = LIVERY.appleHi; ctx.fillRect(-24, -63, 3, 4);
  ctx.fillStyle = LIVERY.stem; ctx.fillRect(-19, -71, 2, 5);
  ctx.beginPath(); ctx.ellipse(-12, -69, 5, 2.5, -0.4, 0, Math.PI * 2); inkFill(ctx, ow, LIVERY.leaf);
}

/** A giant hot dog on the board's two posts: the bun, the sausage lying in it, and (from scale 1) a mustard zigzag. */
function roofHotDog(ctx, ow, S) {
  pathRR(ctx, -38, -60, 74, 8, 4); inkFill(ctx, ow, LIVERY.sausage);
  ctx.fillStyle = LIVERY.sausageHi; ctx.fillRect(-34, -59, 66, 2);
  pathRR(ctx, -32, -57, 62, 8, 4); inkFill(ctx, ow, LIVERY.bun);
  ctx.fillStyle = LIVERY.bunShade; ctx.fillRect(-29, -52, 56, 2);
  if (S >= 1) {
    ctx.fillStyle = TRUCK.mustard;
    for (let sx = -30; sx < 30; sx += 4) ctx.fillRect(sx, ((sx >> 2) & 1) ? -60 : -59, 3, 1);
  }
}

/** The awning over the hatch, 48 x 8 master: stock stripes, cherry gingham, or the salad's lettuce frill. */
function drawAwning(ctx, ow, kind, S) {
  if (kind === 'salad') {
    // the frill first, so the awning's own outline closes over its top: a row of leaf scallops hanging off it
    ctx.fillStyle = LIVERY.lettuceLight;
    for (let sx = -35; sx < 10; sx += 6) { ctx.beginPath(); ctx.arc(sx, -33, 3.5, 0, Math.PI * 2); ctx.fill(); }
    pathRR(ctx, -37, -41, 48, 8, 2); inkFill(ctx, ow, LIVERY.lettuce);
    ctx.save(); pathRR(ctx, -37, -41, 48, 8, 2); ctx.clip();
    ctx.fillStyle = LIVERY.lettuceLight; ctx.fillRect(-37, -41, 48, 2);
    // tomato slices along it: a red disc with a pale seed ring, only where there is room for the ring to read
    for (let sx = -29; sx < 10; sx += 12) {
      ctx.beginPath(); ctx.arc(sx, -37, 3, 0, Math.PI * 2); ctx.fillStyle = LIVERY.tomato; ctx.fill();
      if (S >= 1) { ctx.fillStyle = LIVERY.tomatoSeed; ctx.fillRect(sx - 1, -38, 2, 2); }
    }
    ctx.restore();
    return;
  }
  pathRR(ctx, -37, -41, 48, 8, 2); inkFill(ctx, ow, TRUCK.cream);
  ctx.save(); pathRR(ctx, -37, -41, 48, 8, 2); ctx.clip();
  if (kind === 'gingham') {
    // two layers of the cherry at half strength make the gingham's third tone where they cross
    ctx.fillStyle = LIVERY.cherryLight;
    for (let sx = -37; sx < 11; sx += 8) ctx.fillRect(sx, -41, 4, 8);
    ctx.fillRect(-37, -37, 48, 4);
    ctx.fillStyle = LIVERY.cherry;
    for (let sx = -37; sx < 11; sx += 8) ctx.fillRect(sx, -37, 4, 4);
  } else {
    ctx.fillStyle = TRUCK.mustard; for (let sx = -37; sx < 11; sx += 12) ctx.fillRect(sx, -41, 6, 8);
  }
  ctx.restore();
}

/**
 * Draw the truck with its tyre line at (x, y).
 * @param {{ scale?: number, facing?: number, bob?: number, wheel?: number, squash?: number, heads?: {rig:object,pose:object}[], style?: TruckStyle }} o
 */
export function drawTruck(ctx, x, y, o) {
  const S = o.scale || 1, facing = o.facing || 1, sq = o.squash || 1, bob = o.bob || 0, ow = 2 / S;
  const style = o.style || STOCK_STYLE, paint = PAINTS[style.paint] || PAINTS.beetroot;
  const X = R(x), Y = R(y) - R(bob);
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(S * sq * facing, S / sq);
  // the roof slab, and whatever rides on it (the stock board, or what the garage sold)
  if (style.roof === 'apple') { roofSlab(ctx, ow); roofApple(ctx, ow); }
  else if (style.roof === 'hotdog') { roofPosts(ctx); roofSlab(ctx, ow); roofHotDog(ctx, ow, S); }
  else roofBoard(ctx, ow, S, facing);
  // the body: ONE inked path with the cab bump appended, with the highlight cap and the shadowed sill clipped
  // inside it - three tones and no line of their own, because they are colour changes in one silhouette
  bodyPath(ctx); inkFill(ctx, ow, paint.body);
  ctx.save(); bodyPath(ctx); ctx.clip();
  ctx.fillStyle = paint.hi; ctx.fillRect(13, -38, 25, 2); ctx.fillRect(-38, -40, 3, 8);
  ctx.fillStyle = paint.sill; ctx.fillRect(-40, -13, 82, 4);   // the sill: 4 master px = 2 device at the token
  if (paint.squiggle && S >= 1) {
    // a squeezed-bottle zigzag down the middle of the sill, only where it is more than a pixel tall
    ctx.fillStyle = paint.squiggle;
    for (let sx = -38; sx < 40; sx += 4) ctx.fillRect(sx, ((sx >> 2) & 1) ? -12 : -11, 3, 1);
  }
  ctx.restore();
  // the awning over the hatch: one clipped fill under one outline, patterned by the style
  drawAwning(ctx, ow, style.awning, S);
  // windows: the hatch and the cab, each its own object. The interior is dark plum so a pale fur reads against it;
  // the pale glass is left as the reflection bar down the frame's shaded side.
  pathRR(ctx, HATCH[0], HATCH[1], HATCH[2], HATCH[3], 2); inkFill(ctx, ow, TRUCK.glass);
  ctx.fillStyle = TRUCK.glassLow; ctx.fillRect(HATCH[0] + 1, HATCH[1] + HATCH[3] - 5, HATCH[2] - 2, 4);
  ctx.fillStyle = TRUCK.reflect; ctx.fillRect(HATCH[0] + 1, HATCH[1] + 1, 3, HATCH[3] - 2);
  pathRR(ctx, CAB[0], CAB[1], CAB[2], CAB[3], 3); inkFill(ctx, ow, TRUCK.glass);
  ctx.fillStyle = TRUCK.glassLow; ctx.fillRect(CAB[0] + 1, CAB[1] + CAB[3] - 5, CAB[2] - 2, 4);
  ctx.fillStyle = TRUCK.reflect; ctx.fillRect(CAB[0] + 1, CAB[1] + 1, 3, CAB[3] - 2);
  // headlamp: brass with a lit core (the core only from scale 1 up: the 2 px floor)
  ctx.beginPath(); ctx.arc(38, -20, 3.5, 0, Math.PI * 2); inkFill(ctx, ow, TRUCK.brass);
  if (S >= 1) { ctx.fillStyle = TRUCK.lamp; ctx.fillRect(37, -21, 2, 2); }
  // wheels over the body's bottom edge, spokes turned by o.wheel
  wheel(ctx, -24, o.wheel || 0, ow); wheel(ctx, 26, o.wheel || 0, ow);
  ctx.restore();

  // the crew in the windows, in screen space so their ink stays one pixel at the token scale
  const heads = o.heads;
  if (heads && heads.length) {
    const kx = S * sq, ky = S / sq, hs = R(HEAD * S), n = heads.length < 4 ? heads.length : 4;
    for (let i = 0; i < n; i++) {
      const h = heads[i]; if (!h || !h.rig) continue;
      const cab = i === 0, win = cab ? CAB : HATCH;
      // the box this head may paint in: the glass plus the plum and awning above it, so the ears break the frame
      const ax = X + facing * (win[0] + 1) * kx, bx = X + facing * (win[0] + win[2] - 1) * kx;
      const x0 = R(ax < bx ? ax : bx), x1 = R(ax < bx ? bx : ax);
      const y0 = R(Y + (cab ? CAB_CLIP_TOP : HATCH_CLIP_TOP) * ky), y1 = R(Y + (win[1] + win[3] - 1) * ky);
      // hatch heads spread about the window centre; the driver sits on the cab's
      const mx = cab ? CAB[0] + CAB[2] / 2 : HATCH[0] + HATCH[2] / 2 + (i - 1 - (n - 2) / 2) * HATCH_PITCH;
      const hcx = X + facing * mx * kx, hcy = Y + (cab ? CAB_HEAD_Y : HATCH_HEAD_Y) * ky;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      drawHeadPortrait(ctx, h.rig, h.pose, R(hcx - hs / 2), R(hcy - hs / 2), hs, { bg: null, facing, fill: HEAD_FILL, cy: 0.5 });
      ctx.restore();
    }
  }
  // the chalk board hooked on the hatch's bottom rail. Only from scale 1 up: on the 40x24 token it is a 6 px blob
  // that reads as a crate on the ground, and the only room for it there is across the third crew member's face.
  if (S >= 1) {
    ctx.save();
    ctx.translate(X, Y); ctx.scale(S * sq * facing, S / sq);
    ctx.fillStyle = INK; ctx.fillRect(0, -16, 2, 3); ctx.fillRect(7, -16, 2, 3);
    pathRR(ctx, -2, -15, 13, 11, 1); inkFill(ctx, ow, TRUCK.board);
    ctx.fillStyle = TRUCK.chalk; ctx.fillRect(0, -13, 9, 2); ctx.fillRect(0, -9, 6, 2);
    ctx.restore();
  }
}
