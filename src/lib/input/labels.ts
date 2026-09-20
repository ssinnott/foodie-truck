// What a key or a gamepad button is CALLED on screen. Pure string work: no `window`, no `navigator`,
// no DOM, so `tools/nettest.ts` imports it under plain Node like every other library module.
//
// Both games arrived at the same three-part answer independently -- a table of named codes, a short
// list of patterns for the codes that name themselves, and a fallback for everything else -- and
// then disagreed only about the words. Aether & Brass writes 'L SHIFT' and 'BACKSPACE'; Foodie Truck
// writes 'LSHIFT' and 'BKSP', because its tickets are narrower. That is art direction, not logic, so
// the table and the fallback are parameters and the ORDER is the library's:
//
//   1. the game's own name for the code, if it has one;
//   2. KeyA -> A, Digit1 -> 1, Numpad1 -> NUM1, F5 -> F5;
//   3. the game's fallback.
//
// Names first, patterns second, and it matters: `NumpadEnter` is in both games' tables and matches
// no pattern, while `KeyA` is in neither and matches one. Running the table first is what makes the
// two orders the games actually shipped (A&B checked patterns first, FT the table) agree -- no entry
// in either table matches any pattern below, so neither game's labels move by adopting this order.

/** A code's on-screen name, for the codes that do not spell themselves ('Space' -> 'SPACE'). */
export type KeyNames = Readonly<Record<string, string>>;

/** How a game spells the codes this module does not decide for itself. */
export interface KeyLabelOptions {
  /** The game's named codes. Checked first, so a name always wins over a pattern. */
  names?: KeyNames;
  /** What an unrecognised code becomes. Default: the code, uppercased. */
  fallback?: (code: string) => string;
}

const KEY_LETTER = /^Key([A-Z])$/;
const KEY_DIGIT = /^Digit(\d)$/;
const KEY_NUMPAD = /^Numpad(\d)$/;
const KEY_FUNCTION = /^F(\d+)$/;

/**
 * Short on-screen label for a `KeyboardEvent.code`, or '' for no code at all (an unbound action's
 * hint line asks for a label it has no code for, and must get a blank rather than 'UNDEFINED').
 */
export function keyLabel(code: string, opts: KeyLabelOptions = {}): string {
  if (!code) return '';
  const named = opts.names && opts.names[code];
  if (named !== undefined) return named;
  let m = KEY_LETTER.exec(code);
  if (m) return m[1];
  m = KEY_DIGIT.exec(code);
  if (m) return m[1];
  m = KEY_NUMPAD.exec(code);
  if (m) return 'NUM' + m[1];
  if (KEY_FUNCTION.test(code)) return code;
  return opts.fallback ? opts.fallback(code) : code.toUpperCase();
}

/**
 * The W3C standard gamepad mapping, by button index. Index 8 is the left-hand small button, which
 * every vendor names differently -- SELECT, BACK, VIEW, SHARE -- so a game that cares passes its own
 * word for it. 16 is the vendor / guide button: the OS usually eats it before the page sees it, and
 * a game that offers it for binding will find it never arrives.
 */
export const PAD_LABELS: readonly string[] = Object.freeze([
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME',
]);

/** How a game spells a button index outside the table it passed. */
export interface PadLabelOptions {
  /** The game's own button names, index by index. Defaults to PAD_LABELS. */
  labels?: readonly string[];
  /** What an index past the end of `labels` becomes. Default: 'B' + index. */
  fallback?: (button: number) => string;
}

/** Short on-screen label for a standard-mapping button index ('A', 'RT', 'D-UP'). */
export function padLabel(button: number, opts: PadLabelOptions = {}): string {
  const labels = opts.labels || PAD_LABELS;
  const name = labels[button];
  if (name !== undefined) return name;
  return opts.fallback ? opts.fallback(button) : 'B' + button;
}
