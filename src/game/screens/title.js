// TITLE (docs/GDD.md section 10): the parked truck on the dusk lane, a crate of produce on the verge, the crew
// idling beside it, the FOODIE TRUCK sign swinging over the whole picture and a chalk A-frame menu.
//
// Nothing here simulates anything: the only state is which menu row is selected, so `checksumFields` is one
// number and the screen is trivially net-safe. The lane and the sign are pre-rendered layers (art/logo.js); the
// four critters are the only per-frame drawing, each on its own beat of the shared animation table.
import { VIEW_W, UI, REPO_URL, REPO_LABEL } from '../../constants.js';
import { Screen } from '../game.js';
import { drawTextOutlined } from '../../engine/text.js';
import { drawRig } from '../../art/rig.js';
import { drawShadow } from '../../art/fx.js';
import { drawTruck } from '../../art/truck.js';
import { critterRig } from '../../content/critters/common.js';
import { ITEMS } from '../../content/critters/items.js';
import { drawFood } from '../../art/food.js';
import { LIGHT_X, LIGHT_Y } from '../../art/shading.js';
import { CRITTERS } from '../../content/critters/index.js';
import { AnimPlayer } from '../animation.js';
import { drawSlate, drawMenuRows, drawHint } from '../ui.js';
import { confirmPressed, navY } from '../menuinput.js';
import { drawLane, drawLogoSign, drawCrate, drawBlock, TRUCK_Y, CREW_Y } from '../../art/logo.js';

/** The menu, and the screen each row opens. SOURCE is a link, not a screen. */
const ROWS = ['PLAY', 'ONLINE', 'CREW', 'SOURCE'];
/** The A-frame slate on the verge, right of the truck. Sized to its four rows: an empty board is dead green. */
const SLATE = { x: 426, y: 188, w: 176, h: 90 };
/**
 * Where the truck parks, the crate it was loaded from, and where the crew lines up.
 *
 * The crew used to stand ACROSS the truck's hatch: the awning, the serving window and the chalk board behind
 * them read as coloured slabs, and the board stuck out from behind Barley's shoulder as an unreadable green
 * lump. They now stand clear of the hatch and only the first one laps the cab, so the picture reads
 * truck | crew | menu left to right, and the truck is a truck.
 */
const TRUCK_X = 150, CRATE_X = 56, CRATE_Y = 300;
/**
 * Wider and unevenly spaced, not a 48 px rank: once each critter carries its own beat the knife, the raised paw
 * and the basket all need room around them, and at the old pitch Cress's basket hung over Chicory's chest.
 * The chef stands behind the chopping block, so their gap is the block's width.
 */
const CREW_X = [202, 270, 352, 406];
/**
 * The crew are drawn a third up from the sprite's own scale: at 1x, four 56 px critters on a 360 px picture read
 * as a row of tokens rather than as the cast, and the cast is one of the three things this screen has to say.
 */
const CREW_SCALE = 1.35;
/**
 * The apple Barley is working on. `ITEMS.food` draws at s 5, which is smaller than the 5 px paw that ART_STYLE
 * section 0.3 draws OVER the item, so on the lane it read as a red sliver behind a cream disc; this is the same
 * `drawFood` apple at s 8, big enough to clear the paw at every angle of the chew. The counter-rotation is
 * `items.js upright()`: the apple stays the right way up whatever the arm is doing.
 */
const APPLE = { attach: 'handR', length: 12, draw(ctx, rig) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  ctx.save(); ctx.rotate(a); drawFood(ctx, 'apple', 1, 2, 8, UI.red); ctx.restore();
} };
/** The chopping block stands where the blade comes down, with a clear strip of lane either side of it. */
const BLOCK_X = 313, BLOCK_Y = 294;
/**
 * The lineup is STAGED, not ranked. Four critters shoulder to shoulder in the same neutral `idle`, empty-pawed,
 * every eye on the lens, was a passport photo: the silhouettes differed by costume and by nothing else, and the
 * screen advertised a food truck with no food in it. Each seat now plays its OWN beat off the shared table with
 * the prop that beat is authored around (content/critters/items.js), so the row reads as a working crew:
 * Barley has an apple, Sorrel is chopping over the block, Chicory waves back down the line and Cress walks the
 * basket up it - two of them turned in toward the others instead of eight eyes on the lens. `dy` sets each one a
 * few pixels off the others' baseline so the row is a group standing about rather than a rank, `hold` is how long
 * a one-shot beat sits on its last key before it goes again (a repeated action, not a stutter), and `phase` opens
 * the screen with all four on different beats. Pose, prop, facing and footing only - no new rig art, no new anims.
 */
const CREW_ACT = [
  { anim: 'eat', item: APPLE, facing: 1, dy: 0, hold: 0, phase: 12 },
  { anim: 'chop', item: ITEMS.knife, facing: 1, dy: -5, hold: 30, phase: 20 },
  { anim: 'wave', item: null, facing: -1, dy: -2, hold: 0, phase: 5 },
  { anim: 'carry', item: ITEMS.basket, facing: -1, dy: 1, hold: 0, phase: 31 },
];
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
    // Back at the front door: forget which pad claimed which couch seat, and let the couch fill again from
    // scratch - four seats, pads welcome (an online lobby we have just walked out of had claiming switched off).
    this.game.input.setPadClaims(true);
    this.game.input.resetClaims();
    this.sel = 0;
    this.crew = CRITTERS.map((def, i) => {
      // nobody is seated on the title, so the crew wears the off-duty apron: the four player colours mean "this
      // seat is taken" everywhere else (constants.js OFF_DUTY_APRON, docs/ART_STYLE.md section 4)
      const act = CREW_ACT[i % CREW_ACT.length];
      const seat = { rig: critterRig(def, -1), player: new AnimPlayer(def.anims), act, wait: 0 };
      seat.rig.weapon = act.item;
      seat.rig.basketFill = 0.5;
      seat.player.play(act.anim);
      // every seat starts a dozen-odd frames into its own beat: four loops of different lengths that never
      // line up, and nobody is caught on their anticipation key the moment the screen opens
      for (let k = 0; k < act.phase; k++) this.tickSeat(seat);
      return seat;
    });
  }

  update() {
    super.update();
    const inp = this.game.input;
    const dy = navY(inp);
    if (dy) this.sel = (this.sel + dy + ROWS.length) % ROWS.length;
    if (confirmPressed(inp) >= 0) this.choose();
    for (const s of this.crew) this.tickSeat(s);
  }

  /** One seat, one step: a one-shot beat sits on its last key for `hold` frames and then goes again. */
  tickSeat(s) {
    s.player.tick();
    if (!s.player.done) return;
    if (s.wait < s.act.hold) { s.wait++; return; }
    s.wait = 0;
    s.player.play(s.act.anim, { restart: true });
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
    // the parked truck, then the crew beside it: a y-sort of two rows, each on its own contact shadow
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 112, 0.28);
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    // the crate it was loaded from, nearer the camera than the truck and clear of the crew's clean lane
    drawShadow(ctx, CRATE_X, CRATE_Y, 44, 0.3);
    drawCrate(ctx, CRATE_X, CRATE_Y);
    // the block the chef works over, UNDER the crew pass: drawn after them it swallowed the blade on the way down
    drawShadow(ctx, BLOCK_X, BLOCK_Y, 26, 0.3);
    drawBlock(ctx, BLOCK_X, BLOCK_Y);
    for (let i = 0; i < this.crew.length; i++) {
      const s = this.crew[i], x = CREW_X[i], y = CREW_Y + s.act.dy;
      drawShadow(ctx, x, y, 34, 0.4);
      drawRig(ctx, s.rig, s.player.pose, { x, y, facing: s.act.facing, scale: CREW_SCALE });
    }
    // the A-frame: two legs, each on its OWN contact shadow. One wide ellipse between the feet touched neither of
    // them and read as a smudge on the verge.
    drawShadow(ctx, SLATE.x + 30, SLATE.y + SLATE.h + 24, 22, 0.28);
    drawShadow(ctx, SLATE.x + SLATE.w - 30, SLATE.y + SLATE.h + 24, 22, 0.28);
    ctx.fillStyle = UI.ink; ctx.fillRect(SLATE.x + 25, SLATE.y + SLATE.h - 1, 10, 26); ctx.fillRect(SLATE.x + SLATE.w - 35, SLATE.y + SLATE.h - 1, 10, 26);
    ctx.fillStyle = UI.wood; ctx.fillRect(SLATE.x + 26, SLATE.y + SLATE.h, 8, 24); ctx.fillRect(SLATE.x + SLATE.w - 34, SLATE.y + SLATE.h, 8, 24);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(SLATE.x + 32, SLATE.y + SLATE.h, 2, 24); ctx.fillRect(SLATE.x + SLATE.w - 28, SLATE.y + SLATE.h, 2, 24);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: 'TODAY' });
    drawMenuRows(ctx, ROWS, SLATE.x, SLATE.y + 38, SLATE.w, this.sel, this.frame);
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
