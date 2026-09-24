// Landmarks on the world map and the stations in the kitchen (docs/GDD.md section 3). Pure data.
//
// PLACES: where the truck can drive. `x, y` are world-map coordinates (the map is WORLD_W x WORLD_H px,
// content/places.js owns those numbers so the map screen and the HUD compass agree); `screen` is the
// mini-game a landmark opens when the order needs something it supplies (game/run.js screenForPlace) - two
// landmarks may share one, and the screen reads which it stands at off its `place` param;
// `sign` is the word on its signpost; `accent` is the ONE saturated colour the landmark and its mini-game
// share (docs/ART_STYLE.md section 4: one signal colour per scene).
export const WORLD_W = 1920, WORLD_H = 1080;

export const PLACES = Object.freeze([
  // Home is the DEPOT: the truck's own garage in the middle of the town, its door on the west road a few yards short
  // of the crossroads (960, 600) every lane fans out of. The day starts with the truck parked inside it.
  { id: 'home', name: 'HOLLOW LANE DEPOT', sign: 'HOME', x: 904, y: 590, screen: 'kitchen', accent: '#F2C14E' },
  { id: 'orchard', name: 'PIPPIN ORCHARD', sign: 'APPLES', x: 420, y: 300, screen: 'orchard', accent: '#D9463B' },
  { id: 'pond', name: 'MILLPOND', sign: 'FISH', x: 1480, y: 760, screen: 'pond', accent: '#5FD3C0' },
  { id: 'coop', name: 'CLUCKET COOP', sign: 'EGGS', x: 1500, y: 280, screen: 'coop', accent: '#F2C14E' },
  { id: 'dairy', name: 'BUTTERCUP DAIRY', sign: 'MILK', x: 300, y: 820, screen: 'dairy', accent: '#F1E4C8' },
  { id: 'mill', name: 'WINDLE MILL', sign: 'FLOUR', x: 960, y: 200, screen: 'mill', accent: '#E3C68F' },
  { id: 'hive', name: 'CLOVER HIVES', sign: 'HONEY', x: 700, y: 900, screen: 'hive', accent: '#E2B44A' },
  // The farm keeps the id `garden`: it is the name of its SCREEN (the walled kitchen garden the crew works a row
  // of), the seed block, the scenario and the dev jump, and the landmark was only ever the place that garden is at.
  { id: 'garden', name: 'FURROW FARM', sign: 'FARM', x: 1250, y: 520, screen: 'garden', accent: '#C96B7A' },
  // The second pass's landmarks, each with a screen of its own now: crabs are chased along the cove's beach, not
  // reeled in off a jetty like a trout, and berries are picked off the bank's bushes, not pulled out of a bed. The
  // cove keeps the pond's mint (it is the same sea, and the two coasts share an hour and a sun), and the bank
  // keeps the farm's rose and gold, its neighbour on the south lane (docs/ART_STYLE.md section 4).
  { id: 'shore', name: 'COCKLE COVE', sign: 'SHORE', x: 1760, y: 520, screen: 'beach', accent: '#5FD3C0' },
  { id: 'bramble', name: 'BRAMBLE BANK', sign: 'BERRIES', x: 1180, y: 880, screen: 'bramble', accent: '#C96B7A' },
  // The third pass's landmarks (docs/CONTENT_ROADMAP.md section E). Hazel Holt is the nut grove in the north-west
  // corner, up a lane from the orchard: nuts are SHAKEN down. Its accent is the mill's straw gold (a nut is a
  // grain's cousin, and the two never share a screen).
  { id: 'holt', name: 'HAZEL HOLT', sign: 'NUTS', x: 180, y: 150, screen: 'holt', accent: '#E3C68F' },
  // Tangle Wood is the dark wood in the north-east corner, on the coop's side of the river: things hide under the
  // leaves and are FORAGED. Its accent is the avocado's deep green.
  { id: 'wood', name: 'TANGLE WOOD', sign: 'WOOD', x: 1760, y: 180, screen: 'wood', accent: '#5C7A3B' },
  // Thyme Terrace is the walled herb bed between home and the orchard, up a spur off the orchard lane: herbs are
  // SNIPPED and grow back. Its accent is the leek's green.
  { id: 'terrace', name: 'THYME TERRACE', sign: 'HERBS', x: 680, y: 440, screen: 'terrace', accent: '#7DB35A' },
]);

/**
 * THE TOWN'S STOPS: where the day's queues form once the pantry is full. Every one stands on a street of the town
 * round the depot (art/backgrounds/map.ts CITY), never at a landmark - the countryside is where the truck gathers,
 * the town is where it sells. `x, y` is the kerb the truck pulls up to (a point on the street; arriving within the
 * map's 40 px of it opens the line), `sign` the queue's short name on the map's LINES ticket, and the queue itself
 * stands on the pavement: its front diner's feet at `qx, qy`, each diner behind them `qdx, qdy` further back.
 * There are as many stops as the longest day has queues (the fete's four), and the day plan deals them out.
 */
export const STOPS = Object.freeze([
  { id: 'square', name: 'THE MARKET SQUARE', sign: 'SQUARE', x: 960, y: 500, qx: 983, qy: 504, qdx: 0, qdy: -12 },
  { id: 'station', name: 'STATION ROAD', sign: 'STATION', x: 1110, y: 520, qx: 1110, qy: 542, qdx: 14, qdy: 0 },
  { id: 'market', name: 'THE HIGH STREET', sign: 'HIGH ST', x: 1090, y: 700, qx: 1090, qy: 722, qdx: 14, qdy: 0 },
  { id: 'corner', name: 'CHAPEL CORNER', sign: 'CHAPEL', x: 790, y: 600, qx: 790, qy: 622, qdx: -14, qdy: 0 },
]);

/** The full name of a landmark or a town stop by id ('THE MARKET SQUARE'); an unknown id is shouted back as itself. */
export function placeName(id: string): string {
  const p = PLACES.find((x) => x.id === id) || STOPS.find((x) => x.id === id);
  return p ? p.name : id.toUpperCase();
}

/** Kitchen stations, left to right along the truck's counter. `verb` is the interaction the station asks for. */
export const STATIONS = Object.freeze([
  { id: 'fridge', name: 'FRIDGE', verb: 'tap' },
  { id: 'chop', name: 'CHOP', verb: 'tap' },
  { id: 'mix', name: 'MIX', verb: 'stir' },
  { id: 'stove', name: 'STOVE', verb: 'hold' },
  { id: 'oven', name: 'OVEN', verb: 'time' },
  { id: 'plate', name: 'PLATE', verb: 'tap' },
]);
