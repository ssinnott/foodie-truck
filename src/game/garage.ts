// THE GARAGE'S BOOKS (docs/GDD.md section 13): the coin tin, the pieces bought and what the truck is wearing. The
// one record that outlives a WEEK - game/week.ts forgets a week the night it ends, and the tin has to carry on
// into the next one, or nothing dear could ever be saved up for.
//
// Persistence is localStorage and deliberately fragile, exactly as game/week.ts and engine/bindings.ts are: a
// private window, a blocked origin or junk in the entry all mean an EMPTY GARAGE - no coins, the stock truck -
// never a thrown error on boot.
//
// THREE RULES, all of them about keeping the simulation out of here:
//   * Read and written from screen enter() / exit() ONLY, never from an update() (docs/MULTIPLAYER.md: no
//     localStorage on the simulation path). The garage screen buys into its own copy and writes it on the way out.
//   * Nothing in here reaches the simulation. The coins and the parts are read by the garage screen; the style is
//     read by drawTruck; neither can change a frame the game steps, so two peers with different garages play the
//     same match.
//   * ONLINE PEERS DO NOT BANK. A match plays the host's week (game/week.ts says the same of the week record), and
//     the garage is a local thing for now: nobody's tin fills from a match and every peer sees the stock truck.
import type { TruckStyle } from '../art/truck.ts';
import { STOCK_STYLE, PAINTS, AWNINGS, ROOFS } from '../art/truck.ts';
import { partOf, partKey } from '../content/garage.ts';
import type { TruckSlot } from '../content/garage.ts';

/** Where the garage lives, and the shape version that invalidates it. */
const STORE_KEY = 'foodie-truck.garage';
const STORE_VERSION = 1;
/** A tin that has somehow grown past this is junk, not savings. */
const MAX_COINS = 999999;

/** The garage: what is in the tin, what has been bought and what the truck is wearing. */
export interface GarageRecord {
  /** Coins in the tin: every closed day's tips, less what the garage has sold. */
  coins: number;
  /** The pieces bought, as content/garage.ts partKey()s ('paint.mint'). Stock pieces are owned without being listed. */
  owned: string[];
  /** What the truck is wearing: always something owned. */
  wearing: TruckStyle;
  /**
   * The day whose tips were banked LAST, as 'seed:day'. The closed board can open more than once on the same night
   * (it is left and come back to); this is what makes paying the day in twice paying it in once.
   */
  banked: string;
}

/** A garage nobody has been in yet: an empty tin and the truck as it left the works. */
export function emptyGarage(): GarageRecord {
  return { coins: 0, owned: [], wearing: { ...STOCK_STYLE }, banked: '' };
}

/** Storage, if this browser has one we are allowed to touch. */
function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** True for an option the art has, in that slot. */
function known(slot: TruckSlot, id: unknown): boolean {
  if (typeof id !== 'string') return false;
  if (slot === 'paint') return Object.prototype.hasOwnProperty.call(PAINTS, id);
  return (slot === 'awning' ? AWNINGS : ROOFS).indexOf(id) >= 0;
}

/** True when `rec` may wear option `id` in `slot`: it is a stock piece, or it has been bought. */
export function owns(rec: GarageRecord, slot: TruckSlot, id: string): boolean {
  const part = partOf(slot, id);
  if (!part) return false;
  return part.price === 0 || rec.owned.indexOf(partKey(part)) >= 0;
}

/**
 * A stored record, checked hard: a part this build does not sell is dropped, and a slot worn with something the
 * record does not own (or the art does not have) goes back to stock. Anything else it does not like is an empty
 * garage.
 */
function validate(raw: unknown): GarageRecord {
  const rec = emptyGarage();
  if (!raw || typeof raw !== 'object') return rec;
  const r = raw as Record<string, unknown>;
  if (r.v !== STORE_VERSION) return rec;
  const coins = Number(r.coins);
  rec.coins = Number.isFinite(coins) ? Math.max(0, Math.min(MAX_COINS, Math.floor(coins))) : 0;
  if (Array.isArray(r.owned)) {
    for (const k of r.owned) {
      if (typeof k !== 'string' || rec.owned.indexOf(k) >= 0) continue;
      const dot = k.indexOf('.'), part = dot > 0 ? partOf(k.slice(0, dot), k.slice(dot + 1)) : null;
      if (part && part.price > 0) rec.owned.push(k);
    }
  }
  const w = (r.wearing && typeof r.wearing === 'object' ? r.wearing : {}) as Record<string, unknown>;
  for (const slot of ['paint', 'awning', 'roof'] as TruckSlot[]) {
    const id = w[slot];
    if (known(slot, id) && owns(rec, slot, id as string)) rec.wearing[slot] = id as string;
  }
  rec.banked = typeof r.banked === 'string' ? r.banked.slice(0, 32) : '';
  return rec;
}

/** The garage, or an empty one. Never throws. Call from enter(), never from update(). */
export function readGarage(): GarageRecord {
  const s = store();
  if (!s) return emptyGarage();
  try {
    const raw = s.getItem(STORE_KEY);
    return raw ? validate(JSON.parse(raw)) : emptyGarage();
  } catch { return emptyGarage(); }
}

/**
 * Write the garage. Never throws, and returns false when nothing was written. `online` is the match guard, as
 * game/week.ts saveWeek has it: the caller passes `!!(game.net && game.net.active)`.
 */
export function saveGarage(rec: GarageRecord, online = false): boolean {
  if (online) return false;
  const s = store();
  if (!s) return false;
  try {
    s.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, coins: rec.coins, owned: rec.owned.slice(), wearing: { ...rec.wearing }, banked: rec.banked }));
    return true;
  } catch { return false; }
}

/**
 * Pay a closed day's tips into the tin, once. Keyed on the seed and the day, so the board opening closed twice
 * on the same night pays in once. Returns the coins actually paid in (0 when the day was already banked, or
 * online). Call from enter(), never from update().
 */
export function bankDay(seed: number, day: number, coins: number, online = false): number {
  if (online) return 0;
  const rec = readGarage(), key = `${seed | 0}:${day | 0}`;
  if (rec.banked === key) return 0;
  const paid = Math.max(0, Math.floor(Number(coins) || 0));
  rec.coins = Math.min(MAX_COINS, rec.coins + paid);
  rec.banked = key;
  return saveGarage(rec) ? paid : 0;
}

/**
 * Buy option `id` for `slot` out of `rec`'s tin, and wear it. Changes `rec` only (the screen writes it on the way
 * out); returns false - and changes nothing - for a stock piece, one already owned or one the tin cannot cover.
 */
export function buy(rec: GarageRecord, slot: TruckSlot, id: string): boolean {
  const part = partOf(slot, id);
  if (!part || part.price === 0 || owns(rec, slot, id) || rec.coins < part.price) return false;
  rec.coins -= part.price;
  rec.owned.push(partKey(part));
  rec.wearing[slot] = id;
  return true;
}

/** Wear option `id` in `slot`, if it is owned. Changes `rec` only; returns whether it did. */
export function wear(rec: GarageRecord, slot: TruckSlot, id: string): boolean {
  if (!owns(rec, slot, id)) return false;
  rec.wearing[slot] = id;
  return true;
}

/**
 * What the truck should be drawn wearing on this machine right now: the garage's style, or the stock truck in a
 * live match (every peer sees the same one). Call from enter(), never from update() - it reads storage.
 */
export function truckStyleFor(game: { net: any }): TruckStyle {
  if (game.net && game.net.active) return { ...STOCK_STYLE };
  return readGarage().wearing;
}
