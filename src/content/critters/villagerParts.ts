// The village diners' species parts (docs/ART_STYLE.md sections 4-5): the markings, headgear and back pieces that make
// each of the diners in villagers.ts read as its own animal at a squint, built from the same inked-polygon, ball and
// capsule helpers the cast uses. Nothing here is a new rendering path: a marking is a colour change CLIPPED inside the
// head's own ink (no outline of its own), an accessory is its own inked object, every colour goes through rig.col()
// via the cel helpers so the hit flash still works, nothing is under 2 px, and no hook allocates (the polygons are
// refilled into the scratch arrays below, as common.ts does with KNOT).
import { celPath, celBall, celRect, celCapsule, celPoly, tones, band, pathRR } from '../../lib/art/shading.ts';
import { pathTaperedCapsule } from '../../lib/art/shapes.ts';
import { getChain } from '../../lib/art/secondary.ts';
import { rad } from '../../lib/engine/math.ts';
import { hatY, muzzleGeom, TAIL_CHAIN } from './common.ts';
import type { CritterBuild, CritterHook, CritterRig } from './common.ts';
import type { RigAccessory } from '../../lib/art/rig.ts';

const R = Math.round;
const TAU = Math.PI * 2;

/** Scratch polygons: a hook refills one and hands it to celPoly, so a draw call allocates nothing. */
const TRI: number[] = [0, 0, 0, 0, 0, 0];
const QUAD: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
/** The quill crown's zig-zag: a valley and a tip per spike, plus the two closing points. */
const SPIKES = 7;
const FAN: number[] = new Array((SPIKES * 2 + 3) * 2).fill(0);
/** The boar's crest: the same zig-zag as the quill crown with fewer, shorter spikes. */
const BRISTLES = 5;
const CREST: number[] = new Array((BRISTLES * 2 + 3) * 2).fill(0);

/**
 * Refill `out` from a shape written in fractions of `r` ([x0, y0, x1, y1, ...]), rounded to whole pixels. A shape's
 * fractions are module constants and `out` its scratch array of the same length, so a hook allocates nothing.
 */
function scaled(out: number[], shape: readonly number[], r: number, dx = 0, dy = 0): number[] {
  for (let i = 0; i < shape.length; i += 2) { out[i] = R(shape[i] * r) + dx; out[i + 1] = R(shape[i + 1] * r) + dy; }
  return out;
}

function tri(ctx: CanvasRenderingContext2D, rig: Parameters<typeof celPoly>[1], hex: string, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  TRI[0] = x0; TRI[1] = y0; TRI[2] = x1; TRI[3] = y1; TRI[4] = x2; TRI[5] = y2;
  celPoly(ctx, rig, TRI, hex, 0.4, 0);
}

// ---------------------------------------------------------------- markings (head space, clipped inside the skull's ink)

/**
 * A lighter stripe down the middle of the face from the crown to the muzzle, in the `belly` fur: the badger's white
 * blaze. Drawn only over the skull (clipped), with the dark side of the face left either side of it.
 */
export const blazeMarking: CritterHook = (ctx, rig, pose, inf) => {
  const r = inf.r;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = tones(rig, rig.palette.belly).base;
  ctx.beginPath(); ctx.moveTo(R(-r * 0.2), -r); ctx.lineTo(R(r * 0.34), -r); ctx.lineTo(R(r * 0.9), R(r * 0.3)); ctx.lineTo(R(r * 0.2), R(r * 0.5)); ctx.closePath(); ctx.fill();
  ctx.restore();
};

/** A dark patch over the far side of the head (a cow's, a beagle's): a round blotch in `hair`, clipped inside the skull. */
export const patchMarking: CritterHook = (ctx, rig, pose, inf) => {
  const r = inf.r;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(rig.palette.hair);
  ctx.beginPath(); ctx.ellipse(R(-r * 0.4), R(-r * 0.3), R(r * 0.55), R(r * 0.5), 0, 0, TAU); ctx.fill();
  ctx.restore();
};

/** Tabby bars across the back cheek: two 2 px stripes of `hair`, clipped inside the skull. */
export const tabbyMarking: CritterHook = (ctx, rig, pose, inf) => {
  const r = inf.r;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(rig.palette.hair);
  ctx.fillRect(R(-r * 0.95), R(-r * 0.05), R(r * 0.5), 2); ctx.fillRect(R(-r * 0.95), R(r * 0.25), R(r * 0.55), 2);
  ctx.restore();
};

/** The pig's snout: a deeper pink disc on the muzzle tip with two 2 px nostrils. Drawn in place of the nose. */
export function snoutMarking(disc: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle), x = g.mx + g.rx - 2, y = g.my - 1;
    ctx.beginPath(); ctx.ellipse(x, y, 3, 4, 0, 0, TAU);
    celPath(ctx, rig, disc, x, y, 4, 0.4, 0);
    if (rig.override) return;
    ctx.fillStyle = rig.col(rig.palette.dark);
    ctx.fillRect(x - 1, y - 2, 2, 2); ctx.fillRect(x - 1, y + 1, 2, 2);
  };
}

/** The mole's nose: one big pink ball at the muzzle tip, the thing you see first. */
export function bigNose(hex: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle);
    celBall(ctx, rig, g.mx + g.rx - 2, g.my - 1, 4, hex, true);
  };
}

/** A broad flat bill (a duck's): one wide wedge at the muzzle tip, in `hex`. */
export function billMarking(hex: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle);
    QUAD[0] = g.mx - 1; QUAD[1] = g.my - 4; QUAD[2] = g.mx + g.rx + 6; QUAD[3] = g.my - 2; QUAD[4] = g.mx + g.rx + 6; QUAD[5] = g.my + 3; QUAD[6] = g.mx - 1; QUAD[7] = g.my + 4;
    celPoly(ctx, rig, QUAD, hex, 0.4, 0);
  };
}

/** A hen's beak and wattle: a small gold wedge and a red drop under it. */
export function beakAndWattle(beak: string, wattle: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle);
    celBall(ctx, rig, g.mx + g.rx - 3, g.my + g.ry, 2.5, wattle, false);
    tri(ctx, rig, beak, g.mx - 1, g.my - 5, g.mx + g.rx + 5, g.my, g.mx - 1, g.my + 4);
  };
}

/** Two buck teeth under the muzzle: 2 x 3 cream blocks that overlap its lower edge. */
export function buckTeeth(hex: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle), x = g.mx + g.rx - 6, y = g.my + g.ry - 2;
    if (rig.override) return;
    ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(x - 1, y - 1, 6, 6);
    ctx.fillStyle = rig.col(hex); ctx.fillRect(x, y, 2, 4); ctx.fillRect(x + 2, y, 2, 4);
  };
}

/**
 * A bat's face: a small pug nose of `nose` at the muzzle tip in place of the stock one (whose 5 x 4 mark is a dog's
 * on a muzzle this small), and one fang over the lower lip behind it, a 2 x 3 block of `fang` in its own ink.
 */
export function pugNoseAndFang(nose: string, fang: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle), x = g.mx + g.rx - 5, y = g.my + g.ry - 2;
    if (rig.override) return;
    ctx.fillStyle = rig.col(nose); pathRR(ctx, g.mx + g.rx - 4, g.my - 3, 4, 3, 1); ctx.fill();
    ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(x - 1, y - 1, 4, 5);
    ctx.fillStyle = rig.col(fang); ctx.fillRect(x, y, 2, 3);
  };
}

/**
 * A seal's whisker pads: three 2 px spots of `hex` on the cheek side of the muzzle, behind the mouth's back corner
 * and below the eye, so they never crowd the nose or the smile.
 */
export function whiskerSpots(hex: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const g = muzzleGeom(inf.r, rig.build.muzzle), x = g.mx - 1, y = g.my - 1;
    if (rig.override) return;
    ctx.fillStyle = rig.col(hex);
    ctx.fillRect(x - 3, y, 2, 2); ctx.fillRect(x, y - 1, 2, 2); ctx.fillRect(x - 1, y + 2, 2, 2);
  };
}

/**
 * A horse's face: a white blaze of `hex` from the crown down the front of the face and over the bridge of the nose
 * (the badger's stripe, narrower, carried on to the nose inside the head's ink - skull and muzzle both), and one
 * 2 px nostril near the tip in place of a dog's nose.
 */
export function horseBlaze(hex: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const r = inf.r, g = muzzleGeom(r, rig.build.muzzle), tip = g.mx + g.rx;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.moveTo(tip - 1, g.my); ctx.ellipse(g.mx, g.my, g.rx - 1, g.ry - 1, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = rig.col(hex);
    ctx.beginPath(); ctx.moveTo(R(-r * 0.04), -r); ctx.lineTo(R(r * 0.3), -r); ctx.lineTo(tip - 2, g.my - g.ry + 2); ctx.lineTo(tip - 4, g.my); ctx.lineTo(R(r * 0.34), R(r * 0.2)); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = rig.col(rig.palette.dark); ctx.fillRect(tip - 4, g.my + 1, 2, 2);
  };
}

/**
 * A big patch of `hex` over the front of the face, clipped inside the skull and AROUND the muzzle, so the muzzle
 * keeps its own shadow band: the robin's red face, the puffin's white one, the kingfisher's cheek. (cx, cy, rx, ry)
 * are fractions of r.
 */
function facePatch(ctx: CanvasRenderingContext2D, rig: CritterRig, r: number, hex: string, cx: number, cy: number, rx: number, ry: number): void {
  const g = muzzleGeom(r, rig.build.muzzle);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.beginPath(); ctx.rect(-2 * r, -2 * r, 4 * r, 4 * r); ctx.moveTo(g.mx + g.rx, g.my); ctx.ellipse(g.mx, g.my, g.rx, g.ry, 0, 0, TAU); ctx.clip('evenodd');
  ctx.fillStyle = rig.col(hex);
  ctx.beginPath(); ctx.ellipse(R(r * cx), R(r * cy), R(r * rx), R(r * ry), 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/** A beak: one inked wedge of `hex` from `back` px inside the muzzle tip to `len` px past it, `half` px either side of its centre line. */
function beakAt(ctx: CanvasRenderingContext2D, rig: CritterRig, r: number, hex: string, back: number, len: number, half: number): void {
  const g = muzzleGeom(r, rig.build.muzzle), x = g.mx + g.rx;
  tri(ctx, rig, hex, x - back, g.my - half, x + len, g.my, x - back, g.my + half);
}

/** A robin's face: the red of its breast up over the cheeks and round the eyes, and a small dark beak. */
export function robinFace(red: string, beak: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    facePatch(ctx, rig, inf.r, red, 0.34, 0.22, 0.7, 0.8);
    beakAt(ctx, rig, inf.r, beak, 3, 4, 2);
  };
}

/** A kingfisher's face: an orange stripe from the bill back under the eyes, and a long dark dagger of a beak. */
export function kingfisherFace(cheek: string, beak: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    facePatch(ctx, rig, inf.r, cheek, -0.12, 0.2, 0.56, 0.22);
    beakAt(ctx, rig, inf.r, beak, 4, 10, 2);
  };
}

/**
 * A puffin's face: white from the brow to the throat under a dark cap, and the tall striped bill - a slate base, a
 * gold band and an orange tip, the first two as colour changes clipped inside the bill's own ink.
 */
export function puffinFace(face: string, base: string, stripe: string, tip: string): CritterHook {
  return (ctx, rig, pose, inf) => {
    const r = inf.r;
    facePatch(ctx, rig, r, face, 0.28, 0.02, 0.76, 0.94);
    const g = muzzleGeom(r, rig.build.muzzle), x0 = g.mx + R(g.rx * 0.45);
    TRI[0] = x0; TRI[1] = g.my - R(r * 0.5); TRI[2] = g.mx + g.rx + 7; TRI[3] = g.my + 1; TRI[4] = x0; TRI[5] = g.my + R(r * 0.45);
    celPoly(ctx, rig, TRI, tip, 0.4, 0);
    if (rig.override) return;
    ctx.save(); ctx.beginPath(); ctx.moveTo(TRI[0], TRI[1]); ctx.lineTo(TRI[2], TRI[3]); ctx.lineTo(TRI[4], TRI[5]); ctx.closePath(); ctx.clip();
    ctx.fillStyle = rig.col(base); ctx.fillRect(x0 - 1, TRI[1], 4, TRI[5] - TRI[1]);
    ctx.fillStyle = rig.col(stripe); ctx.fillRect(x0 + 3, TRI[1], 3, TRI[5] - TRI[1]);
    ctx.restore();
  };
}

// ---------------------------------------------------------------- head pieces (head space, drawn with the head)

/** Two short horns out from the crown's sides, curving up (a cow's): cream, one inked object each. */
export function sideHorns(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = R(-r * 0.78);
    tri(ctx, rig, hex, R(r * 0.5), y, R(r * 0.8), y + 2, R(r * 0.9), y - 8);
    tri(ctx, rig, hex, R(-r * 0.78), y, R(-r * 0.5), y + 2, R(-r * 0.95), y - 8);
  } };
}

/** A pair of branching antlers on the crown: a stem and one tine each, 3 px wide, so they read against the sky. */
export function antlers(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = R(-r * 0.85);
    for (let i = 0; i < 2; i++) {
      const bx = R(r * (i ? 0.38 : -0.32)), s = i ? 1 : -1;
      celCapsule(ctx, rig, bx, y, bx + s * 2, y - 9, 1.6, hex, 0);
      celCapsule(ctx, rig, bx + s, y - 5, bx + s * 7, y - 11, 1.5, hex, 0);
    }
  } };
}

/** A knitted beanie with a turned-up cuff and a pompom: a dome on the hairline, a 4 px band, a ball on top. */
export function beanie(hex: string, cuff: string, pom: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = hatY(rig);
    ctx.beginPath(); ctx.ellipse(0, y, R(r * 0.98), R(r * 0.66), 0, Math.PI, 0); ctx.closePath();
    celPath(ctx, rig, hex, 0, y - R(r * 0.3), R(r * 0.8), 0.35, 0.25);
    band(ctx, rig, R(-r * 1.02), y - 3, R(r * 2.04), 4, cuff, 2);
    celBall(ctx, rig, 0, y - R(r * 0.66) - 1, 3, pom, false);
  } };
}

/** An acorn's cup worn as a cap: a small ridged dome sat on the crown with a stalk. */
export function acornCap(hex: string, stalk: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = hatY(rig);
    ctx.beginPath(); ctx.ellipse(R(r * 0.05), y, R(r * 0.8), R(r * 0.5), 0, Math.PI, 0); ctx.closePath();
    celPath(ctx, rig, hex, 0, y - R(r * 0.25), R(r * 0.6), 0.35, 0.25);
    celRect(ctx, rig, R(r * 0.05) - 1, y - R(r * 0.5) - 3, 3, 4, 1, stalk, 0, 0);
  } };
}

/** A hen's comb: three red lobes on the crown, tallest in the middle. */
export function comb(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR;
    celBall(ctx, rig, R(-r * 0.3), R(-r * 0.98), 2.5, hex, false);
    celBall(ctx, rig, R(r * 0.3), R(-r * 0.96), 2.5, hex, false);
    celBall(ctx, rig, 0, R(-r * 1.08), 3, hex, false);
  } };
}

/**
 * A hedgehog's crown of quills: a fan of dark spikes over the top and back of the head, kept clear of the brow row
 * (the polygon's inner edge stops at the hat line) so the face reads underneath.
 */
export function quillCrown(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, top = hatY(rig) + 1;
    const a0 = -1.8, a1 = -3.5, step = (a1 - a0) / SPIKES;
    let n = 0;
    for (let k = 0; k < SPIKES; k++) {
      const av = a0 + step * k, at = av + step * 0.5;
      FAN[n++] = R(Math.cos(av) * r * 0.9); FAN[n++] = Math.min(top, R(Math.sin(av) * r * 0.9));
      FAN[n++] = R(Math.cos(at) * r * 1.32); FAN[n++] = R(Math.sin(at) * r * 1.32);
    }
    FAN[n++] = R(Math.cos(a1) * r * 0.9); FAN[n++] = R(Math.sin(a1) * r * 0.9);
    FAN[n++] = R(-r * 0.4); FAN[n++] = R(-r * 0.2);
    FAN[n++] = R(-r * 0.2); FAN[n++] = top;
    celPoly(ctx, rig, FAN, hex, 0.4, 0);
  } };
}

/**
 * A boar's tusk: a cream crescent rising from the lower lip in front of the mouth and curving up past the snout's
 * front, so it breaks the head's silhouette. A head piece rather than a marking, so it is drawn AFTER the face: it
 * covers the smile's front corner instead of the mouth cutting across it.
 */
export function tusk(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const g = muzzleGeom(rig.p.headR, (rig.build as CritterBuild).muzzle), tip = g.mx + g.rx, y = g.my + g.ry - 1;
    ctx.beginPath(); ctx.moveTo(tip - 4, y); ctx.lineTo(tip - 1, y + 1);
    ctx.quadraticCurveTo(tip + 3, y - 3, tip + 1, g.my - 3);   // the outer curve, bulging forward to the point
    ctx.quadraticCurveTo(tip, g.my + 2, tip - 4, y);           // and the inner one back down to the lip
    ctx.closePath();
    celPath(ctx, rig, hex, tip - 1, g.my + 3, 5, 0.4, 0);
  } };
}

/**
 * A boar's crest: a short ridge of bristles over the crown, fewer and shorter than the hedgehog's quills. Its inner
 * edge rides the hat line and then drops down the back of the skull, so the brows and the far eye stay clear.
 */
export function bristleCrest(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, top = hatY(rig);
    const a0 = -1.75, a1 = -2.95, step = (a1 - a0) / BRISTLES;
    let n = 0;
    for (let k = 0; k < BRISTLES; k++) {
      const av = a0 + step * k, at = av + step * 0.5;
      CREST[n++] = R(Math.cos(av) * r * 0.92); CREST[n++] = Math.min(top, R(Math.sin(av) * r * 0.92));
      CREST[n++] = R(Math.cos(at) * r * 1.36); CREST[n++] = R(Math.sin(at) * r * 1.36);
    }
    CREST[n++] = R(Math.cos(a1) * r * 0.92); CREST[n++] = R(Math.sin(a1) * r * 0.92);
    CREST[n++] = R(Math.cos(a1) * r * 0.78); CREST[n++] = R(Math.sin(a1) * r * 0.78);
    CREST[n++] = R(-r * 0.57); CREST[n++] = top;
    celPoly(ctx, rig, CREST, hex, 0.4, 0);
  } };
}

/**
 * A horse's mane: four rounded locks of `hex` falling from the crown down the back of the head to the nape, standing
 * proud of the skull, and a forelock tipped forward over the forehead. Every edge that faces the face keeps to the
 * hat line or behind the far eye, so the brows stay clear; the ears, drawn behind the skull, stand up through it.
 * The wearer lowers its eyes (face.eyeY) to give the forelock a forehead to fall on.
 */
const MANE_LOCKS: readonly number[] = Object.freeze([
  // [control x, control y, end x, end y] per lock, in fractions of r, from the crown round the back to the nape
  -0.36, -1.48, -0.64, -1.0,
  -1.18, -1.02, -1.0, -0.4,
  -1.46, -0.1, -1.08, 0.3,
  -1.36, 0.78, -0.84, 0.84,
]);
const MANE_INNER: readonly number[] = Object.freeze([-0.68, 0.42, -0.74, -0.34, -0.6, -0.8]);
export function mane(hex: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, top = hatY(rig);
    ctx.beginPath(); ctx.moveTo(R(r * 0.04), Math.min(top, R(-r * 1.1)));
    for (let i = 0; i < MANE_LOCKS.length; i += 4) ctx.quadraticCurveTo(R(MANE_LOCKS[i] * r), R(MANE_LOCKS[i + 1] * r), R(MANE_LOCKS[i + 2] * r), R(MANE_LOCKS[i + 3] * r));
    for (let i = 0; i < MANE_INNER.length; i += 2) ctx.lineTo(R(MANE_INNER[i] * r), Math.min(top, R(MANE_INNER[i + 1] * r)));
    ctx.lineTo(0, top);
    ctx.closePath();
    celPath(ctx, rig, hex, R(-r * 0.8), R(-r * 0.4), r, 0.4, 0);
    // the forelock: one lock from the crown tipped forward, its point a pixel above the hat line
    ctx.beginPath(); ctx.moveTo(R(-r * 0.12), R(-r * 0.98));
    ctx.quadraticCurveTo(R(r * 0.42), R(-r * 1.34), R(r * 0.38), top - 1);
    ctx.lineTo(R(r * 0.1), top - 2);
    ctx.closePath();
    celPath(ctx, rig, hex, R(r * 0.15), R(-r * 0.9), R(r * 0.4), 0.4, 0);
  } };
}

/**
 * A horse's tail: a hank of `hex` hair hanging from the rump and fanning out toward its end, three tapered links
 * appended into ONE path (one outline, no seams), swaying on the same chain the stock tails use.
 */
export function hairTail(hex: string): RigAccessory {
  return { attach: 'hip', layer: 'back', draw(ctx, rig) {
    const hw = R(rig.p.hip / 2);
    const ch = getChain(rig, 'tail', 2, TAIL_CHAIN);
    ctx.save(); ctx.translate(-hw + 2, -4); ctx.rotate(rad(ch.ang[0]));
    ctx.beginPath();
    pathTaperedCapsule(ctx, 0, 0, -6, 2, 2.5, 3, true);
    pathTaperedCapsule(ctx, -6, 2, -10, 9, 3, 4, true);
    pathTaperedCapsule(ctx, -10, 9, -10, 16, 4, 2.5, true);
    celPath(ctx, rig, hex, -7, 8, 8, 0.36, 0);
    ctx.restore();
  } };
}

/**
 * A bonnet (a goose's): a hood of `hex` over the crown and the back of the head, a little proud of the skull, with
 * its brim poking forward over the forehead, its edge running above the brows and down behind the far eye to the
 * jaw, and a `ribbon` tied in a bow under the chin. The wearer lowers its eyes (face.eyeY) to give the brim a
 * forehead to sit on.
 */
const BRIM: readonly number[] = Object.freeze([-0.5, 0.8, -0.6, 0.25, -0.6, -0.3, -0.58, -0.8, -0.3, -1.0, 0.2, -1.02, 0.6, -0.9]);
export function bonnet(hex: string, ribbon: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, out = r * 1.18;
    ctx.beginPath();
    ctx.moveTo(R(r * 0.86), R(-r * 0.9));      // the poke of the brim, out in front of the forehead
    ctx.arc(0, 0, out, rad(-62), rad(128), true);   // over the top and down the back to the jaw
    for (let i = 0; i < BRIM.length; i += 2) ctx.lineTo(R(BRIM[i] * r), R(BRIM[i + 1] * r));
    ctx.closePath();
    celPath(ctx, rig, hex, R(-r * 0.3), R(-r * 0.3), R(out), 0.34, 0.25);
    celCapsule(ctx, rig, R(-r * 0.5), R(r * 0.8), R(r * 0.12), R(r * 1.02), 1.5, ribbon, 0);
    celBall(ctx, rig, R(r * 0.06), R(r * 1.06), 2.5, ribbon, false);
    celBall(ctx, rig, R(r * 0.36), R(r * 1.0), 2.5, ribbon, false);
  } };
}

/**
 * A captain's cap (a seal's): a `top` crown flattened and tipped forward over a 5 px `band` on the hat line, a `peak`
 * jutting out over the brow where the flat cap's does, and a 2 px `badge` on the band's front. The crown is wider
 * than the band, which is what tells it from the flat cap and the hard hat at a squint.
 */
const CAP_CROWN: readonly number[] = Object.freeze([-0.88, 0, 0.88, 0, 1.08, -0.42, 0.8, -0.6, -0.76, -0.6, -1.0, -0.38]);
const CROWN: number[] = new Array(CAP_CROWN.length).fill(0);
export function captainsCap(top: string, bandHex: string, peak: string, badge: string): RigAccessory {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = hatY(rig);
    band(ctx, rig, R(r * 0.45), y - 2, R(r * 0.8), 4, peak, 2);
    celPoly(ctx, rig, scaled(CROWN, CAP_CROWN, r, 0, y - 4), top, 0.36, 0.25);
    band(ctx, rig, R(-r * 0.9), y - 5, R(r * 1.8), 5, bandHex, 2);
    if (rig.override) return;
    ctx.fillStyle = rig.col(badge); ctx.fillRect(R(r * 0.5), y - 4, 2, 2);
  } };
}

// ---------------------------------------------------------------- back pieces (torso / hip space, behind the body)

/** A hedgehog's back: a sawtooth of quills standing up behind the torso. */
export function quillBack(hex: string): RigAccessory {
  return { attach: 'torso', layer: 'back', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
    let n = 0;
    FAN[n++] = -R(hw * 0.2); FAN[n++] = -H + 2;
    for (let k = 0; k < SPIKES; k++) {
      const t = k / SPIKES;
      FAN[n++] = -R(hw * (0.45 + t * 0.6)) - 3; FAN[n++] = R(-H + 2 + (H - 3) * t) - 1;
      FAN[n++] = -R(hw * (0.85 + t * 0.45)) - 5; FAN[n++] = R(-H + 2 + (H - 3) * (t + 0.5 / SPIKES)) + 1;
    }
    FAN[n++] = -R(hw * 0.3); FAN[n++] = -1;
    celPoly(ctx, rig, FAN, hex, 0.4, 0);
  } };
}

/** A tortoise's shell: a big dome behind the torso with three plate seams in a darker tone, clipped inside its ink. */
export function shell(hex: string, seam: string): RigAccessory {
  return { attach: 'torso', layer: 'back', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2), cx = -R(hw * 0.5), cy = -R(H * 0.55), rx = R(hw * 1.15), ry = R(H * 0.95);
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    celPath(ctx, rig, hex, cx, cy, ry, 0.34, 0.25);
    if (rig.override) return;
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = rig.col(seam);
    ctx.fillRect(cx - rx, cy - 1, rx * 2, 2);
    ctx.fillRect(cx - 5, cy - ry, 2, ry * 2); ctx.fillRect(cx + 4, cy - ry, 2, ry * 2);
    ctx.restore();
  } };
}

/** A beaver's tail: a flat paddle trailing behind the hip with a cross-hatch of 2 px bars, on the back layer. */
export function paddleTail(hex: string, bars: string): RigAccessory {
  return { attach: 'hip', layer: 'back', draw(ctx, rig) {
    const hw = R(rig.p.hip / 2);
    ctx.save(); ctx.translate(-hw + 1, -3);
    ctx.beginPath(); ctx.ellipse(-8, 1, 8, 4, 0.25, 0, TAU);
    celPath(ctx, rig, hex, -8, 1, 6, 0.36, 0);
    if (!rig.override) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(-8, 1, 7, 3, 0.25, 0, TAU); ctx.clip();
      ctx.fillStyle = rig.col(bars); ctx.fillRect(-12, -3, 2, 8); ctx.fillRect(-7, -3, 2, 8);
      ctx.restore();
    }
    ctx.restore();
  } };
}

/** A collar and bell: a 3 px band of `hex` round the neck and a gold bell hung at the front. */
export function bellCollar(hex: string, bell: string): RigAccessory {
  return { attach: 'torso', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
    pathRR(ctx, -R(hw * 0.7), -H + 1, R(hw * 1.4), 4, 2);
    celPath(ctx, rig, hex, 0, -H + 3, R(hw * 0.6), 0.35, 0);
    celBall(ctx, rig, R(hw * 0.25), -H + 6, 2.5, bell, false);
  } };
}

/**
 * A bat's wings, folded half open behind the shoulders: two scalloped membranes of `hex` (the far one higher and
 * further back) with 2 px `bone` fingers clipped inside each. The membrane is held a value above the hatch's plum
 * wall, so a wing seen against it still reads.
 */
const WING_SHAPE: readonly number[] = Object.freeze([0, -2, -8, -12, -17, -14, -19, -5, -14, -7, -13, -1, -8, -3, -6, 2, -1, 3]);
const WING: number[] = new Array(WING_SHAPE.length).fill(0);
export function batWings(hex: string, bone: string): RigAccessory {
  return { attach: 'torso', layer: 'back', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
    for (let i = 0; i < 2; i++) {
      const ox = i ? -R(hw * 0.2) : -R(hw * 0.5), oy = i ? -H + 6 : -H + 3, k = i ? 0.8 : 1;
      for (let j = 0; j < WING_SHAPE.length; j += 2) { WING[j] = ox + R(WING_SHAPE[j] * k); WING[j + 1] = oy + R(WING_SHAPE[j + 1] * k); }
      celPoly(ctx, rig, WING, hex, 0.4, 0);
      if (rig.override) continue;
      // the fingers: from the root out to the tip and to the next two points of the scalloped edge
      ctx.save();
      ctx.beginPath(); ctx.moveTo(WING[0], WING[1]);
      for (let j = 2; j < WING.length; j += 2) ctx.lineTo(WING[j], WING[j + 1]);
      ctx.closePath(); ctx.clip();
      ctx.strokeStyle = rig.col(bone); ctx.lineWidth = 2; ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(ox, oy); ctx.lineTo(WING[4], WING[5]);
      ctx.moveTo(ox, oy); ctx.lineTo(WING[6], WING[7]);
      ctx.moveTo(ox, oy); ctx.lineTo(WING[10], WING[11]);
      ctx.stroke();
      ctx.restore();
    }
  } };
}

/**
 * A small bird's cocked tail (a robin's): a wedge of `hex` feathers standing up behind the hip with a notch at its
 * tip, swaying on the same chain the stock tails use.
 */
const FEATHERS: readonly number[] = Object.freeze([2, -2, 0, 3, -10, -2, -14, -7, -11, -8, -12, -13, -6, -9]);
export function featherTail(hex: string): RigAccessory {
  return { attach: 'hip', layer: 'back', draw(ctx, rig) {
    const hw = R(rig.p.hip / 2);
    const ch = getChain(rig, 'tail', 2, TAIL_CHAIN);
    ctx.save(); ctx.translate(-hw + 2, -3); ctx.rotate(rad(ch.ang[0]));
    celPoly(ctx, rig, FEATHERS, hex, 0.36, 0);
    ctx.restore();
  } };
}
