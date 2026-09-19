// The THIRD device source, beside the keyboard and the pad (docs/ARCHITECTURE.md section 3): a thumb on the glass.
//
// A phone has no keys to bind, so there is nothing here for engine/bindings.js to own. The layout below IS the
// binding - a d-pad under the left thumb, GO and X under the right, ALT over the pad, MENU up in the corner - and
// it is exported whole, because game/touchpad.js draws exactly these rectangles and circles, and a control the
// player sees in one place and presses in another is worse than no control at all. Hit-tested here, drawn there.
//
// Only seat 0 is reachable this way. Four thumbs on one phone is not couch play, and a second seat that could only
// ever be a second finger on the same glass would take a critter nobody is driving.
//
// WHO GETS THE OVERLAY. `(hover: none) and (pointer: coarse)` - the same query index.html asks before it tells a
// portrait phone to turn sideways - so a laptop with a touchscreen is not handed thumb controls it does not want.
// A pad paired to a phone then hides them again (engine/input.js suppresses on a keyboard or pad mask) and the
// next touch brings them back: whichever the player reached for last is the one the screen talks about.
//
// The mask is computed from the live points once per step rather than on the DOM event, so a seat's input is
// stable for the whole of a fixed step. A tap that goes down and comes back up between two steps would fall
// through that, so a press is held in `pending` until the step that follows it has been served - the same trick
// keyboard `typed` plays, for the same reason.
import { BIT } from './actions.ts';
import type { Action } from './actions.ts';
import type { Canvas } from '../lib/engine/canvas.ts';

/**
 * The d-pad: a square pressed anywhere, not a cross that has to be hit. `half` is the hit square's half-size,
 * `dead` the still centre, `arm` and `thick` the plus that is drawn inside it (game/touchpad.js).
 */
export const TOUCH_PAD = Object.freeze({ cx: 66, cy: 282, half: 56, dead: 11, arm: 26, thick: 20 });

/** One round button: where it is hit, and what it is called on a hint line. */
export interface TouchButton {
  action: Action;
  cx: number;
  cy: number;
  /** Hit radius. The face drawn under the thumb is BUTTON_INSET smaller: a fingertip is wider than what it aims at. */
  r: number;
  label: string;
}
/** How much smaller a button is drawn than it is pressed. */
export const BUTTON_INSET = 4;
/**
 * GO is the big one, in the right thumb's corner, because it is what every mini-game asks for; X (cancel) rolls
 * off it. X rather than BACK on the face, because every hint line that names cancel already ends in the word: a
 * button called BACK would have the screens reading "BACK: BACK".
 *
 * WHERE THEY ARE NOT is the other half of this table. A 640x360 screen has no margin to put controls in, so the
 * overlay lies over the scene, and the places it must not lie over are the ones the game puts words in: the menu
 * board down the right of the title and the lobby (which is why the cluster hugs the bottom edge, under it), the
 * ticket in one top corner (the shopping list, the order), the seat's name plate in the other (the road, which is
 * why MENU hangs a plate's height below the top edge), and the hint strip across the bottom middle. ALT is the one
 * button that would not fit around all that, so it goes above the d-pad rather than beside GO: the left thumb has
 * to lift for it, and ALT is the rare one - a honk on the road, a portrait turned round in the crew gallery.
 */
export const TOUCH_BUTTONS: readonly TouchButton[] = Object.freeze([
  { action: 'action', cx: 592, cy: 308, r: 32, label: 'GO' },
  { action: 'cancel', cx: 528, cy: 330, r: 21, label: 'X' },
  { action: 'alt', cx: 66, cy: 198, r: 21, label: 'ALT' },
  { action: 'start', cx: 620, cy: 56, r: 18, label: 'MENU' },
]);
/** What each action is called when the hint lines are talking to a thumb (engine/input.js keyText). */
export const TOUCH_LABELS: Partial<Record<Action, string>> = Object.freeze({
  left: '←', right: '→', up: '↑', down: '↓', action: 'GO', alt: 'ALT', cancel: 'X', start: 'MENU',
});

/** How much the off-screen field holds before it is emptied: it is a keystream, not the code (see the soft keyboard). */
const SOFT_MAX = 16;

/** The canvas the points are measured against; null until attach(). */
let view: Canvas | null = null;
/** Live contact points in GAME space (640x360), by pointer id. */
const points = new Map<number, { x: number; y: number }>();
/** Points a test stands in for the real ones (window.__game.touch), or null. */
let virtualPoints: { x: number; y: number }[] | null = null;
/** Pressed since the last endStep(), so a tap shorter than a fixed step is still played. */
let pending = 0;
/** A contact went down since the last endStep(), wherever it landed: the title screen's "press anything". */
let tapPending = false;
/** Set while a keyboard or pad is the live device; the next touch clears it. */
let suppressed = false;
/** Cached media query: a phone or a tablet, not a laptop whose screen happens to be touchable. */
let coarse: MediaQueryList | null = null;
/** The off-screen field that raises the soft keyboard, and what it held when it was last read. */
let field: HTMLInputElement | null = null;
let fieldPrev = '';
/** True while a screen is reading typedCodes() as text and the keyboard should be up. */
let typing = false;
/** Codes the soft keyboard has produced since the last drain. */
let softTyped: string[] = [];

/** Is this a device whose player has no keys - a phone or a tablet? */
export function touchAvailable(): boolean {
  if (virtualPoints) return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (!coarse) coarse = window.matchMedia('(hover: none) and (pointer: coarse)');
  return coarse.matches;
}
/** Should the overlay be on screen? Available, and not standing down for a pad or a keyboard. */
export function touchVisible(): boolean { return touchAvailable() && !suppressed; }
/** engine/input.js: a keyboard or a pad produced input, so the thumb controls step aside until the next touch. */
export function suppressTouch(on: boolean): void { suppressed = !!on; }

/** The mask one contact point presses: the d-pad square by which side of centre it is, or whichever button it is inside. */
export function maskAt(x: number, y: number): number {
  const p = TOUCH_PAD;
  const dx = x - p.cx, dy = y - p.cy;
  if (Math.abs(dx) <= p.half && Math.abs(dy) <= p.half) {
    let m = 0;
    if (dx < -p.dead) m |= BIT.left; else if (dx > p.dead) m |= BIT.right;
    if (dy < -p.dead) m |= BIT.up; else if (dy > p.dead) m |= BIT.down;
    return m;
  }
  for (const b of TOUCH_BUTTONS) {
    const bx = x - b.cx, by = y - b.cy;
    if (bx * bx + by * by <= b.r * b.r) return BIT[b.action];
  }
  return 0;
}

/** Every live contact, test points included. */
function livePoints(): { x: number; y: number }[] {
  if (virtualPoints) return virtualPoints;
  return Array.from(points.values());
}
/**
 * What the thumbs hold for this step: every live contact, plus anything pressed and released since the last one.
 * Read twice a step on an online frame (net/session.js pollRaw, then update()), which is why it clears nothing.
 */
export function touchMask(): number {
  if (!touchVisible()) return 0;
  let m = pending;
  for (const pt of livePoints()) m |= maskAt(pt.x, pt.y);
  return m & 0xff;
}
/** A contact went down this step, anywhere on the glass (the title screen's prompt). */
export function touchTapped(): boolean { return touchVisible() && tapPending; }
/** End of a fixed step: the short tap has been served. */
export function endTouchStep(): void { pending = 0; tapPending = false; }

/**
 * A contact going DOWN at a point: the one edge a press has, wherever the point came from (a real thumb or a
 * test's). It answers whether the point is to be KEPT - while a screen is reading text the X button spells the
 * ESCAPE a soft keyboard has not got, and having spelled it there is nothing left for that contact to hold.
 */
function pressAt(pt: { x: number; y: number }): boolean {
  const m = maskAt(pt.x, pt.y);
  if (typing && m === BIT.cancel) { softTyped.push('Escape'); return false; }
  pending |= m;
  return true;
}

function toGame(e: PointerEvent): { x: number; y: number } {
  if (!view) return { x: -1, y: -1 };
  return view.toInternal(e.clientX, e.clientY);
}
/** Touch and pen only: a mouse on a desktop has the keyboard next to it and must not press the overlay. */
function isTouch(e: PointerEvent): boolean { return e.pointerType === 'touch' || e.pointerType === 'pen'; }

function onPointerDown(e: PointerEvent): void {
  if (!isTouch(e)) return;
  suppressed = false;
  tapPending = true;
  // A screen that is reading text wants the system keyboard, and iOS only opens one inside the gesture that
  // asked for it - so the tap that lands while a screen is typing is the tap that raises it.
  if (typing) focusField();
  if (!touchVisible()) return;
  const pt = toGame(e);
  if (pressAt(pt)) points.set(e.pointerId, pt);
}
function onPointerMove(e: PointerEvent): void {
  if (!isTouch(e) || !points.has(e.pointerId)) return;
  // A thumb that slides from LEFT to RIGHT across the pad is one press moving, not a release and a new press:
  // the point is simply re-read where it now is, and the mask follows it.
  points.set(e.pointerId, toGame(e));
}
function onPointerUp(e: PointerEvent): void { points.delete(e.pointerId); }

/** Attach to the canvas. Idempotent: a second call re-points at the new view rather than doubling the listeners. */
export function attachTouch(v: Canvas): void {
  const first = !view;
  view = v;
  if (!first || !v || !v.canvas || !v.canvas.addEventListener) return;
  const el = v.canvas;
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  // A contact that leaves the element still ends there: without this a thumb dragged off the glass holds a
  // direction down for ever.
  el.addEventListener('pointerleave', onPointerUp);
  if (typeof window !== 'undefined') window.addEventListener('blur', () => points.clear());
}

// ---- the soft keyboard ------------------------------------------------------------------------
//
// Room codes are spelled in KeyboardEvent.code values (screens/lobby.js updateCode), and a phone has none to send.
// An off-screen field is what a phone DOES answer with a keyboard, so one is held here and what it collects is
// turned back into the codes the lobby already reads. The field is never drawn and never holds the code: it is a
// keystream, read by difference and trimmed when it grows, and the lobby's own buffer stays the one true copy.

/** 'A' -> 'KeyA', '7' -> 'Digit7', anything else -> '' (the alphabet is the lobby's, see net/signal.js). */
function charCode(ch: string): string {
  const c = ch.toUpperCase();
  if (c >= 'A' && c <= 'Z') return 'Key' + c;
  if (c >= '0' && c <= '9') return 'Digit' + c;
  return '';
}
function onFieldInput(): void {
  if (!field) return;
  const now = field.value;
  if (now.length < fieldPrev.length) for (let i = now.length; i < fieldPrev.length; i++) softTyped.push('Backspace');
  else for (let i = fieldPrev.length; i < now.length; i++) { const code = charCode(now[i]); if (code) softTyped.push(code); }
  // Keep the field short: it is a keystream, not the code itself, and the lobby holds what has been spelled.
  if (now.length > SOFT_MAX) { field.value = ''; fieldPrev = ''; return; }
  fieldPrev = now;
}
function onFieldKey(e: KeyboardEvent): void {
  // Hardware keys reaching the field (a phone with a case keyboard) would otherwise be eaten by it: the window
  // listener in engine/input.js never sees a keystroke the focused field swallowed.
  if (e.key === 'Enter') { softTyped.push('Enter'); e.preventDefault(); }
  else if (e.key === 'Escape') { softTyped.push('Escape'); e.preventDefault(); }
  else if (e.key === 'Backspace' && !field.value) softTyped.push('Backspace');
}
function makeField(): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  el.id = 'softkeys';
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'characters');
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('enterkeyhint', 'go');
  el.setAttribute('aria-label', 'room code');
  el.maxLength = SOFT_MAX;
  // Off screen, but IN the layout: a field at display:none or visibility:hidden cannot be focused, and one at
  // opacity 0 under the thumb would eat the taps meant for the game.
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;';
  el.addEventListener('input', onFieldInput);
  el.addEventListener('keydown', onFieldKey);
  document.body.appendChild(el);
  return el;
}
function focusField(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (!field) field = makeField();
  try { field.focus({ preventScroll: true }); } catch { /* a browser that will not focus just has no keyboard */ }
}
/**
 * main.js, every step: is the top screen reading text? While it is, a phone gets a keyboard - tried at once for
 * the browsers that allow it, and again on the next tap for the ones that only open inside a gesture.
 */
export function setTouchTyping(on: boolean): void {
  const want = !!on && touchAvailable();
  if (want === typing) return;
  typing = want;
  if (want) { focusField(); if (field) { field.value = ''; fieldPrev = ''; } }
  else if (field) { try { field.blur(); } catch { /* ignore */ } field.value = ''; fieldPrev = ''; }
}
/** True while the soft keyboard is being asked for: the lobby says TAP TO TYPE rather than naming a key. */
export function touchTyping(): boolean { return typing; }
/** The codes the soft keyboard has produced, handed over and forgotten (engine/input.js folds them into typedCodes). */
export function drainSoftTyped(): string[] {
  if (!softTyped.length) return softTyped;
  const out = softTyped;
  softTyped = [];
  return out;
}

/**
 * Test hook (window.__game.touch): stand a list of GAME-space points in for the real contacts, and null clears
 * them again. A list also makes touchAvailable() true, so a desktop test browser can drive the overlay.
 */
export function setTouchVirtual(list: { x: number; y: number }[] | null): void {
  if (!list) { virtualPoints = null; return; }
  const pts = list.map((p) => ({ x: p.x, y: p.y }));
  // An EMPTY list is a phone with nothing held: the overlay is available and drawn, but nobody has tapped, so it
  // must not report the tap that a title screen would take as "press anything".
  virtualPoints = [];
  if (!pts.length) return;
  suppressed = false;
  tapPending = true;
  for (const p of pts) if (pressAt(p)) virtualPoints.push(p);
}
