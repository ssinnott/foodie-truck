// The village diners' species parts (docs/ART_STYLE.md sections 4-5): the markings, headgear and back pieces that make
// each of the diners in villagers.ts read as its own animal at a squint, built from the same inked-polygon, ball and
// capsule helpers the cast uses. Nothing here is a new rendering path: a marking is a colour change CLIPPED inside the
// head's own ink (no outline of its own), an accessory is its own inked object, every colour goes through rig.col()
// via the cel helpers so the hit flash still works, nothing is under 2 px, and no hook allocates (the polygons are
// refilled into the scratch arrays below, as common.ts does with KNOT).
import { celPath, celBall, celRect, celCapsule, celPoly, tones, band, pathRR } from '../../lib/art/shading.ts';
import { hatY, muzzleGeom } from './common.ts';
import type { CritterHook } from './common.ts';
import type { RigAccessory } from '../../lib/art/rig.ts';

const R = Math.round;
const TAU = Math.PI * 2;

/** Scratch polygons: a hook refills one and hands it to celPoly, so a draw call allocates nothing. */
const TRI: number[] = [0, 0, 0, 0, 0, 0];
const QUAD: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
/** The quill crown's zig-zag: a valley and a tip per spike, plus the two closing points. */
const SPIKES = 7;
const FAN: number[] = new Array((SPIKES * 2 + 3) * 2).fill(0);

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
