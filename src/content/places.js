// Landmarks on the world map and the stations in the kitchen (docs/GDD.md section 3). Pure data.
//
// PLACES: where the truck can drive. `x, y` are world-map coordinates (the map is WORLD_W x WORLD_H px,
// content/places.js owns those numbers so the map screen and the HUD compass agree); `screen` is the
// mini-game a landmark opens when the order needs something it supplies (game/run.js screenForPlace);
// `sign` is the word on its signpost; `accent` is the ONE saturated colour the landmark and its mini-game
// share (docs/ART_STYLE.md section 4: one signal colour per scene).
export const WORLD_W = 1920, WORLD_H = 1080;

export const PLACES = Object.freeze([
  { id: 'home', name: 'HOLLOW LANE YARD', sign: 'HOME', x: 960, y: 600, screen: 'kitchen', accent: '#F2C14E' },
  { id: 'orchard', name: 'PIPPIN ORCHARD', sign: 'APPLES', x: 420, y: 300, screen: 'orchard', accent: '#D9463B' },
  { id: 'pond', name: 'MILLPOND', sign: 'FISH', x: 1480, y: 760, screen: 'pond', accent: '#5FD3C0' },
  { id: 'coop', name: 'CLUCKET COOP', sign: 'EGGS', x: 1500, y: 280, screen: 'coop', accent: '#F2C14E' },
  { id: 'dairy', name: 'BUTTERCUP DAIRY', sign: 'MILK', x: 300, y: 820, screen: '', accent: '#F1E4C8' },
  { id: 'mill', name: 'WINDLE MILL', sign: 'FLOUR', x: 960, y: 200, screen: '', accent: '#E3C68F' },
  { id: 'hive', name: 'CLOVER HIVES', sign: 'HONEY', x: 700, y: 900, screen: '', accent: '#E2B44A' },
  { id: 'garden', name: 'SATURDAY MARKET', sign: 'MARKET', x: 1250, y: 520, screen: '', accent: '#C96B7A' },
]);

/** Kitchen stations, left to right along the truck's counter. `verb` is the interaction the station asks for. */
export const STATIONS = Object.freeze([
  { id: 'chop', name: 'CHOP', verb: 'tap' },
  { id: 'mix', name: 'MIX', verb: 'stir' },
  { id: 'stove', name: 'STOVE', verb: 'hold' },
  { id: 'oven', name: 'OVEN', verb: 'time' },
  { id: 'plate', name: 'PLATE', verb: 'tap' },
]);
