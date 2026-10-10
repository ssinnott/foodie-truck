// The coop's birds (docs/ART_STYLE.md section 1 "Coop"): five hens, rust or speckled grey, and one rooster. Drawn
// like every prop in the rig style - 1 px warm ink round each object, three tones on the body (base, a shadow band,
// the wing as a colour change inside the body's own line), beak and feet in dull ochre - at 20x16 for a hen and 24x20
// for the rooster, feet on the ground point. Two frames of walk (the legs swap) and of peck (the head drops 3 px).
// Screen space, integer coordinates, no allocation per call; the screen draws drawShadow under each bird first.
// The rooster's comb is the ONE place in the scene the reserved HOT colour appears, and only while it telegraphs
// a charge: the screen passes the comb colour in, so this file never decides when heat shows.
// The two jokes add two more looks (game/screens/coopGags.ts): the broody hen PUFFED UP to twice her size with her
// feathers on end, and the CHICK that hatches out of the surprise egg wearing half its shell.
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { PLUM, UI } from '../constants.ts';
import { shellHalf } from './coopProps.ts';

const R = Math.round, TAU = Math.PI * 2;
/** Bird colours: the only rust and grey things in the scene (no critter wears either). */
export const HEN = Object.freeze({
  /** Beak and feet: a darkened straw ochre, NOT the mustard that read as SIGNAL.coop - ten gold legs out-shouted the
   *  one 6x6 egg sparkle the gold is reserved for (ART_STYLE section 4). */
  rust: '#A8623A', grey: '#8C8A93', beak: '#B98A46',
  /** A hen's comb and the rooster's resting comb: the map's roof red, muted, never the reserved HOT. */
  comb: '#A65A48',
  /** The rooster's tail plumes: the wall's seam green, so they read dark against the floor and never as a fourth fur. */
  plume: '#3F4D44',
});
const RUST_SH = mix(HEN.rust, PLUM.shadow, 0.4), GREY_SH = mix(HEN.grey, PLUM.shadow, 0.4), PLUME_SH = mix(HEN.plume, PLUM.deep, 0.4);
/** Speckles on the grey hen: 2x2 marks in its shadow tone, fixed in body space so they never crawl. */
const SPECKS = [-5, -11, -1, -13, 3, -10, -3, -8];
/**
 * The chick's fluff: a pale primrose, lighter and far greyer than the coop's gold (#F2C14E), so the one gold thing
 * in the scene is still the fresh-egg sparkle (ART_STYLE section 4) and a chick on a head never reads as an egg to
 * go and get. Its shade is the hens' plum mix; beak and feet are the hens' ochre.
 */
export const CHICK = '#F2DE94';
const CHICK_SH = mix(CHICK, PLUM.shadow, 0.3);
/** Rows from a chick's feet to the top of the half shell on its head: what a head it sits on grows by. */
export const CHICK_H = 17;
/** A sitting hen's body comes down this far, onto where her feet were. */
const SIT_DROP = 5;
/** The puffed hen's ruffled back: tufts at these angles (radians) round the upper rim of her body. */
const TUFTS = Float32Array.of(3.6, 4.05, 4.5, 4.95, 5.4, 5.85);

/** One stroked-then-filled path: the ink shows 1 px outside the fill. */
function ink(ctx, fill) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); }

/** A leg: a 2x`h` ochre post inside a 1 px ink line, foot toward +x. */
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
 * legs; `peck` 0/1 drops the head. 20 wide, 16 tall. `sit` tucks the legs away: a hen sat down on a nest, whose
 * (x, y) is then the bottom of her body in the straw rather than her feet.
 */
export function drawHen(ctx, x, y, kind, facing, walk, peck, sit = false) {
  const base = kind ? HEN.grey : HEN.rust, sh = kind ? GREY_SH : RUST_SH, py = peck * 3;
  ctx.save(); ctx.translate(x, sit ? y + SIT_DROP : y); if (facing < 0) ctx.scale(-1, 1);
  if (!sit) { leg(ctx, -4 + walk * 2, 4); leg(ctx, 1 - walk * 2, 4); }
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

/**
 * The broody hen in a temper, feet at (x, y) in her nest. `puff` 0..1 swells her from a hen's 20x16 to twice that:
 * the body 32x26 with its feathers on end (a ring of tufts round her back, the tail fanned into three spikes, the
 * wing flared), the head pushed up and forward with a wider comb and a GLARE - a 3 px eye under a brow slanting down
 * at the beak. `jab` 1 throws the head forward and down with the beak open: one peck of the flurry. At puff 0 she is
 * drawHen's hen, so a deflating hen lands back on exactly the bird she was.
 */
export function drawPuffedHen(ctx, x, y, kind, facing, puff, jab) {
  if (puff <= 0) { drawHen(ctx, x, y, kind, facing, 0, jab); return; }
  const base = kind ? HEN.grey : HEN.rust, sh = kind ? GREY_SH : RUST_SH, p = puff;
  const bx = -1, by = -10 - 5 * p, rx = 8 + 8 * p, ry = 5 + 8 * p, tr = 1 + 2.5 * p, spike = 3 + 5 * p;
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  leg(ctx, -4, 4); leg(ctx, 1, 4);
  // body, tufts and the fanned tail as ONE path, so a single ink line runs round the whole ruffled outline
  ctx.beginPath();
  ctx.ellipse(bx, by, rx, ry, 0, 0, TAU);
  for (let i = 0; i < TUFTS.length; i++) {
    const a = TUFTS[i], tx = bx + Math.cos(a) * rx, ty = by + Math.sin(a) * ry;
    ctx.moveTo(tx + tr, ty); ctx.arc(tx, ty, tr, 0, TAU);
  }
  for (let a = 3.3; a < 4.2; a += 0.38) {
    ctx.moveTo(bx + Math.cos(a - 0.22) * rx * 0.9, by + Math.sin(a - 0.22) * ry * 0.9);
    ctx.lineTo(bx + Math.cos(a) * (rx + spike), by + Math.sin(a) * (ry + spike));
    ctx.lineTo(bx + Math.cos(a + 0.22) * rx * 0.9, by + Math.sin(a + 0.22) * ry * 0.9);
    ctx.closePath();
  }
  ink(ctx, base);
  ctx.save(); ctx.beginPath(); ctx.ellipse(bx, by, rx, ry, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = sh; ctx.fillRect(bx - rx, R(by + ry * 0.4), rx * 2, ry);                         // the shadow band
  ctx.beginPath(); ctx.ellipse(bx - 2, by - 1, 4 + 4 * p, 2.5 + 2.5 * p, -0.35 * p, 0, TAU); ctx.fill();   // the wing, flared
  if (kind) for (let i = 0; i < SPECKS.length; i += 2) ctx.fillRect(R(bx + (SPECKS[i] + 1) * (1 + p)), R(by + (SPECKS[i + 1] + 10) * (1 + p)), 2, 2);
  ctx.restore();
  // the head, up on top of all that, the comb pushed back off the brow, and the glare
  const hr = 3.5 + 2 * p, hx = R(6 + 7 * p + jab * 3), hy = R(-15 - 9 * p + jab * 4), cw = R(3 + 2 * p), cx = hx - R(2 * p);
  ctx.fillStyle = INK; ctx.fillRect(cx - (cw >> 1) - 1, R(hy - hr) - 4, cw + 2, 5);
  ctx.fillStyle = HEN.comb; ctx.fillRect(cx - (cw >> 1), R(hy - hr) - 3, cw, 3);
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  const bk = R(hx + hr) - 2;
  ctx.fillStyle = INK; ctx.fillRect(bk, hy - 3, 7, jab ? 7 : 5);                                    // beak, inked: open on a jab
  ctx.fillStyle = HEN.beak; ctx.fillRect(bk + 1, hy - 2, 5, 2);
  if (jab) ctx.fillRect(bk + 1, hy + 2, 4, 2);
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fillStyle = base; ctx.fill();
  // the glare: a hen's ink-dot eye opened right up, white with the pupil hard forward, under a brow slanting down at the beak
  ctx.fillStyle = INK; ctx.fillRect(hx - 1, hy - 3, 6, 6);
  ctx.fillStyle = UI.cream; ctx.fillRect(hx, hy - 2, 4, 4);
  ctx.fillStyle = INK; ctx.fillRect(hx + 2, hy - 1, 2, 2);
  ctx.fillRect(hx - 2, hy - 6, 3, 2); ctx.fillRect(hx + 1, hy - 5, 3, 2); ctx.fillRect(hx + 4, hy - 4, 2, 2);
  ctx.restore();
}

/**
 * A chick, feet at (x, y): a primrose fluff ball 12 wide with its head a smaller ball at the front top, two ochre
 * feet (`step` 0/1 swaps them), an ink eye, and - `hat` - the top half of its own shell on its head, the broken edge
 * down over the brow. `cheep` 1 opens the beak and lifts the wing. CHICK_H rows tall with the hat on.
 */
export function drawChick(ctx, x, y, facing, step, cheep, hat) {
  ctx.save(); ctx.translate(x, y); if (facing < 0) ctx.scale(-1, 1);
  ctx.fillStyle = INK; ctx.fillRect(-4 + step, -3, 4, 4); ctx.fillRect(1 - step, -3, 4, 4);
  ctx.fillStyle = HEN.beak; ctx.fillRect(-3 + step, -2, 2, 2); ctx.fillRect(2 - step, -2, 2, 2);
  ctx.fillStyle = INK; ctx.fillRect(5, cheep ? -11 : -10, 5, cheep ? 6 : 4);                       // beak, inked
  ctx.fillStyle = HEN.beak; ctx.fillRect(6, cheep ? -10 : -9, 3, 2);
  if (cheep) ctx.fillRect(6, -7, 3, 1);
  ctx.beginPath();
  ctx.ellipse(-1, -6, 6, 4.5, 0, 0, TAU);
  ctx.moveTo(6, -10); ctx.arc(2.5, -10, 3.5, 0, TAU);
  ink(ctx, CHICK);
  ctx.save(); ctx.beginPath(); ctx.ellipse(-1, -6, 6, 4.5, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = CHICK_SH; ctx.fillRect(-8, -4, 14, 4);                                            // the shade band
  ctx.fillRect(-5, cheep ? -9 : -8, 4, 2);                                                           // the wing
  ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(3, -10, 2, 2);                                                   // the eye
  if (hat) shellHalf(ctx, 2.5, -13, 9, 4);
  ctx.restore();
}
