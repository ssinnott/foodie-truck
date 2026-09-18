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
 * Orders. `steps` are kitchen stations in order (content/places.js STATIONS): fridge | chop | mix | stove | oven |
 * plate. Every recipe opens at the FRIDGE, where its ingredients are pulled out one tap at a time (docs/GDD.md
 * section 6), so a dish is never cooked out of thin air.
 * `customer` is a cast-adjacent NPC drawn by the results screen; `line` is what they say on the phone.
 */
export const ORDERS = Object.freeze([
  { id: 'applePie', dish: 'APPLE PIE', customer: 'owl', line: 'ONE APPLE PIE, PLEASE. WARM.',
    needs: [{ id: 'apple', amount: 4 }, { id: 'egg', amount: 2 }], steps: ['fridge', 'chop', 'mix', 'oven', 'plate'] },
  { id: 'fishCakes', dish: 'FISH CAKES', customer: 'otter', line: 'FISH CAKES! TWO! NO, THREE!',
    needs: [{ id: 'fish', amount: 3 }, { id: 'egg', amount: 1 }], steps: ['fridge', 'chop', 'mix', 'stove', 'plate'] },
  { id: 'omelette', dish: 'APPLE OMELETTE', customer: 'goat', line: 'SOMETHING WITH EGGS. AND APPLES. SURPRISE ME.',
    needs: [{ id: 'egg', amount: 3 }, { id: 'apple', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'plate'] },
  // The four orders below are what the dairy, the mill, the hives and the market garden are FOR: until an order
  // asked for milk, flour, honey or carrots, `run.missing()` never named those landmarks, `screenForPlace` never
  // returned their screens and four finished mini-games would have sat unreachable behind a signpost. Each one
  // pairs a new ingredient with a second so the truck still makes two stops, and the amounts are the 3..4 a party
  // gathers inside a 40-second round (measured against the orchard's four apples).
  { id: 'honeyLoaf', dish: 'HONEY LOAF', customer: 'owl', line: 'A HONEY LOAF. WARM, AND CUT THICK.',
    needs: [{ id: 'flour', amount: 3 }, { id: 'honey', amount: 2 }], steps: ['fridge', 'mix', 'oven', 'plate'] },
  { id: 'custardTart', dish: 'CUSTARD TART', customer: 'goat', line: 'CUSTARD TART. NOT TOO WOBBLY.',
    needs: [{ id: 'milk', amount: 3 }, { id: 'egg', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'oven', 'plate'] },
  { id: 'carrotSoup', dish: 'CARROT SOUP', customer: 'otter', line: 'SOUP! CARROT SOUP! IT IS PERISHING OUT HERE!',
    needs: [{ id: 'carrot', amount: 4 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
  { id: 'griddleCakes', dish: 'GRIDDLE CAKES', customer: 'otter', line: 'GRIDDLE CAKES. A STACK OF THEM.',
    needs: [{ id: 'flour', amount: 3 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'plate'] },
]);
