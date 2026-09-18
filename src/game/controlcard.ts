// The HOW TO PLAY card: a paper ticket that drops in under the clock for the first seconds of every mini-game (and
// on every new step in the kitchen) and shows the round's controls as PICTURES, not words - a small player who
// cannot read the hint line yet can still read a key going up and down. Four pictograms, each an animated keycap:
//   move   two arrow keys, pressed by turns;
//   tap    the action key, pressed once every so often;
//   mash   the action key, pressed over and over with motion marks either side;
//   hold   the action key held down with a bar filling under it.
// A screen draws it with `drawControlCard(ctx, frame, t, schemes, key)` where `t` is frames since the round (or
// the step) began: the card holds for CARD_HOLD frames, then slides up off the top of the screen over CARD_SLIDE.
// Draw-only from end to end: nothing here touches a screen's simulation.
import { VIEW_W, UI, SIGNAL } from '../constants.ts';
import { drawText, measureText } from '../engine/text.ts';
import type { DrawTextOptions } from '../engine/text.ts';
import { drawTicket } from './ui.ts';

const R = Math.round;
export type CardScheme = 'move' | 'tap' | 'mash' | 'hold';
/** How long the card is held in place, and how long it takes to slide away after that. */
export const CARD_HOLD = 210, CARD_SLIDE = 16;
/** The card's resting row (just under the clock ticket; a screen with no ticket up there can pass its own) and how far it climbs to leave. */
export const CARD_Y = 54;
const CARD_LIFT = 120;
/** Keycaps: the face, the 2 px side under it, and the drop when pressed. */
const KEY_H = 14, KEY_MIN_W = 18, KEY_SIDE = 2, KEY_DROP = 2;
/** One pictogram's column, and the paper either side of the row. */
const COL_W = 62, PAD_X = 10, TITLE = 'HOW TO PLAY';
const WORD: Record<CardScheme, string> = { move: 'MOVE', tap: 'TAP', mash: 'TAP TAP TAP', hold: 'HOLD' };
const WORD_TEXT: DrawTextOptions = { size: 1, color: UI.ink, align: 'center', shadow: false };
const KEY_TEXT: DrawTextOptions = { size: 1, color: UI.ink, align: 'center', shadow: false };
const CARD_OPTS = { title: TITLE, rules: false };

/** A keycap with `label` on its face, centred on `cx` with its top at `y`; pressed keys drop KEY_DROP and lose their side. */
function drawKey(ctx: CanvasRenderingContext2D, cx: number, y: number, label: string, pressed: boolean): void {
  const w = Math.max(KEY_MIN_W, measureText(label, 1) + 8), x = R(cx - w / 2), top = y + (pressed ? KEY_DROP : 0);
  ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, top - 1, w + 2, KEY_H + 2 + (pressed ? 0 : KEY_SIDE));
  if (!pressed) { ctx.fillStyle = UI.paperDark; ctx.fillRect(x, top + KEY_H, w, KEY_SIDE); }
  ctx.fillStyle = pressed ? UI.paperDark : UI.paper; ctx.fillRect(x, top, w, KEY_H);
  drawText(ctx, label, cx, top + 4, KEY_TEXT);
}

/** Two short motion marks either side of a keycap: the picture of "again and again". */
function drawMarks(ctx: CanvasRenderingContext2D, cx: number, y: number, on: boolean): void {
  ctx.fillStyle = on ? SIGNAL.good : UI.paperDark;
  ctx.fillRect(cx - 18, y + 2, 3, 2); ctx.fillRect(cx - 20, y + 7, 5, 2); ctx.fillRect(cx - 18, y + 12, 3, 2);
  ctx.fillRect(cx + 15, y + 2, 3, 2); ctx.fillRect(cx + 15, y + 7, 5, 2); ctx.fillRect(cx + 15, y + 12, 3, 2);
}

/** One pictogram at column centre `cx`, keys with their tops at `y`, animated off the screen's frame counter. */
function drawScheme(ctx: CanvasRenderingContext2D, scheme: CardScheme, cx: number, y: number, f: number, key: string): void {
  if (scheme === 'move') {
    const step = (f / 30) & 1;
    drawKey(ctx, cx - 13, y, '←', step === 0);
    drawKey(ctx, cx + 13, y, '→', step === 1);
  } else if (scheme === 'tap') {
    drawKey(ctx, cx, y, key, (f % 48) < 10);
  } else if (scheme === 'mash') {
    const down = (f % 12) < 5;
    drawKey(ctx, cx, y, key, down);
    drawMarks(ctx, cx, y, down);
  } else {
    drawKey(ctx, cx, y, key, true);
    const bx = cx - 16, by = y + KEY_H + 6, k = (f % 80) / 64;
    ctx.fillStyle = UI.ink; ctx.fillRect(bx - 1, by - 1, 34, 6);
    ctx.fillStyle = UI.paperLine; ctx.fillRect(bx, by, 32, 4);
    ctx.fillStyle = SIGNAL.good; ctx.fillRect(bx, by, R(32 * Math.min(1, k)), 4);
  }
  drawText(ctx, WORD[scheme], cx, y + KEY_H + 14, WORD_TEXT);
}

/**
 * The card, `t` frames after it was raised: held at `restY` for CARD_HOLD, then sliding up and off. `key` is what
 * the action button is called on the seat's own device (input.keyText / padText), so a pad seat sees its button.
 */
export function drawControlCard(ctx: CanvasRenderingContext2D, frame: number, t: number, schemes: readonly CardScheme[], key: string, restY: number = CARD_Y): void {
  if (t >= CARD_HOLD + CARD_SLIDE || schemes.length === 0) return;
  const lift = t > CARD_HOLD ? ((t - CARD_HOLD) / CARD_SLIDE) : 0;
  const w = schemes.length * COL_W + PAD_X * 2, h = 62, x = R(VIEW_W / 2 - w / 2), y = R(restY - lift * lift * CARD_LIFT);
  const top = drawTicket(ctx, x, y, w, h, CARD_OPTS);
  for (let i = 0; i < schemes.length; i++) drawScheme(ctx, schemes[i], x + PAD_X + COL_W * i + COL_W / 2, top + 6, frame, key);
}
