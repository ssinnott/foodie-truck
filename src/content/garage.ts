// THE GARAGE'S CATALOGUE (docs/GDD.md section 13): what the truck can wear and what each piece costs. The art for
// every option is art/truck.ts's (PAINTS, AWNINGS, ROOFS); this file only names them and prices them.
//
// THE PRICES ARE SET AGAINST A WEEK'S TIPS. A dish tips TIP_COINS[stars] (game/run.ts): 4, 8 or 12 coins. A week is
// 31 dishes (4 on the opening day, 6 on each of the three ordinary ones, 9 at the fete), so a week of two-star
// cooking tips 248, a week of three stars 372, and a steady two-and-a-half is about 310. Each piece costs between
// 200 and 360, so an ordinary week buys ABOUT ONE THING: the first week always buys the cheapest, and the six
// pieces together are five or six weeks of work. Move a price and that sentence is what it has to stay true to.

/** The three things on a truck that can be changed, in the order the garage lists them. */
export type TruckSlot = 'paint' | 'awning' | 'roof';

/** One option for one slot: its art id (art/truck.ts), its name on the slate and its price in coins (0 = stock). */
export interface TruckPart {
  slot: TruckSlot;
  id: string;
  name: string;
  price: number;
}

/** The slots, in the order the garage's slate lists them, with the label each row prints. */
export const SLOTS: readonly { id: TruckSlot; label: string }[] = Object.freeze([
  Object.freeze({ id: 'paint' as TruckSlot, label: 'PAINT' }),
  Object.freeze({ id: 'awning' as TruckSlot, label: 'AWNING' }),
  Object.freeze({ id: 'roof' as TruckSlot, label: 'ROOF' }),
]);

/**
 * Every option, stock first within its slot. Three stock pieces the truck is built with and SIX TO BUY: two
 * paints, two awnings and two things for the roof - the food ones (the ketchup-and-mustard paint, the salad
 * awning and the hot dog) the dearest of each pair.
 */
export const PARTS: readonly TruckPart[] = Object.freeze([
  Object.freeze({ slot: 'paint' as TruckSlot, id: 'beetroot', name: 'BEETROOT', price: 0 }),
  Object.freeze({ slot: 'paint' as TruckSlot, id: 'mint', name: 'SEAFOAM MINT', price: 220 }),
  Object.freeze({ slot: 'paint' as TruckSlot, id: 'ketchup', name: 'KETCHUP AND MUSTARD', price: 320 }),
  Object.freeze({ slot: 'awning' as TruckSlot, id: 'stripes', name: 'MUSTARD STRIPES', price: 0 }),
  Object.freeze({ slot: 'awning' as TruckSlot, id: 'gingham', name: 'CHERRY GINGHAM', price: 200 }),
  Object.freeze({ slot: 'awning' as TruckSlot, id: 'salad', name: 'SALAD', price: 280 }),
  Object.freeze({ slot: 'roof' as TruckSlot, id: 'board', name: 'FOODIE TRUCK BOARD', price: 0 }),
  Object.freeze({ slot: 'roof' as TruckSlot, id: 'apple', name: 'BIG APPLE', price: 260 }),
  Object.freeze({ slot: 'roof' as TruckSlot, id: 'hotdog', name: 'HOT DOG', price: 360 }),
]);

/** The options for one slot, stock first. */
export function partsFor(slot: TruckSlot): TruckPart[] { return PARTS.filter((p) => p.slot === slot); }

/** One option by slot and id, or null. */
export function partOf(slot: string, id: string): TruckPart | null { return PARTS.find((p) => p.slot === slot && p.id === id) || null; }

/** The key a part is owned under in the save ('paint.mint'). */
export function partKey(p: { slot: string; id: string }): string { return `${p.slot}.${p.id}`; }
