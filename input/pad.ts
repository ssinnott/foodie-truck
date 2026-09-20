// The gamepad DEVICE layer: polling, held/pressed button masks, the stick's four directions, and the
// capture a rebind screen needs. Everything above it -- which action a button means, whether input is
// an action map or a byte mask -- belongs to the game, and nothing here knows about it.
//
// That line is the whole point. The two games' input modules are two architectures (one an action
// map with a `run` bit, one a byte mask with `BIT`), and the survey that measured them concluded
// there was no seam to cut. There is, but it is not THROUGH the representation: it is UNDER it. Every
// line below was written twice, once per game, in the same order with the same constants -- and the
// only differences are two numbers (how many buttons to read, how far the stick must lean) and one
// bug, which is that only one of the two ever noticed a pad being unplugged.
//
// No `navigator` at module scope: `getPads` defaults to it lazily, inside a try, so this file
// imports under plain Node for `tools/nettest.ts` and returns "no pads" rather than throwing on a
// page whose permissions policy refuses the Gamepad API.
//
// Nothing here allocates per step. The masks are numbers in arrays that are written in place, which
// is what lets `poll()` sit on the fixed-step path next to the simulation.

/** One button as `navigator.getGamepads()` reports it. Both fields are optional: a virtual pad in a test need only set what it is testing. */
export interface PadButtonLike { pressed?: boolean; value?: number }
/** One gamepad, shaped like a `Gamepad`. Only the three fields this module reads are required. */
export interface PadLike { connected?: boolean; buttons: ArrayLike<PadButtonLike | null | undefined>; axes: ArrayLike<number> }
/** What `navigator.getGamepads()` hands back: a sparse, index-stable list. */
export type PadList = ArrayLike<PadLike | null | undefined>;

/** The four direction bits `dirMask` answers with. A game maps them onto its own actions. */
export const DIR = Object.freeze({ left: 1, right: 2, up: 4, down: 8 });

export interface PadSourceOptions {
  /**
   * How many buttons to read. 16 is the standard mapping; 17 also reaches the vendor / guide button.
   * A REBIND has to see a button before it can be bound, so a game that offers more buttons than it
   * ships defaults for reads the wider count here.
   */
  buttons?: number;
  /** How far the left stick leaves centre before `dirMask` calls it a press. */
  deadzone?: number;
  /** How far an analogue trigger is pulled before it counts as pressed, alongside its own `pressed` flag. */
  triggerAt?: number;
  /**
   * Ignore a pad whose `connected` is explicitly `false`. On by default, and lenient on purpose: a
   * pad that does not carry the field at all still counts, which is what lets a test list say only
   * what it is testing. Browsers differ on what an unplugged pad looks like -- a `null` slot in one,
   * an object with `connected: false` in another -- and both read as gone either way.
   */
  requireConnected?: boolean;
  /** Where the pads come from. Defaults to `navigator.getGamepads()`, guarded. */
  getPads?: () => PadList;
}

const EMPTY: PadList = [];

/**
 * A polled view of every gamepad: what each one holds, what went down since the last step, and which
 * button a rebind screen should be handed.
 */
export interface PadSource {
  /**
   * Read the devices once. Call exactly once per fixed step, before anything reads a mask: this is
   * what moves "now" to "last step", so calling it twice in one step erases that step's edges.
   */
  poll(): void;
  /** How many pad slots the last `poll()` saw (including empty ones). */
  count(): number;
  /** The pad at `index` as the last `poll()` saw it, or null. */
  pad(index: number): PadLike | null;
  /** The list the last `poll()` read. */
  pads(): PadList;
  /**
   * Read the devices again, right now, and change nothing. What netplay wants: a session samples the
   * local devices, puts them on the wire and injects every seat's mask BEFORE the input step turns
   * masks into edges, so a game that reads the step's snapshot there puts a frame of lag on
   * everything the local player does. A game whose session already runs after its input step has no
   * use for this and should read `activeMask` instead.
   */
  readPads(): PadList;
  /** The held-button bitfield of any pad-shaped object, polled or not. Nothing is swallowed here. */
  maskOf(gp: PadLike | null | undefined): number;
  /** The four directions of any pad-shaped object, polled or not. */
  dirMaskOf(gp: PadLike | null | undefined): number;
  /** Buttons held at the last `poll()`, as a bitfield, swallowed ones included. */
  rawMask(index: number): number;
  /**
   * Buttons held at the last `poll()` that are not swallowed. This is the one a game reads to build
   * its actions while a rebind screen is up and the game beneath is still ticking; a game whose
   * screens stack (so nothing beneath ticks at all) can read `rawMask` and never notice.
   */
  activeMask(index: number): number;
  /** Buttons that went down at the last `poll()` and are not swallowed, as a bitfield. */
  downMask(index: number): number;
  /** Is any button (not the stick) of this pad held? Stick drift must never read as a press. */
  anyHeld(index: number): boolean;
  /** One raw axis, or 0. */
  axis(index: number, axis: number): number;
  /** The left stick's four directions past the deadzone, as DIR bits. */
  dirMask(index: number): number;
  /**
   * Ignore a button until it is released. A bind lands while the button is still down; without this
   * the next step reads that held button as a brand new press of whatever it now means, and a player
   * who bound CANCEL is thrown off the screen by the very press that bound it.
   */
  swallow(index: number, button: number): void;
  /** Buttons currently ignored on this pad. */
  swallowedMask(index: number): number;
  /** Swallow every button every pad is holding right now. */
  swallowHeld(): void;
  /** Start a capture: everything already held is swallowed, so only a fresh press can be captured. */
  beginCapture(): void;
  /** The lowest new button on the lowest pad holding one, swallowed on the way out, or -1. */
  captureButton(): number;
  /** Which pad `captureButton()` last answered from, or -1. */
  capturedPad(): number;
  /** End a capture. */
  endCapture(): void;
  /** True between `beginCapture()` and `endCapture()`. */
  capturing(): boolean;
  /** Test hook: read this list instead of `navigator.getGamepads()`. `null` restores the real one. */
  setPads(list: PadList | null): void;
}

/** Build a pad source. Nothing is read until the first `poll()`. */
export function createPadSource(opts: PadSourceOptions = {}): PadSource {
  const buttons = opts.buttons ?? 16;
  const deadzone = opts.deadzone ?? 0.25;
  const triggerAt = opts.triggerAt ?? 0.5;
  const requireConnected = opts.requireConnected !== false;
  const getPads = opts.getPads || defaultGetPads;

  let override: PadList | null = null;
  let list: PadList = EMPTY;
  /** Held now, held at the previous poll, and held-but-ignored. One entry per pad index, written in place. */
  const cur: number[] = [];
  const prev: number[] = [];
  const swallowed: number[] = [];
  let capturing = false;
  let capturedPad = -1;

  function usable(gp: PadLike | null | undefined): gp is PadLike {
    return !!gp && (!requireConnected || gp.connected !== false);
  }
  function held(gp: PadLike, b: number): boolean {
    const btn = gp.buttons[b];
    return !!btn && (btn.pressed === true || (btn.value ?? 0) > triggerAt);
  }
  function rawOf(gp: PadLike): number {
    let m = 0;
    for (let b = 0; b < buttons; b++) if (held(gp, b)) m |= 1 << b;
    return m;
  }
  function at(index: number): PadLike | null {
    const gp = list[index];
    return usable(gp) ? gp : null;
  }

  return {
    poll() {
      list = override || safePads(getPads);
      const n = Math.max(list.length, cur.length);
      for (let i = 0; i < n; i++) {
        prev[i] = cur[i] | 0;
        const gp = list[i];
        const raw = usable(gp) ? rawOf(gp) : 0;
        cur[i] = raw;
        // A swallowed button stops being swallowed the moment it is let go -- that release is the
        // player finishing with it, and pressing it again is a new press by any reading.
        if (swallowed[i]) swallowed[i] &= raw;
      }
    },
    count() { return list.length; },
    pad(index) { return at(index); },
    pads() { return list; },
    readPads() { return override || safePads(getPads); },
    maskOf(gp) { return usable(gp) ? rawOf(gp) : 0; },
    dirMaskOf(gp) {
      if (!usable(gp) || !gp.axes) return 0;
      const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      let m = 0;
      if (x < -deadzone) m |= DIR.left; else if (x > deadzone) m |= DIR.right;
      if (y < -deadzone) m |= DIR.up; else if (y > deadzone) m |= DIR.down;
      return m;
    },
    rawMask(index) { return cur[index] | 0; },
    activeMask(index) { return (cur[index] | 0) & ~(swallowed[index] | 0); },
    downMask(index) { return (cur[index] | 0) & ~(prev[index] | 0) & ~(swallowed[index] | 0); },
    anyHeld(index) { return (cur[index] | 0) !== 0; },
    axis(index, axis) {
      const gp = at(index);
      return gp && gp.axes ? gp.axes[axis] || 0 : 0;
    },
    dirMask(index) { return this.dirMaskOf(at(index)); },
    swallow(index, button) { swallowed[index] = (swallowed[index] | 0) | (1 << button); },
    swallowedMask(index) { return swallowed[index] | 0; },
    swallowHeld() { for (let i = 0; i < cur.length; i++) swallowed[i] = (swallowed[i] | 0) | (cur[i] | 0); },
    beginCapture() { capturing = true; capturedPad = -1; this.swallowHeld(); },
    captureButton() {
      for (let i = 0; i < cur.length; i++) {
        const down = this.downMask(i);
        if (!down) continue;
        for (let b = 0; b < buttons; b++) {
          if (!(down & (1 << b))) continue;
          this.swallow(i, b);
          capturedPad = i;
          return b;
        }
      }
      return -1;
    },
    capturedPad() { return capturedPad; },
    endCapture() { capturing = false; capturedPad = -1; },
    capturing() { return capturing; },
    setPads(next) { override = next; },
  };
}

/** `navigator.getGamepads()`, or nothing at all under Node and behind a permissions policy that refuses it. */
function defaultGetPads(): PadList {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return EMPTY;
  return navigator.getGamepads();
}
/** Never let a device read throw onto the fixed-step path; a browser that refuses simply has no pads. */
function safePads(getPads: () => PadList): PadList {
  try { return getPads() || EMPTY; } catch { return EMPTY; }
}

/**
 * Which pad is sitting in which couch seat.
 *
 * The rule both games wrote is the same one: a pad that shows activity takes the LOWEST seat that is
 * free, and "free" is the game's own question -- Aether & Brass refuses a seat whose keyboard half
 * has been used, Foodie Truck refuses one a net session is injecting, and both refuse one that
 * already has a pad. So the seat test is a callback and the bookkeeping is here.
 *
 * What is NOT a callback is `dropDisconnected()`. Only one of the two games released a seat when its
 * pad was unplugged; in the other, a pad that fell off the table held its seat for the rest of the
 * session and the player could not get it back. That is a bug, not a policy, and it is fixed here
 * for both.
 *
 * Claiming is off for the whole of an online session: every seat but one belongs to somebody on
 * another machine, so a local pad must drive the local seat rather than claim a peer's.
 */
export interface PadSeats {
  /** The seat a pad is in, or -1. */
  seatOf(pad: number): number;
  /** The pad in a seat, or -1. */
  padOf(seat: number): number;
  /** Is any pad in this seat? */
  taken(seat: number): boolean;
  /**
   * Put `pad` in the lowest seat below `seats` that `free` accepts and no pad already holds.
   * Returns the seat taken, or -1 if claiming is off, the pad already has one, or none was free.
   */
  claim(pad: number, seats: number, free: (seat: number) => boolean): number;
  /** Take a pad out of its seat. Returns the seat freed, or -1. */
  release(pad: number): number;
  /** Empty every seat. */
  releaseAll(): void;
  /** Free the seats of pads that are no longer there. Returns those seats, lowest first. */
  dropDisconnected(source: PadSource): number[];
  /** Pad indices the source can see that are in no seat, lowest first. */
  unclaimed(source: PadSource): number[];
  /** Turn claiming on or off. Off for the whole of an online session. */
  setClaiming(on: boolean): void;
  /** Is claiming on? */
  claiming(): boolean;
}

/** Build the pad-to-seat table. Starts empty, with claiming on. */
export function createPadSeats(): PadSeats {
  /** pad index -> seat. */
  const seats = new Map<number, number>();
  let claiming = true;

  const padOf = (seat: number): number => {
    for (const [pad, s] of seats) if (s === seat) return pad;
    return -1;
  };

  return {
    seatOf(pad) { const s = seats.get(pad); return s === undefined ? -1 : s; },
    padOf,
    taken(seat) { return padOf(seat) >= 0; },
    claim(pad, count, free) {
      if (!claiming || seats.has(pad)) return -1;
      for (let s = 0; s < count; s++) {
        if (padOf(s) >= 0 || !free(s)) continue;
        seats.set(pad, s);
        return s;
      }
      return -1;
    },
    release(pad) {
      const s = seats.get(pad);
      if (s === undefined) return -1;
      seats.delete(pad);
      return s;
    },
    releaseAll() { seats.clear(); },
    dropDisconnected(source) {
      const freed: number[] = [];
      for (const pad of [...seats.keys()]) {
        if (source.pad(pad)) continue;
        freed.push(seats.get(pad) as number);
        seats.delete(pad);
      }
      return freed.sort((a, b) => a - b);
    },
    unclaimed(source) {
      const out: number[] = [];
      for (let i = 0; i < source.count(); i++) if (source.pad(i) && !seats.has(i)) out.push(i);
      return out;
    },
    setClaiming(on) { claiming = !!on; },
    claiming() { return claiming; },
  };
}
