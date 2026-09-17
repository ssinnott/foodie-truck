// THE ORDER BOARD (docs/GDD.md sections 3 and 10): the day's seven stages pinned up on paper, each one a CUSTOMER
// and the RECIPE they phone in. The party picks which one the truck works on; when the last one has been served the
// board closes the truck for the night, which is where the game ends.
//
// `select` hands over to it once a crew is stamped, and `results` hands back to it after every dish, with the stage
// just cooked stamped SERVED and the stars it earned printed on its ticket. The board is a
// MENU in the sense of game/menuinput.js - any joined seat drives the one shared cursor - so a couch P2 or an
// online guest can pick the next order, and everything it simulates is three numbers (`checksumFields`).
//
// Nothing here is random and nothing reads the clock: the cards, the rigs and every string are built in enter().
import { VIEW_W, UI, PLUM } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { drawHeadPortrait, idlePoseOf } from '../../art/portraits.js';
import { critterRig } from '../../content/critters/common.js';
import { getCustomer } from '../../content/critters/customers.js';
import { AnimPlayer } from '../animation.js';
import { ORDERS, INGREDIENTS } from '../../content/recipes.js';
import { PLACES } from '../../content/places.js';
import { drawFood } from '../../art/food.js';
import { drawTicket, drawSign, drawSlate, drawStamp, drawStars, drawHint, drawDim, cardX, CARD_W } from '../ui.js';
import { confirmPressed, cancelPressed, navX, navY } from '../menuinput.js';
import { drawLane } from '../../art/logo.js';
import { TRUCK } from '../../art/truck.js';

/** Four tickets on the top row, the rest under them: seven cards of the select screen's own width and gap. */
const COLS = 4, CARD_H = 124, ROW_Y = [46, 178];
/**
 * Inside a card: the header band, the customer's portrait box with their name and the night's stars beside it, the
 * dish across the middle in the card's largest type, and one NEED row per ingredient under a rule. The dish WRAPS
 * at its space rather than dropping to a smaller size, so all seven headlines are the same size 2 and the board
 * reads as one menu instead of four shouted names and three whispered ones.
 */
const PORT_X = 8, PORT_Y = 20, PORT_S = 40;
const TEXT_X = PORT_X + PORT_S + 6, NAME_Y = 26, STARS_X = TEXT_X + 40, STARS_Y = 46, STAR_R = 5;
const DISH_Y = 66, DISH_ROW = 14, RULE_Y = 98, NEED_Y = 102, NEED_ROW = 11, NEED_X = 14, NEED_TEXT_X = 22;
/**
 * A served card keeps its dish, its customer and its stars and gives the NEED rows up to the stamp: what a stage
 * wants gathered stops being news once it has been cooked, and a SERVED slammed across the headline would take
 * the one line that says which stage this is with it.
 */
const STAMP_Y = 112;
/** The stamp lands over the card's blank foot, in the truck's own beetroot - the select screen's READY ink. */
const STAMP_OPTS = { size: 2, color: TRUCK.body, light: TRUCK.bodyHi };
const STAMP_FRAMES = 24, SERVED_TEXT = 'SERVED';
/** The order pad under the board: the customer's phone line, who said it, and where that order sends the truck. */
const PAD = { x: 60, y: 306, w: 520, h: 30 };
/** A served card is paper that has been handled: UI.paperDark at 45 % over the whole ticket, so the open ones lead. */
const DONE_WASH = 'rgba(216,192,147,0.45)';
const HEAD_TEXT = 'THE ORDER BOARD';
/** Closing time: the slate that ends the day, and the rows printed on it. */
const SLATE = { x: 176, y: 106, w: 288, h: 124 };
const CLOSE_TITLE = 'CLOSING TIME', CLOSE_ROW = 18, CLOSE_Y = 46, CLOSED_TEXT = 'THE TRUCK IS CLOSED FOR THE NIGHT';
const BLINK_PERIOD = 60, BLINK_ON = 40;

/**
 * A dish name over at most two rows: it breaks at the space nearest the middle, so 'APPLE OMELETTE' is two words
 * on two rows rather than one row clipped by the card. A name that fits whole stays whole.
 */
function wrapDish(dish) {
  if (measureText(dish, 2) <= CARD_W - 12) return [dish];
  const words = dish.split(' ');
  if (words.length < 2) return [dish];
  let best = 1, bd = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < bd) { bd = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export class StageScreen extends Screen {
  constructor(game) { super(game, 'stage'); this.cards = []; this.busts = []; this.rows = []; this.fields = []; }

  enter(params) {
    super.enter(params);
    const game = this.game, run = game.run;
    // one rig and one idle beat per DISTINCT customer (three of them serve seven orders), phased apart so the
    // board does not breathe in lockstep; a card keeps the index of the bust it draws
    this.busts.length = 0;
    const byId = new Map();
    this.cards = ORDERS.map((o, i) => {
      let bi = byId.get(o.customer);
      if (bi == null) {
        const def = getCustomer(o.customer), player = new AnimPlayer(def.anims);
        player.play('idle');
        for (let k = 0; k < this.busts.length * 13; k++) player.tick();
        bi = this.busts.length;
        this.busts.push({ def, rig: critterRig(def, -1), player, anchor: idlePoseOf(def) });
        byId.set(o.customer, bi);
      }
      const def = this.busts[bi].def;
      const row = i < COLS ? 0 : 1, col = i < COLS ? i : i - COLS;
      const inRow = row === 0 ? Math.min(COLS, ORDERS.length) : ORDERS.length - COLS;
      const needs = o.needs.map((n) => {
        const ing = INGREDIENTS[n.id] || INGREDIENTS.apple;
        const place = PLACES.find((p) => p.id === ing.place);
        return { icon: ing.icon, hex: ing.hex, text: `${ing.name} ${n.amount}`, place: place ? place.name : ing.place.toUpperCase() };
      });
      return {
        bust: bi, x: cardX(col, inRow), y: ROW_Y[row], row, col,
        title: `ORDER ${String(i + 1).padStart(2, '0')}`,
        name: def.name, dish: o.dish, lines: wrapDish(o.dish),
        needs, line: o.line, who: `${def.role}    STOPS: ${needs.map((n) => n.place).join(', ')}`,
      };
    });
    this.closed = run.dayComplete();
    this.justServed = run.lastServed;
    this.sel = this.firstOpen(run, run.lastServed >= 0 ? run.lastServed + 1 : run.stage);
    this.chosen = -1;
    this.stampT = 0;
    this.servedText = `SERVED ${run.cleared()} OF ${run.stages.length}`;
    this.starsText = `STARS ${run.stars()} OF ${run.stages.length * 3}`;
    this.takingsText = `TAKINGS ${run.score}`;
    this.rows.length = 0;
    this.rows.push(this.servedText, this.starsText, this.takingsText);
    this.hint = this.closed
      ? `${game.input.keyText(0, 'action')}: TITLE`
      : `${game.input.keyText(0, 'action')}: TAKE THE ORDER    ${game.input.keyText(0, 'cancel')}: BACK`;
    this.portOpts = { bg: PLUM.shadow, fill: 0.6, facing: 1 };
  }

  /** The first stage still to be served, scanning from `from`; the day's last card when every one is done. */
  firstOpen(run, from) {
    const n = run.stages.length;
    for (let k = 0; k < n; k++) { const i = (((from + k) % n) + n) % n; if (!run.stages[i].stars) return i; }
    return (((from) % n) + n) % n;
  }

  update() {
    super.update();
    const game = this.game, inp = game.input, run = game.run;
    for (const b of this.busts) { b.player.tick(); if (b.player.done) b.player.play('idle', { restart: true }); }
    if (this.stampT < STAMP_FRAMES) this.stampT++;
    // the night is over: the only thing left on the board is the way out
    if (this.closed) {
      if (confirmPressed(inp) >= 0) this.quit();
      return;
    }
    if (this.chosen >= 0) return;                      // the pick is made, the fade is running
    const dx = navX(inp), dy = navY(inp), n = this.cards.length;
    if (dx) this.sel = (this.sel + dx + n) % n;
    if (dy < 0 && this.sel >= COLS) this.sel -= COLS;
    else if (dy > 0 && this.sel < COLS) this.sel = Math.min(n - 1, this.sel + COLS);
    if (confirmPressed(inp) >= 0) {
      this.chosen = this.sel;
      run.setStage(this.sel);
      game.fadeTo(() => game.replace('map'));
      return;
    }
    // Backing out to the title is a LOCAL way out: online it would drop one peer out of a live room and stall
    // the rest, which is why the pause overlay is refused there too (docs/ARCHITECTURE.md section 5).
    if (cancelPressed(inp) >= 0 && !(game.net && game.net.active)) game.reset('title');
  }

  /** Closing time, confirmed: leave the room if there is one, then back to the front door. */
  quit() {
    const game = this.game;
    if (game.net) { try { game.net.leave(); } catch { /* a room that is already gone */ } game.net = null; }
    game.reset('title');
  }

  // ---- drawing ----

  card(ctx, i) {
    const c = this.cards[i], run = this.game.run, st = run.stages[i];
    const sel = i === this.sel && !this.closed, x = c.x, y = c.y - (sel ? 2 : 0);
    drawTicket(ctx, x, y, CARD_W, CARD_H, { title: c.title, rules: false });
    // the selected ticket wears the truck's beetroot on its header band and its edge, the same "this one is
    // yours" mark the select screen puts on a picked recipe card
    if (sel) {
      ctx.fillStyle = TRUCK.body; ctx.fillRect(x + 1, y + 3, CARD_W - 2, 12);
      drawText(ctx, c.title, x + CARD_W / 2, y + 6, { size: 1, color: UI.cream, align: 'center', shadow: false });
      ctx.fillStyle = TRUCK.body;
      ctx.fillRect(x + 1, y + 16, 2, CARD_H - 18); ctx.fillRect(x + CARD_W - 3, y + 16, 2, CARD_H - 18);
      ctx.fillRect(x + 1, y + CARD_H - 3, CARD_W - 2, 2);
    }
    // the customer, in a plum window: the three village furs are muted and two of them would sit pale on paper
    const b = this.busts[c.bust];
    ctx.fillStyle = UI.ink; ctx.fillRect(x + PORT_X - 1, y + PORT_Y - 1, PORT_S + 2, PORT_S + 2);
    drawHeadPortrait(ctx, b.rig, b.player.pose, x + PORT_X, y + PORT_Y, PORT_S, this.portOpts);
    drawText(ctx, c.name, x + TEXT_X, y + NAME_Y, { size: 1, color: UI.ink, shadow: false });
    // the stars this stage was served at, empty until it has been (the promise the board is filled in against)
    drawStars(ctx, x + STARS_X, y + STARS_Y, st.stars, 3, STAR_R);
    // the dish, centred over one or two rows: the card's headline and the only size-2 type on it
    const top = y + DISH_Y + (c.lines.length === 1 ? DISH_ROW / 2 : 0);
    for (let k = 0; k < c.lines.length; k++) {
      drawTextOutlined(ctx, c.lines[k], x + CARD_W / 2, top + k * DISH_ROW, { size: 2, color: UI.ink, outline: UI.paperDark, thickness: 1, align: 'center', shadow: false });
    }
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 8, y + RULE_Y, CARD_W - 16, 1);
    if (st.stars > 0) {
      ctx.fillStyle = DONE_WASH; ctx.fillRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2);
      const t = i === this.justServed ? this.stampT / STAMP_FRAMES : 1;
      drawStamp(ctx, SERVED_TEXT, x + CARD_W / 2, y + STAMP_Y, Math.min(1, t), STAMP_OPTS);
      return;
    }
    for (let k = 0; k < c.needs.length; k++) {
      const n = c.needs[k], ny = y + NEED_Y + k * NEED_ROW;
      drawFood(ctx, n.icon, x + NEED_X, ny + 4, 4, n.hex);
      drawText(ctx, n.text, x + NEED_TEXT_X, ny, { size: 1, color: UI.ink, shadow: false });
    }
  }

  /** The order pad under the board: what the selected customer said on the phone, and where it sends the truck. */
  pad(ctx) {
    const c = this.cards[this.sel];
    drawTicket(ctx, PAD.x, PAD.y, PAD.w, PAD.h, { rules: false, header: false });
    drawText(ctx, c.line, PAD.x + PAD.w / 2, PAD.y + 6, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawText(ctx, c.who, PAD.x + PAD.w / 2, PAD.y + 18, { size: 1, color: UI.wood, align: 'center', shadow: false });
  }

  /** Closing time: the day's card, totted up on the slate the title screen writes its menu on. */
  closing(ctx) {
    drawDim(ctx, 0.5);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: CLOSE_TITLE });
    for (let i = 0; i < this.rows.length; i++) {
      drawText(ctx, this.rows[i], SLATE.x + SLATE.w / 2, SLATE.y + CLOSE_Y + i * CLOSE_ROW, { size: 1, color: UI.chalk, align: 'center', shadow: false });
    }
    if (this.frame % BLINK_PERIOD < BLINK_ON) {
      drawText(ctx, CLOSED_TEXT, SLATE.x + SLATE.w / 2, SLATE.y + SLATE.h - 18, { size: 1, color: UI.chalk, align: 'center', shadow: false });
    }
  }

  draw(ctx) {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 24, HEAD_TEXT, { size: 2 });
    for (let i = 0; i < this.cards.length; i++) this.card(ctx, i);
    if (!this.closed) this.pad(ctx);
    else this.closing(ctx);
    drawHint(ctx, this.hint);
  }

  summary() {
    const run = this.game.run;
    return {
      sel: this.sel, dish: this.cards[this.sel].dish, customer: this.cards[this.sel].name,
      chosen: this.chosen, closed: this.closed, stages: this.cards.length,
      stars: run.stages.map((s) => s.stars), cleared: run.cleared(), served: run.served,
    };
  }
  /** Every number that could differ between two machines: the cursor, the pick and the closing card. */
  checksumFields() {
    const f = this.fields; f.length = 0;
    f.push(this.sel, this.chosen, this.closed ? 1 : 0);
    return f;
  }
}
