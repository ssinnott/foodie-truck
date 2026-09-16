// TITLE (docs/GDD.md section 10): the parked truck on the dusk lane, the crew idling in front of it, the FOODIE
// TRUCK sign swinging over the whole picture and a chalk A-frame menu standing on the verge.
//
// Nothing here simulates anything: the only state is which menu row is selected, so `checksumFields` is one
// number and the screen is trivially net-safe. The lane and the sign are pre-rendered layers (art/logo.js); the
// four critters are the only per-frame drawing, desynced by i*11 ticks so the idles never breathe in unison.
import { VIEW_W, UI, REPO_URL, REPO_LABEL } from '../../constants.js';
import { Screen } from '../game.js';
import { drawTextOutlined } from '../../engine/text.js';
import { drawRig } from '../../art/rig.js';
import { drawShadow } from '../../art/fx.js';
import { drawTruck } from '../../art/truck.js';
import { critterRig } from '../../content/critters/common.js';
import { CRITTERS } from '../../content/critters/index.js';
import { AnimPlayer } from '../animation.js';
import { drawSlate, drawMenuRows, drawHint } from '../ui.js';
import { confirmPressed, navY } from '../menuinput.js';
import { drawLane, drawLogoSign, TRUCK_Y, CREW_Y } from '../../art/logo.js';

/** The menu, and the screen each row opens. SOURCE is a link, not a screen. */
const ROWS = ['PLAY', 'ONLINE', 'CREW', 'SOURCE'];
/** The A-frame slate on the verge, right of the truck. */
const SLATE = { x: 402, y: 186, w: 196, h: 94 };
/** Where the truck parks and where the crew stands in front of it (art/logo.js owns the row bands). */
const TRUCK_X = 150;
const CREW_X = [130, 186, 242, 298];
/** The sign swings +-0.02 rad about its top centre, slowly enough to read as weight. */
const SWING = 0.02, SWING_RATE = 0.045;
/** PRESS START is on for 40 of every 60 frames: a blink, not a strobe. */
const BLINK_PERIOD = 60, BLINK_ON = 40;
const START_Y = 314;
const TRUCK_OPTS = { scale: 2, wheel: 0 };
const START_TEXT = 'PRESS START';

export class TitleScreen extends Screen {
  constructor(game) { super(game, 'title'); this.crew = []; this.sel = 0; }

  enter(params) {
    super.enter(params);
    // Back at the front door: forget which pad claimed which couch seat and let P2 drop in again from scratch.
    this.game.input.resetClaims();
    this.sel = 0;
    this.crew = CRITTERS.map((def, i) => {
      const seat = { rig: critterRig(def, i), player: new AnimPlayer(def.anims) };
      seat.player.play('idle');
      // desync the idles by i*11 ticks so four breathing critters never share a beat
      for (let k = 0; k < i * 11; k++) seat.player.tick();
      return seat;
    });
  }

  update() {
    super.update();
    const inp = this.game.input;
    const dy = navY(inp);
    if (dy) this.sel = (this.sel + dy + ROWS.length) % ROWS.length;
    if (confirmPressed(inp) >= 0) this.choose();
    for (const s of this.crew) s.player.tick();
  }

  /** Open the selected row. SOURCE leaves the game, so it is the one row guarded against a blocked popup. */
  choose() {
    const row = ROWS[this.sel];
    if (row === 'PLAY') this.game.replace('select');
    else if (row === 'ONLINE') this.game.replace('lobby');
    else if (row === 'CREW') this.game.replace('gallery');
    else if (row === 'SOURCE') { try { window.open(REPO_URL, '_blank'); } catch { /* popups blocked: stay put */ } }
  }

  draw(ctx) {
    drawLane(ctx);
    // the parked truck, then the crew in front of it: a y-sort of two rows, each on its own contact shadow
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 140, 0.3);
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    for (let i = 0; i < this.crew.length; i++) {
      const s = this.crew[i], x = CREW_X[i];
      drawShadow(ctx, x, CREW_Y, 30, 0.4);
      drawRig(ctx, s.rig, s.player.pose, { x, y: CREW_Y, facing: 1, scale: 1 });
    }
    // the A-frame: two legs and a ground shadow under the slate, so the board stands rather than floats
    drawShadow(ctx, SLATE.x + SLATE.w / 2, SLATE.y + SLATE.h + 24, 96, 0.22);
    ctx.fillStyle = UI.ink; ctx.fillRect(SLATE.x + 25, SLATE.y + SLATE.h - 1, 10, 26); ctx.fillRect(SLATE.x + SLATE.w - 35, SLATE.y + SLATE.h - 1, 10, 26);
    ctx.fillStyle = UI.wood; ctx.fillRect(SLATE.x + 26, SLATE.y + SLATE.h, 8, 24); ctx.fillRect(SLATE.x + SLATE.w - 34, SLATE.y + SLATE.h, 8, 24);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(SLATE.x + 32, SLATE.y + SLATE.h, 2, 24); ctx.fillRect(SLATE.x + SLATE.w - 28, SLATE.y + SLATE.h, 2, 24);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: 'TODAY' });
    drawMenuRows(ctx, ROWS, SLATE.x, SLATE.y + 40, SLATE.w, this.sel, this.frame);
    // the sign hangs over everything, swinging about its top centre
    drawLogoSign(ctx, VIEW_W / 2, 0, SWING * Math.sin(this.frame * SWING_RATE));
    if (this.frame % BLINK_PERIOD < BLINK_ON) {
      drawTextOutlined(ctx, START_TEXT, VIEW_W / 2, START_Y, { size: 2, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
    }
    drawHint(ctx, REPO_LABEL);
  }

  summary() { return { row: ROWS[this.sel], sel: this.sel, rows: ROWS.length, crew: this.crew.length }; }
  /** The only thing on this screen that could differ between two machines. */
  checksumFields() { return [this.sel]; }
}

export { ROWS as TITLE_ROWS };
