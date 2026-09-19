// THE DAY BOARD (docs/GDD.md sections 3 and 10): the day's plan pinned up on paper before the truck opens - the
// three LINES that will form (where each waits, who is in it and what they will order), and under them the
// SHOPPING LIST every one of those orders adds up to. Confirm OPENS THE TRUCK and fades to the map; the truck then
// drives round the landmarks until the pantry holds the whole list, and only then do the lines open.
//
// `select` hands over to it once a crew is stamped, and `results` hands back to it after the LAST line has been
// served: the board then opens CLOSED - every line stamped SERVED with each customer's stars printed on the card,
// and a CLOSING TIME slate over it totting the day up - and the one press left goes back to the title, which is
// where the game ends. There is no cursor: nothing on the board is picked, so everything it simulates is two
// numbers (`checksumFields`), and any joined seat's confirm counts (game/menuinput.js).
//
// Nothing here is random and nothing reads the clock: the cards, the rigs and every string are built in enter().
import { VIEW_W, UI, PLUM } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { CritterDef, Game, ScreenParams } from '../game.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawHeadPortrait, idlePoseOf } from '../../art/portraits.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { PartialPose } from '../../lib/art/poses.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { drawFood } from '../../art/food.ts';
import { drawTicket, drawSign, drawSlate, drawStamp, drawStars, drawHint, drawDim, cardX, CARD_W } from '../ui.ts';
import { confirmPressed, cancelPressed } from '../menuinput.ts';
import { drawLane } from '../../art/logo.ts';
import { TRUCK } from '../../art/truck.ts';
import { recipeOf, twistTag } from '../run.ts';

/** One card per line across the top: three of the select screen's own card width and gap. */
const CARD_Y = 46, CARD_H = 124;
/**
 * Inside a card: the header band, the landmark the line waits at, a rule, then one CUSTOMER block per person in
 * the queue - their portrait in a plum window, their name beside it and the dish they will order under that, over
 * one or two rows (a name that fits whole stays whole). A served customer gives the dish rows up to their stars.
 */
const PLACE_Y = 20, RULE_Y = 30, CUST_Y = 34, CUST_PITCH = 44, PORT_X = 8, PORT_S = 28;
const TEXT_X = PORT_X + PORT_S + 6, NAME_DY = 2, DISH_DY = 13, DISH_ROW = 10, STARS_DX = 22, STARS_DY = 20, STAR_R = 4;
/** A served line keeps its customers and their stars and takes a SERVED stamp across its foot. */
const STAMP_Y = 112;
/** The stamp lands in the truck's own beetroot - the select screen's READY ink. */
const STAMP_OPTS = { size: 2, color: TRUCK.body, light: TRUCK.bodyHi };
const STAMP_FRAMES = 24, SERVED_TEXT = 'SERVED';
/** A served card is paper that has been handled: UI.paperDark at 45 % over the whole ticket. */
const DONE_WASH = 'rgba(216,192,147,0.45)';
/**
 * The shopping list under the cards: one wide ticket, the ingredients across it in LIST_COLS columns of
 * LIST_COL_W, so seven of them take two rows and the whole day's gathering reads at a glance.
 */
const LIST = { x: 60, y: 182, w: 520 }, LIST_COLS = 4, LIST_COL_W = 128, LIST_ROW = 12, LIST_TOP = 20, LIST_PAD = 8;
/** The pad under the list (PAD_GAP below it): the day's menu on one row and how the day goes on the other. */
const PAD = { x: 60, w: 520, h: 30 }, PAD_GAP = 8;
const HOW_TEXT = 'FILL THE PANTRY, THEN SERVE THE LINES';
const HEAD_TEXT = 'TODAY AT THE TRUCK', LIST_TITLE = 'SHOPPING LIST', MENU_LABEL = 'ON THE MENU: ';
/** Closing time: the slate that ends the day, and the rows printed on it. */
const SLATE = { x: 176, y: 100, w: 288, h: 136 };
const CLOSE_TITLE = 'CLOSING TIME', CLOSE_ROW = 16, CLOSE_Y = 44, CLOSED_TEXT = 'THE TRUCK IS CLOSED FOR THE NIGHT';
const BLINK_PERIOD = 60, BLINK_ON = 40;
/** The card's inner width a dish name has to fit in, right of the portrait. */
const DISH_W = CARD_W - TEXT_X - 6;

/**
 * A dish name over at most two rows: it breaks at the space nearest the middle, so 'APPLE OMELETTE' is two words
 * on two rows rather than one row clipped by the card. A name that fits whole stays whole.
 */
function wrapDish(dish: string): string[] {
  if (measureText(dish, 1) <= DISH_W) return [dish];
  const words = dish.split(' ');
  if (words.length < 2) return [dish];
  let best = 1, bd = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < bd) { bd = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/**
 * A customer as content/critters/customers.ts holds them: a cast entry without the `bio` that only the playable
 * critters (the gallery reads it) carry. `getCustomer` is the one way onto this board.
 */
export type CustomerDef = Omit<CritterDef, 'bio'>;

/** One customer block on a card, worded once in enter(). */
export interface StageCustomer {
  /** Index into `busts`: the diner's portrait. */
  bust: number;
  /** Their name plate text. */
  name: string;
  /** The dish over one or two rows (wrapDish). */
  lines: string[];
}

/** One line's ticket, laid out and worded once in enter(). */
export interface StageCard {
  /** The card's top-left corner. */
  x: number;
  y: number;
  /** Header band text ('LINE 01'). */
  title: string;
  /** Where the line waits ('WINDLE MILL'). */
  place: string;
  customers: StageCustomer[];
}

/** One diner, built once per DISTINCT diner in enter() and drawn on every card they queue on. */
export interface StageBust {
  def: CustomerDef;
  /** Built once in enter(), never in draw(): slot -1, the off-duty apron. */
  rig: Rig;
  /** Idling from a per-bust offset (13 ticks each) so the board does not breathe in lockstep. */
  player: AnimPlayer;
  /** The first idle frame's pose, which art/portraits.ts anchors the portrait on; null for a rig without one. */
  anchor: PartialPose | null;
}

/** One entry of the shopping list on the board: the glyph, its colour and 'APPLES 12'. */
export interface StageListRow {
  icon: string;
  hex: string;
  text: string;
}

/** The options object handed to art/portraits.ts drawHeadPortrait; one per screen, reused by every card. */
export interface PortraitDrawOpts {
  /** The window the head sits in. */
  bg: string;
  /** How much of the square the head fills. */
  fill: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
}

export class StageScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, and a screen's own declaration would also define a base field back to undefined),
  // and this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild
  // (tools/build.js, tools/server.js) and under Node's type stripping alike, so the emitted class is the original.

  /** The day's line tickets, one per run.lines entry in that order. */
  declare cards: StageCard[];
  /** One entry per distinct diner, in the order the cards first ask for them; a customer block keeps its index. */
  declare busts: StageBust[];
  /** The shopping list's entries, in run.needs order. */
  declare list: StageListRow[];
  /** The closing slate's rows, rebuilt (in place) by enter(). */
  declare rows: string[];
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** True once every line has been served: the board closes the truck for the night instead of opening it. */
  declare closed: boolean;
  /** The line results just finished (run.lastServed), whose stamp is still slamming; -1 before the first one. */
  declare justServed: number;
  /** 1 once confirm has opened the truck and the fade is running; 0 until then. */
  declare chosen: number;
  /** Frames into the SERVED stamp on `justServed`'s card, 0..STAMP_FRAMES; every other served card is stamped whole. */
  declare stampT: number;
  /** The pad's first row: the day's menu. */
  declare menuText: string;
  /** The hint line under the board, which the closed truck replaces with the way out. */
  declare hint: string;
  /** The list ticket's height, from how many rows the day's ingredients take, and the pad's top under it. */
  declare listH: number;
  declare padY: number;
  /** The drawHeadPortrait options, reused by every card (this file allocates nothing in draw()). */
  declare portOpts: PortraitDrawOpts;

  constructor(game: Game) { super(game, 'stage'); this.cards = []; this.busts = []; this.list = []; this.rows = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    // one rig and one idle beat per DISTINCT diner (three of them fill six seats), phased apart so the board does
    // not breathe in lockstep; a customer block keeps the index of the bust it draws
    this.busts.length = 0;
    const byId = new Map();
    const bustOf = (id: string): number => {
      let bi = byId.get(id);
      if (bi == null) {
        const def = getCustomer(id), player = new AnimPlayer(def.anims);
        player.play('idle');
        for (let k = 0; k < this.busts.length * 13; k++) player.tick();
        bi = this.busts.length;
        this.busts.push({ def, rig: critterRig(def, -1), player, anchor: idlePoseOf(def) });
        byId.set(id, bi);
      }
      return bi;
    };
    const n = run.lines.length;
    this.cards = run.lines.map((ln, i) => {
      const place = PLACES.find((p) => p.id === ln.place);
      return {
        x: cardX(i, n), y: CARD_Y,
        title: `LINE ${String(i + 1).padStart(2, '0')}`,
        place: place ? place.name : ln.place.toUpperCase(),
        customers: ln.customers.map((c) => {
          const bi = bustOf(c.customer);
          return { bust: bi, name: this.busts[bi].def.name, lines: wrapDish(recipeOf(c.recipe).dish + twistTag(c)) };
        }),
      };
    });
    this.list = run.needs.map((need) => {
      const ing = INGREDIENTS[need.id] || INGREDIENTS.apple;
      return { icon: ing.icon, hex: ing.hex, text: `${ing.name} ${need.amount}` };
    });
    this.listH = LIST_TOP + LIST_ROW * Math.max(1, Math.ceil(this.list.length / LIST_COLS)) + LIST_PAD;
    this.padY = LIST.y + this.listH + PAD_GAP;
    this.menuText = MENU_LABEL + run.recipes.map((id) => recipeOf(id).dish).join(', ');
    this.closed = run.dayComplete();
    this.justServed = run.lastServed;
    this.chosen = 0;
    this.stampT = 0;
    this.rows.length = 0;
    this.rows.push(`LINES SERVED ${run.linesServed()} OF ${n}`, `DISHES ${run.served}`, `STARS ${run.stars()} OF ${run.lines.reduce((t, l) => t + l.customers.length * 3, 0)}`, `TAKINGS ${run.score}`);
    this.hint = this.closed
      ? `${game.input.keyText(0, 'action')}: TITLE`
      : `${game.input.keyText(0, 'action')}: OPEN THE TRUCK    ${game.input.keyText(0, 'cancel')}: BACK`;
    this.portOpts = { bg: PLUM.shadow, fill: 0.6, facing: 1 };
    // the SERVED stamp lands as its slam finishes; at closing time the night's little bell follows it
    if (this.justServed >= 0) game.audio.play('stamp', { delay: STAMP_FRAMES / 60 });
    if (this.closed) { game.audio.music.play('closing'); game.audio.play('day_done', { delay: (STAMP_FRAMES + 20) / 60 }); }
  }

  override update(): void {
    super.update();
    const game = this.game, inp = game.input;
    for (const b of this.busts) { b.player.tick(); if (b.player.done) b.player.play('idle', { restart: true }); }
    if (this.stampT < STAMP_FRAMES) this.stampT++;
    // the night is over: the only thing left on the board is the way out
    if (this.closed) {
      if (confirmPressed(inp) >= 0) { game.audio.play('menu_confirm'); this.quit(); }
      return;
    }
    if (this.chosen) return;                            // the truck is opening, the fade is running
    if (confirmPressed(inp) >= 0) {
      this.chosen = 1;
      game.audio.play('truck_start');
      game.fadeTo(() => game.replace('map'));
      return;
    }
    // Backing out to the title is a LOCAL way out: online it would drop one peer out of a live room and stall
    // the rest, which is why the pause overlay is refused there too (docs/ARCHITECTURE.md section 5).
    if (cancelPressed(inp) >= 0 && !(game.net && game.net.active)) { game.audio.play('menu_back'); game.reset('title'); }
  }

  /** Closing time, confirmed: leave the room if there is one, then back to the front door. */
  quit(): void {
    const game = this.game;
    if (game.net) { try { game.net.leave(); } catch { /* a room that is already gone */ } game.net = null; }
    game.reset('title');
  }

  // ---- drawing ----

  card(ctx: CanvasRenderingContext2D, i: number): void {
    const c = this.cards[i], run = this.game.run, ln = run.lines[i], x = c.x, y = c.y;
    drawTicket(ctx, x, y, CARD_W, CARD_H, { title: c.title, rules: false });
    drawText(ctx, c.place, x + CARD_W / 2, y + PLACE_Y, { size: 1, color: UI.wood, align: 'center', shadow: false });
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 8, y + RULE_Y, CARD_W - 16, 1);
    for (let k = 0; k < c.customers.length; k++) {
      const cu = c.customers[k], b = this.busts[cu.bust], cy = y + CUST_Y + k * CUST_PITCH, stars = ln.customers[k] ? ln.customers[k].stars : 0;
      // the diner, in a plum window: the three village furs are muted and two of them would sit pale on paper
      ctx.fillStyle = UI.ink; ctx.fillRect(x + PORT_X - 1, cy - 1, PORT_S + 2, PORT_S + 2);
      drawHeadPortrait(ctx, b.rig, b.player.pose, x + PORT_X, cy, PORT_S, this.portOpts);
      drawText(ctx, cu.name, x + TEXT_X, cy + NAME_DY, { size: 1, color: UI.ink, shadow: false });
      // the dish they will order - or, once they have eaten it, the stars they gave it
      if (stars > 0) drawStars(ctx, x + TEXT_X + STARS_DX, cy + STARS_DY, stars, 3, STAR_R);
      else for (let r = 0; r < cu.lines.length; r++) drawText(ctx, cu.lines[r], x + TEXT_X, cy + DISH_DY + r * DISH_ROW, { size: 1, color: UI.wood, shadow: false });
    }
    if (ln.served) {
      ctx.fillStyle = DONE_WASH; ctx.fillRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2);
      const t = i === this.justServed ? this.stampT / STAMP_FRAMES : 1;
      drawStamp(ctx, SERVED_TEXT, x + CARD_W / 2, y + STAMP_Y, Math.min(1, t), STAMP_OPTS);
    }
  }

  /** The shopping list under the cards: every ingredient of every order in every line, summed. */
  shopping(ctx: CanvasRenderingContext2D): void {
    const top = drawTicket(ctx, LIST.x, LIST.y, LIST.w, this.listH, { title: LIST_TITLE, rules: false });
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i], col = i % LIST_COLS, row = (i / LIST_COLS) | 0;
      const ex = LIST.x + 10 + col * LIST_COL_W, ey = top + 4 + row * LIST_ROW;
      drawFood(ctx, e.icon, ex + 6, ey + 4, 4, e.hex);
      drawText(ctx, e.text, ex + 16, ey, { size: 1, color: UI.ink, shadow: false });
    }
  }

  /** The pad under the list: the day's menu, and how the day goes. */
  pad(ctx: CanvasRenderingContext2D): void {
    const y = this.padY;
    drawTicket(ctx, PAD.x, y, PAD.w, PAD.h, { rules: false, header: false });
    drawText(ctx, this.menuText, PAD.x + PAD.w / 2, y + 6, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawText(ctx, HOW_TEXT, PAD.x + PAD.w / 2, y + 18, { size: 1, color: UI.wood, align: 'center', shadow: false });
  }

  /** Closing time: the day, totted up on the slate the title screen writes its menu on. */
  closing(ctx: CanvasRenderingContext2D): void {
    drawDim(ctx, 0.5);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: CLOSE_TITLE });
    for (let i = 0; i < this.rows.length; i++) {
      drawText(ctx, this.rows[i], SLATE.x + SLATE.w / 2, SLATE.y + CLOSE_Y + i * CLOSE_ROW, { size: 1, color: UI.chalk, align: 'center', shadow: false });
    }
    if (this.frame % BLINK_PERIOD < BLINK_ON) {
      drawText(ctx, CLOSED_TEXT, SLATE.x + SLATE.w / 2, SLATE.y + SLATE.h - 18, { size: 1, color: UI.chalk, align: 'center', shadow: false });
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    drawLane(ctx);
    drawDim(ctx, 0.62);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 24, HEAD_TEXT, { size: 2 });
    for (let i = 0; i < this.cards.length; i++) this.card(ctx, i);
    this.shopping(ctx);
    if (!this.closed) this.pad(ctx);
    else this.closing(ctx);
    drawHint(ctx, this.hint);
  }

  override summary() {
    const run = this.game.run;
    return {
      lines: this.cards.length, places: this.cards.map((c) => c.place), chosen: this.chosen, closed: this.closed,
      list: this.list.map((e) => e.text), menu: run.recipes.slice(),
      linesServed: run.linesServed(), served: run.served, stars: run.stars(),
    };
  }
  /** Every number that could differ between two machines: the opening press and the closing card. */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.chosen, this.closed ? 1 : 0);
    return f;
  }
}
