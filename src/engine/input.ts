// Keyboard + gamepad + touch -> per-player action state with edge detection and an input buffer
// (docs/ARCHITECTURE.md section 3). Eight actions, so a player's whole input for one frame is one byte; packMask /
// unpackMask are the only place the bit layout lives, and net/protocol.js sends exactly that mask.
//
// Couch play seats FOUR (LOCAL_PLAYERS). The keyboard reaches the first two: P1 on arrows/WASD + Z X C, P2 on
// T F G H + V B N (the same block shifted three columns right, exactly as the sibling game does it). Seats 3 and
// 4 have no keys - there is no third nine-key block left on a keyboard worth playing on - so they are GAMEPAD
// seats, and a pad claims the lowest seat no keyboard is already driving on its first press. Four pads fill the
// truck; a pad and the two key blocks fill it just as well.
//
// A PHONE reaches seat 0 and only seat 0, through the on-screen controls in engine/touch.js: four thumbs on one
// piece of glass is not couch play. Its mask is folded in beside the keyboard's and the pad's, so nothing
// downstream - edges, the buffer, the wire - can tell which of the three a press came from, and a player who
// picks up a pad mid-game simply has both. The one thing touch DOES change is what the hint lines say: while a
// thumb is the live device keyText() names the button on the glass, not a keycap nobody has.
//
// Online, everyone is on the first block on their own keyboard, and net/session.js reads the local device through
// pollRaw() while injecting the peers' delayed masks with setVirtual() - so update() computes edges from whatever
// mask the seat actually holds. Pad CLAIMS are a couch-only idea and are switched off for the whole of an online
// session (setPadClaims), because every seat but one belongs to somebody on another machine: online, every pad in
// the room drives the local seat through pollRaw() whether it is claimed or not.
import { INPUT_BUFFER, MAX_PLAYERS, LOCAL_PLAYERS } from '../constants.ts';
import { ACTIONS, BIT } from './actions.ts';
import { keyboardMap, padMap, keyLabel, padLabel, bindingRevision, onBindingsChanged } from './bindings.ts';
import { attachTouch, touchMask, touchTapped, touchVisible, suppressTouch, endTouchStep, drainSoftTyped, TOUCH_LABELS } from './touch.ts';
import { createPadSource, createPadSeats, DIR } from '../lib/input/pad.ts';

export { ACTIONS };

/** How far the left stick has to leave centre before it reads as a d-pad press. The stick is not bindable. */
const STICK_DEAD = 0.45;
/** Buttons a standard pad reports. Wider than what is bound, because a REBIND has to see the button first. */
const PAD_BUTTON_COUNT = 17;

/**
 * The pads themselves (lib/input/pad.js): polling, held and pressed button masks, the stick's four
 * directions, the swallow that keeps a just-bound button quiet, and the pad-to-seat table. The
 * library owns the device; which button is which ACTION is still this file's business, because the
 * eight-action byte mask is this game's wire format and no library is going to know about it.
 */
const padSource = createPadSource({ buttons: PAD_BUTTON_COUNT, deadzone: STICK_DEAD });
const padSeats = createPadSeats();

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
/** What the thumbs held for the step in progress: sampled once by update(), read again by the overlay's draw. */
let touchHeld = 0;
/**
 * REBINDING (game/screens/controls.js). While capturing, every seat is held at neutral and the first key or button
 * to go down is reported instead of being played: the press that picks a binding must not also drive the menu it
 * was picked in. Raw per-pad button state is tracked every step, capturing or not, so a button already held when
 * capture opens is not mistaken for a fresh press.
 */
let capturing = false, capturedCode = '', capturedPad = -1;

/** Pack an action map ({ left: true, action: true }) into a mask. */
export function packMask(a) { let m = 0; for (let i = 0; i < ACTIONS.length; i++) if (a && a[ACTIONS[i]]) m |= 1 << i; return m & 0xff; }
/** Unpack a mask into an action map (allocates; hot paths use the mask directly). */
export function unpackMask(m) { const a = {}; for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0; return a; }

function makePlayer() {
  return { cur: 0, prev: 0, pressedNow: 0, bufAge: new Int32Array(ACTIONS.length).fill(NEVER), virtual: -1, device: 'none', joined: false, joinNow: false, idleFrames: 0, ax: 0, ay: 0 };
}
const players = Array.from({ length: MAX_PLAYERS }, makePlayer);
players[0].joined = true;

/**
 * Every code any seat has bound, so onKeyDown knows which presses to take off the page (an arrow key that scrolls
 * the window is a player's move going somewhere else). Rebuilt whenever bindings.js says it has changed.
 */
function rebuildBoundCodes() {
  boundCodes = new Set();
  for (let s = 0; ; s++) { const map = keyboardMap(s); if (!map) break; for (const a of ACTIONS) for (const c of map[a] || []) boundCodes.add(c); }
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
/** The library's four direction bits, as this game's action bits. */
function stickBits(dirs) {
  return ((dirs & DIR.left) ? BIT.left : 0) | ((dirs & DIR.right) ? BIT.right : 0)
    | ((dirs & DIR.up) ? BIT.up : 0) | ((dirs & DIR.down) ? BIT.down : 0);
}
/** Which actions a held-button bitfield means, under the pad table every controller shares. */
function actionBits(raw) {
  const map = padMap();
  let m = 0;
  for (const a of ACTIONS) { const list = map[a]; if (!list) continue; for (let k = 0; k < list.length; k++) if (raw & (1 << list[k])) { m |= BIT[a]; break; } }
  return m;
}
/**
 * Mask from one polled gamepad: its bound buttons, plus the left stick, which is wired to the four directions and
 * is not bindable - a stick that could be mapped onto CANCEL is a player walking out of a mini-game by leaning
 * left. Swallowed buttons are already out of `activeMask`, which is what lets a just-bound button stay quiet
 * until it is released.
 */
function padMask(idx) {
  return actionBits(padSource.activeMask(idx)) | stickBits(padSource.dirMask(idx));
}
/** The same, read LIVE rather than from the step's poll: pollRaw only (see there). */
function livePadMask(list, idx) {
  const gp = list[idx];
  if (!gp) return 0;
  return actionBits(padSource.maskOf(gp) & ~padSource.swallowedMask(idx)) | stickBits(padSource.dirMaskOf(gp));
}
/** Mask of every pad not sitting in a seat (slot 0 reads them all when nobody has claimed them). */
function unboundPadsMask() {
  let m = 0;
  for (let i = 0; i < padSource.count(); i++) { if (!padSource.pad(i) || padSeats.seatOf(i) >= 0) continue; m |= padMask(i); }
  return m;
}
/**
 * Mask of EVERY pad, claimed or not: what the local human is holding, which is what netplay sends. Read live,
 * because net/session.js samples it in beforeStep() - before update() has polled for this step.
 */
function allPadsMask() {
  const list = padSource.readPads();
  let m = 0;
  for (let i = 0; i < list.length; i++) m |= livePadMask(list, i);
  return m;
}
/**
 * Can a pad take couch seat `s`? Not one a keyboard block is already driving - the pad player would be sharing a
 * critter with the person next to them while a seat stood empty - and not one a net session is injecting. (That
 * the seat has no pad already is the library's own rule, so it is not repeated here.)
 */
function seatFreeForPad(s) {
  const pl = players[s];
  return pl.virtual < 0 && pl.device !== 'keyboard';
}
/**
 * A pad showing any action claims the LOWEST free couch seat. Lowest, not first-found: a run's party is a dense
 * array whose index is the input slot (game/run.js startRun), so a hole at seat 1 would hand seat 2's pad
 * somebody else's critter. The table and the "lowest free" rule are the library's (lib/input/pad.js); which
 * seats this game will give away is the callback.
 */
function claimPads() {
  for (let i = 0; i < padSource.count(); i++) {
    if (!padSource.pad(i) || padSeats.seatOf(i) >= 0 || !padMask(i)) continue;
    const s = padSeats.claim(i, LOCAL_PLAYERS, seatFreeForPad);
    if (s >= 0) { players[s].joined = true; players[s].joinNow = true; }
  }
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
    // One device read a step, before anything else looks at a pad: this is what turns "held now" into "held last
    // step", so the button edges below and the capture above are the same two samples.
    padSource.poll();
    // A pad that has been unplugged gives its seat back. The seat itself stays joined - a critter mid-run does
    // not vanish because a controller rolled under the sofa - and the same pad plugged back in claims by the
    // usual rule, which may well be a different seat.
    padSeats.dropDisconnected(padSource);
    // While a rebind is being captured, the first key or button down is REPORTED rather than played, and nobody
    // takes a seat on it: the press that picks a binding belongs to the binding, not to the menu it was picked in.
    if (capturing) {
      if (!capturedCode) for (let i = 0; i < typedStep.length; i++) { capturedCode = typedStep[i]; break; }
      if (capturedPad < 0) capturedPad = padSource.captureButton();
    } else {
      claimPads();
    }
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      pl.prev = pl.cur;
      pl.joinNow = false;
      if (pl.virtual >= 0) { pl.cur = pl.virtual; pl.device = 'virtual'; }
      else if (capturing) { pl.cur = 0; }
      else {
        const map = keyboardMap(p);
        const kb = map ? keyMask(map) : 0;
        const own = padSeats.padOf(p);
        const gp = own >= 0 ? padMask(own) : (p === 0 ? unboundPadsMask() : 0);
        const tc = p === 0 ? touchHeld : 0;
        pl.cur = kb | gp | tc;
        // Keys and a pad both stand the overlay down until the next touch: a phone with a controller paired to it
        // should not keep a d-pad drawn over the scene that the player has stopped pressing.
        if (kb || gp) suppressTouch(true);
        if (kb) pl.device = 'keyboard'; else if (gp) pl.device = 'gamepad'; else if (tc) pl.device = 'touch';
        if (p > 0 && p < LOCAL_PLAYERS && kb && !pl.joined) { pl.joined = true; pl.joinNow = true; }
      }
      pl.pressedNow = pl.cur & ~pl.prev;
      for (let i = 0; i < ACTIONS.length; i++) pl.bufAge[i] = (pl.pressedNow & (1 << i)) ? 0 : Math.min(NEVER, pl.bufAge[i] + 1);
      pl.idleFrames = pl.cur ? 0 : pl.idleFrames + 1;
      pl.ax = ((pl.cur & BIT.right) ? 1 : 0) - ((pl.cur & BIT.left) ? 1 : 0);
      pl.ay = ((pl.cur & BIT.down) ? 1 : 0) - ((pl.cur & BIT.up) ? 1 : 0);
    }
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
   * Netplay: the local devices of a slot as a mask, without touching the edge state machine. EVERY pad counts,
   * claimed or not - online there is one human at this keyboard and whatever they picked up is theirs, and a
   * claim left over from the couch must not quietly stop their pad reaching the wire.
   */
  pollRaw(p = 0) {
    freshBoundCodes();
    const map = keyboardMap(p);
    return ((map ? keyMask(map) : 0) | allPadsMask() | touchMask()) & 0xff;
  },
  /** Couch seats: joined flags and the drop-in edge. */
  joined(p) { return players[p].joined; },
  joinPressed(p) { return players[p].joinNow; },
  setJoined(p, on) { players[p].joined = !!on; if (!on) { const own = padSeats.padOf(p); if (own >= 0) padSeats.release(own); } },
  /** Reset pad claims (title screen, and the match boundary in net/roster.js). */
  resetClaims() { padSeats.releaseAll(); for (let s = 1; s < players.length; s++) players[s].joined = false; },
  /**
   * Couch on/off. Claiming seats is a couch-only idea: online, seats 1..3 belong to other machines, so the lobby
   * switches this off and every pad in the room drives the local seat through pollRaw() instead.
   */
  setPadClaims(on) { padSeats.setClaiming(!!on); },
  /** Which pad drives a seat, or -1 for none (hints, tests). */
  padOf(p) { return padSeats.padOf(p); },
  /** Last device that produced input for the seat ('keyboard' | 'gamepad' | 'touch' | 'virtual' | 'none'). */
  device(p) { return players[p].device; },
  /** Are the on-screen controls up? game/touchpad.js draws them, and a screen may move a hint out from under them. */
  touchOn() { return touchVisible(); },
  /** What the thumbs held this step, for the overlay's own pressed/unpressed faces. */
  touchMask() { return touchHeld; },
  idleFrames(p) { return players[p].idleFrames; },
  /** Test hook: feed fake gamepads shaped like navigator.getGamepads() entries. */
  setPadVirtual(list) { padSource.setPads(list); },
  /**
   * Key label for hints ('Z', '←', 'ENTER'), as the seat is bound RIGHT NOW - a rebind changes what hints say.
   * On a phone there is no key to name, so the button on the glass answers instead ('GO', 'BACK'): the hint lines
   * screens build in enter() then read as instructions rather than as a keyboard nobody in the room has.
   */
  keyText(p, a) {
    if (touchVisible() && TOUCH_LABELS[a]) return TOUCH_LABELS[a];
    const map = keyboardMap(p) || keyboardMap(0);
    return keyLabel((map[a] || [])[0] || '');
  },
  /**
   * The button an action sits on ('A', 'RT', 'D-UP'). A screen builds BOTH lines in enter() and picks one in
   * draw() by device(p): seats 3 and 4 have no keyboard block, so keyText would hand them somebody else's keys.
   */
  padText(a) { return padLabel((padMap()[a] || [])[0]); },
  /**
   * REBINDING, for game/screens/controls.js. Between capture() and endCapture() every seat reads neutral and the
   * first key or button pressed is held here instead. The pad button is swallowed until it is released, so the
   * press that bound it cannot immediately fire as whatever it now means.
   */
  capture() { capturing = true; capturedCode = ''; capturedPad = -1; padSource.beginCapture(); },
  /** The key code captured so far, or ''. */
  capturedKey() { return capturedCode; },
  /** The pad button captured so far, or -1. */
  capturedButton() { return capturedPad; },
  /** True between capture() and endCapture(). */
  capturing() { return capturing; },
  /** Stop capturing. A captured key is forgotten as held, so it does not read as a fresh press on the next step. */
  endCapture() {
    capturing = false;
    padSource.endCapture();
    if (capturedCode) keysDown.delete(capturedCode);
    capturedCode = ''; capturedPad = -1;
  },
  get playerCount() { return players.length; },
  get localPlayers() { return LOCAL_PLAYERS; },
};
