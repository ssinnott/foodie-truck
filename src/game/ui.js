// The UI kit (docs/ART_STYLE.md section 4, docs/ART_PRINCIPLES.md 30-35): three skins of one four-layer plate recipe -
// PAPER TICKET, CHALK SLATE, WOODEN SIGN - plus rubber stamps, name plates, menu rows and timer bars. Every screen
// draws its panels through here so they read as one kit. Integer coordinates everywhere; text on paper and chalk
// has its shadow OFF; nothing here allocates per frame except the strings a caller builds in enter().
import { VIEW_W, UI, PLAYER_COLORS, PLAYER_LABELS, SIGNAL } from '../constants.js';
import { drawText, drawTextOutlined, measureText } from '../engine/text.js';
import { pathRR } from '../art/shading.js';
import { pathStar } from '../art/shapes.js';

const R = Math.round;
/** Size-1 rows sit on the ticket's ruled lines: this pitch (docs/ART_PRINCIPLES.md 30). */
export const ROW = 11;
/** Card geometry shared by select and lobby (carried from the sibling: four corner cursors fit on one card). */
export const CARD_W = 140, CARD_H = 200, CARD_GAP = 12, BUST_H = 96, BUST_SCALE = 2.5;
export const RING_POS = Object.freeze([[16, 18], [CARD_W - 16, 18], [16, BUST_H - 10], [CARD_W - 16, BUST_H - 10]]);

/** Left edge of card `i` in a centred row of `n`. */
export function cardX(i, n) { const total = n * CARD_W + (n - 1) * CARD_GAP; return R((VIEW_W - total) / 2) + i * (CARD_W + CARD_GAP); }

/**
 * PAPER TICKET: paper fill, 1 px ink, r2, a perforated top edge (2x2 ink notches every 6 px), rules every ROW px from
 * `y + 14` so size-1 text sits on them, an optional header band with a title. Returns the y of the first rule.
 * @param {{ title?: string, rules?: boolean, header?: boolean, perforated?: boolean, shadow?: boolean }} [o]
 */
export function drawTicket(ctx, x, y, w, h, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (o.shadow !== false) { ctx.fillStyle = 'rgba(47,35,56,0.35)'; pathRR(ctx, x + 2, y + 3, w, h, 2); ctx.fill(); }
  pathRR(ctx, x, y, w, h, 2);
  ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = UI.paper; ctx.fill();
  if (o.perforated !== false) { ctx.fillStyle = UI.ink; for (let px = x + 4; px < x + w - 3; px += 6) ctx.fillRect(px, y, 2, 2); }
  let top = y + 4;
  if (o.header !== false && o.title) {
    ctx.fillStyle = UI.paperDark; ctx.fillRect(x + 1, y + 3, w - 2, 12);
    drawText(ctx, o.title, x + w / 2, y + 6, { size: 1, color: UI.ink, align: 'center', shadow: false });
    top = y + 16;
  }
  if (o.rules !== false) { ctx.fillStyle = UI.paperLine; for (let ry = top + ROW - 1; ry < y + h - 3; ry += ROW) ctx.fillRect(x + 4, ry, w - 8, 1); }
  return top;
}

/** CHALK SLATE: board fill in a 3 px wood frame with a 1 px dark inset; an optional chalk title with a jittered underline. */
export function drawSlate(ctx, x, y, w, h, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  pathRR(ctx, x - 3, y - 3, w + 6, h + 6, 4); ctx.fillStyle = UI.woodLight; ctx.fill();
  ctx.strokeStyle = UI.woodDark; ctx.lineWidth = 2; pathRR(ctx, x - 1, y - 1, w + 2, h + 2, 3); ctx.stroke();
  ctx.fillStyle = UI.board; ctx.fillRect(x, y, w, h);
  if (o.title) {
    drawTextOutlined(ctx, o.title, x + w / 2, y + 8, { size: 2, color: UI.chalk, outline: UI.boardDark, align: 'center', shadow: false });
    const tw = measureText(o.title, 2); ctx.fillStyle = UI.chalk;
    for (let ux = R(x + w / 2 - tw / 2); ux < x + w / 2 + tw / 2; ux += 8) ctx.fillRect(ux, y + 26 + ((ux >> 3) & 1), 6, 2);
  }
}

/** WOODEN SIGN hanging from two ropes at (x, y) (its top centre); `swing` in radians (±0.02 looks right). Returns nothing. */
export function drawSign(ctx, cx, top, w, h, text, o = {}) {
  cx = R(cx); top = R(top); w = R(w); h = R(h);
  const rope = o.rope != null ? o.rope : 10;
  ctx.save(); ctx.translate(cx, top); if (o.swing) ctx.rotate(o.swing);
  ctx.fillStyle = UI.woodDark; ctx.fillRect(-R(w * 0.35) - 1, 0, 2, rope); ctx.fillRect(R(w * 0.35) - 1, 0, 2, rope);
  pathRR(ctx, -R(w / 2), rope, w, h, 4);
  ctx.strokeStyle = UI.ink; ctx.lineWidth = 2 * (o.lw || 1); ctx.stroke();
  ctx.fillStyle = UI.wood; ctx.fill();
  ctx.fillStyle = UI.woodLight; ctx.fillRect(-R(w / 2) + 2, rope + 1, w - 4, 2);
  ctx.fillStyle = UI.woodDark; ctx.fillRect(-R(w / 2) + 2, rope + h - R(h * 0.3), w - 4, R(h * 0.3) - 1);
  ctx.fillStyle = UI.ink; ctx.fillRect(-R(w * 0.35) - 2, rope + 3, 3, 3); ctx.fillRect(R(w * 0.35) - 1, rope + 3, 3, 3);   // nails
  const size = o.size || 2;
  drawTextOutlined(ctx, text, 0, rope + R((h - 7 * size) / 2), { size, color: o.color || UI.cream, outline: UI.woodDark, align: 'center', shadow: false });
  ctx.restore();
}

/**
 * Rubber stamp: red ink (or `color`) text rotated -8 degrees with a 1 px lighter misprint offset. `t` in 0..1 is the
 * arrival: 0..0.25 slams from 1.6x to 1x, 0.25..0.5 shakes ±3 px, then holds (ART_PRINCIPLES 35).
 */
export function drawStamp(ctx, text, cx, cy, t = 1, o = {}) {
  const size = o.size || 3;
  const k = t < 0.25 ? 1 + 0.6 * (1 - t / 0.25) : 1;
  const shake = t >= 0.25 && t < 0.5 ? R(Math.sin(t * 90) * 3) : 0;
  ctx.save(); ctx.translate(R(cx) + shake, R(cy)); ctx.rotate(o.angle != null ? o.angle : -0.14); ctx.scale(k, k);
  const w = measureText(text, size) + 12, h = 7 * size + 8;
  ctx.globalAlpha *= o.alpha != null ? o.alpha : 0.9;
  ctx.strokeStyle = o.color || UI.red; ctx.lineWidth = 2; pathRR(ctx, -R(w / 2), -R(h / 2), w, h, 2); ctx.stroke();
  drawText(ctx, text, 1, -R(7 * size / 2) + 1, { size, color: o.light || '#F08A80', align: 'center', shadow: false });
  drawText(ctx, text, 0, -R(7 * size / 2), { size, color: o.color || UI.red, align: 'center', shadow: false });
  ctx.restore();
}

/** Seat name plate: ink on the slot colour, wide enough for the text, centred at (cx) with its top at y. */
export function drawNamePlate(ctx, slot, text, cx, y) {
  const w = measureText(text, 1) + 8, x = R(cx - w / 2); y = R(y);
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 1, w + 2, 11);
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark; ctx.fillRect(x, y, w, 9);
  drawText(ctx, text, x + 4, y + 1, { size: 1, color: UI.ink, shadow: false });
}

/** Menu rows on a slate: centred, selected in chalk with a bobbing '>' marker, idle in paper-dark. */
export function drawMenuRows(ctx, items, x, y, w, selected, frame, pitch = 14) {
  for (let i = 0; i < items.length; i++) {
    const sel = i === selected, ry = R(y + i * pitch);
    drawText(ctx, items[i], x + w / 2, ry, { size: 1, color: sel ? UI.chalk : UI.paperDark, align: 'center', shadow: false });
    if (sel) drawText(ctx, '>', R(x + w / 2 - measureText(items[i], 1) / 2 - 10 + Math.sin(frame * 0.15) * 2), ry, { size: 1, color: UI.chalk, shadow: false });
  }
}

/** A timing / progress bar on paper: ink-outlined trough, `good` fill, an optional hot band at the end. */
export function drawBar(ctx, x, y, w, h, fill, o = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = o.trough || UI.paperLine; ctx.fillRect(x, y, w, h);
  if (o.hotFrom != null) { ctx.fillStyle = SIGNAL.hot; ctx.fillRect(x + R(w * o.hotFrom), y, w - R(w * o.hotFrom), h); }
  if (o.window) { ctx.fillStyle = o.windowColor || SIGNAL.good; ctx.fillRect(x + R(w * o.window[0]), y, R(w * (o.window[1] - o.window[0])), h); }
  ctx.fillStyle = o.color || SIGNAL.good; ctx.fillRect(x, y, R(w * Math.max(0, Math.min(1, fill))), h);
}

/** Five stars, `n` lit in gold, on a paper plate. */
export function drawStars(ctx, cx, y, n, max = 3, size = 7) {
  const pitch = size * 2 + 4, x0 = cx - ((max - 1) * pitch) / 2;
  for (let i = 0; i < max; i++) {
    pathStar(ctx, R(x0 + i * pitch), R(y), size, size * 0.45, 5, -Math.PI / 2);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = i < n ? UI.yellow : UI.paperDark; ctx.fill();
  }
}

/** One-line hint on a paper strip along the bottom of the screen. */
export function drawHint(ctx, text, y = 346) {
  const w = measureText(text, 1) + 16, x = R(VIEW_W / 2 - w / 2);
  ctx.fillStyle = UI.paper; ctx.fillRect(x, y, w, 12); ctx.fillStyle = UI.ink; ctx.fillRect(x, y + 12, w, 1);
  drawText(ctx, text, VIEW_W / 2, y + 2, { size: 1, color: UI.ink, align: 'center', shadow: false });
}

/** Dim the screen under an overlay. */
export function drawDim(ctx, alpha = 1) { const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha; ctx.fillStyle = UI.dim; ctx.fillRect(0, 0, VIEW_W, 360); ctx.globalAlpha = a; }

export { PLAYER_LABELS };
