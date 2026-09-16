// Keyboard + gamepad -> per-player action state with edge detection and an input buffer (docs/ARCHITECTURE.md
// section 3). Eight actions, so a player's whole input for one frame is one byte; packMask / unpackMask are
// the only place the bit layout lives, and net/protocol.js sends exactly that mask.
//
// Couch play: P1 on arrows/WASD + Z X C, P2 on T F G H + V B N (the same block shifted three columns right,
// exactly as the sibling game does it). Online, everyone is on the first block on their own keyboard, and
// net/session.js reads the local device through pollRaw() while injecting the peers' delayed masks with
// setVirtual() - so update() computes edges from whatever mask the seat actually holds.
import { INPUT_BUFFER, MAX_PLAYERS, LOCAL_PLAYERS } from '../constants.js';

/** All per-player actions, in bit order (bit i of a mask is ACTIONS[i]). Frozen: changing it is a wire break. */
export const ACTIONS = Object.freeze(['left', 'right', 'up', 'down', 'action', 'alt', 'cancel', 'start']);
const BIT = {}; ACTIONS.forEach((a, i) => { BIT[a] = 1 << i; });

/** Default keyboard bindings per couch slot (KeyboardEvent.code). */
export const KEYBOARD = [
  { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    action: ['KeyZ', 'Space'], alt: ['KeyX', 'ShiftLeft'], cancel: ['KeyC', 'Escape', 'Backspace'], start: ['Enter'] },
  { left: ['KeyF'], right: ['KeyH'], up: ['KeyT'], down: ['KeyG'], action: ['KeyV'], alt: ['KeyB'], cancel: ['KeyN'], start: ['Digit5'] },
];
/** Human labels for the hint lines. */
const KEY_LABELS = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP', ShiftLeft: 'SHIFT', Digit5: '5' };
/** Standard gamepad mapping: A action, B cancel, X alt, Start start, d-pad 12-15, left stick axes 0/1. */
const PAD = { action: [0], cancel: [1], alt: [2], start: [9], up: [12], down: [13], left: [14], right: [15] };
const STICK_DEAD = 0.45;

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
let virtualPads = null;

/** Pack an action map ({ left: true, action: true }) into a mask. */
export function packMask(a) { let m = 0; for (let i = 0; i < ACTIONS.length; i++) if (a && a[ACTIONS[i]]) m |= 1 << i; return m & 0xff; }
/** Unpack a mask into an action map (allocates; hot paths use the mask directly). */
export function unpackMask(m) { const a = {}; for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0; return a; }

function makePlayer() {
  return { cur: 0, prev: 0, pressedNow: 0, bufAge: new Int32Array(ACTIONS.length).fill(NEVER), virtual: -1, device: 'none', pad: -1, joined: false, joinNow: false, idleFrames: 0, ax: 0, ay: 0 };
}
const players = Array.from({ length: MAX_PLAYERS }, makePlayer);
players[0].joined = true;

function rebuildBoundCodes() {
  boundCodes = new Set();
  for (const map of KEYBOARD) for (const a of ACTIONS) for (const c of map[a] || []) boundCodes.add(c);
}
function onKeyDown(e) {
  if (!boundCodes) rebuildBoundCodes();
  if (boundCodes.has(e.code)) e.preventDefault();
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
/** Mask from one gamepad (buttons + left stick). */
function padMask(gp) {
  if (!gp) return 0;
  let m = 0;
  for (const a of ACTIONS) for (const b of PAD[a] || []) { const btn = gp.buttons && gp.buttons[b]; if (btn && (btn.pressed || btn.value > 0.5)) { m |= BIT[a]; break; } }
  const ax = gp.axes ? gp.axes[0] || 0 : 0, ay = gp.axes ? gp.axes[1] || 0 : 0;
  if (ax < -STICK_DEAD) m |= BIT.left; else if (ax > STICK_DEAD) m |= BIT.right;
  if (ay < -STICK_DEAD) m |= BIT.up; else if (ay > STICK_DEAD) m |= BIT.down;
  return m;
}
/** Mask of every pad not bound to a slot (slot 0 reads them all when nobody has claimed them). */
function unboundPadsMask() {
  let m = 0;
  const list = pads();
  for (let i = 0; i < list.length; i++) { if (!list[i]) continue; let bound = false; for (const p of players) if (p.pad === i) bound = true; if (!bound) m |= padMask(list[i]); }
  return m;
}
/** A pad whose button went down claims the lowest free couch seat. */
function claimPads() {
  const list = pads();
  for (let i = 0; i < list.length; i++) {
    const gp = list[i]; if (!gp) continue;
    let bound = false; for (const p of players) if (p.pad === i) bound = true;
    if (bound) continue;
    if (!padMask(gp)) continue;
    for (let s = 0; s < LOCAL_PLAYERS; s++) if (players[s].pad < 0 && (s === 0 ? players[s].device !== 'keyboard' : true)) { players[s].pad = i; players[s].joined = true; players[s].joinNow = true; break; }
  }
}

export const input = {
  ACTIONS, KEYBOARD, packMask, unpackMask,
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
    if (!boundCodes) rebuildBoundCodes();
    anyKeyThisStep = anyKeyPending; anyKeyPending = false;
    claimPads();
    const list = pads();
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      pl.prev = pl.cur;
      pl.joinNow = false;
      if (pl.virtual >= 0) { pl.cur = pl.virtual; pl.device = 'virtual'; }
      else {
        const map = KEYBOARD[p];
        const kb = map ? keyMask(map) : 0;
        const gp = pl.pad >= 0 ? padMask(list[pl.pad]) : (p === 0 ? unboundPadsMask() : 0);
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
  /** Netplay: the local devices of a slot as a mask, without touching the edge state machine. */
  pollRaw(p = 0) {
    if (!boundCodes) rebuildBoundCodes();
    const map = KEYBOARD[p]; const list = pads(); const pl = players[p];
    return ((map ? keyMask(map) : 0) | (pl.pad >= 0 ? padMask(list[pl.pad]) : 0) | unboundPadsMask()) & 0xff;
  },
  /** Couch seats: joined flags and the drop-in edge. */
  joined(p) { return players[p].joined; },
  joinPressed(p) { return players[p].joinNow; },
  setJoined(p, on) { players[p].joined = !!on; if (!on) { players[p].pad = -1; } },
  /** Reset pad claims (title screen). */
  resetClaims() { for (const p of players) p.pad = -1; for (let s = 1; s < players.length; s++) players[s].joined = false; },
  /** Last device that produced input for the seat ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(p) { return players[p].device; },
  idleFrames(p) { return players[p].idleFrames; },
  /** Test hook: feed fake gamepads shaped like navigator.getGamepads() entries. */
  setPadVirtual(list) { virtualPads = list; },
  /** Key label for hints ('Z', '←', 'ENTER'). */
  keyText(p, a) { const map = KEYBOARD[p] || KEYBOARD[0]; const c = (map[a] || [])[0] || ''; return KEY_LABELS[c] || c.replace(/^Key|^Digit/, ''); },
  get playerCount() { return players.length; },
  get localPlayers() { return LOCAL_PLAYERS; },
};
