// RESULTS (docs/GDD.md section 7): the customer at the hatch eating, the plate sliding out to them over 10 frames
// with the dish on it, three chews (the customer's `eat` anim three times, a component off the plate on each), then a
// red stamp by stars - DELICIOUS / TASTY / EDIBLE - with the 6-frame slam, the stars, the tip in coins on a paper
// receipt, and PRESS Z blinking. Confirm (or 600 frames) banks the order with run.serve(stars) and returns to the map.
//
// The room is the kitchen's own layer (art/backgrounds/kitchen.js), so the hatch and shelf are the ones the dish was
// plated on; everything but the customer and the plate is dimmed, which turns the kitchen into a backdrop for the
// paper and puts the light on the one thing that matters - whether they liked it. Params: { stars, score }; a bare
// ?skipTo=results gets two stars.
import { UI } from '../../constants.js';
import { Screen } from '../game.js';
import { particles } from '../../engine/particles.js';
import { blitAt } from '../../art/layers.js';
import { burstCrumbs, burstSparkle } from '../../art/fx.js';
import { drawBust, idlePoseOf } from '../../art/portraits.js';
import { critterRig } from '../../content/critters/common.js';
import { getCustomer } from '../../content/critters/customers.js';
import { INGREDIENTS } from '../../content/recipes.js';
import { AnimPlayer } from '../animation.js';
import { drawTicket, drawStamp, drawStars, drawHint, drawDim, ROW } from '../ui.js';
import { confirmPressed } from '../menuinput.js';
import { drawText } from '../../engine/text.js';
import { kitchenLayer, HATCH } from '../../art/backgrounds/kitchen.js';
import { paintStations, drawPlate, drawBellRing, PLATE, PROPS } from '../../art/kitchenProps.js';
import { ITEMS } from '../../content/critters/items.js';

const R = Math.round;
/** The timeline, in frames from enter(): the plate arrives, the chews run, and the paper prints over them. */
const SLIDE_FRAMES = 10, EAT_AT = 14, EAT_LEN = 42, CHEWS = 3;
const STAMP_AT = 36, STARS_AT = 50, RECEIPT_AT = 60, PROMPT_AT = 74, AUTO_AT = 600;
/** Confirm is ignored for the first frames so the bell press that served the dish cannot skip the whole screen. */
const CONFIRM_AT = 20;
/** Index by stars (1..3); index 0 is unreachable (stars are clamped to 1) but keeps the lookup flat. */
const STAMPS = ['EDIBLE', 'EDIBLE', 'TASTY', 'DELICIOUS'];
const COINS = [0, 4, 8, 12];
/** Where the plate slides from (the kitchen side of the shelf) to (under the customer's chin). */
const PLATE_X0 = PLATE.x + 13, PLATE_X1 = HATCH.x + 30;
/** The paper column, left of the hatch: the stamp, the stars and the receipt under them. */
const COL_X = 250, STAMP_Y = 98, STARS_Y = 138;
const RECEIPT_W = 156, RECEIPT_H = 16 + ROW * 4 + 6, RECEIPT_X = COL_X - RECEIPT_W / 2, RECEIPT_Y = 158;
const RECEIPT_OPTS = { title: 'RECEIPT' }, ROW_TEXT = { size: 1, color: UI.ink, shadow: false }, ROW_RIGHT = { size: 1, color: UI.ink, shadow: false, align: 'right' };
const DISH_LABEL = 'DISH', STARS_LABEL = 'STARS', TIP_LABEL = 'TIP', TOTAL_LABEL = 'TOTAL';

export class ResultsScreen extends Screen {
  constructor(game) { super(game, 'results'); this.fields = []; }

  enter(params) {
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
    this.anchor = idlePoseOf(cust); this.bustOpts = { facing: -1, margin: 8 };
    this.rig.weapon = ITEMS.food; this.rig.heldIcon = this.icons[0]; this.rig.heldHex = this.hexes[0];
    this.chews = 0; this.eaten = 0; this.left = false;
    // every string the screen draws is built here: draw() allocates nothing (docs/ARCHITECTURE.md section 8)
    this.stampText = STAMPS[this.stars];
    this.tip = COINS[this.stars];
    this.dishText = order.dish;
    this.starsText = `${this.stars} / 3`;
    this.tipText = `${this.tip} COINS`;
    this.totalText = String(run.score + this.stars * 100);
    this.prompt = `PRESS ${game.input.keyText(0, 'action')}`;
    this.fields.length = 0;
  }

  update() {
    super.update();
    const game = this.game, f = this.frame;
    particles.update();
    this.player.tick();
    // the chews: three eats, one after the other, each taking a component off the plate
    if (f >= EAT_AT && this.chews < CHEWS && (f - EAT_AT) % EAT_LEN === 0) {
      this.chews++;
      this.player.play('eat', { restart: true });
      // the dish goes down over the three chews whatever it is made of, so the last bite empties the plate
      this.eaten = Math.min(this.icons.length, R(this.chews * this.icons.length / CHEWS));
      burstCrumbs(PLATE_X1 + 4, PLATE.y - 14, PLATE.y + 6, this.hexes[0], 5, true);
    }
    if (this.chews >= CHEWS && this.player.done && this.player.name !== 'cheer') this.player.play('cheer');
    if (f === STAMP_AT) burstSparkle(COL_X, STAMP_Y + 10, 6, UI.cream, true);
    if (this.left) return;
    if ((f >= CONFIRM_AT && confirmPressed(game.input) >= 0) || f >= AUTO_AT) {
      this.left = true;
      game.run.serve(this.stars);
      game.replace('map');
    }
  }

  draw(ctx) {
    const f = this.frame;
    blitAt(ctx, this.layer, 0, 0);
    drawDim(ctx, 0.8);
    // the customer fills the hatch; the plate slides along the shelf to them, both over the dim
    drawBust(ctx, this.rig, this.player.pose, this.anchor, HATCH.x + 6, HATCH.y + 4, 104, HATCH.shelfY - HATCH.y - 4, 1.7, this.bustOpts);
    const k = f >= SLIDE_FRAMES ? 1 : f / SLIDE_FRAMES;
    const px = R(PLATE_X0 + (PLATE_X1 - PLATE_X0) * (1 - (1 - k) * (1 - k)));
    drawPlate(ctx, px, PLATE.y, this.icons, this.hexes, Math.max(0, this.icons.length - this.eaten), 1);
    drawBellRing(ctx, f < 8 ? f : -1);
    particles.draw(ctx, null);
    if (f >= STAMP_AT) drawStamp(ctx, this.stampText, COL_X, STAMP_Y, (f - STAMP_AT) / 24);
    if (f >= STARS_AT) drawStars(ctx, COL_X, STARS_Y, this.stars, 3, 9);
    if (f >= RECEIPT_AT) this.drawReceipt(ctx);
    if (f >= PROMPT_AT && ((f >> 4) & 1)) drawHint(ctx, this.prompt);
  }

  drawReceipt(ctx) {
    const x = RECEIPT_X, top = drawTicket(ctx, x, RECEIPT_Y, RECEIPT_W, RECEIPT_H, RECEIPT_OPTS);
    const right = x + RECEIPT_W - 6;
    drawText(ctx, DISH_LABEL, x + 6, top + 2, ROW_TEXT); drawText(ctx, this.dishText, right, top + 2, ROW_RIGHT);
    drawText(ctx, STARS_LABEL, x + 6, top + 2 + ROW, ROW_TEXT); drawText(ctx, this.starsText, right, top + 2 + ROW, ROW_RIGHT);
    drawText(ctx, TIP_LABEL, x + 6, top + 2 + ROW * 2, ROW_TEXT); drawText(ctx, this.tipText, right, top + 2 + ROW * 2, ROW_RIGHT);
    drawText(ctx, TOTAL_LABEL, x + 6, top + 2 + ROW * 3, ROW_TEXT); drawText(ctx, this.totalText, right, top + 2 + ROW * 3, ROW_RIGHT);
    // the tip's coins: one brass disc per star, stacked at the receipt's foot
    for (let i = 0; i < this.stars; i++) {
      const cx = x + 20 + i * 17, cy = RECEIPT_Y + RECEIPT_H + 10;
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
      ctx.fillStyle = PROPS.brassSh; ctx.fillRect(cx - 2, cy - 1, 4, 4);
      ctx.fillStyle = UI.ink; ctx.fillRect(cx - 1, cy - 3, 2, 6);
    }
  }

  summary() { return { stars: this.stars, score: this.score, chews: this.chews, eaten: this.eaten, stamp: this.frame >= STAMP_AT ? this.stampText : '', left: this.left }; }
  /** Every field that could diverge between peers (net/checksum.js). */
  checksumFields() { const f = this.fields; f.length = 0; f.push(this.frame, this.stars, this.chews, this.eaten, this.left ? 1 : 0); return f; }
}
