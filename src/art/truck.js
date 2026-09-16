// The truck: a rounded 1950s milk-float drawn from primitives (docs/ART_STYLE.md section 1 "The truck"). One function,
// self-contained and allocation-free, shared by the map token (scale 0.5, 40x24), the title and results (scale 2) and
// the lobby (scale 4). Master art is 80x48 with the tyre line at y = 0 and the body facing +x; `o.facing` mirrors it,
// `o.bob` lifts it, `o.squash` (1.1 on a honk) squashes it about the tyre line, `o.wheel` (0..3) turns the spokes.
// The crew's heads (`o.heads`: up to four { rig, pose }) ride in the windows - the driver in the cab, the rest at the
// hatch - drawn in SCREEN space after the body so their 1 px ink survives the token's half scale, clipped to the
// window they sit in. The ink is one device pixel at every scale (lineWidth 2 / scale), like a rig's.
import { drawHeadPortrait } from './portraits.js';
import { drawText } from '../engine/text.js';
import { pathRR } from './shading.js';

const INK = '#2A1F1A';
/** The truck's own colours (ART_STYLE section 1); exported so the title's parked truck and the kitchen agree. */
export const TRUCK = Object.freeze({
  body: '#7E3A56', bodyShade: '#5A2A40', bodyHi: '#9A5470', cream: '#F1E4C8', mustard: '#E2B44A', window: '#D9C9A8',
  reflect: '#FBE3C4', brass: '#E2B44A', lamp: '#FFD27A', board: '#2F4B3C', wood: '#9A6234', woodDark: '#5E3A1B', chalk: '#F2EFE6',
});
/** Master size (scale 1). */
export const TRUCK_W = 80, TRUCK_H = 48;
/** Head portrait size in master units: 12 px on the map token. */
const HEAD = 24;
/** Window rects in master units [x, y, w, h]: the cab (driver) and the hatch (the rest of the crew). */
const CAB = [16, -31, 20, 14], HATCH = [-36, -31, 46, 16];
/** Where the hatch heads sit (master x of each portrait's left edge): a 16 px pitch so 17 px heads only just touch. */
const HATCH_X = [-37, -21, -5];
const R = Math.round;

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-38, -30);
  ctx.arcTo(-38, -42, -30, -42, 6);
  ctx.lineTo(8, -42);
  ctx.arcTo(12, -42, 12, -38, 3);
  ctx.lineTo(12, -34);
  ctx.lineTo(30, -34);
  ctx.arcTo(40, -34, 40, -24, 8);
  ctx.lineTo(40, -14);
  ctx.arcTo(40, -12, 38, -12, 2);
  ctx.lineTo(-36, -12);
  ctx.arcTo(-38, -12, -38, -14, 2);
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
  // roof sign posts, then the roof slab and the wooden FOODIE TRUCK board
  ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-28, -58, 2, 12); ctx.fillRect(24, -58, 2, 12);
  pathRR(ctx, -40, -46, 52, 5, 2); inkFill(ctx, ow, TRUCK.cream);
  pathRR(ctx, -38, -60, 74, 11, 2); inkFill(ctx, ow, TRUCK.wood);
  ctx.fillStyle = TRUCK.woodDark; ctx.fillRect(-36, -52, 70, 2);
  if (S >= 2) {
    // the lettering is a size-1 pixel font, readable from scale 2 up; below that a cream stripe stands in for it
    ctx.save(); ctx.scale(facing, 1);
    drawText(ctx, 'FOODIE TRUCK', 0, -58, { size: 1, color: TRUCK.cream, align: 'center', shadow: false });
    ctx.restore();
  } else { ctx.fillStyle = TRUCK.cream; ctx.fillRect(-32, -57, 28, 3); ctx.fillRect(2, -57, 30, 3); }
  // the body: ONE inked path with the cab bump appended; shadow band and highlight cap clipped inside it
  bodyPath(ctx); inkFill(ctx, ow, TRUCK.body);
  ctx.save(); bodyPath(ctx); ctx.clip();
  ctx.fillStyle = TRUCK.bodyShade; ctx.fillRect(-40, -23, 82, 12);
  ctx.fillStyle = TRUCK.bodyHi; ctx.fillRect(-36, -42, 44, 3); ctx.fillRect(-38, -40, 3, 20);
  ctx.restore();
  // the awning over the hatch: mustard / cream stripes as one clipped fill under one outline
  pathRR(ctx, -37, -40, 48, 9, 2); inkFill(ctx, ow, TRUCK.cream);
  ctx.save(); pathRR(ctx, -37, -40, 48, 9, 2); ctx.clip();
  ctx.fillStyle = TRUCK.mustard; for (let sx = -37; sx < 11; sx += 12) ctx.fillRect(sx, -40, 6, 9);
  ctx.restore();
  // windows: the hatch and the cab, each its own object, with a reflection bar top-left
  pathRR(ctx, HATCH[0], HATCH[1], HATCH[2], HATCH[3], 2); inkFill(ctx, ow, TRUCK.window);
  ctx.fillStyle = TRUCK.reflect; ctx.fillRect(HATCH[0] + 1, HATCH[1] + 1, 3, HATCH[3] - 2);
  pathRR(ctx, CAB[0], CAB[1], CAB[2], CAB[3], 3); inkFill(ctx, ow, TRUCK.window);
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
    const kx = S * sq, ky = S / sq, hs = R(HEAD * S);
    for (let i = 0; i < heads.length && i < 4; i++) {
      const h = heads[i]; if (!h || !h.rig) continue;
      const win = i === 0 ? CAB : HATCH, px = i === 0 ? CAB[0] - 2 : HATCH_X[i - 1];
      const wx0 = facing > 0 ? X + win[0] * kx : X - (win[0] + win[2]) * kx, wy0 = Y + win[1] * ky;
      // the head's centre sits on the window's centre: eyes in the glass, chin behind the sill, ears past the frame
      const hx = facing > 0 ? X + px * kx : X - (px + HEAD) * kx, hy = Y + (win[1] + win[3] / 2) * ky - hs / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(R(wx0) + 1, R(wy0) + 1, R(win[2] * kx) - 2, R(win[3] * ky) - 2); ctx.clip();
      drawHeadPortrait(ctx, h.rig, h.pose, R(hx), R(hy), hs, { bg: null, facing, fill: 0.72, cy: 0.5 });
      ctx.restore();
    }
  }
  // the chalk board hooked on the hatch's corner, over the heads
  ctx.save();
  ctx.translate(X, Y); ctx.scale(S * sq * facing, S / sq);
  pathRR(ctx, 2, -20, 11, 9, 1); inkFill(ctx, ow, TRUCK.board);
  ctx.fillStyle = TRUCK.chalk; ctx.fillRect(4, -18, 6, 2); ctx.fillRect(4, -14, 4, 2);
  ctx.restore();
}
