// The map's HUD (docs/GDD.md section 4, docs/ART_STYLE.md section 12): the day's ticket top-left (the shopping list
// while the pantry is short, the lines once it is full), one name plate per
// seat top-right, the 28x28 steering-wheel widget bottom-left whose four slot-colour ticks light straight from each
// seat's stick, the off-screen destination arrow pinned to the view edge, the HONK! stamp and the wooden sign plate an
// arrival drops in, and the one hint line. Screen space, integer coordinates, nothing allocated per frame: every
// string is built by the map screen in enter().
import { VIEW_W, VIEW_H, UI, PLAYER_COLORS, SIGNAL } from '../constants.ts';
import { drawNeedsTicket, drawNamePlate, drawStamp, drawSign, drawHint, drawTicket, ROW } from './ui.ts';
import { drawFood } from '../art/food.ts';
import { drawText } from '../engine/text.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { pathRR } from '../lib/art/shading.ts';

const R = Math.round;
/** Ingredient id -> glyph id / base hex for the ticket's icons (content/recipes.js). */
const ICONS = {}, HEXES = {};
for (const id of Object.keys(INGREDIENTS)) { ICONS[id] = INGREDIENTS[id].icon; HEXES[id] = INGREDIENTS[id].hex; }
const TICKET_OPTS = { icons: ICONS, hexes: HEXES };

export const HINT = 'STEER: ARROWS   HONK: X';
/** The wheel widget's box (bottom-left, above the hint strip). */
export const WHEEL_X = 8, WHEEL_Y = VIEW_H - 8 - 12 - 30, WHEEL_SIZE = 30;

const SHOPPING_TITLE = 'SHOPPING LIST', LINES_TITLE = 'THE LINES', NO_HEAD = Object.freeze([]);
const LINE_TEXT = { size: 1, color: UI.ink, shadow: false }, LINE_DONE_TEXT = { size: 1, color: UI.paperLine, shadow: false };

/** The shopping list, top-left: one row per ingredient the day asks for, ticked as its line fills. */
/** 132 wide: the longest ingredient id (STRAWBERRY) and a two-digit count on one row (game/ui.js drawNeedsTicket). */
export const SHOPPING_W = 132;
export function drawShoppingHud(ctx, run) { drawNeedsTicket(ctx, 8, 8, SHOPPING_W, SHOPPING_TITLE, NO_HEAD, run.needs, drawFood, TICKET_OPTS); }

/**
 * The lines, top-left, once the pantry is full: one row per queue - `rows[i]` is the caller's own wording of where
 * it waits and how many are in it - washed back once it has been served, with the gold arrow on the one the
 * compass points at (`dest`, an index into the rows, or -1).
 */
export function drawLinesHud(ctx, run, rows, dest) {
  const x = 8, y = 8, w = 120, h = 16 + ROW * rows.length + 4;
  const top = drawTicket(ctx, x, y, w, h, { title: LINES_TITLE });
  for (let i = 0; i < rows.length; i++) {
    const ry = top + 2 + ROW * i, done = run.lines[i] && run.lines[i].served;
    drawText(ctx, rows[i], x + 6, ry, done ? LINE_DONE_TEXT : LINE_TEXT);
    if (done) { ctx.fillStyle = UI.ink; ctx.fillRect(x + w - 14, ry + 3, 2, 3); ctx.fillRect(x + w - 12, ry + 1, 2, 5); ctx.fillRect(x + w - 10, ry - 1, 2, 3); }
    else if (i === dest) { ctx.fillStyle = UI.ink; ctx.fillRect(x + w - 15, ry, 7, 7); ctx.fillStyle = SIGNAL.map; ctx.fillRect(x + w - 14, ry + 2, 2, 3); ctx.fillRect(x + w - 12, ry + 1, 2, 5); ctx.fillRect(x + w - 10, ry + 2, 2, 3); }
  }
}

/**
 * The paper tag over a landmark where a line is waiting: '2 IN LINE' on a small ticket pinned above its signpost
 * (screen space; the map screen converts). Built strings only: `text` and `w` come from the map's enter().
 */
export function drawLineTag(ctx, sx, sy, text, w) {
  const x = R(sx - w / 2), y = R(sy);
  drawTicket(ctx, x, y, w, 14, { header: false, rules: false, perforated: false });
  drawText(ctx, text, x + w / 2, y + 3, { size: 1, color: UI.ink, align: 'center', shadow: false });
}

/**
 * The crew strip, top-right: the seats' name plates on ONE paper card of the order ticket's own recipe, not four
 * loose colour chips floating on the world. The first pass stacked bare plates straight on the plane, and over the
 * market they read as part of the stalls; the card gives them a home, and its drop shadow says which layer they are
 * on. `seats` = [{ slot, plateText, plateW }]; the card is sized to the widest plate so it never clips a name.
 */
export const PLATE_PITCH = 14;
/** Card geometry for a party of `n`, so the destination chevron can steer around exactly what is drawn. */
export function crewCardW(seats) { let w = 0; for (let i = 0; i < seats.length; i++) if (seats[i].plateW > w) w = seats[i].plateW; return w + 14; }
export function crewCardH(n) { return 8 + (n - 1) * PLATE_PITCH + 11; }
export function drawSeatPlates(ctx, seats) {
  const n = seats.length;
  if (!n) return;
  const w = crewCardW(seats), h = crewCardH(n), x = VIEW_W - 8 - w, y = 5;
  drawTicket(ctx, x, y, w, h, { header: false, rules: false, perforated: false });
  for (let i = 0; i < n; i++) drawNamePlate(ctx, seats[i].slot, seats[i].plateText, x + w / 2, y + 4 + i * PLATE_PITCH);
}

/**
 * The steering wheel on an ink plate: a wooden rim, three spokes turned by `turn` (radians, the wheel's lean while
 * the truck is turning), and four 5x3 ticks - P1 top, P2 right, P3 bottom, P4 left - lit in the slot colour while
 * bit `slot` of `pushMask` is set (read straight from input.axisX/Y, no sim state).
 */
export function drawWheel(ctx, pushMask, turn) {
  const x = WHEEL_X, y = WHEEL_Y, cx = x + 15, cy = y + 15;
  // a 2 px paper bezel and a drop shadow under it, so the dark plate reads as a HUD widget lying on the world and
  // not as an ink-coloured hole cut in the meadow (the ticket and the crew card sit on the same paper)
  ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x - 1, y, WHEEL_SIZE + 4, WHEEL_SIZE + 4, 7); ctx.fill();
  pathRR(ctx, x - 2, y - 2, WHEEL_SIZE + 4, WHEEL_SIZE + 4, 7); ctx.fillStyle = UI.paper; ctx.fill();
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

/** The arrow rides this far inside the view edge, and slides ALONG that edge past each HUD corner's keep-out. */
/** TICKET_B is the tallest shopping list's bottom edge: nine rows (three recipes of three ingredients, none shared) at ui.js ROW under a 16 px head, plus its margins. */
const ARROW_INSET = 14, TICKET_R = 164, TICKET_B = 128, CREW_L = VIEW_W - 104, CREW_B = 76, WHEEL_R = 46;
const WHEEL_T = VIEW_H - 58, HINT_L = 200, HINT_R = 440;

/**
 * The destination arrow: when the target (screen coords) is off the view, a BARE lantern-gold arrow with the map's
 * own 1 px ink outline is pinned to the view edge, points at it and pulses 2 px along its bearing. It used to ride a
 * 20x20 ink plate that the HUD clamps pushed inward onto the meadow, where a block of ink four times darker than any
 * shadow on the plane read as a hole punched in the field rather than as a sign. The plate is gone and the clamps now
 * slide the arrow along the edge it is pinned to, so it can never sit on a tree.
 * Math.atan2 is fine here: this is draw(), not sim.
 */
export function drawDestArrow(ctx, tx, ty, frame) {
  if (tx >= 4 && tx <= VIEW_W - 4 && ty >= 4 && ty <= VIEW_H - 4) return;
  const cx = VIEW_W / 2, cy = VIEW_H / 2, dx = tx - cx, dy = ty - cy, a = Math.atan2(dy, dx);
  // the ray from the centre, clamped to a rect inset from the view edge; `pinX` is true on the left / right edge
  const kx = (cx - ARROW_INSET) / Math.max(1e-6, Math.abs(dx)), ky = (cy - ARROW_INSET) / Math.max(1e-6, Math.abs(dy));
  const pinX = kx <= ky, k = pinX ? kx : ky;
  let px = R(cx + dx * k), py = R(cy + dy * k);
  if (pinX) {
    // left edge: under the order ticket and above the wheel. Right edge: under the crew card.
    if (px < cx) { if (py < TICKET_B) py = TICKET_B; if (py > WHEEL_T) py = WHEEL_T; }
    else if (py < CREW_B) py = CREW_B;
  } else if (py < cy) {
    if (px < TICKET_R) px = TICKET_R;             // top edge: past the ticket, short of the crew card
    if (px > CREW_L) px = CREW_L;
  } else {
    if (px < WHEEL_R) px = WHEEL_R;               // bottom edge: past the wheel, either side of the hint strip
    else if (px > HINT_L && px < HINT_R) px = px < (HINT_L + HINT_R) / 2 ? HINT_L : HINT_R;
  }
  const pulse = (frame >> 3) & 1 ? 2 : 0;
  ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.translate(pulse, 0);
  // a plain triangle, not a barbed chevron: the nose must be the SHARPEST corner (32 deg against the tail's 79), and long enough to read as elongated or
  // the barbs win the silhouette at 12 px and every diagonal bearing reads about 90 deg off
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-7, 6); ctx.closePath();
  ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = SIGNAL.map; ctx.fill();
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
