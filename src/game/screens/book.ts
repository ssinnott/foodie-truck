// THE RECIPE BOOK (docs/GDD.md section 12): what this truck has cooked, who it has fed, what it has gathered and
// where it has been - the gallery's sibling, and the only screen allowed to read game/book.ts.
//
// Sixty-three recipes, forty ingredients, twelve landmarks and three diners are in the game and a player who
// finishes a week has met perhaps a sixth of them. The book is where the rest are: a dish already cooked is inked
// in with the picture art/dishes.ts already draws for it, one never cooked is the same card in PENCIL - the
// silhouette faded back, its name blanked - so the shape of what is missing is visible without giving it away.
//
// Nothing here simulates anything. The book is read ONCE in enter() and never in update() (docs/MULTIPLAYER.md:
// no localStorage on the simulation path), the only state is which page is open, and the screen is reachable from
// the title and from nowhere else - so it can never be open while a run is live.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawDish } from '../../art/dishes.ts';
import { drawFood } from '../../art/food.ts';
import { ORDERS, INGREDIENTS } from '../../content/recipes.ts';
import { PLACES } from '../../content/places.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { DINERS, recipeOf } from '../run.ts';
import { readBook, dishesKnown } from '../book.ts';
import type { BookRecord } from '../book.ts';
import { drawTicket, drawSign, drawSlate, drawStars, drawHint, drawDim } from '../ui.ts';
import { cancelPressed, navX } from '../menuinput.ts';
import { drawLane } from '../../art/logo.ts';

const HEAD_TEXT = 'RECIPE BOOK';
/**
 * The page strap under the sign: which page this is, and the one number the closed board could never print. It
 * sits at 36 rather than 30 because the hanging sign's plaque runs to about 33 - at 30 the strap was printed
 * across its bottom edge.
 */
const STRAP_Y = 36;
/** The dish grid: four across, three down, so sixty-three recipes are six pages of a book rather than a list. */
const COLS = 4, ROWS = 3, CELL_W = 150, CELL_H = 76, CELL_GAP = 4, GRID_Y = 50;
const PER_PAGE = COLS * ROWS;
/**
 * Inside a dish cell: the picture on the left, the name and the tally to the right of it. The picture is drawn at
 * s 12 - a dish glyph spans about 2.4 s - so it fills its half of the card rather than sitting in it as a crumb.
 */
const DISH_CX = 30, DISH_CY = 38, DISH_S = 12, TEXT_X = 58, NAME_Y = 8, NAME_ROW = 10, TALLY_Y = 40, STAR_R = 3;
/** A dish never cooked is drawn at this alpha, which is the pencil: the shape is there, the colour is not. */
const PENCIL_ALPHA = 0.18;
const UNKNOWN_NAME = '- - -';
/**
 * The back pages (diners, larder, road) are rows on a SLATE, not text laid straight over the lane: a tally in
 * paper ink over the hedgerow is unreadable, which is what the first pass of this screen looked like.
 */
const PANEL = { x: 44, y: 46, w: 552, h: 248 };
const LIST_Y = PANEL.y + 46, LIST_ROW = 20, LIST_COLS = 2, LIST_COL_W = 264, LIST_X = PANEL.x + 20;
const LIST_TALLY_DX = 150;
/** The larder's forty glyphs sit four across and closer together than a diner's row does. */
const LARDER_COLS = 4, LARDER_COL_W = 132, LARDER_ROW = 17, LARDER_X = PANEL.x + 14, LARDER_TALLY_DX = 96;

/** Which kind of page is open: the dish grid (several of them) or one of the three back pages. */
const PAGE_DISHES = 0, PAGE_DINERS = 1, PAGE_LARDER = 2, PAGE_ROAD = 3;

/** One page of the book: its kind, its title, and for a dish page which slice of ORDERS it shows. */
export interface BookPage {
  kind: number;
  title: string;
  /** Dish pages only: the first ORDERS index on this page. */
  from: number;
}

/** A dish cell, worded once in enter(): the recipe, whether it is known, and what the book has on it. */
export interface BookCell {
  id: string;
  /** The dish name over one or two rows, or the blank where it has never been cooked. */
  lines: string[];
  known: boolean;
  n: number;
  stars: number;
  first: number;
}

/** A row on one of the back pages: a glyph or portrait id, a label and a tally. */
export interface BookRow {
  /** Ingredient id, place id or diner id, depending on the page. */
  id: string;
  label: string;
  tally: string;
  known: boolean;
  /** Ingredient rows only: the glyph and its colour. */
  icon: string;
  hex: string;
}

/** A dish name over at most two rows inside a cell, broken at the space nearest the middle. */
function wrapName(name: string, w: number): string[] {
  if (measureText(name, 1) <= w) return [name];
  const words = name.split(' ');
  if (words.length < 2) return [name];
  let best = 1, bd = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < bd) { bd = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export class BookScreen extends Screen {
  // `declare` for the reason game.ts gives over its own block: a plain field declaration would emit a class field
  // per name and this screen has to keep the runtime it shipped with.

  /** The book as storage holds it, read once in enter(). */
  declare book: BookRecord;
  /** Every page, in the order left/right walks them. */
  declare pages: BookPage[];
  /** Which page is open. */
  declare page: number;
  /** The open page's dish cells (a dish page) - rebuilt by `openPage`. */
  declare cells: BookCell[];
  /** The open page's list rows (a back page) - rebuilt by `openPage`. */
  declare list: BookRow[];
  /** The strap under the sign. */
  declare strap: string;
  declare hint: string;

  constructor(game: Game) { super(game, 'book'); this.book = readBook(); this.pages = []; this.page = 0; this.cells = []; this.list = []; this.strap = ''; this.hint = ''; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    // the ONE read of the book, at a screen boundary and never in update()
    this.book = readBook();
    this.pages.length = 0;
    for (let i = 0; i < ORDERS.length; i += PER_PAGE) {
      this.pages.push({ kind: PAGE_DISHES, title: 'THE DISHES', from: i });
    }
    this.pages.push({ kind: PAGE_DINERS, title: 'THE DINERS', from: 0 });
    this.pages.push({ kind: PAGE_LARDER, title: 'THE LARDER', from: 0 });
    this.pages.push({ kind: PAGE_ROAD, title: 'THE ROAD', from: 0 });
    this.page = Math.max(0, Math.min(this.pages.length - 1, (params && (params.page as number)) | 0));
    this.hint = `${this.game.input.keyText(0, 'left')}${this.game.input.keyText(0, 'right')}: PAGE    ${this.game.input.keyText(0, 'cancel')}: BACK`;
    this.openPage();
  }

  /** Word the open page: its cells or its rows, and the strap over it. Called on every page turn, never in draw(). */
  openPage(): void {
    const book = this.book, p = this.pages[this.page];
    this.cells.length = 0;
    this.list.length = 0;
    if (p.kind === PAGE_DISHES) {
      for (let i = p.from; i < Math.min(p.from + PER_PAGE, ORDERS.length); i++) {
        const o = ORDERS[i], row = book.dishes[o.id];
        this.cells.push({
          id: o.id, known: !!row, n: row ? row.n : 0, stars: row ? row.stars : 0, first: row ? row.first : 0,
          lines: wrapName(row ? o.dish : UNKNOWN_NAME, CELL_W - TEXT_X - 6),
        });
      }
      const k = dishesKnown(book);
      this.strap = `${k.known} OF ${k.total} COOKED`;
    } else if (p.kind === PAGE_DINERS) {
      for (const id of DINERS) {
        const row = book.diners[id], def = getCustomer(id);
        this.list.push({
          id, label: def ? def.name : id.toUpperCase(), known: !!row, icon: '', hex: UI.wood,
          tally: row ? `FED ${row.n}` + (row.fav ? `, LIKES ${recipeOf(row.fav).dish}` : '') : 'NOT YET SERVED',
        });
      }
      this.strap = `${this.list.filter((r) => r.known).length} OF ${DINERS.length} MET`;
    } else if (p.kind === PAGE_LARDER) {
      for (const id of Object.keys(INGREDIENTS)) {
        const ing = INGREDIENTS[id], n = book.larder[id] || 0;
        this.list.push({ id, label: ing.name, known: n > 0, icon: ing.icon, hex: ing.hex, tally: n > 0 ? String(n) : '-' });
      }
      this.strap = `${this.list.filter((r) => r.known).length} OF ${this.list.length} GATHERED`;
    } else {
      for (const place of PLACES) {
        if (place.id === 'home') continue;
        const n = book.road[place.id] || 0;
        this.list.push({ id: place.id, label: place.name, known: n > 0, icon: '', hex: place.accent, tally: n > 0 ? `${n} DAYS` : 'NOT YET' });
      }
      this.strap = `${this.list.filter((r) => r.known).length} OF ${this.list.length} VISITED`;
    }
  }

  override update(): void {
    super.update();
    const inp = this.game.input;
    const dx = navX(inp);
    if (dx) {
      this.page = (this.page + dx + this.pages.length) % this.pages.length;
      this.game.audio.play('menu_move');
      this.openPage();
    }
    if (cancelPressed(inp) >= 0) { this.game.audio.play('menu_back'); this.game.replace('title'); }
  }

  // ---- drawing ----

  /** One dish cell: the picture, the name, and the tally - or the whole thing in pencil where it is unknown. */
  cell(ctx: CanvasRenderingContext2D, i: number): void {
    const c = this.cells[i], col = i % COLS, row = (i / COLS) | 0;
    const x = Math.round((VIEW_W - (COLS * CELL_W + (COLS - 1) * CELL_GAP)) / 2) + col * (CELL_W + CELL_GAP);
    const y = GRID_Y + row * (CELL_H + CELL_GAP);
    drawTicket(ctx, x, y, CELL_W, CELL_H, { rules: false, header: false });
    // the picture: inked where it has been cooked, faded back to a pencil shape where it has not
    if (!c.known) ctx.globalAlpha = PENCIL_ALPHA;
    drawDish(ctx, c.id, x + DISH_CX, y + DISH_CY, DISH_S);
    ctx.globalAlpha = 1;
    const ink = c.known ? UI.ink : UI.paperLine;
    for (let r = 0; r < c.lines.length; r++) drawText(ctx, c.lines[r], x + TEXT_X, y + NAME_Y + r * NAME_ROW, { size: 1, color: ink, shadow: false });
    if (c.known) {
      drawText(ctx, `x${c.n}`, x + TEXT_X, y + TALLY_Y, { size: 1, color: UI.wood, shadow: false });
      drawStars(ctx, x + TEXT_X + 30, y + TALLY_Y + 3, c.stars, 3, STAR_R);
      drawText(ctx, `DAY ${c.first}`, x + TEXT_X, y + TALLY_Y + 12, { size: 1, color: UI.paperLine, shadow: false });
    }
  }

  /** A back page: the diners, the larder or the road, in columns of rows. */
  rows(ctx: CanvasRenderingContext2D): void {
    const p = this.pages[this.page];
    const larder = p.kind === PAGE_LARDER;
    drawSlate(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, { title: p.title });
    const cols = larder ? LARDER_COLS : LIST_COLS;
    const colW = larder ? LARDER_COL_W : LIST_COL_W;
    const rowH = larder ? LARDER_ROW : LIST_ROW;
    const x0 = larder ? LARDER_X : LIST_X;
    const tallyDx = larder ? LARDER_TALLY_DX : LIST_TALLY_DX;
    for (let i = 0; i < this.list.length; i++) {
      const r = this.list[i], col = i % cols, row = (i / cols) | 0;
      const x = x0 + col * colW, y = LIST_Y + row * rowH;
      // chalk for somewhere this truck has been, the board's own faded ink for somewhere it has not
      const ink = r.known ? UI.chalk : UI.boardDark;
      if (r.icon) {
        if (!r.known) ctx.globalAlpha = PENCIL_ALPHA;
        drawFood(ctx, r.icon, x + 6, y + 4, 4, r.hex);
        ctx.globalAlpha = 1;
      }
      drawText(ctx, r.label, x + (r.icon ? 16 : 0), y, { size: 1, color: ink, shadow: false });
      drawText(ctx, r.tally, x + tallyDx, y, { size: 1, color: r.known ? UI.yellow : UI.boardDark, shadow: false });
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    drawLane(ctx);
    drawDim(ctx, 0.66);
    drawSign(ctx, VIEW_W / 2, 2, measureText(HEAD_TEXT, 2) + 18, 24, HEAD_TEXT, { size: 2 });
    const p = this.pages[this.page];
    // a back page carries its title on its own slate, so the strap there is the tally alone and not the title twice
    const strap = p.kind === PAGE_DISHES ? `${p.title}   ${this.strap}` : this.strap;
    drawText(ctx, strap, VIEW_W / 2, STRAP_Y, { size: 1, color: UI.cream, align: 'center', shadow: false });
    drawText(ctx, `${this.page + 1}/${this.pages.length}`, VIEW_W - 20, STRAP_Y, { size: 1, color: UI.cream, align: 'right', shadow: false });
    if (p.kind === PAGE_DISHES) for (let i = 0; i < this.cells.length; i++) this.cell(ctx, i);
    else this.rows(ctx);
    drawHint(ctx, this.hint);
  }

  override summary() {
    return {
      page: this.page, pages: this.pages.length, title: this.pages[this.page].title, strap: this.strap,
      cells: this.cells.length, rows: this.list.length,
      known: this.cells.filter((c) => c.known).length + this.list.filter((r) => r.known).length,
      days: this.book.days, weeks: this.book.weeks,
    };
  }
  /** The only thing on this screen that could differ between two machines - and nothing here is ever in a match. */
  override checksumFields(): number[] { return [this.page]; }
}
