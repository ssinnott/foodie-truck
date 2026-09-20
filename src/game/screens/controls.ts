// CONTROLS (docs/GDD.md section 9) - the order pad the crew's own buttons are written on. Eight action rows down
// the left, three columns across: P1's keys, P2's keys, and the one pad table every controller shares.
//
// Rebinding is a CAPTURE, not a menu: pick a cell, press ACTION, and engine/input.js stops playing input and hands
// this screen the very next key or button instead (`capture()` / `capturedKey()` / `capturedButton()`). That is
// the only way a screen can be told "the player pressed C" rather than "the player pressed CANCEL" - and without
// it the press that picks a binding would also drive the menu it was picked in, so binding CANCEL would throw you
// off this screen with the same keystroke.
//
// The rules live in engine/bindings.js, not here: this screen shows what it is told, prints the refusal it is
// handed when a binding is refused, and never reaches into a table itself. Bindings are written to storage in
// exit() - one write, on the way out, off the simulation path (docs/MULTIPLAYER.md).
import { VIEW_W, UI, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { ACTIONS, ACTION_LABELS } from '../../engine/actions.ts';
import * as bindings from '../../engine/bindings.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawTicket, drawSign, drawHint, drawDim, ROW } from '../ui.ts';
import { drawLane } from '../../art/logo.ts';
import { navX, navY, cancelPressed } from '../menuinput.ts';
import { createRebindGrid } from '../../lib/input/rebind.ts';
import type { RebindGrid } from '../../lib/input/rebind.ts';

const R = Math.round;
const HEAD_TEXT = 'CONTROLS';
/**
 * Three columns of bindings and the action name they belong to. `seat` is the keyboard slot a column edits, or -1
 * for the column that edits the shared pad table.
 */
const COLS = [
  { title: 'P1 KEYS', seat: 0 },
  { title: 'P2 KEYS', seat: 1 },
  { title: 'GAMEPAD', seat: -1 },
];
/**
 * The pad on the counter: wide enough for the longest binding name ('D-RIGHT') in every column at size 1, and
 * exactly as tall as the eight rows and their rules - a ticket with a hand's depth of blank paper under the last
 * line reads as a form somebody forgot to finish.
 */
const PAD_X = 64, PAD_Y = 40, PAD_W = 512, PAD_H = 216;
/** The action column, then three binding columns of equal width across what is left. */
const NAME_W = 116;
const CELL_W = R((PAD_W - NAME_W - 24) / COLS.length);
const COL_X = COLS.map((_, i) => PAD_X + 12 + NAME_W + i * CELL_W);
/** Row 0 is the column headings; the eight actions run below it on the ticket's own rules. */
const HEAD_ROW_Y = 22, FIRST_ROW_Y = 40;
/** A capture gives up on its own after five seconds, so a pad player who opened one by mistake is not stuck. */
const CAPTURE_FRAMES = 300;
/** How long a refusal stays on the hint line. */
const MESSAGE_FRAMES = 150;
/** The cell cursor's flash, and the '. . .' a listening cell shows instead of its binding. */
const BLINK = 30, LISTENING = '. . .';

export class ControlsScreen extends Screen {
  // `declare`, not plain field declarations: es2022 defines a plain field before the constructor body runs, so
  // a screen's own declaration would define the base's field back to undefined and wipe what the constructor
  // just wrote. `declare` erases under tsc, esbuild and Node's type stripping alike.

  /**
   * The cursor, the capture, the timeout and the transient line under the grid: lib/input/rebind.js owns all
   * four, because the sibling game's controls plate needed exactly the same four and got the awkward parts
   * right separately. What it does NOT own is a single word or pixel of this screen.
   */
  declare grid: RebindGrid;
  /** The label grid, `cells[col][row]`, rebuilt by refresh() whenever a binding changes. */
  declare cells: string[][];
  /** The hint strip, joined once in enter() because it names this player's own keys. */
  declare hint: string;
  /** The hint strip shown instead while listening. */
  declare listenHint: string;

  constructor(game: Game) {
    super(game, 'controls');
    this.grid = createRebindGrid({
      rows: ACTIONS.length, cols: COLS.length,
      noticeFrames: MESSAGE_FRAMES, captureFrames: CAPTURE_FRAMES,
      // No settle window: while a capture is live engine/input.js already holds every seat at neutral and
      // swallows the key and the button it hands over, so there is no release edge left to absorb.
      settleFrames: 0,
    });
  }

  /** Cursor row: which action is selected, indexing ACTIONS. */
  get row(): number { return this.grid.row; }
  /** Cursor column: which binding column is selected, indexing COLS. */
  get col(): number { return this.grid.col; }
  /** True while waiting for the player to press the key or button they want bound. */
  get listening(): boolean { return this.grid.capturing; }

  override enter(params: ScreenParams) {
    super.enter(params);
    this.grid.reset();
    // Every cell's text, rebuilt only when a binding actually changes: draw() joins no strings (ARCHITECTURE 8).
    this.cells = COLS.map(() => ACTIONS.map(() => ''));
    this.refresh();
    this.hint = 'ARROWS: MOVE    Z: REBIND    X: DEFAULTS    C: BACK';
    this.listenHint = 'PRESS A KEY OR A BUTTON    ESC: CANCEL';
  }

  /** Written on the way out, once: storage is not the simulation's business (docs/MULTIPLAYER.md). */
  override exit() {
    if (this.grid.dirty) bindings.save();
  }

  /** Re-read every cell from engine/bindings.js. Called after an edit, never per frame. */
  refresh() {
    for (let c = 0; c < COLS.length; c++) {
      const col = COLS[c];
      for (let a = 0; a < ACTIONS.length; a++) {
        if (col.seat < 0) this.cells[c][a] = bindings.padLabel((bindings.padMap()[ACTIONS[a]] || [])[0]);
        else {
          const map = bindings.keyboardMap(col.seat);
          this.cells[c][a] = map ? (map[ACTIONS[a]] || []).map(bindings.keyLabel).join(' / ') : '-';
        }
      }
    }
  }

  say(text: string) { this.grid.say(text); }

  override update() {
    super.update();
    const inp = this.game.input;
    const phase = this.grid.tick();
    if (phase === 'timeout') { this.say('REBIND TIMED OUT'); inp.endCapture(); return; }
    if (phase === 'capturing') { this.listen(); return; }

    const dx = navX(inp), dy = navY(inp), audio = this.game.audio;
    if (dx) { this.grid.moveCol(dx); audio.play('menu_move'); }
    if (dy) { this.grid.moveRow(dy); audio.play('menu_move'); }
    if (inp.anyPressed('action') >= 0 || inp.anyPressed('start') >= 0) {
      this.grid.beginCapture();
      inp.capture();
      audio.play('menu_confirm');
      return;
    }
    // ALT puts THIS COLUMN back to stock - the column the cursor is in, so a player who has tangled one seat's
    // keys is not made to throw away the other seat's and the pad's as well.
    if (inp.anyPressed('alt') >= 0) {
      const col = COLS[this.col];
      if (col.seat < 0) bindings.resetPad(); else bindings.resetKeyboard(col.seat);
      // finish() outside a capture is how a change that was not a capture still marks the screen worth saving.
      this.grid.finish(true, `${col.title} BACK TO DEFAULTS`);
      this.refresh();
      audio.play('stamp');
      return;
    }
    if (cancelPressed(inp) >= 0) { audio.play('menu_back'); this.game.reset('title'); }
  }

  /**
   * A capture in progress. ESC backs out (which is why it is the one code bindings.js refuses to bind), and so
   * does running out of patience: a pad player has no ESC, and a capture nobody can leave is a locked screen.
   */
  listen() {
    const inp = this.game.input;
    const code = inp.capturedKey(), button = inp.capturedButton();
    const col = COLS[this.col], action = ACTIONS[this.row];
    let done = false;
    if (code === 'Escape') { this.grid.cancelCapture(); this.say('REBIND CANCELLED'); this.game.audio.play('menu_back'); done = true; }
    else if (col.seat < 0 && button >= 0) { done = this.apply(bindings.bindPad(action, button)); }
    else if (col.seat >= 0 && code) { done = this.apply(bindings.bindKey(col.seat, action, code)); }
    // a key pressed at the pad column (or a button at a key column) is the wrong device for this cell, and saying
    // so is friendlier than a cell that silently refuses to change
    else if (col.seat < 0 && code) { this.grid.cancelCapture(); this.say('THAT COLUMN WANTS A BUTTON'); done = true; }
    else if (col.seat >= 0 && button >= 0) { this.grid.cancelCapture(); this.say('THAT COLUMN WANTS A KEY'); done = true; }
    if (done) inp.endCapture();
  }

  /** One binding attempt: keep the refusal on screen, and only a change is worth saving. */
  apply(result) {
    this.grid.finish(!!result.ok, result.ok ? '' : (result.reason || 'REBIND REFUSED'));
    if (result.ok) { this.refresh(); this.game.audio.play('rebind_ok'); }
    else this.game.audio.play('rebind_refused');
    return true;
  }

  override draw(ctx: CanvasRenderingContext2D) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 26, HEAD_TEXT, { size: 2 });
    drawTicket(ctx, PAD_X, PAD_Y, PAD_W, PAD_H, { title: 'WHO PRESSES WHAT', rules: false });

    // column headings, each in its own seat colour so the table reads as the couch does
    for (let c = 0; c < COLS.length; c++) {
      const col = COLS[c];
      drawText(ctx, col.title, COL_X[c] + CELL_W / 2, PAD_Y + HEAD_ROW_Y, {
        size: 1, color: col.seat < 0 ? UI.ink : PLAYER_COLORS[col.seat], align: 'center', shadow: false,
      });
    }
    ctx.fillStyle = UI.paperLine;
    ctx.fillRect(PAD_X + 8, PAD_Y + HEAD_ROW_Y + 11, PAD_W - 16, 1);

    for (let a = 0; a < ACTIONS.length; a++) {
      const y = PAD_Y + FIRST_ROW_Y + a * ROW * 2;
      ctx.fillStyle = UI.paperLine;
      ctx.fillRect(PAD_X + 8, y + ROW + 4, PAD_W - 16, 1);
      drawText(ctx, ACTION_LABELS[a], PAD_X + 14, y, { size: 1, color: UI.ink, shadow: false });
      for (let c = 0; c < COLS.length; c++) {
        const here = a === this.row && c === this.col;
        const text = here && this.listening ? LISTENING : this.cells[c][a];
        if (here) {
          // the cursor is a jam-jar lid the same beetroot as the READY stamp, drawn UNDER the text
          const w = measureText(text, 1) + 10;
          ctx.fillStyle = this.listening && (this.frame % BLINK) < BLINK / 2 ? UI.paper : UI.paperDark;
          ctx.fillRect(R(COL_X[c] + CELL_W / 2 - w / 2), y - 2, R(w), 12);
          ctx.fillStyle = UI.ink;
          ctx.fillRect(R(COL_X[c] + CELL_W / 2 - w / 2), y + 10, R(w), 1);
        }
        drawText(ctx, text, COL_X[c] + CELL_W / 2, y, { size: 1, color: UI.ink, align: 'center', shadow: false });
      }
    }
    drawHint(ctx, this.listening ? this.listenHint : (this.grid.notice || this.hint));
  }

  override summary() {
    return {
      row: ACTIONS[this.row], col: COLS[this.col].title, rowIndex: this.row, colIndex: this.col, listening: this.listening,
      message: this.grid.notice,
      cells: this.cells.map((c) => c.slice()), dirty: this.grid.dirty, isDefault: bindings.isDefault(),
    };
  }
  /** Nothing here is simulated, but the screen contract asks for the cursor (docs/ARCHITECTURE.md section 5). */
  override checksumFields() { return [this.row, this.col, this.listening ? 1 : 0]; }
}
