// The REBIND GRID: the little state machine behind a controls screen, with no canvas in it.
//
// Both games show the same thing -- actions down the left, one column per layout (P1's keys, P2's
// keys, the pad table everyone shares), a cursor on a cell, and a CAPTURE that stops play and hands
// the screen the very next key or button instead. They draw it completely differently (one on a
// brass plate, one on a paper ticket) and they always will; that is art direction. What they do not
// differ on is the machine underneath, and every one of its awkward parts was got right twice:
//
//   * a capture must SETTLE for a frame or two afterwards, or the release edge of the button that
//     was just bound doubles as a menu move on the very next frame;
//   * a capture must be able to TIME OUT, because a pad player has no Escape and a capture nobody
//     can leave is a locked screen;
//   * a refusal has to stay on screen long enough to read, and then go away on its own;
//   * the cursor wraps on both axes, and a screen that forgets the modulo walks off the grid.
//
// So this module owns the cursor, the capture flag, the settle window, the timeout and the notice
// timer, and the screen owns every word and every pixel. `tick()` answers with what the screen
// should do this step, which is the whole interface: a screen that switches on it cannot forget the
// settle window, because 'settling' is one of the answers.
//
// Frames, not seconds. Everything here is counted in fixed steps, like the simulation it sits next
// to, so a slow machine slows the timeout with everything else rather than skipping past it.

/** What a screen should do with this step. */
export type RebindTick =
  /** Absorbing the edge of whatever was just bound. Read no input at all. */
  | 'settling'
  /** The capture just ran out of patience; it is already ended. Say so. */
  | 'timeout'
  /** A capture is live: look for the key or button the player pressed. */
  | 'capturing'
  /** Nothing special: move the cursor, open a capture, back out. */
  | 'ready';

export interface RebindGridOptions {
  /** How many actions the grid lists. */
  rows: number;
  /** How many binding columns it has. */
  cols: number;
  /** How long a notice stays up. Default 90. */
  noticeFrames?: number;
  /** How long input is ignored after a capture ends. Default 2; 0 for a screen that swallows the edge itself. */
  settleFrames?: number;
  /** How long a capture waits before giving up. Default 300; 0 never gives up. */
  captureFrames?: number;
}

export interface RebindGrid {
  /** Cursor row: which action is selected. */
  readonly row: number;
  /** Cursor column: which binding column is selected. */
  readonly col: number;
  /** True while waiting for the player to press what they want bound. */
  readonly capturing: boolean;
  /** Frames the live capture has been waiting, which is what a blinking prompt counts on. */
  readonly captureT: number;
  /** The transient line under the grid, or '' when there is none to show. */
  readonly notice: string;
  /** Is the notice a refusal? A screen draws those in its own unhappy colour. */
  readonly noticeBad: boolean;
  /** True once a binding has actually changed, so a screen knows whether leaving is worth a write. */
  readonly dirty: boolean;
  /** Move the cursor, wrapping. */
  moveRow(delta: number): void;
  moveCol(delta: number): void;
  /** Put the cursor somewhere exactly (a mouse, a test). Out-of-range values are ignored. */
  moveTo(row: number, col: number): void;
  /** Begin a capture. A capture already running is left alone. */
  beginCapture(): void;
  /** Abandon a capture with nothing bound (Escape). Settles afterwards like any other ending. */
  cancelCapture(): void;
  /**
   * End a capture with an answer: `ok` marks the grid dirty, `message` goes up as a notice (a refusal
   * when `ok` is false). Pass '' to end quietly.
   */
  finish(ok: boolean, message?: string): void;
  /** Put a line up without touching a capture. */
  say(message: string, bad?: boolean): void;
  /** Advance one step and say what the screen should do with it. Call once, first, in update(). */
  tick(): RebindTick;
  /** Back to a freshly opened grid: cursor home, nothing captured, nothing said, not dirty. */
  reset(): void;
}

/** Build a rebind grid. It starts at the top-left cell with nothing captured and nothing said. */
export function createRebindGrid(opts: RebindGridOptions): RebindGrid {
  const rows = Math.max(1, opts.rows | 0);
  const cols = Math.max(1, opts.cols | 0);
  const noticeFrames = opts.noticeFrames ?? 90;
  const settleFrames = opts.settleFrames ?? 2;
  const captureFrames = opts.captureFrames ?? 300;

  let row = 0, col = 0;
  let capturing = false, captureT = 0;
  let notice = '', noticeBad = false, noticeT = 0;
  let settle = 0;
  let dirty = false;

  /** Every ending is the same three things, so no caller can do two of them and forget the third. */
  function end(): void {
    capturing = false;
    captureT = 0;
    settle = settleFrames;
  }

  return {
    get row() { return row; },
    get col() { return col; },
    get capturing() { return capturing; },
    get captureT() { return captureT; },
    get notice() { return noticeT > 0 ? notice : ''; },
    get noticeBad() { return noticeBad; },
    get dirty() { return dirty; },

    moveRow(delta) { row = (row + (delta | 0) % rows + rows) % rows; },
    moveCol(delta) { col = (col + (delta | 0) % cols + cols) % cols; },
    moveTo(r, c) {
      if (Number.isInteger(r) && r >= 0 && r < rows) row = r;
      if (Number.isInteger(c) && c >= 0 && c < cols) col = c;
    },

    beginCapture() { if (!capturing) { capturing = true; captureT = 0; } },
    cancelCapture() { end(); },
    finish(ok, message = '') {
      if (ok) dirty = true;
      end();
      this.say(message, !ok);
    },
    say(message, bad = false) {
      notice = message;
      noticeBad = !!bad;
      noticeT = message ? noticeFrames : 0;
    },

    tick() {
      if (noticeT > 0) noticeT--;
      if (settle > 0) { settle--; return 'settling'; }
      if (!capturing) return 'ready';
      captureT++;
      // The timeout is checked AFTER the screen has had captureFrames steps to find a press, so a
      // key pressed on the very last frame still binds rather than racing the clock.
      if (captureFrames > 0 && captureT > captureFrames) { end(); return 'timeout'; }
      return 'capturing';
    },

    reset() {
      row = 0; col = 0;
      capturing = false; captureT = 0;
      notice = ''; noticeBad = false; noticeT = 0;
      settle = 0;
      dirty = false;
    },
  };
}
