// Keyboard + gamepad + touch -> per-player action state with edge detection and an input buffer
// (docs/ARCHITECTURE.md section 3). Eight actions, so a player's whole input for one frame is one byte; packMask /
// unpackMask are the only place the bit layout lives, and net/protocol.js sends exactly that mask.
//
// ONE PLAYER PER MACHINE. Seat 0 is the person at this screen, and every device they have reaches it: the keys
// (arrows/WASD + Z X C Enter, engine/bindings.js), ANY gamepad - whichever one they pick up, however many are
// plugged in - and the on-screen controls a phone draws (engine/touch.js). The three are folded into one mask, so
// nothing downstream - edges, the buffer, the wire - can tell which of them a press came from, and a player who
// picks up a pad mid-game simply has both. The one thing the device DOES change is what the hint lines say: while
// a thumb is the live device keyText() names the button on the glass, not a keycap nobody has.
//
// There is no couch. Local co-op - a second keyboard block, pads claiming seats of their own - went in favour of
// online co-op, where a second player brings their own machine. Seats 1..3 still exist because an online room
// seats four (MAX_PLAYERS): net/session.js reads this machine's devices through pollRaw() and injects every seat's
// delayed mask with setVirtual(), so update() computes edges from whatever mask a seat actually holds - and a seat
// nobody is injecting holds nothing at all.
import { INPUT_BUFFER, MAX_PLAYERS } from '../constants.ts';
import { ACTIONS, BIT } from './actions.ts';
import { keyboardMap, padMap, keyLabel, padLabel, bindingRevision, onBindingsChanged } from './bindings.ts';
import { attachTouch, touchMask, touchTapped, touchVisible, suppressTouch, endTouchStep, drainSoftTyped, TOUCH_LABELS } from './touch.ts';

export { ACTIONS };

/** How far the left stick has to leave centre before it reads as a d-pad press. The stick is not bindable. */
const STICK_DEAD = 0.45;
/** Buttons a standard pad reports. Wider than what is bound, because a REBIND has to see the button first. */
const PAD_BUTTON_COUNT = 17;

const NEVER = 1e9;
const keysDown = new Set();
/** Codes that went down since the last update(), still being collected from DOM events. */
let typed = [];
/**
 * The codes THIS fixed step owns. update() runs before every screen's update() (see main.js), so a screen asked
 * for typedCodes() during its own update() must still see what was typed for this step, not an emptied array.
 */
let typedStep = [];
let anyKeyPending = false, anyKeyThisStep = false;
let boundCodes = null;
let boundRev = -1;
let virtualPads = null;
/** What the thumbs held for the step in progress: sampled once by update(), read again by the overlay's draw. */
let touchHeld = 0;
/**
 * REBINDING (game/screens/controls.js). While capturing, every seat is held at neutral and the first key or button
 * to go down is reported instead of being played: the press that picks a binding must not also drive the menu it
 * was picked in. Raw per-pad button state is tracked every step, capturing or not, so a button already held when
 * capture opens is not mistaken for a fresh press.
 */
let capturing = false, capturedCode = '', capturedPad = -1;
const padRawPrev = [];
/**
 * Buttons to ignore until they are let go, one raw mask per pad. A bind lands while the button is still down; on
 * the next step that held button would read as a brand new press of whatever it now means, and a player who bound
 * CANCEL would be thrown off the screen by the very press that bound it.
 */
const padSwallow = [];

/** Pack an action map ({ left: true, action: true }) into a mask. */
export function packMask(a) { let m = 0; for (let i = 0; i < ACTIONS.length; i++) if (a && a[ACTIONS[i]]) m |= 1 << i; return m & 0xff; }
/** Unpack a mask into an action map (allocates; hot paths use the mask directly). */
export function unpackMask(m) { const a = {}; for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0; return a; }

function makePlayer() {
  return { cur: 0, prev: 0, pressedNow: 0, bufAge: new Int32Array(ACTIONS.length).fill(NEVER), virtual: -1, device: 'none', joined: false, idleFrames: 0, ax: 0, ay: 0 };
}
const players = Array.from({ length: MAX_PLAYERS }, makePlayer);
players[0].joined = true;

/**
 * Every code that is bound, so onKeyDown knows which presses to take off the page (an arrow key that scrolls the
 * window is a player's move going somewhere else). Rebuilt whenever bindings.js says it has changed.
 */
function rebuildBoundCodes() {
  boundCodes = new Set();
  const map = keyboardMap();
  for (const a of ACTIONS) for (const c of map[a] || []) boundCodes.add(c);
  boundRev = bindingRevision();
}
function freshBoundCodes() { if (!boundCodes || boundRev !== bindingRevision()) rebuildBoundCodes(); return boundCodes; }
onBindingsChanged(() => { boundCodes = null; });
function onKeyDown(e) {
  if (freshBoundCodes().has(e.code) || capturing) e.preventDefault();
  if (e.repeat) return;
  keysDown.add(e.code);
  typed.push(e.code);
  anyKeyPending = true;
}
function onKeyUp(e) { keysDown.delete(e.code); }
function onBlur() { keysDown.clear(); }

function keyMask(map) {
  let m = 0;
  for (let i = 0; i < ACTIONS.length; i++) { const codes = map[ACTIONS[i]]; if (codes) for (let k = 0; k < codes.length; k++) if (keysDown.has(codes[k])) { m |= 1 << i; break; } }
  return m;
}
function pads() {
  if (virtualPads) return virtualPads;
  try { return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; } catch { return []; }
}
/** Which of the 17 standard buttons a pad is holding, as a bitfield. Triggers count past half pull. */
function rawPadMask(gp) {
  if (!gp || !gp.buttons) return 0;
  let m = 0;
  for (let i = 0; i < PAD_BUTTON_COUNT; i++) { const b = gp.buttons[i]; if (b && (b.pressed || b.value > 0.5)) m |= 1 << i; }
  return m;
}
/**
 * Mask from one gamepad: its bound buttons, plus the left stick, which is wired to the four directions and is not
 * bindable - a stick that could be mapped onto CANCEL is a player walking out of a mini-game by leaning left.
 * `idx` is the pad's index, and is what lets a just-bound button stay swallowed until it is released.
 */
function padMask(gp, idx = -1) {
  if (!gp) return 0;
  const raw = rawPadMask(gp) & ~(idx >= 0 ? padSwallow[idx] | 0 : 0);
  const map = padMap();
  let m = 0;
  for (const a of ACTIONS) { const list = map[a]; if (!list) continue; for (let k = 0; k < list.length; k++) if (raw & (1 << list[k])) { m |= BIT[a]; break; } }
  const ax = gp.axes ? gp.axes[0] || 0 : 0, ay = gp.axes ? gp.axes[1] || 0 : 0;
  if (ax < -STICK_DEAD) m |= BIT.left; else if (ax > STICK_DEAD) m |= BIT.right;
  if (ay < -STICK_DEAD) m |= BIT.up; else if (ay > STICK_DEAD) m |= BIT.down;
  return m;
}
/**
 * Raw button bookkeeping, every step whether capturing or not: what each pad holds now (so the NEXT step can tell
 * a fresh press from a held one) and which swallowed buttons have finally been let go.
 */
function trackPadsRaw() {
  const list = pads();
  for (let i = 0; i < list.length; i++) {
    const raw = list[i] ? rawPadMask(list[i]) : 0;
    if (padSwallow[i]) padSwallow[i] &= raw;
    padRawPrev[i] = raw;
  }
}
/** The lowest button that went down on any pad since the last step, or -1. */
function firstPadPress() {
  const list = pads();
  for (let i = 0; i < list.length; i++) {
    const down = (list[i] ? rawPadMask(list[i]) : 0) & ~(padRawPrev[i] | 0);
    if (!down) continue;
    for (let b = 0; b < PAD_BUTTON_COUNT; b++) if (down & (1 << b)) { padSwallow[i] = (padSwallow[i] | 0) | (1 << b); return b; }
  }
  return -1;
}
/**
 * Mask of EVERY pad at once: what the one player here is holding, whichever controller it is in. A pad sits in no
 * seat of its own - there is one player per machine - so two plugged in are two ways of pressing the same buttons.
 */
function allPadsMask() {
  let m = 0;
  const list = pads();
  for (let i = 0; i < list.length; i++) if (list[i]) m |= padMask(list[i], i);
  return m;
}

export const input = {
  ACTIONS, packMask, unpackMask,
  /**
   * Attach DOM listeners; `canvasEl` is focused so keys go to the game. `view` is the canvas api (lib/engine/canvas.js)
   * and is what the touch layer measures a contact against - without it there are simply no on-screen controls.
   */
  init(canvasEl, view = null) {
    rebuildBoundCodes();
    if (view) attachTouch(view);
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
    if (canvasEl && canvasEl.focus) {
      canvasEl.addEventListener('pointerdown', () => canvasEl.focus());
      try { canvasEl.focus(); } catch { /* ignore */ }
    }
  },
  /** Poll devices once per fixed step; ages buffers; computes edges. */
  update() {
    // Hand this step its own codes; the DOM keeps filling a fresh array. A phone's keyboard is an off-screen
    // field rather than the window (engine/touch.js), so what it spelled joins the stream here and nowhere else.
    const soft = drainSoftTyped();
    typedStep = soft.length ? typed.concat(soft) : typed;
    typed = [];
    freshBoundCodes();
    touchHeld = touchMask();
    anyKeyThisStep = anyKeyPending || touchTapped(); anyKeyPending = false;
    // While a rebind is being captured, the first key or button down is REPORTED rather than played: the press
    // that picks a binding belongs to the binding, not to the menu it was picked in.
    if (capturing) {
      if (!capturedCode) for (let i = 0; i < typedStep.length; i++) { capturedCode = typedStep[i]; break; }
      if (capturedPad < 0) capturedPad = firstPadPress();
    }
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      pl.prev = pl.cur;
      if (pl.virtual >= 0) { pl.cur = pl.virtual; pl.device = 'virtual'; }
      // Seats 1..3 are other people's, online, and hold only what the session injects; nothing here drives them.
      else if (capturing || p > 0) { pl.cur = 0; }
      else {
        const kb = keyMask(keyboardMap());
        const gp = allPadsMask();
        const tc = touchHeld;
        pl.cur = kb | gp | tc;
        // Keys and a pad both stand the overlay down until the next touch: a phone with a controller paired to it
        // should not keep a stick drawn over the scene that the player has stopped pressing.
        if (kb || gp) suppressTouch(true);
        if (kb) pl.device = 'keyboard'; else if (gp) pl.device = 'gamepad'; else if (tc) pl.device = 'touch';
      }
      pl.pressedNow = pl.cur & ~pl.prev;
      for (let i = 0; i < ACTIONS.length; i++) pl.bufAge[i] = (pl.pressedNow & (1 << i)) ? 0 : Math.min(NEVER, pl.bufAge[i] + 1);
      pl.idleFrames = pl.cur ? 0 : pl.idleFrames + 1;
      pl.ax = ((pl.cur & BIT.right) ? 1 : 0) - ((pl.cur & BIT.left) ? 1 : 0);
      pl.ay = ((pl.cur & BIT.down) ? 1 : 0) - ((pl.cur & BIT.up) ? 1 : 0);
    }
    trackPadsRaw();
    // The short tap has been served: a press that went down and came back up inside this one step was still
    // played, and must not be played again on the next.
    endTouchStep();
  },
  /** The mask a seat holds this step. */
  mask(p) { return players[p].cur; },
  /** Held this step. */
  held(p, a) { return (players[p].cur & BIT[a]) !== 0; },
  /** Went down this step. */
  pressed(p, a) { return (players[p].pressedNow & BIT[a]) !== 0; },
  /** Pressed within the last `window` steps (input buffer); consume() forgets it. */
  buffered(p, a, window = INPUT_BUFFER) { return players[p].bufAge[ACTIONS.indexOf(a)] < window; },
  consume(p, a) { players[p].bufAge[ACTIONS.indexOf(a)] = NEVER; },
  /** Digital stick as -1..1 per axis. */
  axisX(p) { return players[p].ax; },
  axisY(p) { return players[p].ay; },
  /** Any key went down this step (title prompt). */
  anyKey() { return anyKeyThisStep; },
  /** Any player pressed `a` this step; returns the slot or -1. */
  anyPressed(a) { for (let p = 0; p < players.length; p++) if (players[p].joined && (players[p].pressedNow & BIT[a])) return p; return -1; },
  /** KeyboardEvent.code values typed for the step in progress (text entry: room codes). Stable for the whole step. */
  typedCodes() { return typedStep; },
  /** Test / netplay hook: hold a seat's input at `mask` (a number or an action map) until cleared. */
  setVirtual(p, mask) { players[p].virtual = mask == null ? -1 : (typeof mask === 'number' ? mask & 0xff : packMask(mask)); },
  clearVirtual(p) { players[p].virtual = -1; },
  /**
   * Netplay: this machine's devices as a mask - the keys, every pad and the thumbs - without touching the edge state
   * machine. Whatever seat this machine holds in the room, this is what goes on the wire for it (net/session.js),
   * so `p` is accepted and changes nothing: there is one player here, and these are their hands.
   */
  pollRaw(p = 0) {
    freshBoundCodes();
    return (keyMask(keyboardMap()) | allPadsMask() | touchMask()) & 0xff;
  },
  /**
   * Is a seat in the room? Seat 0 always; the others while an online match has them (net/roster.js resetSeats).
   * `anyPressed` - every shared menu's CONFIRM - listens to the joined seats and no others.
   */
  joined(p) { return players[p].joined; },
  setJoined(p, on) { players[p].joined = !!on; },
  /** Every seat but this machine's own out of the room (the title screen: whatever a match left behind is over). */
  resetJoins() { for (let s = 1; s < players.length; s++) players[s].joined = false; },
  /** Last device that produced input for the seat ('keyboard' | 'gamepad' | 'touch' | 'virtual' | 'none'). */
  device(p) { return players[p].device; },
  /** Are the on-screen controls up? game/touchpad.js draws them, and a screen may move a hint out from under them. */
  touchOn() { return touchVisible(); },
  /** What the thumbs held this step, for the overlay's own pressed/unpressed faces. */
  touchMask() { return touchHeld; },
  idleFrames(p) { return players[p].idleFrames; },
  /** Test hook: feed fake gamepads shaped like navigator.getGamepads() entries. */
  setPadVirtual(list) { virtualPads = list; },
  /**
   * Key label for hints ('Z', '←', 'ENTER'), as the keys are bound RIGHT NOW - a rebind changes what hints say.
   * On a phone there is no key to name, so the button on the glass answers instead ('GO', 'X'): the hint lines
   * screens build in enter() then read as instructions rather than as a keyboard nobody in the room has. `p` is
   * the seat, for a call that reads like every other per-seat one; online every seat plays on the keys of the
   * machine it is sitting at, so the answer is this machine's whichever seat asks.
   */
  keyText(p, a) {
    if (touchVisible() && TOUCH_LABELS[a]) return TOUCH_LABELS[a];
    return keyLabel((keyboardMap()[a] || [])[0] || '');
  },
  /**
   * The button an action sits on ('A', 'RT', 'D-UP'). A screen builds BOTH lines in enter() and picks one in
   * draw() by device(p), so a player on a pad is told A and B rather than Z and C.
   */
  padText(a) { return padLabel((padMap()[a] || [])[0]); },
  /**
   * REBINDING, for game/screens/controls.js. Between capture() and endCapture() every seat reads neutral and the
   * first key or button pressed is held here instead. The pad button is swallowed until it is released, so the
   * press that bound it cannot immediately fire as whatever it now means.
   */
  capture() { capturing = true; capturedCode = ''; capturedPad = -1; },
  /** The key code captured so far, or ''. */
  capturedKey() { return capturedCode; },
  /** The pad button captured so far, or -1. */
  capturedButton() { return capturedPad; },
  /** True between capture() and endCapture(). */
  capturing() { return capturing; },
  /** Stop capturing. A captured key is forgotten as held, so it does not read as a fresh press on the next step. */
  endCapture() {
    capturing = false;
    if (capturedCode) keysDown.delete(capturedCode);
    capturedCode = ''; capturedPad = -1;
  },
  get playerCount() { return players.length; },
};
