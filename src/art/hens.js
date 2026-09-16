// The coop's birds (docs/ART_STYLE.md section 1 "Coop"): five hens, rust or speckled grey, and one rooster. Drawn
// like every prop in the rig style - 1 px warm ink round each object, three tones on the body (base, a shadow band,
// the wing as a colour change inside the body's own line), beak and feet in mustard - at 20x16 for a hen and 24x20
// for the rooster, feet on the ground point. Two frames of walk (the legs swap) and of peck (the head drops 3 px).
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each bird first.
// The rooster's comb is the ONE place in the scene the reserved HOT colour appears, and only while it telegraphs
// a charge: the screen passes the comb colour in, so this file never decides when heat shows.
import { INK } from './layers.js';
import { mix } from './palettes.js';
import { PLUM } from '../constants.js';

const TAU = Math.PI * 2;
/** Bird colours: the only rust and grey things in the scene (no critter wears either). */
export const HEN = Object.freeze({
  rust: '#A8623A', grey: '#8C8A93', beak: '#E2B44A',
  /** A hen's comb and the rooster's resting comb: the map's roof red, muted, never the reserved HOT. */
  comb: '#A65A48',
  /** The rooster's tail plumes: the wall's seam green, so they read dark against the floor and never as a fourth fur. */
  plume: '#3F4D44',
});
const RUST_SH = mix(HEN.rust, PLUM.shadow, 0.4), GREY_SH = mix(HEN.grey, PLUM.shadow, 0.4), PLUME_SH = mix(HEN.plume, PLUM.deep, 0.4);
/** Speckles on the grey hen: 2x2 marks in its shadow tone, fixed in body space so they never crawl. */
const SPECKS = [-5, -11, -1, -13, 3, -10, -3, -8];

/** One stroked-then-filled path: the ink shows 1 px outside the fill. */
function ink(ctx, fill) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); }

/** A leg: a 2x`h` mustard post inside a 1 px ink line, foot toward +x. */
function leg(ctx, x, h) {
  ctx.fillStyle = INK; ctx.fillRect(x - 1, -h - 1, 4, h + 2); ctx.fillRect(x - 1, -2, 6, 3);
  ctx.fillStyle = HEN.beak; ctx.fillRect(x, -h, 2, h); ctx.fillRect(x, -1, 4, 1);
}

/** Head ball with comb, beak and eye; `hy` is the head centre's y (the peck drops it). */
function head(ctx, hx, hy, r, fill, comb, combW) {
  ctx.fillStyle = INK; ctx.fillRect(hx - combW / 2 - 1, hy - r - 4, combW + 2, 4);
  ctx.fillStyle = comb; ctx.fillRect(hx - combW / 2, hy - r - 3, combW, 3);
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = INK; ctx.fillRect(hx + r - 2, hy - 2, 6, 4);   // beak, inked; the skull's fill then covers its root
  ctx.fillStyle = HEN.beak; ctx.fillRect(hx + r - 1, hy - 1, 4, 2);
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  ctx.fillStyle = INK; ctx.fillRect(hx, hy - 2, 2, 2);            // eye
}

/**
 * A hen with its feet at (x, y). `kind` 0 rust / 1 speckled grey; `facing` 1 right / -1 left; `walk` 0/1 swaps the
 * legs; `peck` 0/1 drops the head. 20 wide, 16 tall.
 */
export function drawHen(ctx, x, y, kind, facing, walk, peck) {
  const base = kind ? HEN.grey : HEN.rust, sh = kind ? GREY_SH : RUST_SH, py = peck * 3;
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  leg(ctx, -4 + walk * 2, 4); leg(ctx, 1 - walk * 2, 4);
  // body and tail as ONE path so the outline scallops round the whole bird
  ctx.beginPath();
  ctx.ellipse(-1, -10, 8, 5, 0, 0, TAU);
  ctx.moveTo(-6, -8); ctx.lineTo(-11, -17); ctx.lineTo(-4, -14); ctx.closePath();
  ink(ctx, base);
  ctx.save(); ctx.beginPath(); ctx.ellipse(-1, -10, 8, 5, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = sh; ctx.fillRect(-10, -8, 20, 4);                                               // the shadow band
  ctx.beginPath(); ctx.ellipse(-2, -11, 4, 2.5, 0, 0, TAU); ctx.fill();                          // the wing, no line
  if (kind) for (let i = 0; i < SPECKS.length; i += 2) ctx.fillRect(SPECKS[i], SPECKS[i + 1], 2, 2);
  ctx.restore();
  head(ctx, 6, -15 + py, 3.5, base, HEN.comb, 3);
  ctx.restore();
}

/**
 * The rooster with its feet at (x, y): a bigger rust bird with a plume tail and a wattle. `comb` is the comb colour
 * the screen chose (HEN.comb at rest, SIGNAL.hot on the telegraph's flashing frames); `walk` 0/1 as the hen.
 * 24 wide, 20 tall.
 */
export function drawRooster(ctx, x, y, facing, walk, comb) {
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  leg(ctx, -4 + walk * 2, 6); leg(ctx, 2 - walk * 2, 6);
  // tail plumes first (behind the body): two sickle feathers as one inked shape
  ctx.beginPath();
  ctx.moveTo(-7, -12); ctx.quadraticCurveTo(-16, -14, -18, -25); ctx.quadraticCurveTo(-12, -20, -10, -16);
  ctx.quadraticCurveTo(-14, -22, -12, -28); ctx.quadraticCurveTo(-6, -22, -5, -15); ctx.closePath();
  ink(ctx, HEN.plume);
  ctx.fillStyle = PLUME_SH; ctx.fillRect(-16, -18, 6, 3);
  ctx.beginPath();
  ctx.ellipse(0, -13, 10, 6, 0, 0, TAU);
  ink(ctx, HEN.rust);
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, -13, 10, 6, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = RUST_SH; ctx.fillRect(-12, -10, 24, 4);
  ctx.beginPath(); ctx.ellipse(-2, -14, 5, 3, 0, 0, TAU); ctx.fill();
  ctx.restore();
  head(ctx, 8, -20, 4, HEN.rust, comb, 5);
  ctx.fillStyle = INK; ctx.fillRect(8, -16, 4, 5);                 // wattle, inked
  ctx.fillStyle = HEN.comb; ctx.fillRect(9, -16, 2, 3);
  ctx.restore();
}
