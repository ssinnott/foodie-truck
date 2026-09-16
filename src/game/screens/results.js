// RESULTS (docs/GDD.md section 7): the customer at the hatch at 2x, the plate sliding out to them over 10 frames
// with the dish on it, three chews (the customer's `eat` anim three times, a component vanishing on each), then a
// red stamp by stars - DELICIOUS / TASTY / EDIBLE - with the 6-frame slam, the stars, the tip in coins on a paper
// receipt, and PRESS Z blinking. Confirm (or 600 frames) banks the order with run.serve(stars) and returns to the map.
// The room is the kitchen's own layer (art/backgrounds/kitchen.js), so the hatch and shelf are the same ones the
// dish was plated on. Params: { stars, score }; a bare ?skipTo=results gets two stars.
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
import { drawTicket, drawStamp, drawStars, drawHint, ROW } from '../ui.js';
import { confirmPressed } from '../menuinput.js';
import { drawText } from '../../engine/text.js';
import { kitchenLayer, HATCH } from '../../art/backgrounds/kitchen.js';
import { paintStations, drawPlate, drawStove, PLATE, PROPS } from '../../art/kitchenProps.js';
import { ITEMS } from '../../content/critters/items.js';

const R = Math.round;
/** The timeline, in frames from enter(). */
const SLIDE_FRAMES = 10, EAT_AT = 24, EAT_LEN = 42, CHEWS = 3, STAMP_AT = 156, STARS_AT = 170, RECEIPT_AT = 184, PROMPT_AT = 200, AUTO_AT = 600;
/** Confirm is ignored for the first frames so the bell press that served the dish cannot skip the whole screen. */
const CONFIRM_AT = 20;
const STAMPS = ['EDIBLE', 'EDIBLE', 'TASTY', 'DELICIOUS'];
const COINS = [0, 4, 8, 12];
/** Where the plate slides from (the kitchen side of the shelf) to (under the customer's chin). */
const PLATE_X0 = PLATE.x + 13, PLATE_X1 = HATCH.x + 78;
const RECEIPT_X = 176, RECEIPT_Y = 150, RECEIPT_W = 150, RECEIPT_H = 16 + ROW * 4 + 6;
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
    this.anchor = idlePoseOf(cust); this.bustOpts = { facing: -1, margin: 18 };
    this.rig.weapon = ITEMS.food; this.rig.heldIcon = this.icons[0]; this.rig.heldHex = this.hexes[0];
    this.chews = 0; this.eaten = 0; this.left = false;
    this.stampText = STAMPS[this.stars];
    this.tip = COINS[this.stars];
    this.dishText = order.dish;
    this.starsText = '★'.repeat(this.stars);
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
      this.eaten = Math.min(this.icons.length, this.eaten + 1);
      burstCrumbs(PLATE_X1 + 4, PLATE.y - 14, PLATE.y + 6, this.hexes[0], 5, true);
    }
    if (this.chews >= CHEWS && this.player.done && this.player.name !== 'cheer') this.player.play('cheer');
    if (f === STAMP_AT) burstSparkle(PLATE_X1, PLATE.y - 30, 6, UI.cream, true);
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
    drawStove(ctx, false, 0, f, false);
    // the customer at 2x fills the hatch; the plate slides along the shelf to them
    drawBust(ctx, this.rig, this.player.pose, this.anchor, HATCH.x + 2, HATCH.y + 2, HATCH.w - 4, HATCH.shelfY - HATCH.y - 2, 2, this.bustOpts);
    const k = f >= SLIDE_FRAMES ? 1 : f / SLIDE_FRAMES;
    const px = R(PLATE_X0 + (PLATE_X1 - PLATE_X0) * (1 - (1 - k) * (1 - k)));
    drawPlate(ctx, px, PLATE.y, this.icons, this.hexes, Math.max(0, this.icons.length - this.eaten), 1);
    particles.draw(ctx, null);
    if (f >= STAMP_AT) drawStamp(ctx, this.stampText, HATCH.x + 40, HATCH.y - 20, (f - STAMP_AT) / 24);
    if (f >= STARS_AT) drawStars(ctx, RECEIPT_X + RECEIPT_W / 2, RECEIPT_Y - 28, this.stars, 3, 9);
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
    // the tip's coins: one brass disc per four coins, stacked at the receipt's foot
    for (let i = 0; i < this.stars; i++) {
      ctx.beginPath(); ctx.arc(x + 14 + i * 12, RECEIPT_Y + RECEIPT_H + 10, 5, 0, Math.PI * 2);
      ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
      ctx.fillStyle = UI.ink; ctx.fillRect(x + 13 + i * 12, RECEIPT_Y + RECEIPT_H + 8, 2, 4);
    }
  }

  summary() { return { stars: this.stars, score: this.score, chews: this.chews, eaten: this.eaten, stamp: this.frame >= STAMP_AT ? this.stampText : '', left: this.left }; }
  /** Every field that could diverge between peers (net/checksum.js). */
  checksumFields() { const f = this.fields; f.length = 0; f.push(this.frame, this.stars, this.chews, this.eaten, this.left ? 1 : 0); return f; }
}
