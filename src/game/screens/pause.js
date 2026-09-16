// PAUSE (docs/ARCHITECTURE.md section 5, docs/GDD.md section 10): a transparent overlay over whatever scene
// pushed it - the scene below keeps drawing, dimmed, and nothing simulates while it is up because Game.update()
// ticks only the top screen.
//
// It opens ON the RESUME row, so the same `start` that opened it (or `cancel`) closes it again without anybody
// having to aim. Online the overlay is refused by the scene that would push it (a paused peer stalls the room),
// which is why nothing in here touches game.net.
import { VIEW_W, VIEW_H } from '../../constants.js';
import { makeLayer, blitAt } from '../../art/layers.js';
import { Screen } from '../game.js';
import { drawSlate, drawMenuRows, drawHint } from '../ui.js';
import { confirmPressed, cancelPressed, navY } from '../menuinput.js';

const ROWS = ['RESUME', 'QUIT TO TITLE'];
/**
 * The plate sits ABOVE the middle of the picture, not on it, and is only as big as its two rows. Every scene
 * keeps its subject in the middle band - the camera pins the truck to the centre of the map, the crew stand at
 * the kitchen counter, the mini-games put the cast on the floor line - so a centred plate covers the one thing
 * the player paused to look at. Rows 90..156 are sky, plum wall or canopy in all five scenes, and they clear
 * the map HUD's order ticket and name plates in both top corners.
 */
const SLATE = { x: 226, y: 90, w: 188, h: 66 };
/**
 * The veil: a PLUM VIGNETTE rather than a flat wash. A single 55 % dark rect over the whole frame knocks the
 * scene back to mud, which is hiding the game, not dimming it (docs/ART_STYLE.md section 1: plum shadows, never
 * black ones). This is thin in the middle, where the game is, and thickens toward the rim, where the plate and
 * the hint live. Pre-rendered once and blitted: a gradient per frame is banned (ART_PRINCIPLES 6).
 */
const VEIL_CX = 320, VEIL_CY = 190, VEIL_R = 384;
const VEIL_IN = 'rgba(47,35,56,0.24)', VEIL_MID = 'rgba(47,35,56,0.40)', VEIL_OUT = 'rgba(47,35,56,0.66)';

function paintVeil(g, w, h) {
  const grad = g.createRadialGradient(VEIL_CX, VEIL_CY, 0, VEIL_CX, VEIL_CY, VEIL_R);
  grad.addColorStop(0, VEIL_IN);
  grad.addColorStop(0.45, VEIL_MID);
  grad.addColorStop(1, VEIL_OUT);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

let veilLayer = null;

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
    // seed 168 out of the front-of-house block (art/logo.js owns 160..169); the veil draws no rng at all
    if (!veilLayer) veilLayer = makeLayer(VIEW_W, VIEW_H, paintVeil, 168);
    blitAt(ctx, veilLayer, 0, 0);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: 'PAUSED' });
    drawMenuRows(ctx, ROWS, SLATE.x, SLATE.y + 38, SLATE.w, this.sel, this.frame, 16);
    drawHint(ctx, this.hint);
  }

  summary() { return { row: ROWS[this.sel], sel: this.sel }; }
  checksumFields() { return [this.sel]; }
}
