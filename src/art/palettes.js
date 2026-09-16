// Named palettes and colour helpers. Palette shape: { skin, hair, primary, secondary, accent, metal, dark, glow }.

/** Parse '#rgb' / '#rrggbb' to [r,g,b]. */
export function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** [r,g,b] to '#rrggbb'. */
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** Multiply a colour's brightness (f < 1 darker, > 1 lighter). */
export function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * f, g * f, b * f); }
/** Mix two colours by t. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/** 'rgba(...)' string with alpha. */
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
/** Return a new palette with every colour shaded by f (used for far limbs). */
export function shadePalette(p, f) {
  const o = {};
  for (const k of Object.keys(p)) o[k] = typeof p[k] === 'string' && p[k][0] === '#' ? shade(p[k], f) : p[k];
  return o;
}
/**
 * Darken AND desaturate a colour (far-side limbs): brightness x f, then pulled `desat` (0..1) toward its own grey,
 * with a slight cool cast so far parts sit behind the near ones instead of merging with them.
 */
export function farShade(hex, f, desat = 0.25) {
  const [r, g, b] = hexToRgb(hex);
  const L = (r * 0.3 + g * 0.59 + b * 0.11) * f;
  const rr = r * f, gg = g * f, bb = b * f;
  return rgbToHex(rr + (L - rr) * desat, gg + (L - gg) * desat, bb + (L - bb) * desat + 6);
}
/** Far-limb palette: every colour through farShade (readability pass: far limbs ~35-40 % darker and greyer). */
export function farPalette(p, f = 0.62, desat = 0.25) {
  const o = {};
  for (const k of Object.keys(p)) o[k] = typeof p[k] === 'string' && p[k][0] === '#' ? farShade(p[k], f, desat) : p[k];
  return o;
}

/**
 * Shared named palettes. `hero` is the default every build is spread over (art/rig.js buildRig), so it is a
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
