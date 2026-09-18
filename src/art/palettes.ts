// This game's palette DATA. The colour helpers it used to define alongside them now live in the
// shared library (src/lib/art/palettes.ts) and are re-exported here, so every existing
// `from '../art/palettes.ts'` import keeps resolving and there is exactly one implementation of
// hexToRgb, shade, mix, farShade and friends across both games.
//
// The split is deliberate: the helpers are engine (identical in both games, byte for byte), the
// tables below are art direction (Hedgerow Dusk; the sibling game's are a steampunk ladder and
// share not one hex).
export * from '../lib/art/palettes.ts';

/**
 * Shared named palettes. `hero` is the default every build is spread over (lib/art/rig.ts buildRig), so it is a
 * neutral critter: warm brown fur, a red apron, cream trim. The cast's own palettes live in content/critters.
 * Shape: { skin (fur), hair (dark fur / markings), primary (apron/coat), secondary (trousers/lower body), accent, metal, dark, glow, sleeve }.
 */
export const PALETTES = {
  hero: { skin: '#B07A4A', hair: '#6B4326', primary: '#D9463B', secondary: '#5E3A1B', accent: '#F2C14E', metal: '#C8C0B0', dark: '#3A2A1E', glow: '#FFE28A' },
};
/** Fetch a palette by name (falls back to hero). */
export function getPalette(name) { return PALETTES[name] || PALETTES.hero; }

/** Environment colours shared by backdrops: the countryside's base ladder (docs/ART_STYLE.md section 4). */
export const ENV = {
  skyTop: '#8FCBEA', skyMid: '#BFE3F2', skyHorizon: '#F3E7C8', cloud: '#FFFFFF', cloudShade: '#D9E6EE',
  grass: '#8CC152', grassDark: '#5F9C3A', grassLight: '#B7DB7A', field: '#D9B95A', fieldDark: '#B99A3E', earth: '#A9784A', earthDark: '#7A5230',
  road: '#D8C7A0', roadEdge: '#B8A374', water: '#5FA8D6', waterDark: '#3F7FB0', waterLight: '#A9D8EE',
  wood: '#9A6234', woodDark: '#5E3A1B', woodLight: '#C48A52', stone: '#B9B2A6', stoneDark: '#8A8378', roofRed: '#C4553F', roofRedDark: '#8E3A2B',
  leaf: '#4E9A3C', leafDark: '#2F6E2A', leafLight: '#7FC35A', trunk: '#6B4326', ink: '#2A1F1A',
};
