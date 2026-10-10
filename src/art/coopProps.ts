// The coop's eggs (docs/ART_STYLE.md section 1 "Coop", section 0.8; docs/GDD.md section 5): the egg glyph every egg
// in the scene is painted with - laid in a nest, lying on the floor, hopping into a basket, held up to a face - and
// the pieces the surprise chick breaks it into: the zigzag crack it wears from the moment it is laid, and the half
// shell that flies off when it hatches and the half the chick keeps on its head. Screen space, integer coordinates,
// 1 px warm ink round every object, no allocation per call.
import { INK } from './layers.ts';
import { foodTones } from './food.ts';
import { INGREDIENTS } from '../content/recipes.ts';

const R = Math.round, TAU = Math.PI * 2;
export const SHELL = INGREDIENTS.egg.hex;
/**
 * The shell is painted here and NOT by drawFood. That glyph's generic ramp cools every base it shades (blue gets the
 * biggest lift), and its shade ellipse covers nearly the whole oval, so the cream egg came out #A3A1AA - a cool
 * neutral, blue-leaning, at the same luminance as the #C9A05C nest straw it lies in. The one object the scene exists
 * for read as a grey pebble and the gold sparkle did all the work (the judges' finding; ART_STYLE 1 "every colour is
 * a paper-warm mid-chroma tone" and section 12 "nest straw darker than eggs"). Here the shell keeps its cream base
 * with a PLUM shadow over its lower-right half and the 2 px cap the other big food glyphs get
 * (ART_STYLE 0.5), so it is lighter AND warmer than the straw, and the floor stays the scene's only cool thing.
 */
export const EGG_SH = '#8C7A86', EGG_HI = foodTones(SHELL).hi;
/** An egg's half-height wherever one is laid (10 px tall, 7 wide): the nests, the floor, the hop into a basket. */
export const EGG_S = 5;
/**
 * The surprise chick's egg is a size up (12 px tall): a 2 px zigzag needs that much shell to read as a crack and not
 * a blot (on a 7 px egg the teeth closed up into one dark mark, shot at 2x), and a sharp eye gets a second tell.
 */
export const SURPRISE_S = EGG_S + 1;

/** The coop's egg glyph: inked oval, cream shell, one plum shadow crescent, one 2 px cap. `s` is the half-height. */
export function eggGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.7, s, 0, 0, TAU);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = SHELL; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = EGG_SH;
  ctx.beginPath(); ctx.ellipse(x + s * 0.72, y + s * 0.66, s * 0.95, s, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = EGG_HI; ctx.fillRect(R(x - s * 0.5), R(y - s * 0.6), 2, 2);
}

/**
 * The surprise chick's crack, on an egg drawn with eggGlyph at (x, y) with half-height `s`: the cartoon hatching egg's
 * zigzag round the middle, a 2 px ink M from side to side (ART_STYLE 0.8: a hairline crack is a 1 px stitch), clipped
 * to the shell. The top half above it is the piece that flies off. `stage` 1 and 2 are the two cracks of the wind-up:
 * a split running up from each peak.
 */
export function eggCrack(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, stage: number): void {
  const rx = s * 0.7, y0 = y - s * 0.1, up = s * 0.5;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, y, rx, s, 0, 0, TAU); ctx.clip();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(x - rx - 1, y0); ctx.lineTo(x - rx * 0.5, y0 - up); ctx.lineTo(x, y0); ctx.lineTo(x + rx * 0.5, y0 - up); ctx.lineTo(x + rx + 1, y0);
  if (stage > 0) { ctx.moveTo(x - rx * 0.5, y0 - up); ctx.lineTo(x - rx * 0.75, y0 - up - 3); }
  if (stage > 1) { ctx.moveTo(x + rx * 0.5, y0 - up); ctx.lineTo(x + rx * 0.2, y0 - up - 3); }
  ctx.stroke();
  ctx.restore();
}

/**
 * Half an eggshell, dome up, its broken edge a zigzag along the bottom: the top that flies off a hatching egg, and
 * the half a chick wears as a hat. (x, y) is the middle of the broken edge, `w` the width across it, `h` the dome's
 * height; drawn in the current transform, so a flying half can be spun with ctx.rotate first. Inked, cream, with the
 * egg's plum shadow on its right and the 2 px cap on its lit shoulder, like the whole egg it came off.
 */
export function shellHalf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const hw = w / 2, teeth = 4, tw = w / teeth;
  ctx.beginPath();
  ctx.ellipse(x, y, hw, h, 0, Math.PI, 0);
  for (let k = 1; k <= teeth; k++) { ctx.lineTo(x + hw - k * tw + tw / 2, y + 2); ctx.lineTo(x + hw - k * tw, y); }
  ctx.closePath();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'miter'; ctx.stroke();
  ctx.fillStyle = SHELL; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = EGG_SH; ctx.beginPath(); ctx.ellipse(x + hw, y + 1, hw * 0.55, h * 1.3, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = EGG_HI; ctx.fillRect(R(x - hw * 0.5), R(y - h * 0.65), 2, 2);
}

/**
 * The surprise chick's egg: eggGlyph and its crack, rocked `rot` radians on its own base (it wobbles where it stands,
 * it does not spin about its middle). (x, y) is the egg's centre as eggGlyph takes it. `rim` adds the airborne egg's
 * second ink line (coop.ts airEgg): a cream shell in a cream paw, or over Barley's wool, needs the weight to read.
 */
export function crackedEgg(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, stage: number, rim: boolean): void {
  ctx.save(); ctx.translate(x, y + s); ctx.rotate(rot);
  if (rim) { ctx.beginPath(); ctx.ellipse(0, -s, s * 0.7 + 1, s + 1, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill(); }
  eggGlyph(ctx, 0, -s, s); eggCrack(ctx, 0, -s, s, stage);
  ctx.restore();
}
