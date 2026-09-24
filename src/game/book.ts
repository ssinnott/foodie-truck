// THE RECIPE BOOK (docs/GDD.md section 12): what this truck has cooked, who it has fed, what it has gathered and
// where it has been. Sixty-three recipes, forty ingredients, twelve landmarks and three diners are in the game
// and a player has no way of knowing most of them are there; the book is where they are.
//
// THE INVARIANT, which is the whole design:
//
//     The book is WRITTEN by the game and READ only by the book screen. Nothing the book holds ever reaches
//     planWeek, planDay, gatherTarget, or any screen's update().
//
// That is what makes a saved file safe in a lockstep game. Two peers with different books must play
// byte-identical days, and they do, because no code path exists from the book into the simulation. An unlock - a
// recipe you have to earn, a landmark that opens once you have visited it - would desync two players the instant
// their saves differed, and is the one thing this file must never grow into. `recordDay` is importable anywhere;
// `readBook` is importable ONLY by game/screens/book.ts, and tools/check.js fails the build if that stops being
// true (the executable half of this comment, the way tools/art-check.js is the executable half of the art style).
//
// Persistence is localStorage on engine/bindings.ts's terms: fragile on purpose, read and written from screen
// enter() / exit() only, never from an update() (docs/MULTIPLAYER.md: no localStorage on the simulation path).
// Unlike the week (game/week.ts) the book IS written by every peer in an online match, because what it records
// is what that player themselves cooked, and four people round one host key each cooked it.
import { ORDERS, INGREDIENTS } from '../content/recipes.ts';
import type { Run } from './game.ts';

/** Where the book lives, and the shape version that invalidates it. */
const STORE_KEY = 'foodie-truck.book';
const STORE_VERSION = 1;

/** One recipe's row: how often it has been cooked, the best rating it ever got, and the day it was first served. */
export interface BookDish {
  /** Times cooked, all told. */
  n: number;
  /** The best star rating this dish has ever been given, 1..3. */
  stars: number;
  /** Which day of trading it was first cooked on - 'your 4th day' - counted across every week. */
  first: number;
}

/** One diner's row: how many times they have been fed, and what they have ordered most. */
export interface BookDiner {
  n: number;
  /** The ORDERS id they have ordered most often, or ''. */
  fav: string;
  /** How many times they have ordered it, so a new favourite has to beat it. */
  favN: number;
}

/** The whole book. Every map is keyed by content id, so a build with more recipes simply has more rows. */
export interface BookRecord {
  /** Per ORDERS id. */
  dishes: Record<string, BookDish>;
  /** Per DINERS id (content/critters/customers.ts). */
  diners: Record<string, BookDiner>;
  /** Per INGREDIENTS id: how many have been gathered, all told. */
  larder: Record<string, number>;
  /** Per PLACES id: how many days the truck has been there. */
  road: Record<string, number>;
  /** Days of trading closed, all told. */
  days: number;
  /** Weeks finished. */
  weeks: number;
  /** The last day banked, as `seed:day`, so re-opening a closed board cannot count it twice. */
  last: string;
}

/** Counters saturate rather than overflow: a book is a keepsake, not an integer. */
const MAX_COUNT = 999999;
const add = (a: number, b: number): number => Math.min(MAX_COUNT, (a | 0) + b);

/** An empty book: what a first run writes into, and what junk in storage falls back to. */
export function emptyBook(): BookRecord {
  return { dishes: {}, diners: {}, larder: {}, road: {}, days: 0, weeks: 0, last: '' };
}

/** Storage, if this browser has one we are allowed to touch. */
function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/**
 * A stored book, taken apart key by key. Anything unrecognised is DROPPED rather than thrown on: a book written
 * by a build with sixty-three recipes has to load on a build with seventy, and a book written by the build with
 * seventy has to load back on the one with sixty-three. Unknown ids simply do not draw.
 */
function validate(raw: unknown): BookRecord {
  const out = emptyBook();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, any>;
  if (r.v !== STORE_VERSION) return out;
  const d = r.dishes && typeof r.dishes === 'object' ? r.dishes : {};
  for (const id of Object.keys(d)) {
    const row = d[id];
    if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.n))) continue;
    out.dishes[id] = { n: Math.max(0, row.n | 0), stars: Math.max(0, Math.min(3, row.stars | 0)), first: Math.max(0, row.first | 0) };
  }
  const p = r.diners && typeof r.diners === 'object' ? r.diners : {};
  for (const id of Object.keys(p)) {
    const row = p[id];
    if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.n))) continue;
    out.diners[id] = { n: Math.max(0, row.n | 0), fav: typeof row.fav === 'string' ? row.fav : '', favN: Math.max(0, row.favN | 0) };
  }
  for (const [key, into] of [['larder', out.larder], ['road', out.road]] as const) {
    const m = r[key] && typeof r[key] === 'object' ? r[key] : {};
    for (const id of Object.keys(m)) if (Number.isFinite(Number(m[id]))) into[id] = Math.max(0, m[id] | 0);
  }
  out.days = Math.max(0, r.days | 0);
  out.weeks = Math.max(0, r.weeks | 0);
  out.last = typeof r.last === 'string' ? r.last : '';
  return out;
}

/** Load the book off storage. Internal: `readBook` is the one exported way in, and only the book screen has it. */
function load(): BookRecord {
  const s = store();
  if (!s) return emptyBook();
  try {
    const raw = s.getItem(STORE_KEY);
    return raw ? validate(JSON.parse(raw)) : emptyBook();
  } catch { return emptyBook(); }
}

/** Write the book out. Never throws. */
function write(book: BookRecord): boolean {
  const s = store();
  if (!s) return false;
  try { s.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, ...book })); return true; } catch { return false; }
}

/**
 * BANK A DAY into the book: every dish cooked, every diner fed, everything gathered and everywhere the truck
 * went. Called ONCE from the closed day board (game/screens/stage.ts) - one write, at a screen boundary, off the
 * simulation path.
 *
 * Banking is keyed on `seed:day`, so a board that opens closed twice counts once. `weekDone` is the last day of
 * the week closing, which is the only thing that moves the week counter.
 *
 * Nothing here returns anything the game could branch on: the return is whether the write landed, for the tests.
 */
export function recordDay(run: Run, weekDone = false): boolean {
  if (!run || !run.dayComplete()) return false;
  const book = load();
  const stamp = `${run.seed | 0}:${run.day | 0}`;
  if (book.last === stamp) return false;                       // already banked: the board has opened closed before
  book.last = stamp;
  book.days = add(book.days, 1);
  if (weekDone) book.weeks = add(book.weeks, 1);
  for (const line of run.lines) {
    for (const c of line.customers) {
      if (!c.stars) continue;                                  // nobody left unserved should be in the book
      const dish = book.dishes[c.recipe] || { n: 0, stars: 0, first: 0 };
      dish.n = add(dish.n, 1);
      dish.stars = Math.max(dish.stars, Math.min(3, c.stars | 0));
      if (!dish.first) dish.first = book.days;                 // 'first cooked on your Nth day'
      book.dishes[c.recipe] = dish;
      const diner = book.diners[c.customer] || { n: 0, fav: '', favN: 0 };
      diner.n = add(diner.n, 1);
      book.diners[c.customer] = diner;
    }
  }
  // A diner's FAVOURITE is what THEY have ordered most, which the pass above cannot know while it is still
  // counting: it takes today's orders per diner and only then weighs them against the standing favourite. Ties
  // keep the incumbent, so a favourite has to be beaten rather than merely matched.

  const tally: Record<string, Record<string, number>> = {};
  for (const line of run.lines) for (const c of line.customers) {
    if (!c.stars) continue;
    (tally[c.customer] = tally[c.customer] || {})[c.recipe] = (tally[c.customer][c.recipe] || 0) + 1;
  }
  for (const id of Object.keys(tally)) {
    const diner = book.diners[id];
    if (!diner) continue;
    for (const recipe of Object.keys(tally[id])) {
      const n = tally[id][recipe] + (diner.fav === recipe ? diner.favN : 0);
      if (n > diner.favN) { diner.fav = recipe; diner.favN = n; }
    }
  }
  // the larder, and the landmarks the gathering took the truck to
  for (const need of run.needs) {
    if (need.have <= 0) continue;
    book.larder[need.id] = add(book.larder[need.id] || 0, need.have);
    const place = INGREDIENTS[need.id] ? INGREDIENTS[need.id].place : '';
    if (place) book.road[place] = add(book.road[place] || 0, 1);
  }
  return write(book);
}

/**
 * THE BOOK, for drawing. The ONE exported way to read it, and tools/check.js fails the build if any module but
 * game/screens/book.ts imports it. Call from enter(), never from update().
 */
export function readBook(): BookRecord {
  return load();
}

/** Every recipe in the book's order, with its row or null where it has never been cooked. Drawing only. */
export function dishRows(book: BookRecord): { id: string; dish: string; row: BookDish | null }[] {
  return ORDERS.map((o) => ({ id: o.id, dish: o.dish, row: book.dishes[o.id] || null }));
}

/** How many of the menu this truck has cooked, and how many there are: the number the closed board never could print. */
export function dishesKnown(book: BookRecord): { known: number; total: number } {
  let known = 0;
  for (const o of ORDERS) if (book.dishes[o.id]) known++;
  return { known, total: ORDERS.length };
}
