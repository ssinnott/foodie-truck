// PAUSE (docs/ARCHITECTURE.md section 5, docs/GDD.md section 10): a transparent overlay over whatever scene
// pushed it - the scene below keeps drawing, dimmed, and nothing simulates while it is up because Game.update()
// ticks only the top screen.
//
// It opens ON the RESUME row, so the same `start` that opened it (or `cancel`) closes it again without anybody
// having to aim. Online the overlay is refused by the scene that would push it (a paused peer stalls the room),
// which is why nothing in here touches game.net.
import { Screen } from '../game.js';
import { drawSlate, drawMenuRows, drawHint, drawDim } from '../ui.js';
import { confirmPressed, cancelPressed, navY } from '../menuinput.js';

const ROWS = ['RESUME', 'QUIT TO TITLE'];
const SLATE = { x: 210, y: 118, w: 220, h: 96 };

export class PauseScreen extends Screen {
  constructor(game) { super(game, 'pause'); this.transparent = true; this.sel = 0; }

  enter(params) {
    super.enter(params);
    this.sel = 0;
    const g = this.game;
    // A dev jump (?skipTo=pause) lands straight on the overlay with nothing under it, so the dim would be a dim
    // of nothing. Open the scene it belongs over first: this only ever runs when the stack is just us.
    if (g.screens.length === 1 && g.screens[0] === this && g.run && g.factories.map) {
      const below = g.factories.map(g);
      if (!below.id) below.id = 'map';
      g.screens.unshift(below);
      below.enter({});
    }
    this.hint = `${g.input.keyText(0, 'action')}: CHOOSE    ${g.input.keyText(0, 'cancel')}: RESUME`;
  }

  update() {
    super.update();
    const inp = this.game.input;
    const dy = navY(inp);
    if (dy) this.sel = (this.sel + dy + ROWS.length) % ROWS.length;
    if (cancelPressed(inp) >= 0) { this.game.pop(); return; }
    if (confirmPressed(inp) >= 0) {
      if (this.sel === 0) this.game.pop();
      else this.game.reset('title');
    }
  }

  draw(ctx) {
    drawDim(ctx);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: 'PAUSED' });
    drawMenuRows(ctx, ROWS, SLATE.x, SLATE.y + 44, SLATE.w, this.sel, this.frame, 16);
    drawHint(ctx, this.hint);
  }

  summary() { return { row: ROWS[this.sel], sel: this.sel }; }
  checksumFields() { return [this.sel]; }
}
