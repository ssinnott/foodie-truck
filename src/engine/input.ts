// Keyboard + gamepad -> per-player action state with edge detection and an input buffer (docs/ARCHITECTURE.md
// section 3). Eight actions, so a player's whole input for one frame is one byte; packMask / unpackMask are
// the only place the bit layout lives, and net/protocol.js sends exactly that mask.
//
// Couch play: P1 on arrows/WASD + Z X C, P2 on T F G H + V B N (the same block shifted three columns right,
// exactly as the sibling game does it). Online, everyone is on the first block on their own keyboard, and
// net/session.js reads the local device through pollRaw() while injecting the peers' delayed masks with
// setVirtual() - so update() computes edges from whatever mask the seat actually holds.
import { INPUT_BUFFER, MAX_PLAYERS, LOCAL_PLAYERS } from '../constants.ts';

/** One action: a member of ACTIONS, a key of a keyboard binding, and a key of an action map. */
export type Action = 'left' | 'right' | 'up' | 'down' | 'action' | 'alt' | 'cancel' | 'start';

/** What a seat's input was read from last ('none' until it has produced any). */
export type Device = 'none' | 'keyboard' | 'gamepad' | 'virtual';

/** One couch slot's keyboard binding: every action to the KeyboardEvent.code values that fire it. */
export type KeyMap = Record<Action, string[]>;

/** Which actions are on, as packMask takes it and unpackMask returns it. Absent key = off. */
export type ActionMap = Partial<Record<Action, boolean>>;

/** The part of a gamepad button `padMask` reads. */
export interface PadButtonLike {
  pressed?: boolean;
  value?: number;
}

/**
 * A gamepad as this module reads it: a real navigator.getGamepads() entry, or one of the literals a test feeds
 * setPadVirtual(). The two fields below are every part of a pad `padMask` touches.
 */
export interface PadLike {
  buttons?: readonly PadButtonLike[];
  axes?: readonly number[];
}

/** All per-player actions, in bit order (bit i of a mask is ACTIONS[i]). Frozen: changing it is a wire break. */
export const ACTIONS: readonly Action[] = Object.freeze(['left', 'right', 'up', 'down', 'action', 'alt', 'cancel', 'start']);
/** Action -> its bit, filled from ACTIONS' order on the next line (`BIT.left === 1`). */
const BIT = {} as Record<Action, number>; ACTIONS.forEach((a, i) => { BIT[a] = 1 << i; });

/** Default keyboard bindings per couch slot (KeyboardEvent.code). */
export const KEYBOARD: KeyMap[] = [
  { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    action: ['KeyZ', 'Space'], alt: ['KeyX', 'ShiftLeft'], cancel: ['KeyC', 'Escape', 'Backspace'], start: ['Enter'] },
  { left: ['KeyF'], right: ['KeyH'], up: ['KeyT'], down: ['KeyG'], action: ['KeyV'], alt: ['KeyB'], cancel: ['KeyN'], start: ['Digit5'] },
];
/** Human labels for the hint lines. */
const KEY_LABELS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP', ShiftLeft: 'SHIFT', Digit5: '5' };
/** Standard gamepad mapping: A action, B cancel, X alt, Start start, d-pad 12-15, left stick axes 0/1. */
const PAD: Record<Action, number[]> = { action: [0], cancel: [1], alt: [2], start: [9], up: [12], down: [13], left: [14], right: [15] };
const STICK_DEAD = 0.45;

const NEVER = 1e9;
const keysDown = new Set<string>();
/** Codes that went down since the last update(), still being collected from DOM events. */
let typed: string[] = [];
/**
 * The codes THIS fixed step owns. update() runs before every screen's update() (see main.js), so a screen asked
 * for typedCodes() during its own update() must still see what was typed for this step, not an emptied array.
 */
let typedStep: string[] = [];
let anyKeyPending = false, anyKeyThisStep = false;
let boundCodes: Set<string> | null = null;
let virtualPads: PadLike[] | null = null;

/** Pack an action map ({ left: true, action: true }) into a mask. */
export function packMask(a: ActionMap): number { let m = 0; for (let i = 0; i < ACTIONS.length; i++) if (a && a[ACTIONS[i]]) m |= 1 << i; return m & 0xff; }
/** Unpack a mask into an action map (allocates; hot paths use the mask directly). */
export function unpackMask(m: number): ActionMap { const a: ActionMap = {}; for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0; return a; }

/** One seat's live input state: the masks update() computes, and the couch bookkeeping around them. */
export interface Player {
  /** The mask the seat holds this step. */
  cur: number;
  /** The mask it held last step; the edge between the two is `pressedNow`. */
  prev: number;
  /** The actions that went down this step. */
  pressedNow: number;
  /** Steps since each action was last pressed, in ACTIONS order (NEVER = not within memory). */
  bufAge: Int32Array;
  /** The mask netplay / a test holds the seat at, or -1 when it reads its own devices. */
  virtual: number;
  /** What last drove the seat. */
  device: Device;
  /** Index into pads() of the pad that claimed the seat, or -1. */
  pad: number;
  joined: boolean;
  /** True for the one step the seat dropped in on. */
  joinNow: boolean;
  /** Steps the seat has held nothing. */
  idleFrames: number;
  /** Digital stick, -1..1 per axis. */
  ax: number;
  ay: number;
}

function makePlayer(): Player {
  return { cur: 0, prev: 0, pressedNow: 0, bufAge: new Int32Array(ACTIONS.length).fill(NEVER), virtual: -1, device: 'none', pad: -1, joined: false, joinNow: false, idleFrames: 0, ax: 0, ay: 0 };
}
const players = Array.from({ length: MAX_PLAYERS }, makePlayer);
players[0].joined = true;

function rebuildBoundCodes(): void {
  boundCodes = new Set<string>();
  for (const map of KEYBOARD) for (const a of ACTIONS) for (const c of map[a] || []) boundCodes.add(c);
}
function onKeyDown(e: KeyboardEvent): void {
  if (!boundCodes) rebuildBoundCodes();
  if (boundCodes.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keysDown.add(e.code);
  typed.push(e.code);
  anyKeyPending = true;
}
function onKeyUp(e: KeyboardEvent): void { keysDown.delete(e.code); }
function onBlur(): void { keysDown.clear(); }

function keyMask(map: KeyMap): number {
  let m = 0;
  for (let i = 0; i < ACTIONS.length; i++) { const codes = map[ACTIONS[i]]; if (codes) for (let k = 0; k < codes.length; k++) if (keysDown.has(codes[k])) { m |= 1 << i; break; } }
  return m;
}
function pads(): PadLike[] {
  if (virtualPads) return virtualPads;
  try { return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; } catch { return []; }
}
/** Mask from one gamepad (buttons + left stick). */
function padMask(gp: PadLike | null): number {
  if (!gp) return 0;
  let m = 0;
  for (const a of ACTIONS) for (const b of PAD[a] || []) { const btn = gp.buttons && gp.buttons[b]; if (btn && (btn.pressed || btn.value > 0.5)) { m |= BIT[a]; break; } }
  const ax = gp.axes ? gp.axes[0] || 0 : 0, ay = gp.axes ? gp.axes[1] || 0 : 0;
  if (ax < -STICK_DEAD) m |= BIT.left; else if (ax > STICK_DEAD) m |= BIT.right;
  if (ay < -STICK_DEAD) m |= BIT.up; else if (ay > STICK_DEAD) m |= BIT.down;
  return m;
}
/** Mask of every pad not bound to a slot (slot 0 reads them all when nobody has claimed them). */
function unboundPadsMask(): number {
  let m = 0;
  const list = pads();
  for (let i = 0; i < list.length; i++) { if (!list[i]) continue; let bound = false; for (const p of players) if (p.pad === i) bound = true; if (!bound) m |= padMask(list[i]); }
  return m;
}
/** A pad whose button went down claims the lowest free couch seat. */
function claimPads(): void {
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
  init(canvasEl: HTMLCanvasElement): void {
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
  update(): void {
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
  mask(p: number): number { return players[p].cur; },
  /** Held this step. */
  held(p: number, a: Action): boolean { return (players[p].cur & BIT[a]) !== 0; },
  /** Went down this step. */
  pressed(p: number, a: Action): boolean { return (players[p].pressedNow & BIT[a]) !== 0; },
  /** Pressed within the last `window` steps (input buffer); consume() forgets it. */
  buffered(p: number, a: Action, window: number = INPUT_BUFFER): boolean { return players[p].bufAge[ACTIONS.indexOf(a)] < window; },
  consume(p: number, a: Action): void { players[p].bufAge[ACTIONS.indexOf(a)] = NEVER; },
  /** Digital stick as -1..1 per axis. */
  axisX(p: number): number { return players[p].ax; },
  axisY(p: number): number { return players[p].ay; },
  /** Any key went down this step (title prompt). */
  anyKey(): boolean { return anyKeyThisStep; },
  /** Any player pressed `a` this step; returns the slot or -1. */
  anyPressed(a: Action): number { for (let p = 0; p < players.length; p++) if (players[p].joined && (players[p].pressedNow & BIT[a])) return p; return -1; },
  /** KeyboardEvent.code values typed for the step in progress (text entry: room codes). Stable for the whole step. */
  typedCodes(): string[] { return typedStep; },
  /** Test / netplay hook: hold a seat's input at `mask` (a number or an action map) until cleared. */
  setVirtual(p: number, mask: number | ActionMap | null): void { players[p].virtual = mask == null ? -1 : (typeof mask === 'number' ? mask & 0xff : packMask(mask)); },
  clearVirtual(p: number): void { players[p].virtual = -1; },
  /** Netplay: the local devices of a slot as a mask, without touching the edge state machine. */
  pollRaw(p: number = 0): number {
    if (!boundCodes) rebuildBoundCodes();
    const map = KEYBOARD[p]; const list = pads(); const pl = players[p];
    return ((map ? keyMask(map) : 0) | (pl.pad >= 0 ? padMask(list[pl.pad]) : 0) | unboundPadsMask()) & 0xff;
  },
  /** Couch seats: joined flags and the drop-in edge. */
  joined(p: number): boolean { return players[p].joined; },
  joinPressed(p: number): boolean { return players[p].joinNow; },
  setJoined(p: number, on: boolean): void { players[p].joined = !!on; if (!on) { players[p].pad = -1; } },
  /** Reset pad claims (title screen). */
  resetClaims(): void { for (const p of players) p.pad = -1; for (let s = 1; s < players.length; s++) players[s].joined = false; },
  /** Last device that produced input for the seat ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(p: number): Device { return players[p].device; },
  idleFrames(p: number): number { return players[p].idleFrames; },
  /** Test hook: feed fake gamepads shaped like navigator.getGamepads() entries. */
  setPadVirtual(list: PadLike[] | null): void { virtualPads = list; },
  /** Key label for hints ('Z', '←', 'ENTER'). */
  keyText(p: number, a: Action): string { const map = KEYBOARD[p] || KEYBOARD[0]; const c = (map[a] || [])[0] || ''; return KEY_LABELS[c] || c.replace(/^Key|^Digit/, ''); },
  get playerCount(): number { return players.length; },
  get localPlayers(): number { return LOCAL_PLAYERS; },
};
