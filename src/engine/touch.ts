// The THIRD device source, beside the keyboard and the pad (docs/ARCHITECTURE.md section 3): a thumb on the glass.
//
// Laid out the way the sibling game *Aether & Brass* lays its thumbs out, because that one plays well on a phone and
// the fixed d-pad this file used to draw did not: a FLOATING STICK under the left thumb, round buttons under the right.
//
//  * THE STICK. A thumb that lands anywhere left of TOUCH_STICK.zoneX IS the stick, and where it landed is the
//    stick's centre: dragging away from that point is a direction, snapped to one of eight. Nothing has to be found
//    first. The d-pad it replaces was a 112 px square to land in and then STAY in - a thumb that drifted over its
//    edge while holding RIGHT let go of RIGHT, mid-crab-chase - and that was most of what was wrong with playing
//    on a phone. A thumb dragged further than the ring pulls the centre along behind it, so turning round is one
//    ring's width of travel however far the thumb has wandered.
//  * THE BUTTONS. GO is the big one in the right thumb's corner, because it is what every mini-game asks for, and
//    it is hit generously: its circle is wider than its face, and the whole corner beyond its centre - out to the
//    edge of the glass - is GO as well. A thumb that lands on a button HOLDS that button until it lifts, wherever it
//    rolls meanwhile: the scenes that are played by holding GO must not let go because a thumb shifted.
//  * THE WHOLE GLASS. A phone held sideways is wider than 16:9, so the canvas sits between two dark bands - about a
//    hundred pixels each on a common phone - and that is exactly where thumbs rest. The listeners are on the
//    document rather than the canvas, so a contact in a band is mapped through the same toInternal (an x below 0,
//    or past 640) and lands on the stick or on GO like any other.
//
// The layout below IS the binding: a phone has no keys to bind, so there is nothing here for engine/bindings.js to
// own. It is exported whole because game/touchpad.js draws exactly these circles, and a control the player sees in
// one place and presses in another is worse than no control at all. Hit-tested here, drawn there.
//
// Only seat 0 is reachable this way, which since local co-op went is the only seat this machine has: a second
// player brings their own phone and joins online.
//
// WHO GETS THE OVERLAY. A device that matches `(hover: none) and (pointer: coarse)` - the query index.html asks
// before it tells a portrait phone to turn sideways - has it from the first frame, so the title can say TAP GO
// before anybody has. Anything else gets it the first time a finger actually touches the page (a laptop with a
// touchscreen, a tablet with a trackpad case): until then a mouse is not handed thumb controls it did not ask for.
// A pad or a keyboard stands it down again (engine/input.js suppresses on a keyboard or pad mask) and the next
// touch brings it back: whichever the player reached for last is the one the screen talks about.
//
// The mask is computed from the live contacts once per step rather than on the DOM event, so a seat's input is
// stable for the whole of a fixed step. A tap that goes down and comes back up between two steps would fall through
// that, so a press is held in `pending` until the step that follows it has been served - the same trick keyboard
// `typed` plays, for the same reason - and so is a direction the stick was pushed in, for the flick that is over
// inside one step.
import { BIT } from './actions.ts';
import type { Action } from './actions.ts';
import type { Canvas } from '../lib/engine/canvas.ts';

/**
 * The floating stick. `zoneX`: a contact that lands left of this x is the stick, the band off the canvas's left
 * edge included. `restX` / `restY`: where it is drawn while no thumb is on it. `radius`: full deflection - the knob
 * stops at the ring, and a thumb dragged past it pulls the centre after it. `dead`: the still middle, where a
 * resting thumb presses nothing.
 */
export const TOUCH_STICK = Object.freeze({ zoneX: 300, restX: 68, restY: 286, radius: 30, dead: 8 });

/** One round button: where it is hit, how big it is drawn, and what it is called on a hint line. */
export interface TouchButton {
  action: Action;
  cx: number;
  cy: number;
  /** The face drawn under the thumb. */
  r: number;
  /** The hit radius: wider than the face, because a fingertip is wider than what it aims at. */
  hit: number;
  label: string;
}
/**
 * GO is the big one, in the right thumb's corner; X (cancel) sits off its left shoulder and ALT over its head. X
 * rather than BACK on the face, because every hint line that names cancel already ends in the word: a button
 * called BACK would have the screens reading "BACK: BACK".
 *
 * WHERE THEY ARE NOT is the other half of this table. A 640x360 screen has no margin to put controls in, so the
 * overlay lies over the scene, and the places it must not lie over are the ones the game puts words in: the menu
 * board down the right of the title and the lobby (which is why the cluster hugs the bottom edge, under it), the
 * ticket in the top-left corner (the shopping list, the order), the seat's name plate top right (the road, which is
 * why MENU hangs a plate's height below the top edge), and the strip across the bottom middle - where the title's
 * two addresses are, which X's hit circle stays clear of (tools/scenarios/touch.js holds it to that).
 *
 * ALT is drawn on the three screens that READ it and on no other (`setTouchAlt`, off the top screen's `touchAlt`):
 * everywhere else a circle that does nothing would be lying over a scene that says something.
 */
export const TOUCH_BUTTONS: readonly TouchButton[] = Object.freeze([
  { action: 'action', cx: 590, cy: 304, r: 30, hit: 42, label: 'GO' },
  { action: 'cancel', cx: 518, cy: 330, r: 17, hit: 26, label: 'X' },
  { action: 'alt', cx: 590, cy: 226, r: 18, hit: 26, label: 'ALT' },
  { action: 'start', cx: 618, cy: 56, r: 14, hit: 22, label: 'MENU' },
]);
/** GO, which also owns the corner beyond its centre (buttonAt). */
const GO = TOUCH_BUTTONS.find((b) => b.action === 'action');
/** What each action is called when the hint lines are talking to a thumb (engine/input.js keyText). */
export const TOUCH_LABELS: Partial<Record<Action, string>> = Object.freeze({
  left: '←', right: '→', up: '↑', down: '↓', action: 'GO', alt: 'ALT', cancel: 'X', start: 'MENU',
});

/** The stick's eight directions, by octant clockwise from east (y is down, so octant 2 is DOWN). */
const OCTANTS = Object.freeze([
  BIT.right, BIT.right | BIT.down, BIT.down, BIT.left | BIT.down,
  BIT.left, BIT.left | BIT.up, BIT.up, BIT.right | BIT.up,
]);
const DEAD2 = TOUCH_STICK.dead * TOUCH_STICK.dead;
/** Pointer ids the test hook's contacts use: negative, so they can never be a real pointer's. */
const VIRTUAL_ID = -1000;

/** How much the off-screen field holds before it is emptied: it is a keystream, not the code (see the soft keyboard). */
const SOFT_MAX = 16;

/**
 * One finger on the glass, from the moment it lands until it lifts: either the stick or one button, decided where it
 * landed and never changed by where it goes after that.
 */
export interface TouchContact {
  /** The stick, or a button it is holding down. */
  kind: 'stick' | 'button';
  /** The button's action; unused by the stick. */
  action: Action;
  /** The stick's centre: where the thumb landed, pulled along behind it once it has been dragged past the ring. */
  ox: number;
  oy: number;
  /** Where the thumb is now, in game space. */
  x: number;
  y: number;
  /** Has the stick ever left its still middle? A contact that never did was a tap, and pressed nothing. */
  pushed: boolean;
}

/** The canvas the contacts are measured against; null until attach(). */
let view: Canvas | null = null;
/** Every finger down, by pointer id (the test hook's are negative). */
const contacts = new Map<number, TouchContact>();
/** The contact that is the stick, or null: at most one, and the newest thumb to land on that side takes it. */
let stick: TouchContact | null = null;
/** How many contacts the test hook is holding down, by index (window.__game.touch), and whether it is on at all. */
let virtualOn = false;
let virtualDown: boolean[] = [];
/** Pressed since the last endStep(), so a tap shorter than a fixed step is still played. */
let pending = 0;
/** A contact went down since the last endStep(), wherever it landed: the title screen's "press anything". */
let tapPending = false;
/** Has a real finger touched this page? From then on the overlay is offered whatever the media query said. */
let seen = false;
/**
 * Did the last contact to lift press anything - a button, or the stick pushed off its middle? engine/links.js asks
 * (`touchHitAt`) before it treats the click a browser makes of a tap as a click on an address: a thumb that only
 * rested on the stick's side of the glass was a tap on whatever is drawn there, and one that steered was not.
 */
let lastPlayed = false;
/** Set while a keyboard or pad is the live device; the next touch clears it. */
let suppressed = false;
/** Is the top screen one that reads `alt`? While it is not, that button is neither drawn nor hit. */
let altOn = false;
/** Cached media query: a phone or a tablet, not a laptop whose screen happens to be touchable. */
let coarse: MediaQueryList | null = null;
/** The off-screen field that raises the soft keyboard, and what it held when it was last read. */
let field: HTMLInputElement | null = null;
let fieldPrev = '';
/** True while a screen is reading typedCodes() as text and the keyboard should be up. */
let typing = false;
/** Codes the soft keyboard has produced since the last drain. */
let softTyped: string[] = [];

/** Is this a device whose player has no keys - a phone or a tablet, or anything a finger has touched? */
export function touchAvailable(): boolean {
  if (virtualOn || seen) return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (!coarse) coarse = window.matchMedia('(hover: none) and (pointer: coarse)');
  return coarse.matches;
}
/** Should the overlay be on screen? Available, and not standing down for a pad or a keyboard. */
export function touchVisible(): boolean { return touchAvailable() && !suppressed; }
/** engine/input.js: a keyboard or a pad produced input, so the thumb controls step aside until the next touch. */
export function suppressTouch(on: boolean): void { suppressed = !!on; }

/** The button a point is on, or null: its circle first, then GO's corner. ALT only while the screen on top reads it. */
function buttonAt(x: number, y: number): TouchButton | null {
  for (const b of TOUCH_BUTTONS) {
    if (b.action === 'alt' && !altOn) continue;
    const bx = x - b.cx, by = y - b.cy;
    if (bx * bx + by * by <= b.hit * b.hit) return b;
  }
  // Everything right of GO's centre and below the top of its circle, out to the edge of the glass, is GO: the
  // corner is where a right thumb rests, and on a phone most of that corner is the dark band beside the canvas.
  return x >= GO.cx && y >= GO.cy - GO.hit ? GO : null;
}
/** The direction one stick contact is pushing, as a mask: nothing in its still middle, else the nearest of eight. */
function stickMask(c: TouchContact): number {
  const dx = c.x - c.ox, dy = c.y - c.oy;
  if (dx * dx + dy * dy < DEAD2) return 0;
  // Input sampling, not simulation: what crosses the wire is the mask this picks, so every peer plays the same
  // byte however this machine's atan2 rounds (the same footing as a gamepad's float axes).
  return OCTANTS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
}
/**
 * Does a click at this point belong to the overlay - a button on offer under it, or a contact that just lifted
 * having pressed something? engine/links.js asks before it treats a tap as a click on an address underneath: BACK
 * opening a browser tab mid-game is not something a player can undo from a phone. A thumb that only rested on the
 * stick's side pressed nothing, so its tap is left to land on whatever is drawn there. False whenever the controls
 * are not up, so a mouse on a desktop is never refused anything.
 */
export function touchHitAt(x: number, y: number): boolean {
  if (!touchVisible()) return false;
  return lastPlayed || !!buttonAt(x, y);
}
/**
 * main.js, every step: does the screen on top read `alt`? Only three do (the road's horn, the crew gallery's
 * turn, the CONTROLS column reset), and on every other screen that circle would be a control that does nothing
 * lying over one that says something.
 */
export function setTouchAlt(on: boolean): void { altOn = !!on; }
/** Is the ALT button on offer? game/touchpad.js draws exactly the buttons that can be pressed. */
export function touchAltOn(): boolean { return altOn; }
/** The live stick contact, for game/touchpad.js to draw where the thumb is; null while no thumb is on it. Read-only. */
export function touchStick(): Readonly<TouchContact> | null { return touchVisible() ? stick : null; }

/**
 * What the thumbs hold for this step: every button held down, the stick's direction, and anything pressed and
 * released since the last step. Read twice a step on an online frame (net/session.js pollRaw, then update()),
 * which is why it clears nothing.
 */
export function touchMask(): number {
  if (!touchVisible()) return 0;
  let m = pending;
  for (const c of contacts.values()) m |= c.kind === 'button' ? BIT[c.action] : stickMask(c);
  return m & 0xff;
}
/** A contact went down this step, anywhere on the glass (the title screen's prompt). */
export function touchTapped(): boolean { return touchVisible() && tapPending; }
/** End of a fixed step: the short tap has been served. */
export function endTouchStep(): void { pending = 0; tapPending = false; }

// ---- contacts ---------------------------------------------------------------------------------
//
// The three edges a finger has, whichever kind of finger it is: the DOM listeners below call these for a real
// thumb, and the test hook at the foot of the file calls the very same three for a pretend one, so a test that
// drags the stick is dragging this code and not a stand-in for it.

/** A contact going DOWN at a game-space point: the stick, a button, or nothing at all. */
function contactDown(id: number, pt: { x: number; y: number }): void {
  suppressed = false;
  tapPending = true;
  lastPlayed = false;
  const b = buttonAt(pt.x, pt.y);
  if (b) {
    // While a screen is reading text the X button spells the ESCAPE a soft keyboard has not got, and having
    // spelled it there is nothing left for that contact to hold.
    if (typing && b.action === 'cancel') { softTyped.push('Escape'); lastPlayed = true; return; }
    pending |= BIT[b.action];
    contacts.set(id, { kind: 'button', action: b.action, ox: pt.x, oy: pt.y, x: pt.x, y: pt.y, pushed: true });
    return;
  }
  if (pt.x >= TOUCH_STICK.zoneX) return;     // an empty patch on the buttons' side: nothing there to press
  // The newest thumb on this side is the stick. An older contact that was still the stick is one the browser
  // never told us had lifted (or a second finger landing beside the first): it stops steering either way.
  if (stick) contacts.delete(idOf(stick));
  stick = { kind: 'stick', action: 'left', ox: pt.x, oy: pt.y, x: pt.x, y: pt.y, pushed: false };
  contacts.set(id, stick);
}
/** A contact moving: a button stays held wherever it goes; the stick follows it, dragging its centre past the ring. */
function contactMove(id: number, pt: { x: number; y: number }): void {
  const c = contacts.get(id);
  if (!c || c.kind !== 'stick') return;
  c.x = pt.x; c.y = pt.y;
  const dx = c.x - c.ox, dy = c.y - c.oy, d2 = dx * dx + dy * dy, r = TOUCH_STICK.radius;
  if (d2 > r * r) { const k = 1 - r / Math.sqrt(d2); c.ox += dx * k; c.oy += dy * k; }
  const m = stickMask(c);
  if (m) { c.pushed = true; pending |= m; }
}
/** A contact lifting, or being taken away by the browser: whatever it held, it holds no longer. */
function contactUp(id: number): void {
  const c = contacts.get(id);
  if (!c) return;
  contacts.delete(id);
  lastPlayed = c.pushed;
  if (c === stick) stick = null;
}
/** The pointer id a contact is filed under (the map is small: at most a hand's worth of fingers). */
function idOf(c: TouchContact): number { for (const [id, v] of contacts) if (v === c) return id; return NaN; }
/** Every real contact let go of at once: the window lost focus, the page was hidden, or a contact went stale. */
function dropReal(): void {
  for (const id of Array.from(contacts.keys())) if (id >= 0) contactUp(id);
}

// ---- the DOM ----------------------------------------------------------------------------------

function toGame(e: PointerEvent): { x: number; y: number } {
  if (!view) return { x: -1, y: -1 };
  return view.toInternal(e.clientX, e.clientY);
}
/** Touch and pen only: a mouse on a desktop has the keyboard next to it and must not press the overlay. */
function isTouch(e: PointerEvent): boolean { return e.pointerType === 'touch' || e.pointerType === 'pen'; }
/**
 * Is this event on the game - the canvas, or the bare page around it - rather than on something laid over it?
 * The portrait notice covers the whole screen, and a tap on it must not press GO in the game underneath.
 */
function onGame(e: Event): boolean {
  const t = e.target, el = view && view.canvas;
  return t === el || (typeof document !== 'undefined' && (t === document.body || t === document.documentElement));
}

function onPointerDown(e: PointerEvent): void {
  if (!isTouch(e)) return;
  seen = true;
  // A screen that is reading text wants the system keyboard, and iOS only opens one inside the gesture that
  // asked for it - so the tap that lands while a screen is typing is the tap that raises it.
  if (typing) focusField();
  if (!onGame(e)) return;
  // The first finger down when no other is touching (the definition of `isPrimary` for touch): anything still
  // held from before is a contact whose lift the browser swallowed, and it must not steer for ever.
  if (e.isPrimary) dropReal();
  contactDown(e.pointerId, toGame(e));
}
function onPointerMove(e: PointerEvent): void {
  if (!isTouch(e) || !contacts.has(e.pointerId)) return;
  contactMove(e.pointerId, toGame(e));
}
function onPointerUp(e: PointerEvent): void { contactUp(e.pointerId); }

/**
 * Attach to the page. Idempotent: a second call re-points at the new view rather than doubling the listeners.
 *
 * Nothing here preventDefaults a touchstart, which is what would stop a tap becoming a click: the title's Ko-fi
 * address is reached by a click and nothing else (engine/links.ts). What keeps the browser's own gestures off the
 * glass is `touch-action: none` on the page (index.html) - no pan, no pinch, no double-tap zoom - plus the two
 * belt-and-braces handlers below for the browsers that still try.
 */
export function attachTouch(v: Canvas): void {
  const first = !view;
  view = v;
  if (!first || !v || typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  // A long press is how most of the mini-games are played (HOLD GO), and on a phone a long press is also how a
  // context menu is asked for: refused while a finger is down, and only then, so a desktop's right click is untouched.
  document.addEventListener('contextmenu', (e) => { if (contacts.size) e.preventDefault(); });
  // iOS's own pinch event, which it raises for two thumbs that move apart however `touch-action` is set.
  document.addEventListener('gesturestart', (e) => { if (onGame(e)) e.preventDefault(); });
  if (typeof window !== 'undefined') window.addEventListener('blur', dropReal);
  document.addEventListener('visibilitychange', () => { if (document.hidden) dropReal(); });
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
  // opacity 0 under the thumb would eat the taps meant for the game. Selectable on purpose: the page around it is
  // not (index.html), and an older iOS will not type into a field that inherited that.
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;-webkit-user-select:text;user-select:text;';
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
 * Test hook (window.__game.touch): pretend fingers, in GAME space. Entry i of the list is finger i: one that was
 * not down before goes DOWN where it is, one that was down MOVES there, and a finger missing from the list LIFTS -
 * so `[{ x, y }]` then `[{ x: x + 20, y }]` is a thumb landing and dragging right, and `[]` lets go of everything.
 * They go through the same three edges a real thumb does. A list (even an empty one: a phone with nothing held)
 * also makes the overlay available, so a desktop test browser can drive it; null lets go and turns that off again.
 */
export function setTouchVirtual(list: { x: number; y: number }[] | null): void {
  const n = list ? list.length : 0;
  for (let i = 0; i < Math.max(n, virtualDown.length); i++) {
    const id = VIRTUAL_ID - i;
    if (i < n) {
      const pt = { x: list[i].x, y: list[i].y };
      if (virtualDown[i]) contactMove(id, pt); else contactDown(id, pt);
    } else if (virtualDown[i]) contactUp(id);
  }
  virtualDown = Array.from({ length: n }, () => true);
  virtualOn = !!list;
}
