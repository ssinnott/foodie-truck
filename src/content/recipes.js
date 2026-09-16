// Orders, dishes and ingredients (docs/GDD.md section 3). Pure data: names, what a dish needs, which landmark
// supplies each ingredient, and the kitchen steps in order. Screens draw; this file only says what.
//
// An INGREDIENT names the landmark that supplies it (`place`, one of content/places.js) and a colour the HUD
// ticket, the map sign and the kitchen item all share, so a player learns "red = apples" once.

/** Ingredient id -> { name, place, hex (base colour), icon (a drawn glyph id) }. */
export const INGREDIENTS = Object.freeze({
  apple: { name: 'APPLES', place: 'orchard', hex: '#D9463B', icon: 'apple' },
  fish: { name: 'TROUT', place: 'pond', hex: '#7FA7C4', icon: 'fish' },
  egg: { name: 'EGGS', place: 'coop', hex: '#F7EAD0', icon: 'egg' },
  milk: { name: 'MILK', place: 'dairy', hex: '#FFFFFF', icon: 'milk' },
  flour: { name: 'FLOUR', place: 'mill', hex: '#EBDCC0', icon: 'sack' },
  honey: { name: 'HONEY', place: 'hive', hex: '#F2A83B', icon: 'jar' },
  carrot: { name: 'CARROTS', place: 'garden', hex: '#F08A2E', icon: 'carrot' },
});

/**
 * Orders. `steps` are kitchen stations in order (content/places.js STATIONS): chop | mix | stove | oven | plate.
 * `customer` is a cast-adjacent NPC drawn by the results screen; `line` is what they say on the phone.
 */
export const ORDERS = Object.freeze([
  { id: 'applePie', dish: 'APPLE PIE', customer: 'owl', line: 'ONE APPLE PIE, PLEASE. WARM.',
    needs: [{ id: 'apple', amount: 4 }, { id: 'egg', amount: 2 }], steps: ['chop', 'mix', 'oven', 'plate'] },
  { id: 'fishCakes', dish: 'FISH CAKES', customer: 'otter', line: 'FISH CAKES! TWO! NO, THREE!',
    needs: [{ id: 'fish', amount: 3 }, { id: 'egg', amount: 1 }], steps: ['chop', 'mix', 'stove', 'plate'] },
  { id: 'omelette', dish: 'APPLE OMELETTE', customer: 'goat', line: 'SOMETHING WITH EGGS. AND APPLES. SURPRISE ME.',
    needs: [{ id: 'egg', amount: 3 }, { id: 'apple', amount: 2 }], steps: ['mix', 'stove', 'plate'] },
]);
