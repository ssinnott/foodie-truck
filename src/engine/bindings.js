// BINDINGS: which key and which pad button each of the eight actions sits on, and the only place that answer is
// allowed to change (docs/ARCHITECTURE.md section 3). engine/input.js reads these tables every step and turns them
// into masks; game/screens/controls.js is what edits them; nothing else writes here.
//
// Two namespaces, because they cannot collide with each other:
//
//   * KEYBOARD - one map per couch keyboard slot (two of them; seats 3 and 4 are pad-only). Both slots share one
//     physical keyboard, so a code may be bound ONCE across both: P2 taking P1's Z would leave P1 pressing a key
//     that moves somebody else.
//   * PAD - ONE map shared by every pad. Four people on four identical controllers want the same buttons, and a
//     per-pad table would ask each of them to rebind the same thing four times.
//
// A rebind SETS the action to exactly one input. The defaults list alternates (Z or Space) because they are the
// keys everybody already expects; the moment a player picks their own, their pick is the answer and the alternate
// is not quietly still live under their other hand.
//
// Persistence is localStorage, and it is deliberately fragile: a private window, a blocked origin or a half-written
// entry all mean "use the defaults", never a thrown error on boot. Read and written from screen enter/exit only -
// never from an update() (docs/MULTIPLAYER.md: no localStorage on the simulation path).
import { ACTIONS } from './actions.js';

/** Where a saved set of bindings lives, and the shape version that invalidates it. */
const STORE_KEY = 'foodie-truck.bindings';
const STORE_VERSION = 1;

/** Default keyboard bindings per couch slot (KeyboardEvent.code). Two entries: seats 3 and 4 are pad-only. */
export const KEY_DEFAULTS = Object.freeze([
  { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
    action: ['KeyZ', 'Space'], alt: ['KeyX', 'ShiftLeft'], cancel: ['KeyC', 'Escape', 'Backspace'], start: ['Enter'] },
  { left: ['KeyF'], right: ['KeyH'], up: ['KeyT'], down: ['KeyG'], action: ['KeyV'], alt: ['KeyB'], cancel: ['KeyN'], start: ['Digit5'] },
]);
/** Standard gamepad mapping: A action, B cancel, X alt, Start start, d-pad 12-15. The left stick is not bindable. */
export const PAD_DEFAULTS = Object.freeze({ action: [0], cancel: [1], alt: [2], start: [9], up: [12], down: [13], left: [14], right: [15] });

/** How many couch seats have a keyboard block at all. */
export const KEY_SLOTS = KEY_DEFAULTS.length;
/**
 * Buttons a player may bind, in the W3C standard layout. 16 is the vendor/guide button, which the OS usually eats
 * before the page sees it, so it is not offered. 6 and 7 are the analogue triggers - input.js takes them past half
 * pull, so they press like buttons.
 */
export const PAD_BUTTONS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
/** Face-button names for the hint lines a pad seat reads, and for the CONTROLS table. */
export const PAD_LABELS = Object.freeze([
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME',
]);
/**
 * Keys whose own job on the page outranks any binding: ESC cancels a rebind (so it can never BE one, though it
 * stays on P1's cancel by default, where it always was), and TAB and the reload keys belong to the browser.
 */
export const RESERVED_CODES = Object.freeze(['Escape', 'Tab', 'F5', 'F11', 'F12']);

/** Codes that are drawn as something other than their own name. */
const KEY_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BKSP', Tab: 'TAB', CapsLock: 'CAPS',
  ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL',
  AltLeft: 'LALT', AltRight: 'RALT', MetaLeft: 'LMETA', MetaRight: 'RMETA',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=',
  NumpadAdd: 'NUM+', NumpadSubtract: 'NUM-', NumpadMultiply: 'NUM*', NumpadDivide: 'NUM/', NumpadEnter: 'NUMENT', NumpadDecimal: 'NUM.',
};

/** Deep copy of a binding map, so the live tables never share an array with the frozen defaults. */
function copyMap(map) { const out = {}; for (const a of ACTIONS) out[a] = (map[a] || []).slice(); return out; }
function defaultKeys() { return KEY_DEFAULTS.map(copyMap); }
function defaultPad() { return copyMap(PAD_DEFAULTS); }

let keys = defaultKeys();
let pad = defaultPad();
/** Bumped on every accepted edit; engine/input.js drops its cached code set when it moves. */
let revision = 0;
const listeners = [];
function changed() { revision++; for (const fn of listeners) fn(); }

/** The live keyboard map for a couch slot, or null for a pad-only seat. Read-only: edit through bindKey. */
export function keyboardMap(slot) { return keys[slot] || null; }
/** The live pad map, shared by every pad. Read-only: edit through bindPad. */
export function padMap() { return pad; }
/** Edits so far; engine/input.js watches this rather than being told. */
export function bindingRevision() { return revision; }
/** Call `fn` whenever a binding changes. */
export function onBindingsChanged(fn) { listeners.push(fn); }

/** What an action's first binding is called on a hint line ('Z', '←', 'ENTER'), or '' if it has none. */
export function keyLabel(code) {
  if (!code) return '';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  const bare = code.replace(/^Key|^Digit|^Numpad/, '');
  return (code.startsWith('Numpad') ? 'NUM' + bare : bare).toUpperCase();
}
/** What a pad button is called ('A', 'RT', 'D-UP'). */
export function padLabel(button) { return PAD_LABELS[button] || ('BTN' + button); }

/** The seat and action a keyboard code is currently bound to, or null. */
function keyOwner(code) {
  for (let s = 0; s < keys.length; s++) for (const a of ACTIONS) if (keys[s][a].indexOf(code) >= 0) return { slot: s, action: a };
  return null;
}
/** The action a pad button is currently bound to, or null. */
function padOwner(button) {
  for (const a of ACTIONS) if (pad[a].indexOf(button) >= 0) return a;
  return null;
}

/**
 * Bind a keyboard code to one seat's action, replacing whatever that action held.
 *
 * Refused, with a reason the CONTROLS screen prints as it stands, when the code is reserved or when taking it would
 * leave ANOTHER action with nothing on it at all - an action with no key is one a player cannot press and cannot
 * see to fix. Taking a code off an action that has a spare is fine and is what the alternates are for.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function bindKey(slot, action, code) {
  if (!keys[slot] || ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'NO SUCH SEAT' };
  if (!code) return { ok: false, reason: 'NO KEY' };
  if (RESERVED_CODES.indexOf(code) >= 0) return { ok: false, reason: `${keyLabel(code)} IS RESERVED` };
  const owner = keyOwner(code);
  if (owner && owner.slot === slot && owner.action === action) return { ok: true };
  if (owner) {
    const held = keys[owner.slot][owner.action];
    if (held.length < 2) return { ok: false, reason: `${keyLabel(code)} IS P${owner.slot + 1} ${owner.action.toUpperCase()}` };
    held.splice(held.indexOf(code), 1);
  }
  keys[slot][action] = [code];
  changed();
  return { ok: true };
}

/**
 * Bind a pad button to an action, replacing whatever that action held. Same rule as the keyboard: a button may not
 * be taken off an action that has no other.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function bindPad(action, button) {
  if (ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'NO SUCH ACTION' };
  if (PAD_BUTTONS.indexOf(button) < 0) return { ok: false, reason: `${padLabel(button)} CANNOT BE BOUND` };
  const owner = padOwner(button);
  if (owner === action) return { ok: true };
  if (owner) {
    const held = pad[owner];
    if (held.length < 2) return { ok: false, reason: `${padLabel(button)} IS ${owner.toUpperCase()}` };
    held.splice(held.indexOf(button), 1);
  }
  pad[action] = [button];
  changed();
  return { ok: true };
}

/** Put one keyboard seat back to its defaults. */
export function resetKeyboard(slot) { if (!keys[slot]) return; keys[slot] = copyMap(KEY_DEFAULTS[slot]); changed(); }
/** Put the pad back to its defaults. */
export function resetPad() { pad = defaultPad(); changed(); }
/** Put everything back. */
export function resetAll() { keys = defaultKeys(); pad = defaultPad(); changed(); }
/** True while every table is exactly as it shipped (the CONTROLS screen says so rather than offering a no-op). */
export function isDefault() { return JSON.stringify(serialize().keys) === JSON.stringify(defaultKeys()) && JSON.stringify(serialize().pad) === JSON.stringify(defaultPad()); }

/** The whole set as plain data, for storage and for tests. */
export function serialize() { return { v: STORE_VERSION, keys: keys.map(copyMap), pad: copyMap(pad) }; }

/**
 * Take a set of bindings back in. Anything malformed - a wrong version, a missing action, a code that is not a
 * string, a button that is not a standard one - falls back to that action's default rather than rejecting the lot,
 * so one bad entry in storage never costs a player the rest of their setup.
 * @returns {boolean} whether anything at all was applied
 */
export function deserialize(data) {
  if (!data || data.v !== STORE_VERSION) return false;
  const nextKeys = defaultKeys();
  const nextPad = defaultPad();
  if (Array.isArray(data.keys)) {
    for (let s = 0; s < nextKeys.length; s++) {
      const src = data.keys[s];
      if (!src) continue;
      for (const a of ACTIONS) {
        const list = Array.isArray(src[a]) ? src[a].filter((c) => typeof c === 'string' && c && RESERVED_CODES.indexOf(c) < 0) : null;
        if (list && list.length) nextKeys[s][a] = list;
      }
    }
  }
  if (data.pad) {
    for (const a of ACTIONS) {
      const list = Array.isArray(data.pad[a]) ? data.pad[a].filter((b) => PAD_BUTTONS.indexOf(b) >= 0) : null;
      if (list && list.length) nextPad[a] = list;
    }
  }
  keys = nextKeys; pad = nextPad;
  changed();
  return true;
}

/** Storage, if this browser has one we are allowed to touch. */
function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
/** Load saved bindings over the defaults. Never throws: a private window or junk in storage just means defaults. */
export function load() {
  const s = store();
  if (!s) return false;
  try {
    const raw = s.getItem(STORE_KEY);
    return raw ? deserialize(JSON.parse(raw)) : false;
  } catch { return false; }
}
/** Write the current bindings out, or clear the entry once they are back to stock. Never throws. */
export function save() {
  const s = store();
  if (!s) return false;
  try {
    if (isDefault()) s.removeItem(STORE_KEY);
    else s.setItem(STORE_KEY, JSON.stringify(serialize()));
    return true;
  } catch { return false; }
}
