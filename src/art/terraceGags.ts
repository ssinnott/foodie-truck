// Thyme Terrace's two jokes, drawn (docs/GDD.md section 5). THE TOPIARY: the storm of snipping a critter is lost in
// when the shears run away with it at a wild clump, the hedge statue the clump comes out as - of that very critter,
// on a clipped plinth, regrowing a sprout at a time until it is a clump again, and with a bite out of its head if
// Barley made it - and the clippings left stuck in the critter's fur. THE HEDGEHOG: the fur standing on end on
// whoever woke it.
//
// All of it is draw-side (docs/ARCHITECTURE.md section 4): every number comes from the screen's sim fields or from a
// frame counter, nothing here reads rng or reaches the checksum, and the per-frame paths allocate nothing (the
// statue's canvases are made once, lazily, and redrawn only when what they show changes).
import { INK, makeCanvas } from './layers.ts';
import { foodTones } from './food.ts';
import { hexToRgb } from './palettes.ts';
import { INGREDIENTS } from '../content/recipes.ts';
import { drawRig, jointScreen } from '../lib/art/rig.ts';
import type { Rig, DrawRigOpts } from '../lib/art/rig.ts';
import type { Point } from '../lib/art/rigParts.ts';
import { P } from '../lib/art/poses.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;

// ---------------------------------------------------------------- the statue
/**
 * The statue is a monument, so it is cut a fifth bigger than life (the draw scale: drawRig keeps the ink one pixel
 * at any scale). Its canvas is wide enough for the pointing paw either way and tall enough for the head chef's toque.
 */
export const STATUE_SCALE = 1.2;
const SW = 112, SH = 136;
/** The plinth it stands on: a clipped hedge block PLINTH_W wide and PLINTH_H tall, its foot on the canvas's FOOT row. */
export const PLINTH_H = 7;
const PLINTH_W = 36, FOOT = SH - 2;
/**
 * The statue's pose: a monument, pointing the way. The near paw straight out ahead (below the chin, so the head,
 * the ears and the hat keep the critter's own outline on top - raised, it stood up beside two long ears as a third),
 * the far paw on the hip, a stride, the chest out and the chin up. Drawn `still`, so the tail and the ears hang at
 * rest: a hedge does not sway.
 */
const STATUE_POSE = P({ armR: [96, 6], armL: [-34, 66], legR: [12, 4], legL: [-10, 6], torso: -4, head: -8, root: [0, 0], face: 'neutral' });
const STATUE_OPTS: DrawRigOpts = { x: SW / 2, y: FOOT - PLINTH_H + 1, facing: 1, scale: STATUE_SCALE, still: true };

/** Rows from the foot of a statue of `rig` (its plinth's foot) up to the middle of its head, standing. */
export function statueHeadUp(rig: Rig): number { return PLINTH_H - 1 + (rig.height - rig.p.headR) * rig.scale * STATUE_SCALE; }
/** Rows from the foot of a statue of `rig` up to the top of it: the plinth, the critter and `crown` (its ears or its hat). */
export function statueTopUp(rig: Rig, crown: number): number { return PLINTH_H - 1 + (rig.height * rig.scale + crown) * STATUE_SCALE; }
/** The leaf texture: one 2x2 block in DARK_FLECK of them goes the herb's shadow tone, one in LIGHT_FLECK its light. */
const DARK_FLECK = 0.2, LIGHT_FLECK = 0.13;
/**
 * A statue's face: none. A hedge is clipped to a likeness by its outline (the ears, the hat, the apron's edge, the
 * tail), and eyes painted on it read as the critter itself rolled in leaves; the screen hangs this in place of the
 * face hook on the twin rig it carves the statue from.
 */
export function blankFace(): void { /* a hedge has no face */ }

/**
 * The sprouts a statue puts out as its clump grows back: [joint, dx, dy (fractions of headR off the joint, dx toward
 * the statue's facing), angle (degrees off straight up, toward the facing), length]. The first SPROUTS_1 show at the
 * first stage back, the rest at the second; at the third the clump is a clump again.
 */
const SPROUTS: readonly (readonly [string, number, number, number, number])[] = [
  ['head', -0.3, -1.0, -24, 7], ['handN', 0, -0.4, 14, 6], ['shoulderF', -0.5, -0.2, -64, 6], ['head', 0.6, -0.8, 30, 6],
  ['elbowF', -0.3, 0.2, -110, 6], ['hipF', -0.6, 0, -96, 6], ['kneeN', 0.4, 0, 80, 5], ['head', -1.0, -0.2, -80, 6],
];
const SPROUTS_1 = 3;

/** One clump's statue: its canvas, and the key of what it was last drawn with (-1 = nothing yet). */
interface StatueCanvas { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; key: number; }
/** One slot per clump the scene can have, each made the first time a statue stands there. */
const MAX_STATUES = 8;
const STATUES: (StatueCanvas | null)[] = [];
for (let i = 0; i < MAX_STATUES; i++) STATUES.push(null);
const PT: Point = { x: 0, y: 0 }, PT2: Point = { x: 0, y: 0 };

/** Forget every statue drawn (a screen's enter(): a new party, a new herb). */
export function resetStatues(): void { for (let i = 0; i < MAX_STATUES; i++) { const s = STATUES[i]; if (s) s.key = -1; } }

/**
 * A hedge statue of `rig` standing on its plinth with the plinth's foot at (x, y), facing `face`. The rig is the
 * maker's twin and comes in COATED (the screen's `coat(rig, tone)` ... `coat(rig, null)` round this call, the kit's
 * pattern), so every fill is the herb's green and the ink stays; this adds the leaf texture, `stage` 0..2 sprouts of
 * regrowth and, with `bite`, Barley's bite out of the head's front. Cached per `slot` (the clump) on the key built
 * from `who` (the maker), the facing, the bite and the stage, so a standing statue is one blit a frame.
 */
export function drawStatue(ctx: CanvasRenderingContext2D, slot: number, rig: Rig, who: number, x: number, y: number, face: number, stage: number, bite: number, ing: string): void {
  let s = STATUES[slot];
  if (!s) {
    const canvas = makeCanvas(SW, SH);
    s = { canvas, g: canvas.getContext('2d'), key: -1 };
    s.g.imageSmoothingEnabled = false;
    STATUES[slot] = s;
  }
  const key = ((who * 2 + (face > 0 ? 1 : 0)) * 2 + (bite ? 1 : 0)) * 4 + stage;
  if (s.key !== key) { carve(s.g, rig, face, stage, bite, ing); s.key = key; }
  ctx.drawImage(s.canvas, R(x) - SW / 2, R(y) - FOOT);
}

/** Draw a statue into its canvas: the plinth, the coated rig, the leaf texture, the sprouts, the bite. */
function carve(g: CanvasRenderingContext2D, rig: Rig, face: number, stage: number, bite: number, ing: string): void {
  const t = foodTones(INGREDIENTS[ing].hex), base = rig.override || t.base, r = rig.p.headR * rig.scale * STATUE_SCALE;
  g.clearRect(0, 0, SW, SH);
  // the plinth: a clipped block of the same hedge, inked
  g.fillStyle = INK; g.fillRect(SW / 2 - PLINTH_W / 2 - 1, FOOT - PLINTH_H - 1, PLINTH_W + 2, PLINTH_H + 2);
  g.fillStyle = base; g.fillRect(SW / 2 - PLINTH_W / 2, FOOT - PLINTH_H, PLINTH_W, PLINTH_H);
  STATUE_OPTS.facing = face;
  drawRig(g, rig, STATUE_POSE, STATUE_OPTS);
  leafTexture(g, base, t.sh, t.hi);
  // the regrowth: sprouts off the joints, a few at the first stage back and the rest at the second
  const n = stage <= 0 ? 0 : stage === 1 ? SPROUTS_1 : SPROUTS.length;
  for (let i = 0; i < n; i++) {
    const sp = SPROUTS[i], j = jointScreen(rig, sp[0], PT);
    const x0 = R(j.x + sp[1] * r * face), y0 = R(j.y + sp[2] * r), a = sp[3] * DEG * face;
    const x1 = R(x0 + Math.sin(a) * sp[4]), y1 = R(y0 - Math.cos(a) * sp[4]);
    g.lineCap = 'round';
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = base; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(x1, y1, 3, 0, TAU); g.fill();
    g.fillStyle = t.hi; g.beginPath(); g.arc(x1, y1, 2, 0, TAU); g.fill();
  }
  if (bite) biteOut(g, jointScreen(rig, 'head', PT2), r, face, t.sh);
}

/**
 * A white is anything this light and this grey: an eye's white, and the blend where its fill meets the ink (a
 * 50/50 one still clears both), never the herb's greens, whose blue is far under their green.
 */
const WHITISH_MIN = 110, WHITISH_SPREAD = 40;

/**
 * The leaf texture, over the coat's own pixels (the ink and the plinth's line keep theirs): every 2x2 block of flat
 * coat is left as it is, darkened to the herb's shadow tone or lit to its light one, by a fixed hash of the block,
 * lit more toward the top of the canvas (the light is top-left). A statue has no eyes, but a coat keeps a critter's
 * whites (game/gags.ts) and a frog's whites are its two domes, drawn even under a coat: any white in the statue is
 * clipped to hedge with the rest, so Cress's statue keeps the bumps on its crown and loses the stare. Runs once per
 * redraw, never per frame.
 */
function leafTexture(g: CanvasRenderingContext2D, base: string, dark: string, light: string): void {
  const [br, bg, bb] = hexToRgb(base), [dr, dg, db] = hexToRgb(dark), [lr, lg, lb] = hexToRgb(light);
  const img = g.getImageData(0, 0, SW, SH), d = img.data;
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
      if (d[i + 3] !== 255) continue;
      if (r !== br || gr !== bg || b !== bb) {
        const lo = Math.min(r, gr, b);
        if (lo <= WHITISH_MIN || Math.max(r, gr, b) - lo >= WHITISH_SPREAD) continue;
      }
      const h = hash(x >> 1, y >> 1), lit = LIGHT_FLECK * (1.4 - y / SH);
      if (h < DARK_FLECK) { d[i] = dr; d[i + 1] = dg; d[i + 2] = db; }
      else if (h > 1 - lit) { d[i] = lr; d[i + 1] = lg; d[i + 2] = lb; }
      else { d[i] = br; d[i + 1] = bg; d[i + 2] = bb; }
    }
  }
  g.putImageData(img, 0, 0);
}

/** A fixed 0..1 hash of a block's coordinates: the same leaves every time a statue is redrawn. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The bite: three rounds of BITE_R headR each, centred on the head's own outline at these angles up from straight
 * ahead (degrees), so what is left has a mouthful's scalloped edge - three hollows with the points between them.
 */
const BITE_AT = [44, 4, -36], BITE_R = 0.46, BITE_OUT = 0.96;
/** Where a bite lands on a statue's head: [dx, dy] off the head's middle, in headR, dx toward its facing (the crumbs fly from here). */
export const BITE_SPOT = Object.freeze([0.9, -0.05]);
const BITE: number[][] = BITE_AT.map((a) => [Math.cos(a * DEG) * BITE_OUT, -Math.sin(a * DEG) * BITE_OUT, BITE_R]);

/**
 * Barley's bite out of the statue's head: three overlapping rounds cut out of its front (the face he was face to
 * face with) so the outline itself has the scalloped notch of a mouthful, then the cut edge inked again with a band
 * of the hedge's dark inside it, the way a bitten hedge shows its shadowed middle.
 */
function biteOut(g: CanvasRenderingContext2D, head: Point, r: number, face: number, dark: string): void {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (const b of BITE) { g.beginPath(); g.arc(head.x + b[0] * r * face, head.y + b[1] * r, b[2] * r, 0, TAU); g.fill(); }
  // the rim: only where the statue still has pixels (source-atop), a 3 px dark band and the 1 px ink edge
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = dark; g.lineWidth = 7;
  for (const b of BITE) { g.beginPath(); g.arc(head.x + b[0] * r * face, head.y + b[1] * r, b[2] * r, 0, TAU); g.stroke(); }
  g.strokeStyle = INK; g.lineWidth = 2;
  for (const b of BITE) { g.beginPath(); g.arc(head.x + b[0] * r * face, head.y + b[1] * r, b[2] * r, 0, TAU); g.stroke(); }
  g.restore();
}

// ---------------------------------------------------------------- the frenzy
/**
 * The storm: CORE leaf masses churning over the clump being cut (enough to hide it, so what comes out of the storm
 * is a surprise), CHEST more over the critter's middle (half hiding it), a cloud of LEAVES whirling round both, and
 * GLINTS pairs of shears snipping in it.
 */
const CORE = 7, CHEST = 3, LEAVES = 44, GLINTS = 2;
/** The core's orbit and its masses' radii (px); the chest's. */
const CORE_ORBIT = 17, CORE_R = 13, CHEST_ORBIT = 8, CHEST_R = 8;
const GOLDEN = 2.39996, SHEARS = '#FFF6E0';

/**
 * THE FRENZY's storm, `env` 0..1 as it blows up and dies down, in the visit's herb's tones: a churning core of inked
 * leaf masses centred on the clump at (kx, ky), so the clump is hidden while it is being cut, a smaller churn over the
 * critter's chest at (sx, sy) so it is half hidden (a blur of arms in a green storm), a cloud of leaves whirling
 * over both (`rx` by `ry` round their middle), and the shears snapping open and shut in it. Every position is a
 * function of `f` and the leaf's index.
 */
export function drawStorm(ctx: CanvasRenderingContext2D, kx: number, ky: number, sx: number, sy: number, rx: number, ry: number, f: number, env: number, ing: string): void {
  if (env <= 0) return;
  const t = foodTones(INGREDIENTS[ing].hex), cx = (kx + sx) / 2, cy = (ky + sy) / 2;
  // the churn: inked as one mass, then the base, then the shadow in each
  for (let pass = 0; pass < 3; pass++) {
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? t.base : t.sh;
    for (let i = 0; i < CORE + CHEST; i++) {
      const chest = i >= CORE, a = i * 0.9 + f * ((i & 1) ? 0.45 : -0.38);
      const orbit = (chest ? CHEST_ORBIT : CORE_ORBIT) * env, rr = ((chest ? CHEST_R : CORE_R) + (i % 3) * 2) * env;
      const x = R((chest ? sx : kx) + Math.cos(a) * orbit), y = R((chest ? sy : ky) + Math.sin(a) * orbit * 1.4);
      ctx.beginPath();
      if (pass === 0) ctx.arc(x, y, rr + 2, 0, TAU); else if (pass === 1) ctx.arc(x, y, rr, 0, TAU); else ctx.arc(x + 2, y + 3, Math.max(1, rr - 4), 0, TAU);
      ctx.fill();
    }
  }
  // the cloud: leaves whirling round the two, each a 4x2 or 2x4 leaf in a 1 px ink line
  for (let i = 0; i < LEAVES; i++) {
    const a = i * GOLDEN + f * (0.21 + (i % 5) * 0.035) * ((i & 1) ? 1 : -1), d = (0.42 + 0.58 * frac(i * 0.618034)) * env;
    const x = R(cx + Math.cos(a) * rx * d), y = R(cy + Math.sin(a) * ry * d), flat = ((i + (f >> 2)) & 1) === 0;
    const w = flat ? 4 : 2, h = flat ? 2 : 4;
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = (i % 3) === 0 ? t.hi : t.base; ctx.fillRect(x, y, w, h);
  }
  // the shears: a pair at a new spot in the storm every four frames, open on one frame pair and shut on the next
  ctx.lineCap = 'round';
  for (let k = 0; k < GLINTS; k++) {
    const seed = (f >> 2) * GLINTS + k, a = seed * GOLDEN * 1.7, d = (0.25 + 0.45 * frac(seed * 0.381966)) * env;
    drawShears(ctx, R(cx + Math.cos(a) * rx * d), R(cy + Math.sin(a) * ry * d), (f & 2) === 0);
  }
}

/** A pair of shears at (x, y), the pivot, blades up: open in a V, or snapped shut; two ring handles under the pivot. */
function drawShears(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean): void {
  const spread = open ? 4 : 1;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? INK : SHEARS; ctx.lineWidth = pass === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - spread, y - 8);
    ctx.moveTo(x, y); ctx.lineTo(x + spread, y - 8);
    ctx.moveTo(x - 3 + 2, y + 4); ctx.arc(x - 3, y + 4, 2, 0, TAU);
    ctx.moveTo(x + 3 + 2, y + 4); ctx.arc(x + 3, y + 4, 2, 0, TAU);
    ctx.stroke();
  }
}

function frac(v: number): number { return v - Math.floor(v); }

/**
 * The clippings the frenzy leaves stuck in the critter's fur through its look: leaves of the herb on its head and
 * its shoulder, placed off the joints of the drawRig that just ran (so they ride the bow down). [joint, dx, dy] in
 * fractions of headR, dx toward the facing.
 */
const CLIPPINGS: readonly (readonly [string, number, number])[] = [
  ['head', -0.3, -0.95], ['head', 0.45, -0.85], ['head', -0.85, -0.3], ['head', 0.15, -0.55], ['shoulderN', -0.1, -0.25], ['shoulderF', -0.3, -0.1],
];
export function drawClippings(ctx: CanvasRenderingContext2D, rig: Rig, facing: number, ing: string): void {
  const t = foodTones(INGREDIENTS[ing].hex), r = rig.p.headR * rig.scale;
  for (let i = 0; i < CLIPPINGS.length; i++) {
    const c = CLIPPINGS[i], j = jointScreen(rig, c[0], PT);
    const x = R(j.x + c[1] * r * facing), y = R(j.y + c[2] * r), flat = (i & 1) === 0;
    ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, flat ? 6 : 4, flat ? 4 : 6);
    ctx.fillStyle = (i % 3) === 0 ? t.hi : t.base; ctx.fillRect(x, y, flat ? 4 : 2, flat ? 2 : 4);
  }
}

// ---------------------------------------------------------------- the hedgehog
/** The spikes of fur on end: [angle off straight up (degrees, + toward the facing), length] round the head. */
const BRISTLE = [[-150, 6], [-124, 8], [-98, 8], [-72, 7], [-46, 6], [-20, 5]];

/**
 * Fur on end: spikes of the critter's own fur standing straight out of the back and crown of its head, each an
 * inked wedge, off the head joint of the drawRig that just ran. For the hedgehog's victim, in the air and just
 * after it lands.
 */
export function drawBristle(ctx: CanvasRenderingContext2D, rig: Rig, facing: number): void {
  const h = jointScreen(rig, 'head', PT), r = rig.p.headR * rig.scale, fur = rig.palette.skin;
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? INK : fur;
    const grow = pass === 0 ? 1.5 : 0;
    for (let i = 0; i < BRISTLE.length; i++) {
      const a = BRISTLE[i][0] * DEG * facing, len = BRISTLE[i][1] + grow, s = Math.sin(a), c = Math.cos(a);
      const bx = h.x + s * (r - 2), by = h.y - c * (r - 2), w = 2.5 + grow * 0.6;
      ctx.beginPath();
      ctx.moveTo(R(bx + c * w), R(by + s * w));
      ctx.lineTo(R(bx + s * (len + 2)), R(by - c * (len + 2)));
      ctx.lineTo(R(bx - c * w), R(by - s * w));
      ctx.closePath(); ctx.fill();
    }
  }
}
