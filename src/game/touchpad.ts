// The on-screen controls, drawn. engine/touch.js owns WHERE they are and what a thumb on them presses; this owns
// what they look like, and it reads the same exported layout, so the button a player sees is the button they hit.
//
// The look is the HOW TO PLAY card's keycap language (game/controlcard.js), because that card is where a player
// first meets a control in this game: a paper face over an ink outline, a 2 px side under it that a press takes
// away, and the face itself going paperDark while it is held. Idle, the whole overlay sits at IDLE_ALPHA so the
// scene behind it reads through; a pressed control comes up to full so a thumb covering it still shows an edge.
//
// Draw-only, like the card: nothing here is asked what the player is holding, it is TOLD (input.touchMask()), and
// nothing here touches a screen's simulation.
import { VIEW_W, UI } from '../constants.ts';
import { drawText, measureText } from '../engine/text.ts';
import { BIT } from '../engine/actions.ts';
import { TOUCH_PAD, TOUCH_BUTTONS, BUTTON_INSET, touchAltOn, touchTyping } from '../engine/touch.ts';
import type { Input } from './game.ts';

const R = Math.round;
/** How far the overlay fades back when nothing is held, and how far a pressed control comes up. */
const IDLE_ALPHA = 0.55, HELD_ALPHA = 1;
/** The keycap side, and the drop a press takes: controlcard.js's own numbers, for controls that read as its keys. */
const SIDE = 2, DROP = 2;
/** The arrow on each arm of the d-pad, in mask order (left, right, up, down). */
const ARROWS = Object.freeze(['←', '→', '↑', '↓']);
const LABEL = { size: 1, color: UI.ink, align: 'center' as const, shadow: false };
/** The strip that says a phone may type here, and where it sits (the lobby's code ticket is lower). */
const TYPE_TEXT = 'TAP TO OPEN THE KEYBOARD', TYPE_Y = 6;

/** One arm of the d-pad as a rect: [x, y, w, h], in mask order. */
function armRect(i: number): [number, number, number, number] {
  const p = TOUCH_PAD, half = p.thick / 2, len = p.arm - half;
  if (i === 0) return [p.cx - p.arm, p.cy - half, len, p.thick];
  if (i === 1) return [p.cx + half, p.cy - half, len, p.thick];
  if (i === 2) return [p.cx - half, p.cy - p.arm, p.thick, len];
  return [p.cx - half, p.cy + half, p.thick, len];
}

/** The d-pad: an ink plus, a paper face on it, and whichever arms are held going dark under the thumb. */
function drawPad(ctx: CanvasRenderingContext2D, mask: number): void {
  const p = TOUCH_PAD, half = p.thick / 2;
  // The outline is the plus drawn 1 px proud in ink, so the two bars of it share one silhouette.
  ctx.fillStyle = UI.ink;
  ctx.fillRect(R(p.cx - p.arm - 1), R(p.cy - half - 1), R(p.arm * 2 + 2), R(p.thick + 2));
  ctx.fillRect(R(p.cx - half - 1), R(p.cy - p.arm - 1), R(p.thick + 2), R(p.arm * 2 + 2));
  // The side: the same plus again, one step down, which is what makes a flat shape read as a key to press.
  ctx.fillStyle = UI.paperDark;
  ctx.fillRect(R(p.cx - p.arm), R(p.cy - half + SIDE), R(p.arm * 2), R(p.thick));
  ctx.fillRect(R(p.cx - half), R(p.cy - p.arm + SIDE), R(p.thick), R(p.arm * 2));
  ctx.fillStyle = UI.paper;
  ctx.fillRect(R(p.cx - p.arm), R(p.cy - half), R(p.arm * 2), R(p.thick));
  ctx.fillRect(R(p.cx - half), R(p.cy - p.arm), R(p.thick), R(p.arm * 2));
  const dirs = [BIT.left, BIT.right, BIT.up, BIT.down];
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = armRect(i), held = (mask & dirs[i]) !== 0;
    if (held) { ctx.fillStyle = UI.paperDark; ctx.fillRect(R(x), R(y), R(w), R(h)); }
    drawText(ctx, ARROWS[i], R(x + w / 2), R(y + h / 2 - 3), LABEL);
  }
}

/** One round button: ink rim, paper face, a side under it, and its name across the middle. */
function drawButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, held: boolean): void {
  const face = r - BUTTON_INSET, top = cy + (held ? DROP : 0);
  ctx.beginPath(); ctx.arc(cx, top, face + 1, 0, Math.PI * 2);
  ctx.fillStyle = UI.ink; ctx.fill();
  if (!held) {
    ctx.beginPath(); ctx.arc(cx, top + SIDE, face, 0, Math.PI * 2);
    ctx.fillStyle = UI.paperDark; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, top, face, 0, Math.PI * 2);
  ctx.fillStyle = held ? UI.paperDark : UI.paper; ctx.fill();
  drawText(ctx, label, R(cx), R(top - 3), LABEL);
}

/**
 * The whole overlay, over everything else a frame drew. `input` is the service itself: it answers whether the
 * controls are up at all (a phone or a tablet, and no pad or keyboard in the player's hands) and what is held.
 * Which buttons those are, and whether a screen is asking to be typed into, are the touch layer's own answers -
 * the SAME answers it hit-tests by, so what is drawn and what can be pressed cannot come apart.
 */
export function drawTouchPad(ctx: CanvasRenderingContext2D, input: Input): void {
  if (!input.touchOn()) return;
  const mask = input.touchMask(), typing = touchTyping();
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (mask ? HELD_ALPHA : IDLE_ALPHA);
  drawPad(ctx, mask);
  for (const b of TOUCH_BUTTONS) {
    if (b.action === 'alt' && !touchAltOn()) continue;
    drawButton(ctx, b.cx, b.cy, b.r, b.label, (mask & BIT[b.action]) !== 0);
  }
  // A screen that is reading text needs a system keyboard, and on a phone that is a tap and not a key: say so
  // where nothing else is drawn, and say it only while something is actually asking to be typed into.
  if (typing) {
    ctx.globalAlpha = alpha;
    const w = measureText(TYPE_TEXT, 1) + 10, x = R(VIEW_W / 2 - w / 2);
    ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, TYPE_Y - 1, w + 2, 13);
    ctx.fillStyle = UI.paper; ctx.fillRect(x, TYPE_Y, w, 11);
    drawText(ctx, TYPE_TEXT, R(VIEW_W / 2), TYPE_Y + 2, LABEL);
  }
  ctx.globalAlpha = alpha;
}
