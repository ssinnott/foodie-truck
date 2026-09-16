// The map's HUD (docs/GDD.md section 4, docs/ART_STYLE.md section 12): the order ticket top-left, one name plate per
// seat top-right, the 28x28 steering-wheel widget bottom-left whose four slot-colour ticks light straight from each
// seat's stick, the off-screen destination chevron on an ink plate, the HONK! stamp and the wooden sign plate an
// arrival drops in, and the one hint line. Screen space, integer coordinates, nothing allocated per frame: every
// string is built by the map screen in enter().
import { VIEW_W, VIEW_H, UI, PLAYER_COLORS, SIGNAL } from '../constants.js';
import { drawOrderTicket, drawNamePlate, drawStamp, drawSign, drawHint } from './ui.js';
import { drawFood } from '../art/food.js';
import { INGREDIENTS } from '../content/recipes.js';
import { pathRR } from '../art/shading.js';

const R = Math.round;
/** Ingredient id -> glyph id / base hex for the ticket's icons (content/recipes.js). */
const ICONS = {}, HEXES = {};
for (const id of Object.keys(INGREDIENTS)) { ICONS[id] = INGREDIENTS[id].icon; HEXES[id] = INGREDIENTS[id].hex; }
const TICKET_OPTS = { icons: ICONS, hexes: HEXES };

export const HINT = 'STEER: ARROWS   HONK: X';
/** The wheel widget's box (bottom-left, above the hint strip). */
export const WHEEL_X = 8, WHEEL_Y = VIEW_H - 8 - 12 - 30, WHEEL_SIZE = 30;

/** The order ticket, top-left. */
export function drawTicketHud(ctx, run) { drawOrderTicket(ctx, run, 8, 8, 120, drawFood, TICKET_OPTS); }

/** One name plate per seat, stacked top-right. `seats` = [{ slot, plateText, plateW }]. */
export function drawSeatPlates(ctx, seats) {
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    drawNamePlate(ctx, s.slot, s.plateText, VIEW_W - 9 - s.plateW / 2, 9 + i * 14);
  }
}

/**
 * The steering wheel on an ink plate: a wooden rim, three spokes turned by `turn` (radians, the wheel's lean while
 * the truck is turning), and four 5x3 ticks - P1 top, P2 right, P3 bottom, P4 left - lit in the slot colour while
 * bit `slot` of `pushMask` is set (read straight from input.axisX/Y, no sim state).
 */
export function drawWheel(ctx, pushMask, turn) {
  const x = WHEEL_X, y = WHEEL_Y, cx = x + 15, cy = y + 15;
  pathRR(ctx, x, y, WHEEL_SIZE, WHEEL_SIZE, 5); ctx.fillStyle = UI.ink; ctx.fill();
  ctx.fillStyle = UI.wood; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UI.woodDark; ctx.beginPath(); ctx.arc(cx + 1, cy + 1, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UI.wood; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn);
  ctx.fillStyle = UI.woodLight;
  for (let k = 0; k < 3; k++) { ctx.fillRect(0, -1, 7, 2); ctx.rotate(Math.PI * 2 / 3); }
  ctx.restore();
  ctx.fillStyle = UI.woodLight; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  // ticks: 5x3 on the top and bottom edges, 3x5 on the sides, dim paper when that seat is idle
  ctx.fillStyle = (pushMask & 1) ? PLAYER_COLORS[0] : UI.paperLine; ctx.fillRect(cx - 2, y + 1, 5, 3);
  ctx.fillStyle = (pushMask & 2) ? PLAYER_COLORS[1] : UI.paperLine; ctx.fillRect(x + WHEEL_SIZE - 4, cy - 2, 3, 5);
  ctx.fillStyle = (pushMask & 4) ? PLAYER_COLORS[2] : UI.paperLine; ctx.fillRect(cx - 2, y + WHEEL_SIZE - 4, 5, 3);
  ctx.fillStyle = (pushMask & 8) ? PLAYER_COLORS[3] : UI.paperLine; ctx.fillRect(x + 1, cy - 2, 3, 5);
}

/**
 * The destination chevron: when the target (screen coords) is off the view, a lantern-gold arrow on an ink plate at
 * the view edge points at it and pulses 2 px along its bearing. Math.atan2 is fine here: this is draw(), not sim.
 */
export function drawDestArrow(ctx, tx, ty, frame) {
  if (tx >= 4 && tx <= VIEW_W - 4 && ty >= 4 && ty <= VIEW_H - 4) return;
  const cx = VIEW_W / 2, cy = VIEW_H / 2, dx = tx - cx, dy = ty - cy, a = Math.atan2(dy, dx);
  // clamp the arrow's plate to a rect inset from the view edge, along the ray from the centre
  const hx = cx - 20, hy = cy - 20;
  const k = Math.min(hx / Math.max(1e-6, Math.abs(dx)), hy / Math.max(1e-6, Math.abs(dy)));
  let px = R(cx + dx * k), py = R(cy + dy * k);
  // keep the plate off the ticket (top-left), the name plates (top-right), the wheel (bottom-left) and the hint
  if (px < 150 && py < 104) py = 104;
  if (px > VIEW_W - 150 && py < 72) py = 72;
  if (px < 52 && py > VIEW_H - 64) px = 52;
  if (py > VIEW_H - 26) py = VIEW_H - 26;
  const pulse = (frame >> 3) & 1 ? 2 : 0;
  pathRR(ctx, px - 10, py - 10, 20, 20, 4); ctx.fillStyle = UI.ink; ctx.fill();
  ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.translate(pulse, 0);
  ctx.fillStyle = SIGNAL.map;
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -6); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** HONK! slammed above the cab; `t` in 0..1 is the stamp's arrival (ui.drawStamp). */
export function drawHonk(ctx, sx, sy, t) { drawStamp(ctx, 'HONK!', sx, sy, t, { size: 2, color: UI.red }); }

/** A wooden sign dropping in on its ropes from the top edge; `age` in frames since the arrival. */
export function drawSignPlate(ctx, text, w, age) {
  const drop = age < 10 ? (10 - age) * 6 : 0;
  const swing = age < 60 ? Math.sin(age * 0.35) * 0.03 * (1 - age / 60) : 0;
  drawSign(ctx, VIEW_W / 2, 18 - drop, w, 22, text, { size: 1, swing, rope: 14 });
}

/** The hint strip along the bottom. */
export function drawMapHint(ctx) { drawHint(ctx, HINT); }
