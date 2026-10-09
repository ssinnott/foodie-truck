// The on-screen controls, drawn. engine/touch.js owns WHERE they are and what a thumb on them presses; this owns
// what they look like, and it reads the same exported layout, so the button a player sees is the button they hit.
//
// The look is the HOW TO PLAY card's keycap language (game/controlcard.js), because that card is where a player
// first meets a control in this game: a paper face over an ink outline, a 2 px side under it that a press takes
// away, and the face itself going paperDark while it is held. The stick is the same language bent into a ring: a
// paper band with an arrow tab at each compass point - the four arrows the hint lines name - and a keycap knob in
// the middle that follows the thumb. With no thumb on it the ring waits where the d-pad used to be; a thumb that
// lands anywhere on that side of the glass brings it to where the thumb is.
//
// Every control sits at IDLE_ALPHA while nothing holds it, so the scene behind it reads through, and comes up to
// full on its own while it is held, so a thumb covering it still shows an edge - the stick held does not make GO
// shout too.
//
// Draw-only, like the card: nothing here is asked what the player is holding, it is TOLD (input.touchMask(), the
// live stick), and nothing here touches a screen's simulation.
import { VIEW_W, VIEW_H, UI } from '../constants.ts';
import { drawText, measureText } from '../engine/text.ts';
import { BIT } from '../engine/actions.ts';
import { TOUCH_STICK, TOUCH_BUTTONS, touchAltOn, touchTyping, touchStick } from '../engine/touch.ts';
import type { Input } from './game.ts';

const R = Math.round, TAU = Math.PI * 2;
/** How far a control fades back when nothing holds it, and how far a held one comes up. */
const IDLE_ALPHA = 0.55, HELD_ALPHA = 1;
/** The keycap side, and the drop a press takes: controlcard.js's own numbers, for controls that read as its keys. */
const SIDE = 2, DROP = 2;
/** The stick's knob, and the arrow tab at each compass point of its ring. */
const KNOB_R = 13, TAB_R = 7;
/** The ring is pulled back onto the screen when the thumb that planted it is out in the dark band beside it. */
const RING_MARGIN = TOUCH_STICK.radius + TAB_R + 2;
/** The four arrows on the ring, in mask order (left, right, up, down), and where on the ring each one sits. */
const ARROWS = Object.freeze(['←', '→', '↑', '↓']);
const DIRS = Object.freeze([BIT.left, BIT.right, BIT.up, BIT.down]);
const TAB_DX = Object.freeze([-1, 1, 0, 0]), TAB_DY = Object.freeze([0, 0, -1, 1]);
const LABEL = { size: 1, color: UI.ink, align: 'center' as const, shadow: false };
const LIT = { size: 1, color: UI.paper, align: 'center' as const, shadow: false };
/** The strip that says a phone may type here, and where it sits (the lobby's code ticket is lower). */
const TYPE_TEXT = 'TAP TO OPEN THE KEYBOARD', TYPE_Y = 6;

/** One keycap disc: ink rim, a side under it unless it is pressed, and the face. */
function drawCap(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, held: boolean): number {
  const top = cy + (held ? DROP : 0);
  ctx.beginPath(); ctx.arc(cx, top, r + 1, 0, TAU);
  ctx.fillStyle = UI.ink; ctx.fill();
  if (!held) {
    ctx.beginPath(); ctx.arc(cx, top + SIDE, r, 0, TAU);
    ctx.fillStyle = UI.paperDark; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(cx, top, r, 0, TAU);
  ctx.fillStyle = held ? UI.paperDark : UI.paper; ctx.fill();
  return top;
}

/**
 * The stick: the ring with its four arrow tabs - each going dark while its direction is pushed - and the knob,
 * which sits under the thumb. `x`/`y` is the ring's centre and `kx`/`ky` the knob's; `live` is a thumb on it.
 */
function drawStick(ctx: CanvasRenderingContext2D, x: number, y: number, kx: number, ky: number, mask: number, live: boolean): void {
  const r = TOUCH_STICK.radius;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = UI.ink; ctx.lineWidth = 6; ctx.stroke();
  ctx.strokeStyle = UI.paper; ctx.lineWidth = 3; ctx.stroke();
  // The knob goes on before the tabs, not after: at full tilt it sits squarely on the tab of the way it is pushed,
  // and that tab is the one that has to show.
  drawCap(ctx, kx, ky, KNOB_R, live);
  for (let i = 0; i < 4; i++) {
    // A pushed direction's tab turns over - ink face, paper arrow - rather than only going paperDark as a pressed
    // key does: it is the one part of the stick a thumb is not covering, so it is what has to say which way.
    const tx = x + TAB_DX[i] * r, ty = y + TAB_DY[i] * r, held = (mask & DIRS[i]) !== 0;
    ctx.beginPath(); ctx.arc(tx, ty, TAB_R + 1, 0, TAU); ctx.fillStyle = UI.ink; ctx.fill();
    if (!held) { ctx.beginPath(); ctx.arc(tx, ty, TAB_R, 0, TAU); ctx.fillStyle = UI.paper; ctx.fill(); }
    drawText(ctx, ARROWS[i], tx, ty - 3, held ? LIT : LABEL);
  }
}

/** One round button: a keycap, and its name across the middle. */
function drawButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, label: string, held: boolean): void {
  const top = drawCap(ctx, cx, cy, r, held);
  drawText(ctx, label, R(cx), R(top - 3), LABEL);
}

/**
 * The whole overlay, over everything else a frame drew. `input` is the service itself: it answers whether the
 * controls are up at all (a phone or a tablet, and no pad or keyboard in the player's hands) and what is held.
 * Which buttons those are, where the stick is, and whether a screen is asking to be typed into, are the touch
 * layer's own answers - the SAME answers it hit-tests by, so what is drawn and what can be pressed cannot come apart.
 */
export function drawTouchPad(ctx: CanvasRenderingContext2D, input: Input): void {
  if (!input.touchOn()) return;
  const mask = input.touchMask(), s = touchStick(), typing = touchTyping();
  const alpha = ctx.globalAlpha;
  // The ring under the thumb, or waiting at rest. Pulled back on screen if the thumb is out in the band beside it,
  // with the knob kept at the thumb's offset, so the direction still reads where the thumb itself cannot be seen.
  let x: number = TOUCH_STICK.restX, y: number = TOUCH_STICK.restY, kx = x, ky = y;
  if (s) {
    x = Math.max(RING_MARGIN, Math.min(VIEW_W - RING_MARGIN, s.ox));
    y = Math.max(RING_MARGIN, Math.min(VIEW_H - RING_MARGIN, s.oy));
    kx = x + s.x - s.ox; ky = y + s.y - s.oy;
  }
  ctx.globalAlpha = alpha * (s ? HELD_ALPHA : IDLE_ALPHA);
  drawStick(ctx, R(x), R(y), R(kx), R(ky), mask, !!s);
  for (const b of TOUCH_BUTTONS) {
    if (b.action === 'alt' && !touchAltOn()) continue;
    const held = (mask & BIT[b.action]) !== 0;
    ctx.globalAlpha = alpha * (held ? HELD_ALPHA : IDLE_ALPHA);
    drawButton(ctx, b.cx, b.cy, b.r, b.label, held);
  }
  // A screen that is reading text needs a system keyboard, and on a phone that is a tap and not a key: say so
  // where nothing else is drawn, and say it only while something is actually asking to be typed into.
  if (typing) {
    ctx.globalAlpha = alpha;
    const w = measureText(TYPE_TEXT, 1) + 10, tx = R(VIEW_W / 2 - w / 2);
    ctx.fillStyle = UI.ink; ctx.fillRect(tx - 1, TYPE_Y - 1, w + 2, 13);
    ctx.fillStyle = UI.paper; ctx.fillRect(tx, TYPE_Y, w, 11);
    drawText(ctx, TYPE_TEXT, R(VIEW_W / 2), TYPE_Y + 2, LABEL);
  }
  ctx.globalAlpha = alpha;
}
