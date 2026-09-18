// The UI kit (docs/ART_STYLE.md section 4, docs/ART_PRINCIPLES.md 30-35): three skins of one four-layer plate recipe -
// PAPER TICKET, CHALK SLATE, WOODEN SIGN - plus rubber stamps, name plates, menu rows and timer bars. Every screen
// draws its panels through here so they read as one kit. Integer coordinates everywhere; text on paper and chalk
// has its shadow OFF; nothing here allocates per frame except the strings a caller builds in enter().
import { VIEW_W, UI, PLAYER_COLORS, PLAYER_LABELS, SIGNAL } from '../constants.ts';
import { drawText, drawTextOutlined, measureText } from '../engine/text.ts';
import { pathRR } from '../lib/art/shading.ts';
import { pathStar } from '../lib/art/shapes.ts';
import type { Run } from './game.ts';

const R = Math.round;
/** Size-1 rows sit on the ticket's ruled lines: this pitch (docs/ART_PRINCIPLES.md 30). */
export const ROW = 11;
/** Card geometry shared by select and lobby (carried from the sibling: four corner cursors fit on one card). */
export const CARD_W = 140, CARD_H = 200, CARD_GAP = 12, BUST_H = 96, BUST_SCALE = 2.5;
export const RING_POS = Object.freeze([[16, 18], [CARD_W - 16, 18], [16, BUST_H - 10], [CARD_W - 16, BUST_H - 10]]);

/** Left edge of card `i` in a centred row of `n`. */
export function cardX(i: number, n: number): number { const total = n * CARD_W + (n - 1) * CARD_GAP; return R((VIEW_W - total) / 2) + i * (CARD_W + CARD_GAP); }

/** PAPER TICKET options. Every flag defaults ON, so `{}` is the full recipe and a caller only ever turns things off. */
export interface TicketOpts {
  /** Header band text; no title, no band. */
  title?: string;
  /** false drops the ruled lines. */
  rules?: boolean;
  /** false drops the header band even with a title. */
  header?: boolean;
  /** false drops the perforated top edge. */
  perforated?: boolean;
  /** false drops the drop shadow. */
  shadow?: boolean;
}

/**
 * PAPER TICKET: paper fill, 1 px ink, r2, a perforated top edge (2x2 ink notches every 6 px), rules every ROW px from
 * `y + 14` so size-1 text sits on them, an optional header band with a title. Returns the y of the first rule.
 * @param {{ title?: string, rules?: boolean, header?: boolean, perforated?: boolean, shadow?: boolean }} [o]
 */
export function drawTicket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: TicketOpts = {}): number {
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

/** CHALK SLATE options. */
export interface SlateOpts {
  /** Chalk title, drawn with its jittered underline; no title, neither is drawn. */
  title?: string;
}

/** CHALK SLATE: board fill in a 3 px wood frame with a 1 px dark inset; an optional chalk title with a jittered underline. */
export function drawSlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: SlateOpts = {}): void {
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

/** WOODEN SIGN options. */
export interface SignOpts {
  /** Rope length in px from the hanging point to the board's top edge (default 10). */
  rope?: number;
  /** Sign swing in radians about the hanging point. */
  swing?: number;
  /** Outline width multiplier (default 1). */
  lw?: number;
  /** Text size (default 2). */
  size?: number;
  /** Text colour (default UI.cream). */
  color?: string;
}

/** WOODEN SIGN hanging from two ropes at (x, y) (its top centre); `swing` in radians (±0.02 looks right). Returns nothing. */
export function drawSign(ctx: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number, text: string, o: SignOpts = {}): void {
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

/** RUBBER STAMP options. */
export interface StampOpts {
  /** Text size (default 3). */
  size?: number;
  /** Rotation in radians (default -0.14, the -8 degrees below). */
  angle?: number;
  /** Multiplied into the context's globalAlpha (default 0.9). */
  alpha?: number;
  /** Ink colour (default UI.red). */
  color?: string;
  /** The misprint offset's lighter ink (default '#F08A80'). */
  light?: string;
}

/**
 * Rubber stamp: red ink (or `color`) text rotated -8 degrees with a 1 px lighter misprint offset. `t` in 0..1 is the
 * arrival: 0..0.25 slams from 1.6x to 1x, 0.25..0.5 shakes ±3 px, then holds (ART_PRINCIPLES 35).
 */
export function drawStamp(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, t: number = 1, o: StampOpts = {}): void {
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
export function drawNamePlate(ctx: CanvasRenderingContext2D, slot: number, text: string, cx: number, y: number): void {
  const w = measureText(text, 1) + 8, x = R(cx - w / 2); y = R(y);
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 1, w + 2, 11);
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark; ctx.fillRect(x, y, w, 9);
  drawText(ctx, text, x + 4, y + 1, { size: 1, color: UI.ink, shadow: false });
}

/** Menu rows on a slate: centred, selected in chalk with a bobbing '>' marker, idle in paper-dark. */
export function drawMenuRows(ctx: CanvasRenderingContext2D, items: readonly string[], x: number, y: number, w: number, selected: number, frame: number, pitch: number = 14): void {
  for (let i = 0; i < items.length; i++) {
    const sel = i === selected, ry = R(y + i * pitch);
    drawText(ctx, items[i], x + w / 2, ry, { size: 1, color: sel ? UI.chalk : UI.paperDark, align: 'center', shadow: false });
    if (sel) drawText(ctx, '>', R(x + w / 2 - measureText(items[i], 1) / 2 - 10 + Math.sin(frame * 0.15) * 2), ry, { size: 1, color: UI.chalk, shadow: false });
  }
}

/** TIMER / PROGRESS BAR options. */
export interface BarOpts {
  /** Trough colour behind the fill (default UI.paperLine). */
  trough?: string;
  /** Fill colour (default SIGNAL.good). */
  color?: string;
  /** 0..1: where the hot band at the end starts. */
  hotFrom?: number;
  /** [from, to] in 0..1: the good window drawn on the trough. */
  window?: readonly number[];
  /** The window's colour (default SIGNAL.good). */
  windowColor?: string;
}

/** A timing / progress bar on paper: ink-outlined trough, `good` fill, an optional hot band at the end. */
export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: number, o: BarOpts = {}): void {
  x = R(x); y = R(y); w = R(w); h = R(h);
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = o.trough || UI.paperLine; ctx.fillRect(x, y, w, h);
  if (o.hotFrom != null) { ctx.fillStyle = SIGNAL.hot; ctx.fillRect(x + R(w * o.hotFrom), y, w - R(w * o.hotFrom), h); }
  if (o.window) { ctx.fillStyle = o.windowColor || SIGNAL.good; ctx.fillRect(x + R(w * o.window[0]), y, R(w * (o.window[1] - o.window[0])), h); }
  ctx.fillStyle = o.color || SIGNAL.good; ctx.fillRect(x, y, R(w * Math.max(0, Math.min(1, fill))), h);
}

/** Five stars, `n` lit in gold, on a paper plate. */
export function drawStars(ctx: CanvasRenderingContext2D, cx: number, y: number, n: number, max: number = 3, size: number = 7): void {
  const pitch = size * 2 + 4, x0 = cx - ((max - 1) * pitch) / 2;
  for (let i = 0; i < max; i++) {
    pathStar(ctx, R(x0 + i * pitch), R(y), size, size * 0.45, 5, -Math.PI / 2);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = i < n ? UI.yellow : UI.paperDark; ctx.fill();
  }
}

/** One-line hint on a paper strip along the bottom of the screen. */
export function drawHint(ctx: CanvasRenderingContext2D, text: string, y: number = 346): void {
  const w = measureText(text, 1) + 16, x = R(VIEW_W / 2 - w / 2);
  ctx.fillStyle = UI.paper; ctx.fillRect(x, y, w, 12); ctx.fillStyle = UI.ink; ctx.fillRect(x, y + 12, w, 1);
  drawText(ctx, text, VIEW_W / 2, y + 2, { size: 1, color: UI.ink, align: 'center', shadow: false });
}

/** Dim the screen under an overlay. */
export function drawDim(ctx: CanvasRenderingContext2D, alpha: number = 1): void { const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha; ctx.fillStyle = UI.dim; ctx.fillRect(0, 0, VIEW_W, 360); ctx.globalAlpha = a; }

export { PLAYER_LABELS };

/** art/food.js drawFood, passed into the order ticket so this module stays free of it. */
export type DrawFood = (ctx: CanvasRenderingContext2D, icon: string, cx: number, cy: number, s: number, hex?: string) => void;

/** ORDER TICKET options. */
export interface OrderTicketOpts {
  /** Header band text; the STAGE the order board pinned up by default. */
  title?: string;
  /** Ingredient id -> glyph id for the row icons; without it the ingredient id is the glyph id. */
  icons?: Record<string, string>;
  /** Ingredient id -> base hex for the row icons. */
  hexes?: Record<string, string>;
}

/**
 * The ORDER TICKET (docs/GDD.md section 4): customer, dish, one `NEED` row per ingredient with an ink tick when
 * gathered, and a gold arrow on the first missing one. Shared by the map HUD and the kitchen rail. The header is
 * the STAGE the order board pinned up (game/run.js `stage`), so the ticket and the board's card say the same number.
 * Returns the ticket's height. `foods` is art/food.js drawFood (passed in so this module stays free of it).
 */
export function drawOrderTicket(ctx: CanvasRenderingContext2D, run: Run, x: number, y: number, w: number, drawFood: DrawFood | null, o: OrderTicketOpts = {}): number {
  const order = run.order, rows = order.needs.length;
  const h = 16 + ROW * (2 + rows) + 4;
  const top = drawTicket(ctx, x, y, w, h, { title: o.title || `ORDER ${String((run.stage | 0) + 1).padStart(2, '0')}` });
  drawText(ctx, `FOR ${order.customer.toUpperCase()}`, x + 6, top + 2, { size: 1, color: UI.ink, shadow: false });
  drawText(ctx, order.dish, x + 6, top + 2 + ROW, { size: 1, color: UI.ink, shadow: false });
  let arrow = false;
  for (let i = 0; i < rows; i++) {
    const n = order.needs[i], ry = top + 2 + ROW * (2 + i), done = n.have >= n.amount;
    if (drawFood) drawFood(ctx, o.icons ? o.icons[n.id] : n.id, x + 11, ry + 4, 4, o.hexes ? o.hexes[n.id] : undefined);
    drawText(ctx, `${n.id.toUpperCase()} ${n.have}/${n.amount}`, x + 20, ry, { size: 1, color: UI.ink, shadow: false });
    if (done) { ctx.fillStyle = UI.ink; ctx.fillRect(x + w - 14, ry + 3, 2, 3); ctx.fillRect(x + w - 12, ry + 1, 2, 5); ctx.fillRect(x + w - 10, ry - 1, 2, 3); }
    else if (!arrow) { arrow = true; ctx.fillStyle = UI.ink; ctx.fillRect(x + w - 15, ry, 7, 7); ctx.fillStyle = SIGNAL.map; ctx.fillRect(x + w - 14, ry + 2, 2, 3); ctx.fillRect(x + w - 12, ry + 1, 2, 5); ctx.fillRect(x + w - 10, ry + 2, 2, 3); }
  }
  return h;
}
