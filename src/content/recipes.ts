// Orders, dishes and ingredients (docs/GDD.md section 3). Pure data: names, what a dish needs, which landmark
// supplies each ingredient, and the kitchen steps in order. Screens draw; this file only says what.
//
// An INGREDIENT names the landmark that supplies it (`place`, one of content/places.js) and a colour the HUD
// ticket, the map sign and the kitchen item all share, so a player learns "red = apples" once.
//
// A landmark can supply MORE THAN ONE ingredient: the orchard drops pears and peaches as well as apples, the farm's
// bed grows six vegetables besides the carrot, and the mill fills sacks of rice as well as flour. A
// mini-game gathers whichever of its landmark's ingredients the shopping list is still short of (game/run.js
// gatherTarget), so every entry here is reachable without a screen of its own. The FIRST ingredient listed for a
// landmark is the one its screen falls back to when nothing is asked for (a dev jump with no order).

/** Ingredient id -> { name, place, hex (base colour), icon (a drawn glyph id, art/food.js FOOD) }. */
export const INGREDIENTS = Object.freeze({
  apple: { name: 'APPLES', place: 'orchard', hex: '#D9463B', icon: 'apple' },
  fish: { name: 'TROUT', place: 'pond', hex: '#7FA7C4', icon: 'fish' },
  egg: { name: 'EGGS', place: 'coop', hex: '#F7EAD0', icon: 'egg' },
  milk: { name: 'MILK', place: 'dairy', hex: '#FFFFFF', icon: 'milk' },
  flour: { name: 'FLOUR', place: 'mill', hex: '#EBDCC0', icon: 'sack' },
  honey: { name: 'HONEY', place: 'hive', hex: '#F2A83B', icon: 'jar' },
  carrot: { name: 'CARROTS', place: 'garden', hex: '#F08A2E', icon: 'carrot' },
  // the orchard's other trees: caught under the canopy like the apples
  pear: { name: 'PEARS', place: 'orchard', hex: '#B9C24A', icon: 'pear' },
  peach: { name: 'PEACHES', place: 'orchard', hex: '#F5A66B', icon: 'peach' },
  avocado: { name: 'AVOCADOS', place: 'orchard', hex: '#5C7A3B', icon: 'avocado' },
  // the dairy churns as well as milks; the mill fills rice sacks under the same chutes
  butter: { name: 'BUTTER', place: 'dairy', hex: '#F5D66B', icon: 'butter' },
  rice: { name: 'RICE', place: 'mill', hex: '#F7F3E6', icon: 'rice' },
  // the farm's other rows, pulled out of the bed like the carrots
  potato: { name: 'POTATOES', place: 'garden', hex: '#C29A5B', icon: 'potato' },
  onion: { name: 'ONIONS', place: 'garden', hex: '#E7C58C', icon: 'onion' },
  leek: { name: 'LEEKS', place: 'garden', hex: '#7DB35A', icon: 'leek' },
  beetroot: { name: 'BEETROOT', place: 'garden', hex: '#8E2F5E', icon: 'beetroot' },
  pumpkin: { name: 'PUMPKINS', place: 'garden', hex: '#D9661F', icon: 'pumpkin' },
  cabbage: { name: 'CABBAGES', place: 'garden', hex: '#A9C86A', icon: 'cabbage' },
  // Cockle Cove, the shore at the east edge of the map: crab lines and a rake off the jetty
  crab: { name: 'CRABS', place: 'shore', hex: '#D9603B', icon: 'crab' },
  seaweed: { name: 'SEAWEED', place: 'shore', hex: '#3F7A4E', icon: 'seaweed' },
  salt: { name: 'SEA SALT', place: 'shore', hex: '#EAF0F2', icon: 'salt' },
  // Bramble Bank, the berry beds on the south lane
  strawberry: { name: 'STRAWBERRIES', place: 'bramble', hex: '#E8405A', icon: 'strawberry' },
  blueberry: { name: 'BLUEBERRIES', place: 'bramble', hex: '#4A5BA8', icon: 'blueberry' },
});

/** Every ingredient id a landmark supplies, in INGREDIENTS order (the first is the landmark's fallback). */
export function ingredientsAt(placeId: string): string[] {
  const out: string[] = [];
  for (const id of Object.keys(INGREDIENTS)) if (INGREDIENTS[id].place === placeId) out.push(id);
  return out;
}

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
  // The four orders below are what the dairy, the mill, the hives and the farm are FOR: until an order
  // asked for milk, flour, honey or carrots, `run.missing()` never named those landmarks, `screenForPlace` never
  // returned their screens and four finished mini-games would have sat unreachable behind a signpost. Each one
  // pairs a new ingredient with a second so the truck still makes two stops, and the amounts are the 3..4 a party
  // gathers in well under a minute (measured against the orchard's four apples; a round has no clock).
  { id: 'honeyLoaf', dish: 'HONEY LOAF', customer: 'owl', line: 'A HONEY LOAF. WARM, AND CUT THICK.',
    needs: [{ id: 'flour', amount: 3 }, { id: 'honey', amount: 2 }], steps: ['fridge', 'mix', 'oven', 'plate'] },
  { id: 'custardTart', dish: 'CUSTARD TART', customer: 'goat', line: 'CUSTARD TART. NOT TOO WOBBLY.',
    needs: [{ id: 'milk', amount: 3 }, { id: 'egg', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'oven', 'plate'] },
  { id: 'carrotSoup', dish: 'CARROT SOUP', customer: 'otter', line: 'SOUP! CARROT SOUP! IT IS PERISHING OUT HERE!',
    needs: [{ id: 'carrot', amount: 4 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
  { id: 'griddleCakes', dish: 'GRIDDLE CAKES', customer: 'otter', line: 'GRIDDLE CAKES. A STACK OF THEM.',
    needs: [{ id: 'flour', amount: 3 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'plate'] },
  // The second menu: one order per new ingredient (docs/GDD.md section 3), APPENDED so that ?order=N and every
  // scenario that names an index above still lands on the same dish. Amounts stay in the 2..4 a party gathers in
  // one round, and a dish never asks for more than three things, so the fridge run stays short.
  { id: 'pearCrumble', dish: 'PEAR CRUMBLE', customer: 'goat', line: 'PEAR CRUMBLE. WITH THE CRUNCHY BITS.',
    needs: [{ id: 'pear', amount: 3 }, { id: 'flour', amount: 2 }], steps: ['fridge', 'chop', 'mix', 'oven', 'plate'] },
  { id: 'peachCobbler', dish: 'PEACH COBBLER', customer: 'owl', line: 'A PEACH COBBLER, IF THE PEACHES ARE RIPE.',
    needs: [{ id: 'peach', amount: 3 }, { id: 'butter', amount: 2 }], steps: ['fridge', 'chop', 'mix', 'oven', 'plate'] },
  { id: 'avocadoToast', dish: 'AVOCADO TOAST', customer: 'otter', line: 'AVOCADO ON TOAST. SMASH IT UP GOOD.',
    needs: [{ id: 'avocado', amount: 2 }, { id: 'flour', amount: 2 }], steps: ['fridge', 'chop', 'oven', 'plate'] },
  { id: 'crabCakes', dish: 'CRAB CAKES', customer: 'otter', line: 'CRAB CAKES! FRESH OFF THE COVE!',
    needs: [{ id: 'crab', amount: 3 }, { id: 'egg', amount: 1 }], steps: ['fridge', 'chop', 'mix', 'stove', 'plate'] },
  { id: 'seaweedRolls', dish: 'SEAWEED RICE ROLLS', customer: 'goat', line: 'RICE ROLLS IN SEAWEED. NEAT LITTLE ONES.',
    needs: [{ id: 'rice', amount: 3 }, { id: 'seaweed', amount: 2 }], steps: ['fridge', 'stove', 'chop', 'plate'] },
  { id: 'pretzels', dish: 'SALT PRETZELS', customer: 'owl', line: 'PRETZELS. TWISTED, AND PLENTY OF SALT.',
    needs: [{ id: 'flour', amount: 3 }, { id: 'salt', amount: 1 }, { id: 'butter', amount: 1 }], steps: ['fridge', 'mix', 'oven', 'plate'] },
  { id: 'strawberryTart', dish: 'STRAWBERRY TART', customer: 'goat', line: 'A STRAWBERRY TART. THE RED ONES ON TOP.',
    needs: [{ id: 'strawberry', amount: 4 }, { id: 'butter', amount: 2 }], steps: ['fridge', 'chop', 'mix', 'oven', 'plate'] },
  { id: 'blueberryMuffins', dish: 'BLUEBERRY MUFFINS', customer: 'owl', line: 'BLUEBERRY MUFFINS. A BASKET OF THEM.',
    needs: [{ id: 'blueberry', amount: 3 }, { id: 'flour', amount: 2 }, { id: 'egg', amount: 1 }], steps: ['fridge', 'mix', 'oven', 'plate'] },
  { id: 'ricePudding', dish: 'RICE PUDDING', customer: 'otter', line: 'RICE PUDDING. WITH THE SKIN ON.',
    needs: [{ id: 'rice', amount: 3 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'mix', 'stove', 'plate'] },
  { id: 'jacketPotato', dish: 'JACKET POTATO', customer: 'goat', line: 'A JACKET POTATO. BUTTER IN THE MIDDLE.',
    needs: [{ id: 'potato', amount: 3 }, { id: 'butter', amount: 1 }], steps: ['fridge', 'chop', 'oven', 'plate'] },
  { id: 'onionSoup', dish: 'ONION SOUP', customer: 'owl', line: 'ONION SOUP. I CAN TAKE THE TEARS.',
    needs: [{ id: 'onion', amount: 4 }, { id: 'butter', amount: 1 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
  { id: 'leekPie', dish: 'LEEK PIE', customer: 'otter', line: 'LEEK PIE! THE ONE WITH THE LID!',
    needs: [{ id: 'leek', amount: 3 }, { id: 'flour', amount: 2 }, { id: 'milk', amount: 1 }], steps: ['fridge', 'chop', 'mix', 'oven', 'plate'] },
  { id: 'beetrootSoup', dish: 'BEETROOT SOUP', customer: 'goat', line: 'BEETROOT SOUP. THE PINK KIND.',
    needs: [{ id: 'beetroot', amount: 3 }, { id: 'potato', amount: 1 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
  { id: 'pumpkinSoup', dish: 'PUMPKIN SOUP', customer: 'owl', line: 'PUMPKIN SOUP. A BIG BOWL, AND BREAD.',
    needs: [{ id: 'pumpkin', amount: 2 }, { id: 'onion', amount: 1 }, { id: 'milk', amount: 2 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
  { id: 'cabbageRolls', dish: 'CABBAGE ROLLS', customer: 'otter', line: 'CABBAGE ROLLS. STUFFED FULL.',
    needs: [{ id: 'cabbage', amount: 3 }, { id: 'rice', amount: 2 }], steps: ['fridge', 'chop', 'stove', 'plate'] },
]);
