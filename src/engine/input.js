// Keyboard + gamepad -> per-player action state with edge detection and an input buffer (docs/ARCHITECTURE.md
// section 3). Eight actions, so a player's whole input for one frame is one byte; packMask / unpackMask are
// the only place the bit layout lives, and net/protocol.js sends exactly that mask.
//
// Couch play seats FOUR (LOCAL_PLAYERS). The keyboard reaches the first two: P1 on arrows/WASD + Z X C, P2 on
// T F G H + V B N (the same block shifted three columns right, exactly as the sibling game does it). Seats 3 and
// 4 have no keys - there is no third nine-key block left on a keyboard worth playing on - so they are GAMEPAD
// seats, and a pad claims the lowest seat no keyboard is already driving on its first press. Four pads fill the
// truck; a pad and the two key blocks fill it just as well.
//
// Online, everyone is on the first block on their own keyboard, and net/session.js reads the local device through
// pollRaw() while injecting the peers' delayed masks with setVirtual() - so update() computes edges from whatever
// mask the seat actually holds. Pad CLAIMS are a couch-only idea and are switched off for the whole of an online
// session (setPadClaims), because every seat but one belongs to somebody on another machine: online, every pad in
// the room drives the local seat through pollRaw() whether it is claimed or not.
import { INPUT_BUFFER, MAX_PLAYERS, LOCAL_PLAYERS } from '../constants.js';
import { ACTIONS, BIT } from './actions.js';
import { keyboardMap, padMap, keyLabel, padLabel, bindingRevision, onBindingsChanged } from './bindings.js';

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
/** Couch-only: while this is off no pad takes a seat, and every pad falls through to slot 0 / pollRaw. */
let padClaims = true;
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
  return { cur: 0, prev: 0, pressedNow: 0, bufAge: new Int32Array(ACTIONS.length).fill(NEVER), virtual: -1, device: 'none', pad: -1, joined: false, joinNow: false, idleFrames: 0, ax: 0, ay: 0 };
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
/** Is pad `i` already sitting in a seat? */
function padBound(i) { for (const p of players) if (p.pad === i) return true; return false; }
/** Mask of every pad not bound to a slot (slot 0 reads them all when nobody has claimed them). */
function unboundPadsMask() {
  let m = 0;
  const list = pads();
  for (let i = 0; i < list.length; i++) { if (!list[i] || padBound(i)) continue; m |= padMask(list[i], i); }
  return m;
}
/** Mask of EVERY pad, claimed or not: what the local human is holding, which is what netplay sends. */
function allPadsMask() {
  let m = 0;
  const list = pads();
  for (let i = 0; i < list.length; i++) if (list[i]) m |= padMask(list[i], i);
  return m;
}
/**
 * Can a pad take couch seat `s`? Not one a keyboard block is already driving - the pad player would be sharing a
 * critter with the person next to them while a seat stood empty - and not one a net session is injecting.
 */
function seatFreeForPad(s) {
  const pl = players[s];
  return pl.pad < 0 && pl.virtual < 0 && pl.device !== 'keyboard';
}
/**
 * A pad whose button went down claims the LOWEST free couch seat. Lowest, not first-found: a run's party is a
 * dense array whose index is the input slot (game/run.js startRun), so a hole at seat 1 would hand seat 2's pad
 * somebody else's critter.
 */
function claimPads() {
  if (!padClaims) return;
  const list = pads();
  for (let i = 0; i < list.length; i++) {
    const gp = list[i]; if (!gp || padBound(i)) continue;
    if (!padMask(gp, i)) continue;
    for (let s = 0; s < LOCAL_PLAYERS; s++) if (seatFreeForPad(s)) { players[s].pad = i; players[s].joined = true; players[s].joinNow = true; break; }
  }
}

export const input = {
  ACTIONS, packMask, unpackMask,
  /** Attach DOM listeners; `canvasEl` is focused so keys go to the game. */
  init(canvasEl) {
    rebuildBoundCodes();
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
    typedStep = typed; typed = [];      // hand this step its own codes; the DOM keeps filling a fresh array
    freshBoundCodes();
    anyKeyThisStep = anyKeyPending; anyKeyPending = false;
    // While a rebind is being captured, the first key or button down is REPORTED rather than played, and nobody
    // takes a seat on it: the press that picks a binding belongs to the binding, not to the menu it was picked in.
    if (capturing) {
      if (!capturedCode) for (let i = 0; i < typedStep.length; i++) { capturedCode = typedStep[i]; break; }
      if (capturedPad < 0) capturedPad = firstPadPress();
    } else {
      claimPads();
    }
    const list = pads();
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      pl.prev = pl.cur;
      pl.joinNow = false;
      if (pl.virtual >= 0) { pl.cur = pl.virtual; pl.device = 'virtual'; }
      else if (capturing) { pl.cur = 0; }
      else {
        const map = keyboardMap(p);
        const kb = map ? keyMask(map) : 0;
        const gp = pl.pad >= 0 ? padMask(list[pl.pad], pl.pad) : (p === 0 ? unboundPadsMask() : 0);
        pl.cur = kb | gp;
        if (kb) pl.device = 'keyboard'; else if (gp) pl.device = 'gamepad';
        if (p > 0 && p < LOCAL_PLAYERS && kb && !pl.joined) { pl.joined = true; pl.joinNow = true; }
      }
      pl.pressedNow = pl.cur & ~pl.prev;
      for (let i = 0; i < ACTIONS.length; i++) pl.bufAge[i] = (pl.pressedNow & (1 << i)) ? 0 : Math.min(NEVER, pl.bufAge[i] + 1);
      pl.idleFrames = pl.cur ? 0 : pl.idleFrames + 1;
      pl.ax = ((pl.cur & BIT.right) ? 1 : 0) - ((pl.cur & BIT.left) ? 1 : 0);
      pl.ay = ((pl.cur & BIT.down) ? 1 : 0) - ((pl.cur & BIT.up) ? 1 : 0);
    }
    trackPadsRaw();
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
    return ((map ? keyMask(map) : 0) | allPadsMask()) & 0xff;
  },
  /** Couch seats: joined flags and the drop-in edge. */
  joined(p) { return players[p].joined; },
  joinPressed(p) { return players[p].joinNow; },
  setJoined(p, on) { players[p].joined = !!on; if (!on) { players[p].pad = -1; } },
  /** Reset pad claims (title screen, and the match boundary in net/roster.js). */
  resetClaims() { for (const p of players) p.pad = -1; for (let s = 1; s < players.length; s++) players[s].joined = false; },
  /**
   * Couch on/off. Claiming seats is a couch-only idea: online, seats 1..3 belong to other machines, so the lobby
   * switches this off and every pad in the room drives the local seat through pollRaw() instead.
   */
  setPadClaims(on) { padClaims = !!on; },
  /** Which pad drives a seat, or -1 for none (hints, tests). */
  padOf(p) { return players[p].pad; },
  /** Last device that produced input for the seat ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(p) { return players[p].device; },
  idleFrames(p) { return players[p].idleFrames; },
  /** Test hook: feed fake gamepads shaped like navigator.getGamepads() entries. */
  setPadVirtual(list) { virtualPads = list; },
  /** Key label for hints ('Z', '←', 'ENTER'), as the seat is bound RIGHT NOW - a rebind changes what hints say. */
  keyText(p, a) { const map = keyboardMap(p) || keyboardMap(0); return keyLabel((map[a] || [])[0] || ''); },
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
  get localPlayers() { return LOCAL_PLAYERS; },
};
