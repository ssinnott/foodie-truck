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
import { drawHeadPortrait } from './portraits.js';
import { drawText } from '../engine/text.js';
import { pathRR } from './shading.js';

const INK = '#2A1F1A';
/** The truck's own colours (ART_STYLE section 1); exported so the title's parked truck and the kitchen agree. */
export const TRUCK = Object.freeze({
  body: '#7E3A56', bodyShade: '#5A2A40', bodyHi: '#9A5470', cream: '#F1E4C8', mustard: '#E2B44A', window: '#D9C9A8',
  reflect: '#FBE3C4', brass: '#E2B44A', lamp: '#FFD27A', board: '#2F4B3C', wood: '#9A6234', woodDark: '#5E3A1B', chalk: '#F2EFE6',
  // dusk glass: a MID value (L .31) on purpose - pale glass lost the two light furs and dark glass loses the two dark
  // ones, and only a middle tone clears all four by the 25 % ladder (ART_STYLE section 0.1)
  glass: '#8A96A2', glassLow: '#6B7682',
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
 * Draw the truck with its tyre line at (x, y).
 * @param {{ scale?: number, facing?: number, bob?: number, wheel?: number, squash?: number, heads?: {rig:object,pose:object}[] }} o
 */
export function drawTruck(ctx, x, y, o) {
  const S = o.scale || 1, facing = o.facing || 1, sq = o.squash || 1, bob = o.bob || 0, ow = 2 / S;
  const X = R(x), Y = R(y) - R(bob);
  ctx.save();
  ctx.translate(X, Y);
  ctx.scale(S * sq * facing, S / sq);
  // roof sign posts, then the roof slab and the wooden FOODIE TRUCK board. The slab is 8 master px so 4 device px of
  // cream survive between its two ink lines at the map token (ART_STYLE section 12: 4 px on every inked band).
  ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-28, -58, 2, 11); ctx.fillRect(24, -58, 2, 11);
  pathRR(ctx, -40, -48, 52, 8, 2); inkFill(ctx, ow, TRUCK.cream);
  pathRR(ctx, -38, -60, 74, 11, 2); inkFill(ctx, ow, TRUCK.wood);
  ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-36, -52, 70, 2);
  if (S >= 2) {
    // the lettering is a size-1 pixel font, readable from scale 2 up; below that a cream stripe stands in for it
    ctx.save(); ctx.scale(facing, 1);
    drawText(ctx, 'FOODIE TRUCK', 0, -58, { size: 1, color: TRUCK.cream, align: 'center', shadow: false });
    ctx.restore();
  } else { ctx.fillStyle = TRUCK.cream; ctx.fillRect(-32, -57, 28, 3); ctx.fillRect(2, -57, 30, 3); }
  // the body: ONE inked path with the cab bump appended; the highlight cap clipped inside it (the third tone is the
  // glass, so there is no separate shadow band to sit under a window and break the value ladder)
  bodyPath(ctx); inkFill(ctx, ow, TRUCK.body);
  ctx.save(); bodyPath(ctx); ctx.clip();
  ctx.fillStyle = TRUCK.bodyHi; ctx.fillRect(13, -38, 25, 2); ctx.fillRect(-38, -40, 3, 8);
  ctx.restore();
  // the awning over the hatch: mustard / cream stripes as one clipped fill under one outline
  pathRR(ctx, -37, -41, 48, 8, 2); inkFill(ctx, ow, TRUCK.cream);
  ctx.save(); pathRR(ctx, -37, -41, 48, 8, 2); ctx.clip();
  ctx.fillStyle = TRUCK.mustard; for (let sx = -37; sx < 11; sx += 12) ctx.fillRect(sx, -41, 6, 8);
  ctx.restore();
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
