// RESULTS (docs/GDD.md section 7): the customer at the hatch eating, the plate sliding out to them over 10 frames
// with the dish on it, three chews (the customer's `eat` anim three times, a component off the plate on each), then a
// paper receipt carrying the stars, the tip in coins and - slammed across its foot - the red DELICIOUS / TASTY /
// EDIBLE stamp, and PRESS Z blinking. Confirm (or 600 frames) banks the customer with run.serve(stars) and calls the
// next one in line (the `line` screen), or, when they were the last in it, sends the truck back to the map for the
// next line - or, when that was the day's last line, to the board, which closes the truck for the night.
//
// The room is the kitchen's own layer (art/backgrounds/kitchen.js), so the hatch and shelf are the ones the dish was
// plated on; the room is dimmed and THE PARTY, the customer, the plate and the paper are drawn over the dim, so the
// only lit things are the joke and the score. The party stands along the counter watching somebody eat their food -
// the moment the whole game is built around - and throws `cheer` when the stars land, each seat a few frames behind
// the last so four critters never move as one body. Params: { stars, score }; a bare ?skipTo=results gets two stars.
import { UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, burstCrumbs, burstSparkle } from '../../art/fx.ts';
import { drawBust, idlePoseOf } from '../../art/portraits.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { DrawRigOpts, Rig, RigWeapon } from '../../lib/art/rig.ts';
import type { PartialPose } from '../../lib/art/poses.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawStamp, drawStars, drawHint, drawDim, ROW } from '../ui.ts';
import type { TicketOpts } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawText } from '../../engine/text.ts';
import type { DrawTextOptions } from '../../engine/text.ts';
import { kitchenLayer, BUST, ROWS } from '../../art/backgrounds/kitchen.ts';
import { paintStations, drawPlate, drawBellRing, drawStove, drawKettleSteam, PLATE, PROPS } from '../../art/kitchenProps.ts';
import { ITEMS } from '../../content/critters/items.ts';
// The customer holds the dish, so their rig is the kitchen's own rig-plus-held-food type rather than a bare Rig.
// Imported, not redeclared: `import type` erases, so this adds no runtime edge between the two screens.
import type { CritterRig } from './kitchen.ts';

const R = Math.round;
/** The timeline, in frames from enter(): the plate arrives, the chews run, and the paper prints over them. */
const SLIDE_FRAMES = 10, EAT_AT = 14, EAT_LEN = 42, CHEWS = 3;
/** The paper prints BEFORE the stamp slams, because the verdict is stamped on the receipt itself now: it used to
 *  slam onto the wall, straight across the pan rack and the shelf (director's note 13). */
const RECEIPT_AT = 30, STAMP_AT = 36, STARS_AT = 50, PROMPT_AT = 74, AUTO_AT = 600;
/** The party's cheer: seat 0 goes on the frame the stars land, each seat after it CHEER_LAG frames later. */
const CHEER_LAG = 5;
/** Confirm is ignored for the first frames so the bell press that served the dish cannot skip the whole screen. */
const CONFIRM_AT = 20;
/** Index by stars (1..3); index 0 is unreachable (stars are clamped to 1) but keeps the lookup flat. */
const STAMPS = ['EDIBLE', 'EDIBLE', 'TASTY', 'DELICIOUS'];
const COINS = [0, 4, 8, 12];
/** The tip's coins lie in ONE row on the counter under the receipt: the picture counts what the paper printed. */
const COIN_COLS = 12, COIN_PITCH = 10, COIN_R = 4;
/** Where the plate slides from (the kitchen side of the shelf) to (under the customer's chin). */
const PLATE_X0 = PLATE.x + 13, PLATE_X1 = BUST.x + 34;
/** Where the party stands to watch: along the counter left of the paper, facing the hatch, on the kitchen's feet
 *  line. The row is CENTRED on CREW_CX whatever the party's size, so two critters are never a huddle in one corner
 *  with two thirds of the counter empty (the lopsided-composition defect the pond was pulled up on). */
const CREW_CX = 169, CREW_DX = 72;
/**
 * The score is ONE piece of paper, standing immediately left of the hatch so it and the customer's face are one
 * glance apart: the stars in a band under the header, the order's worth under a rule, and the verdict stamped
 * across a blank foot - which is why the paper is 34 rows taller than its three printed rows need.
 */
const COL_X = 404, STAR_R = 9;
const RECEIPT_W = 164, RECEIPT_H = 16 + 24 + ROW * 3 + 34, RECEIPT_X = COL_X - RECEIPT_W / 2, RECEIPT_Y = 128;
/** Inside the paper: the star band under the header, a rule, the three printed rows, then the stamp's blank foot. */
const STARS_Y = RECEIPT_Y + 28, RULE_Y = RECEIPT_Y + 42, ROWS_Y = RECEIPT_Y + 46, STAMP_Y = RECEIPT_Y + 92;
const COIN_Y = RECEIPT_Y + RECEIPT_H + 6;
const RECEIPT_OPTS: TicketOpts = { title: 'RECEIPT', rules: false }, ROW_TEXT: DrawTextOptions = { size: 1, color: UI.ink, shadow: false }, ROW_RIGHT: DrawTextOptions = { size: 1, color: UI.ink, shadow: false, align: 'right' };
const DISH_LABEL = 'DISH', TIP_LABEL = 'TIP', TOTAL_LABEL = 'TOTAL';

/** One party member watching the customer eat: what `enter()` builds per `run.party` seat, in party order. */
export interface Watcher {
  /** Built once in enter(), never in draw(): the apron carries the seat's player colour. Nothing is ever in its
   *  paws on this screen, so this is a bare rig and not the kitchen's held-food one. */
  rig: Rig;
  player: AnimPlayer;
  /** The frame this seat throws its cheer: STARS_AT, CHEER_LAG frames later for each seat along the row. */
  cheerAt: number;
  /** True once it has thrown it (the cheer plays once, not every frame after `cheerAt`). */
  cheered: boolean;
  /** px along the counter: the feet centre, and `opts.x` with it. */
  x: number;
  /** The drawRig options, reused every frame (this file allocates nothing in draw()). */
  opts: DrawRigOpts;
}

/**
 * What `particles.draw`'s third parameter is. engine/particles.ts is not typed yet, so its `draw(ctx, cam, layer)`
 * reads as three REQUIRED parameters although its own doc comment calls the third one optional ("undefined = all")
 * - which is exactly how this screen calls it: one pass, every kind, over the dim. The assertion at the call site
 * says what particles.ts cannot yet; the singleton stays the receiver, so nothing about the call moves.
 */
interface ParticlesDraw {
  draw(ctx: CanvasRenderingContext2D, cam: { x: number; y: number } | null, layer?: 'back' | 'front'): void;
}

export class ResultsScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, and a screen's own declaration would also define a base field back to undefined),
  // and this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The party along the counter, in party order (not slot order). */
  declare crew: Watcher[];
  /** The room, pre-rendered once (art/backgrounds/kitchen.ts kitchenLayer) and blitted per frame. */
  declare layer: { canvas: HTMLCanvasElement; w: number; h: number };
  /** The verdict the kitchen awarded, clamped to 1..3: the stamp, the star band and the tip all read it. */
  declare stars: number;
  /** What the kitchen banked for the dish: `params.score`, or twice the stars for a bare ?skipTo=results. */
  declare score: number;
  /** The order's ingredients as food glyph ids (art/food.ts), in order. */
  declare icons: string[];
  /** Those ingredients' base hexes, in the same order. */
  declare hexes: string[];
  /** The customer at the hatch: their rig, with the dish in its paw until the last bite, ... */
  declare rig: CritterRig;
  /** ... the player driving the idle, the three chews and the cheer, ... */
  declare player: AnimPlayer;
  /** ... the pose the bust is anchored on (their idle's first frame), ... */
  declare anchor: PartialPose | null;
  /** ... and the drawBust options that face and inset them. */
  declare bustOpts: { facing: number; margin: number };
  /** Chews taken so far, 0..CHEWS. */
  declare chews: number;
  /** Components eaten off the plate, 0..icons.length. */
  declare eaten: number;
  /** True once confirm (or AUTO_AT) has banked the stage: the screen is on its way out. */
  declare left: boolean;
  // the strings, all of them built in enter() so draw() allocates nothing:
  /** The red stamp's word: STAMPS[stars]. */
  declare stampText: string;
  /** The tip in coins, COINS[stars]: the receipt's row and the discs under it count the same number. */
  declare tip: number;
  /** The receipt's DISH row: what was cooked. */
  declare dishText: string;
  /** Its TIP row. */
  declare tipText: string;
  /** Its TOTAL row: the run's score with this stage's stars banked. */
  declare totalText: string;
  /** The blinking PRESS <key> line. */
  declare prompt: string;

  constructor(game: Game) { super(game, 'results'); this.fields = []; this.crew = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layer = kitchenLayer(paintStations);
    particles.clear();
    this.stars = Math.max(1, Math.min(3, R(params.stars != null ? params.stars : 2)));
    this.score = params.score != null ? params.score : this.stars * 2;
    const order = run.order;
    this.icons = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).icon);
    this.hexes = order.needs.map((n) => (INGREDIENTS[n.id] || INGREDIENTS.apple).hex);
    const cust = getCustomer(order.customer);
    this.rig = critterRig(cust, -1); this.player = new AnimPlayer(cust.anims); this.player.play('idle');
    this.anchor = idlePoseOf(cust); this.bustOpts = { facing: -1, margin: BUST.margin };
    // `as RigWeapon`: content/critters/items.ts is not typed yet, so its `attach: 'handR'` widens to `string` and
    // its entries miss RigWeapon's `attach?: HandName` by that one field. The table IS a table of rig weapons -
    // rig.ts reads exactly these keys back off it - so the assertion says what items.ts cannot yet.
    this.rig.weapon = ITEMS.food as RigWeapon; this.rig.heldIcon = this.icons[0]; this.rig.heldHex = this.hexes[0];
    // the party, watching from along the counter: one rig per seat in its own apron, every idle started a few
    // frames apart so the row does not breathe in lockstep, and one cheer each on a stagger
    this.crew.length = 0;
    for (let i = 0; i < run.party.length; i++) {
      const p = run.party[i], def = getCritter(p.critter), player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < i * 7; k++) player.tick();
      const x = R(CREW_CX - (run.party.length - 1) * CREW_DX / 2 + i * CREW_DX);
      this.crew.push({
        rig: critterRig(def, p.slot), player, cheerAt: STARS_AT + i * CHEER_LAG, cheered: false,
        x, opts: { x, y: ROWS.feet, facing: 1 },
      });
    }
    this.chews = 0; this.eaten = 0; this.left = false;
    // every string the screen draws is built here: draw() allocates nothing (docs/ARCHITECTURE.md section 8)
    this.stampText = STAMPS[this.stars];
    this.tip = COINS[this.stars];
    this.dishText = order.dish;
    this.tipText = `${this.tip} COINS`;
    this.totalText = String(run.score + this.stars * 100);
    this.prompt = `PRESS ${game.input.keyText(0, 'action')}`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    particles.update();
    this.player.tick();
    for (let i = 0; i < this.crew.length; i++) {
      const c = this.crew[i];
      if (!c.cheered && f >= c.cheerAt) { c.cheered = true; c.player.play('cheer', { restart: true }); }
      c.player.tick();
    }
    // the chews: three eats, one after the other, each taking a component off the plate
    if (f >= EAT_AT && this.chews < CHEWS && (f - EAT_AT) % EAT_LEN === 0) {
      this.chews++;
      this.player.play('eat', { restart: true });
      // the dish goes down over the three chews whatever it is made of, so the last bite empties the plate
      this.eaten = Math.min(this.icons.length, R(this.chews * this.icons.length / CHEWS));
      if (this.eaten >= this.icons.length) this.dropFood();
      burstCrumbs(PLATE_X1 + 4, PLATE.y - 14, PLATE.y + 6, this.hexes[0], 5, true);
    }
    // `cheer` raises the near arm forward: the paw must be empty before it, or the apple lands on the beak and
    // the near eye - the one thing ART_STYLE section 0.7 forbids outright, on the shot this screen is built around
    if (this.chews >= CHEWS && this.player.done && this.player.name !== 'cheer') { this.dropFood(); this.player.play('cheer'); }
    if (f === STAMP_AT) burstSparkle(COL_X, STAMP_Y + 10, 6, UI.cream, true);
    if (this.left) return;
    if ((f >= CONFIRM_AT && confirmPressed(game.input) >= 0) || f >= AUTO_AT) {
      this.left = true;
      const run = game.run;
      run.serve(this.stars);
      // the next in line steps up; a finished line sends the truck on to the next one, and the last line closes the day
      game.replace(!run.lineDone() ? 'line' : run.dayComplete() ? 'stage' : 'map');
    }
  }

  /** The dish is gone: empty the customer's paw so the raised arm carries nothing across their face. */
  dropFood(): void { this.rig.weapon = null; this.rig.heldIcon = null; this.rig.heldHex = null; }

  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    blitAt(ctx, this.layer, 0, 0);
    // the copper pot's body is a per-frame mark in the kitchen, so it has to be drawn here too or the hob is a
    // bare slab; it goes UNDER the dim with the rest of the room (off the heat, no flame, no steam)
    drawStove(ctx, false, 0, f);
    drawKettleSteam(ctx, f);   // the kettle is still on while somebody eats: the room's one unstoppable mark
    drawDim(ctx, 0.66);
    // over the dim: the party along the counter, the customer in the hatch, the plate sliding between them. The
    // room stays dark and these are the lit things, which is the interior ladder (ART_STYLE section 7)
    for (let i = 0; i < this.crew.length; i++) drawShadow(ctx, this.crew[i].x, ROWS.feet, this.crew[i].rig.width + 6, 0.4, 0);
    for (let i = this.crew.length - 1; i >= 0; i--) drawRig(ctx, this.crew[i].rig, this.crew[i].player.pose, this.crew[i].opts);
    drawBust(ctx, this.rig, this.player.pose, this.anchor, BUST.x, BUST.y, BUST.w, BUST.h, BUST.scale, this.bustOpts);
    const k = f >= SLIDE_FRAMES ? 1 : f / SLIDE_FRAMES;
    const px = R(PLATE_X0 + (PLATE_X1 - PLATE_X0) * (1 - (1 - k) * (1 - k)));
    drawPlate(ctx, px, PLATE.y, this.icons, this.hexes, Math.max(0, this.icons.length - this.eaten), 1);
    drawBellRing(ctx, f < 8 ? f : -1);
    (particles as ParticlesDraw).draw(ctx, null);   // every kind in one pass: see ParticlesDraw
    if (f >= RECEIPT_AT) this.drawReceipt(ctx);
    if (f >= STAMP_AT) drawStamp(ctx, this.stampText, COL_X, STAMP_Y, (f - STAMP_AT) / 24);
    if (f >= PROMPT_AT && ((f >> 4) & 1)) drawHint(ctx, this.prompt);
  }

  /** The whole score on one piece of paper: the stars over a rule, what the order was worth under it, and the
   *  verdict stamped across the blank foot. It sits beside the hatch, so the customer's face and the score are one
   *  glance apart and neither of them is printed on the room's furniture. */
  drawReceipt(ctx: CanvasRenderingContext2D): void {
    const x = RECEIPT_X;
    drawTicket(ctx, x, RECEIPT_Y, RECEIPT_W, RECEIPT_H, RECEIPT_OPTS);
    drawStars(ctx, COL_X, STARS_Y, this.stars, 3, STAR_R);
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 4, RULE_Y, RECEIPT_W - 8, 1);
    const right = x + RECEIPT_W - 6;
    drawText(ctx, DISH_LABEL, x + 6, ROWS_Y, ROW_TEXT); drawText(ctx, this.dishText, right, ROWS_Y, ROW_RIGHT);
    drawText(ctx, TIP_LABEL, x + 6, ROWS_Y + ROW, ROW_TEXT); drawText(ctx, this.tipText, right, ROWS_Y + ROW, ROW_RIGHT);
    drawText(ctx, TOTAL_LABEL, x + 6, ROWS_Y + ROW * 2, ROW_TEXT); drawText(ctx, this.totalText, right, ROWS_Y + ROW * 2, ROW_RIGHT);
    // the tip's coins: one brass disc per coin the receipt promised, in a row on the counter at the paper's foot
    for (let i = 0; i < this.tip; i++) {
      const cx = x + 22 + (i % COIN_COLS) * COIN_PITCH, cy = COIN_Y + ((i / COIN_COLS) | 0) * COIN_PITCH;
      ctx.beginPath(); ctx.arc(cx, cy, COIN_R, 0, Math.PI * 2);
      ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
      ctx.fillStyle = PROPS.brassSh; ctx.fillRect(cx - 1, cy, 3, 3);
    }
  }

  override summary() { return { stars: this.stars, score: this.score, chews: this.chews, eaten: this.eaten, stamp: this.frame >= STAMP_AT ? this.stampText : '', left: this.left }; }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] { const f = this.fields; f.length = 0; f.push(this.frame, this.stars, this.chews, this.eaten, this.left ? 1 : 0); return f; }
}
