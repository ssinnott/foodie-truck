// The farm's two jokes, drawn (docs/GDD.md section 5; docs/ART_STYLE.md section 0, section 3, section 4, section 7):
// the rocket root's TELL - a top shivering over a heave of cracked soil - and the root itself in the air, the
// whopper's giant root, the trug set down on the soil while its owner stares at the sky, the root Barley has bitten,
// and the poses both jokes are played in. game/screens/gardenGags.ts decides WHEN every one of these is drawn and
// hands in every number, so a peer that never draws steps exactly the same farm.
//
// Screen space, integer coordinates, no allocation per call (docs/ARCHITECTURE.md section 8). Everything wears the
// rig's 1 px ink and the crop's own tones (art/gardenProps.ts CROP); there is no SIGNAL hex anywhere in here. A
// crack in the bed is not "the thing you want" - it is the thing that is about to happen - so the tell is told in
// earth and ink alone, and the root's own hex stays on the root, the way gardenProps.ts ROOT_HEX says.
import { UI, PLUM } from '../constants.ts';
import { INK } from './layers.ts';
import { mix } from './palettes.ts';
import { drawFood } from './food.ts';
import { CROP } from './gardenProps.ts';
import { GARDEN } from './backgrounds/garden.ts';
import { F } from '../content/critters/common.ts';
import type { Anim, Frame } from '../lib/art/animation.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;

/**
 * The rocket root is drawn two sizes up from a pulled root (s 10 against 6): it is the joke's one prop, it has the
 * whole sky to cross in a dozen frames, and Barley's bite has to show in it at 1x.
 */
export const ROCKET_S = 10;
/**
 * The whopper, at nearly three times a pulled root (s 17 against 6). Drawn AT that size rather than blown up with
 * ctx.scale, the way its 14-frame hop into the trug used to be: scaled, a 2 px ink line turns into a 5 px smudge,
 * and the biggest thing in the joke was the one thing in the scene without a clean outline.
 */
export const GIANT_S = 17;

// ---------------------------------------------------------------- a root at any size
/** The three leaf strokes a carrot or a beetroot keeps on once it is pulled (gardenProps.ts drawPulledRoot), at s 6. */
const LEAF = Int8Array.of(-1, -4, -6, -13, 0, -4, 0, -15, 1, -4, 6, -12);
const BEET_LEAF = CROP.beetLeaf;

/**
 * A root at half-size `s` about (0, 0) in the CURRENT transform, its top on for a carrot or a beetroot, grown with
 * `s` (one 1 px ink line either side of every stroke, whatever the size). The caller translates and rotates, so
 * one glyph serves the rocket going up nose first, coming down, and the whopper standing on a belly.
 */
export function drawRoot(ctx: CanvasRenderingContext2D, icon: string, hex: string, s: number): void {
  if (icon === 'carrot' || icon === 'beetroot') {
    const k = s / 6, w = Math.max(2, R(2 * k));
    ctx.beginPath();
    for (let i = 0; i < LEAF.length; i += 4) { ctx.moveTo(LEAF[i] * k, LEAF[i + 1] * k); ctx.lineTo(LEAF[i + 2] * k, LEAF[i + 3] * k); }
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = w + 2; ctx.stroke();
    ctx.strokeStyle = icon === 'carrot' ? CROP.leaf : BEET_LEAF; ctx.lineWidth = w; ctx.stroke();
  }
  drawFood(ctx, icon, 0, 0, s, hex);
}

/** `drawRoot` at (x, y), turned `rot` radians (0 is tip down, the way it grew; PI is nose up). */
export function drawRootAt(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, hex: string, s: number, rot: number): void {
  ctx.save(); ctx.translate(R(x), R(y));
  if (rot) ctx.rotate(rot);
  drawRoot(ctx, icon, hex, s);
  ctx.restore();
}

/**
 * The rocket's trail: two 2 px speed lines in cream under ink, running `len` rows from (x, y) away from where the
 * root is going (`dir` -1 for a trail below a root going up, +1 above one coming down). It is what makes a root
 * that crosses the screen in a dozen frames read as a shot rather than a flicker.
 */
export function drawStreak(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, dir: number): void {
  x = R(x); y = R(y); len = R(len);
  if (len < 4) return;
  const y0 = dir > 0 ? y - len : y, h = len;
  ctx.fillStyle = INK;
  ctx.fillRect(x - 6, y0 - 1, 4, h + 2); ctx.fillRect(x + 3, y0 + (dir > 0 ? -1 : 5), 4, h - 4);
  ctx.fillStyle = UI.cream;
  ctx.fillRect(x - 5, y0, 2, h); ctx.fillRect(x + 4, y0 + (dir > 0 ? 0 : 6), 2, h - 6);
}

// ---------------------------------------------------------------- the tell: the heave in the soil
/**
 * Lifted soil: dry, cracked and PALE against the dark tilled ridge it breaks out of (`CROP.soil`), because earth
 * shoved up into the light dries to the colour of the path. A heave in the bed's own dark brown was tried first and
 * could not be found from across the room: dark on dark, with its ink lost in the soil. Pale, the dome and every
 * crack in it read at 1x from the far end of the row. Its one shade band and one highlight, mixed once here
 * (ARCHITECTURE section 8: no `mix` inside a draw). Light top-left.
 */
const HEAVE = mix(GARDEN.path, UI.cream, 0.12), HEAVE_SH = mix(CROP.soil, GARDEN.path, 0.55), HEAVE_HI = mix(GARDEN.path, UI.cream, 0.6);
/**
 * The heave's size: a dome RX0 either side and RY0 tall where the top stands in the bed - wider than any plant's
 * crown and tall enough to break the ridge's own inked top edge (ROWS.ridge, 8 rows above the soil line), so the
 * row's one long straight line has a bump in it that a fern cannot hide - growing by RX1 / RY1 to the full gauge,
 * where it shoulders well up into the path.
 */
const HEAVE_RX0 = 18, HEAVE_RX1 = 7, HEAVE_RY0 = 9, HEAVE_RY1 = 6;
/** The plant rides up on the heave by this share of its height: something under it is pushing. */
const HEAVE_LIFT = 0.6;
/**
 * The cracks: four ink polylines across the dome's face, three points each, as (x, y) from the crown on the dome at
 * rest (HEAVE_RX0 by HEAVE_RY0) and stretched with it as it grows, so they stay on the earth that is splitting. The
 * first two are there from the start; the other two open past CRACKS_MORE, so the bed breaks up as the gauge fills.
 */
const CRACKS = Int8Array.of(
  -5, -3, -9, -6, -14, -4,
  5, -4, 9, -7, 14, -4,
  -6, 0, -10, -2, -15, -1,
  6, -1, 11, -2, 16, -1,
);
const CRACKS_FIRST = 2, CRACKS_MORE = 0.4;

/** How far the plant rides up on a heave grown to `k` (0..1): the screen lifts the top by this. */
export function heaveLift(k: number): number { return R((HEAVE_RY0 + HEAVE_RY1 * k) * HEAVE_LIFT); }

/**
 * THE TELL: the bed heaved up round a rocket root's crown at (x, y), grown to `k` (0 standing in the bed, 1 at the
 * full gauge). A dome of lifted earth, inked, lit top-left, with cracks running out of it across the ridge. Drawn
 * before the plant, which the screen lifts by `heaveLift(k)` so it stands on the top of the dome.
 */
export function drawHeave(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  x = R(x); y = R(y);
  const rx = R(HEAVE_RX0 + HEAVE_RX1 * k), ry = R(HEAVE_RY0 + HEAVE_RY1 * k);
  // the dome: one inked body, the lifted earth, the shade on the side away from the light, one highlight
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(x, y + 1, rx + 1, ry + 2, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.fillStyle = HEAVE;
  ctx.beginPath(); ctx.ellipse(x, y + 1, rx, ry + 1, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = HEAVE_SH; ctx.beginPath(); ctx.ellipse(x + 4, y + 2, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HEAVE; ctx.beginPath(); ctx.ellipse(x - 2, y + 1, rx - 3, ry, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = HEAVE_HI; ctx.fillRect(x - R(rx * 0.55), y - ry + 2, 3, 2);
  // the cracks, 2 px of ink each (nothing under 2 px, ART_STYLE 0.8), stretched with the dome
  const gx = rx / HEAVE_RX0, gy = ry / HEAVE_RY0, n = k >= CRACKS_MORE ? CRACKS.length / 6 : CRACKS_FIRST;
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const c = i * 6;
    ctx.moveTo(x + R(CRACKS[c] * gx), y + R(CRACKS[c + 1] * gy));
    ctx.lineTo(x + R(CRACKS[c + 2] * gx), y + R(CRACKS[c + 3] * gy));
    ctx.lineTo(x + R(CRACKS[c + 4] * gx), y + R(CRACKS[c + 5] * gy));
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- the trug, set down
const TRUG_SH = mix(CROP.willow, PLUM.deep, 0.36), TRUG_HI = mix(CROP.willow, UI.woodLight, 0.5);
/** The trug standing on the soil: TRUG_W wide and TRUG_H deep, its handle TRUG_ARC round. */
export const TRUG_H = 10;
const TRUG_W = 11, TRUG_ARC = 7;

/**
 * The trug set down on the soil, its base centred on (x, y), with `n` roots in it (four drawn at most, the same as
 * gardenProps.ts GARDEN_TRUG in the paw) - put down for the whole of a joke, while its owner points at the sky or
 * goes head over heels, and where the joke's root ends up. The same willow, the same handle in the seat's `colour`,
 * the same band.
 */
export function drawTrugDown(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, icon: string, hex: string, colour: string): void {
  x = R(x); y = R(y);
  ctx.beginPath(); ctx.arc(x, y - TRUG_H, TRUG_ARC, Math.PI, 0);
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - TRUG_W, y - TRUG_H); ctx.lineTo(x + TRUG_W, y - TRUG_H); ctx.lineTo(x + TRUG_W - 2, y); ctx.lineTo(x - TRUG_W + 2, y); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CROP.willow; ctx.fill();
  ctx.fillStyle = TRUG_SH; ctx.fillRect(x - TRUG_W + 3, y - 3, 2 * TRUG_W - 6, 2);
  ctx.fillStyle = TRUG_HI; ctx.fillRect(x - TRUG_W + 2, y - TRUG_H + 1, 3, 2);
  ctx.fillStyle = colour; ctx.fillRect(x - TRUG_W + 3, y - 6, 2 * TRUG_W - 6, 3);
  const k = n > 4 ? 4 : n;
  for (let i = 0; i < k; i++) drawFood(ctx, icon, x - 6 + i * 4, y - TRUG_H + 2, 3.5, hex);
}

// ---------------------------------------------------------------- Barley's bite
/** The bitten root's sprite: BITE_W x BITE_H, the root's centre BITE_OX / BITE_OY in from its top-left. */
const BITE_W = 36, BITE_H = 48, BITE_OX = 18, BITE_OY = 30;
/**
 * Where the bite comes out of each root, as fractions of `s` from its centre: on the glyph's own right shoulder,
 * so the teeth take a piece out of the EDGE and never punch a hole in the middle. Anything not listed is bitten
 * where a round glyph's shoulder is.
 */
const BITE_AT: Readonly<Record<string, readonly number[]>> = Object.freeze({
  carrot: [0.38, 0.1], potato: [0.9, -0.2], onion: [0.8, -0.25], leek: [0.36, 0.45], beetroot: [0.72, -0.1],
  pumpkin: [0.94, -0.15], cabbage: [0.88, -0.25], tomato: [0.86, -0.15], pea: [0.92, -0.25],
});
const BITE_ROUND = [0.85, -0.2];
/** Two tooth-rounds, BITE_R of `s` each, BITE_DY of `s` above and below the bite's centre: a scalloped bite, not a dent. */
const BITE_R = 0.32, BITE_DY = 0.26;
const BITTEN = new Map<string, HTMLCanvasElement>();

/**
 * The rocket root after Barley's CHOMP, painted ONCE per root and kept (the backdrops' rule: paint once, blit per
 * frame). A scalloped bite is cut out of its shoulder with `destination-out`, and its rim is drawn with
 * `source-atop`, so the ink line and the pale bitten flesh land on the root and nowhere else - the root keeps one
 * outline all the way round, bite included (ART_STYLE 0.2). Called from enter(), never from a draw.
 */
export function bittenRoot(icon: string, hex: string): HTMLCanvasElement {
  const key = icon + hex;
  const had = BITTEN.get(key);
  if (had) return had;
  const c = document.createElement('canvas'); c.width = BITE_W; c.height = BITE_H;
  const g = c.getContext('2d');
  const s = ROCKET_S, at = BITE_AT[icon] || BITE_ROUND, bx = at[0] * s, by = at[1] * s, r = BITE_R * s, dy = BITE_DY * s;
  g.translate(BITE_OX, BITE_OY);
  drawRoot(g, icon, hex, s);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(bx, by - dy, r, 0, TAU); g.moveTo(bx + 1 + r, by + dy); g.arc(bx + 1, by + dy, r, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-atop';
  g.lineWidth = 2;
  g.strokeStyle = mix(hex, UI.cream, 0.55);
  g.beginPath(); g.arc(bx, by - dy, r + 2, 0, TAU); g.stroke();
  g.beginPath(); g.arc(bx + 1, by + dy, r + 2, 0, TAU); g.stroke();
  g.strokeStyle = INK;
  g.beginPath(); g.arc(bx, by - dy, r, 0, TAU); g.stroke();
  g.beginPath(); g.arc(bx + 1, by + dy, r, 0, TAU); g.stroke();
  BITTEN.set(key, c);
  return c;
}

/** Blit a bitten root (bittenRoot) with its centre at (x, y). */
export function drawBitten(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number): void {
  ctx.drawImage(sprite, R(x) - BITE_OX, R(y) - BITE_OY);
}

// ---------------------------------------------------------------- the poses
/** Frames in an anim, summed off its keys: the screen times its beats by these, so a pose and its beat never drift. */
export function animFrames(a: Anim): number { let n = 0; for (const f of a.frames) n += f.dur; return n; }

/**
 * THE SOMERSAULT, built rather than typed. The rig turns about its feet (lib/art/rig.ts drawRig: root offset, then
 * root rot), so a body that should tumble about its own middle needs its root offset moved every key to keep that
 * middle on the path the throw gives it: `root = S - R(turn) * (0, -BELLY)`, where S is where the belly should be.
 * The belly rises FLIP_ARC rows and comes down LIE_H rows off the ground - a torso's half-width, flat on its back -
 * while the body turns FLIP_TURN degrees: one whole turn backwards and a quarter more, which is on its back, belly
 * up, head behind it. Keys every FLIP_KEY frames, eased so the throw yanks, tumbles and lands.
 */
const BELLY = 22, FLIP_ARC = 38, LIE_H = 12, FLIP_TURN = -450, FLIP_KEYS = 10, FLIP_KEY = 2;
/** Where the flip leaves the root: exactly where `pinned` and `rollOff` pick it up. */
const LIE_X = BELLY, LIE_Y = -LIE_H, LIE_ROT = -90;
function flipFrames(): Frame[] {
  const out: Frame[] = [];
  for (let i = 0; i <= FLIP_KEYS; i++) {
    const k = i / FLIP_KEYS, e = k * k * (3 - 2 * k);
    const turn = i === FLIP_KEYS ? FLIP_TURN : FLIP_TURN * e, a = turn * DEG;
    const cy = -(BELLY + (LIE_H - BELLY) * k + FLIP_ARC * Math.sin(Math.PI * k));
    const root = [R(-BELLY * Math.sin(a)), R(cy + BELLY * Math.cos(a)), R(turn)];
    // the throw (arms flung up, legs leaving the ground), the tuck, and the limbs opening for the landing
    if (k < 0.2) out.push(F(FLIP_KEY, { armR: [130, 10], armL: [-150, -10], torso: -18, head: -14, legR: [30, 8], legL: [-30, 30], root, stretch: 1.06, face: 'shout' }));
    else if (k < 0.8) out.push(F(FLIP_KEY, { armR: [70, 70], armL: [60, 76], torso: 12, head: 16, legR: [96, -100], legL: [84, -92], root, face: 'shout' }));
    else out.push(F(FLIP_KEY, { armR: [96, 14], armL: [84, 18], torso: 0, head: 10, legR: [80, -20], legL: [60, 4], root, squash: 1.08, face: 'dazed' }));
  }
  // the last key is the landing itself: held, never lerped past (a non-loop anim rests on its last key)
  out[FLIP_KEYS].dur = 1;
  return out;
}

/**
 * The jokes' poses, added to the scene's overlay table (gardenProps.ts GARDEN_ANIMS) for every seat. Every key sets
 * both arms and both legs (ART_STYLE section 8); `weapon: 90` rides on the keys the trug is in the paw for - the two
 * grips, and the carry stance a joke ends on - because from the bang to the end of a joke it is down on the soil.
 *
 * The rocket root:
 *   gripWary   the tug on a top the bed is heaving under: the grip with the eyes wide open (`neutral` - the
 *              `grit` lids lifted off) and the head down at the cracks.
 *   gripAlarm  the last four tugs: leaning right back, head up, mouth open (`shout`) - the '!' goes up with it.
 *   rocketPop  the root rips out of the paws: thrown back off its heels with both arms up, and settled.
 *   lookUp     the trug is down, the head right back at the sky and the near paw pointing up after it. (A paw
 *              shading the eyes was the first idea and this rig cannot make it: the shoulder sits at chin height,
 *              and the arm stops beside the muzzle - common.ts says the same over `reach`. Pointing reads further.)
 *   gape       Barley, as it comes down: head back, mouth wide.
 *   bonked     the root lands on the head: squashed flat, knees gone, `dazed`.
 *   dizzy      the stars: a slow `dazed` sway on the spot.
 *   shakeOff   a fast shake of the head, eyes shut, and a smile.
 *   chomp      Barley: the jaws snap shut on it, the chew, the smile.
 * The whopper:
 *   whopperFlip the somersault (flipFrames): flung up, the tuck, `dazed` for the landing.
 *   pinned     flat on its back with the giant root standing on its belly, paws up round it, legs kicking, `shout`.
 *   rollOff    a shove that topples the root off, a rock up onto the feet, and the carry stance.
 */
export const GAG_ANIMS = Object.freeze({
  gripWary: { loop: true, frames: [
    F(9, { armR: [56, 36], armL: [64, 30], weapon: 90, torso: -8, head: 8, legR: [18, 14], legL: [-24, 22], root: [-2, 1], face: 'neutral' }, { ease: 'inout' }),
    F(9, { armR: [62, 30], armL: [72, 24], weapon: 90, torso: -14, head: 4, legR: [23, 9], legL: [-29, 27], root: [-4, 0], squash: 1.03, face: 'neutral' }, { ease: 'inout' }),
  ] },
  gripAlarm: { loop: true, frames: [
    F(4, { armR: [62, 30], armL: [72, 24], weapon: 90, torso: -20, head: -16, legR: [26, 8], legL: [-32, 30], root: [-5, 0], face: 'shout' }),
    F(4, { armR: [64, 28], armL: [74, 22], weapon: 90, torso: -22, head: -18, legR: [26, 8], legL: [-32, 30], root: [-4, 0], squash: 1.02, face: 'shout' }),
  ] },
  rocketPop: { loop: false, frames: [
    F(3, { armR: [130, 12], armL: [-150, -10], torso: -24, head: -20, legR: [30, 6], legL: [-32, 30], root: [-4, -5], stretch: 1.06, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [124, 16], armL: [-140, -14], torso: -18, head: -24, legR: [18, 10], legL: [-22, 22], root: [-3, 0], squash: 1.06, face: 'shout' }, { ease: 'inout' }),
    F(4, { armR: [40, 20], armL: [-24, 14], torso: -8, head: -26, legR: [6, 2], legL: [-6, 2], root: [0, 0], face: 'neutral' }, { ease: 'out' }),
  ] },
  lookUp: { loop: true, frames: [
    F(18, { armR: [158, 8], armL: [-26, 16], torso: -8, head: -30, legR: [6, 2], legL: [-6, 2], root: [0, 0], face: 'neutral' }, { ease: 'inout' }),
    F(18, { armR: [154, 12], armL: [-22, 18], torso: -10, head: -34, legR: [6, 2], legL: [-6, 2], root: [0, -1], face: 'neutral' }, { ease: 'inout' }),
  ] },
  gape: { loop: true, frames: [
    F(5, { armR: [44, 30], armL: [-44, 20], torso: -10, head: -36, legR: [8, 4], legL: [-8, 4], root: [0, 0], face: 'shout' }),
    F(5, { armR: [48, 30], armL: [-48, 20], torso: -12, head: -38, legR: [8, 4], legL: [-8, 4], root: [0, -1], face: 'shout' }),
  ] },
  bonked: { loop: false, frames: [
    F(3, { armR: [60, 10], armL: [-60, 10], torso: 8, head: 16, legR: [22, 20], legL: [-22, 20], root: [0, 4], squash: 1.18, face: 'dazed' }, { ease: 'out' }),
    F(5, { armR: [34, 10], armL: [-34, 10], torso: 4, head: 8, legR: [10, 8], legL: [-10, 8], root: [0, 1], squash: 1.06, face: 'dazed' }, { ease: 'inout' }),
  ] },
  dizzy: { loop: true, frames: [
    F(12, { armR: [30, 10], armL: [-28, 12], torso: 4, head: 8, legR: [6, 2], legL: [-6, 2], root: [-1, 0, -3], face: 'dazed' }, { ease: 'inout' }),
    F(12, { armR: [26, 12], armL: [-32, 10], torso: 2, head: 4, legR: [6, 2], legL: [-6, 2], root: [1, 0, 3], face: 'dazed' }, { ease: 'inout' }),
  ] },
  shakeOff: { loop: false, frames: [
    F(3, { armR: [24, 10], armL: [-24, 10], torso: 0, head: 14, legR: [4, 0], legL: [-4, 0], root: [0, 0], face: 'closed' }),
    F(3, { armR: [24, 10], armL: [-24, 10], torso: 0, head: -12, legR: [4, 0], legL: [-4, 0], root: [0, 0], face: 'closed' }),
    F(3, { armR: [24, 10], armL: [-24, 10], torso: 0, head: 12, legR: [4, 0], legL: [-4, 0], root: [0, 0], face: 'closed' }),
    F(3, { armR: [24, 10], armL: [-24, 10], torso: 0, head: -10, legR: [4, 0], legL: [-4, 0], root: [0, 0], face: 'closed' }),
    F(3, { armR: [20, 10], armL: [-20, 10], torso: 0, head: 6, legR: [4, 0], legL: [-4, 0], root: [0, 0], face: 'closed' }),
    F(9, { armR: [14, 12], armL: [-18, 8], torso: 2, head: 0, legR: [0, 0], legL: [0, 0], root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  chomp: { loop: false, frames: [
    F(3, { armR: [50, 30], armL: [-40, 20], torso: -6, head: -20, legR: [8, 4], legL: [-8, 4], root: [0, 2], squash: 1.08, face: 'closed' }, { ease: 'out' }),
    F(9, { armR: [40, 50], armL: [-30, 20], torso: -2, head: -4, legR: [6, 2], legL: [-6, 2], root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(8, { armR: [24, 70], armL: [-14, 30], torso: 2, head: 6, legR: [6, 2], legL: [-6, 2], root: [0, 1], face: 'closed' }, { ease: 'inout' }),
    F(8, { armR: [24, 70], armL: [-14, 30], torso: 0, head: -2, legR: [6, 2], legL: [-6, 2], root: [0, 0], face: 'closed' }, { ease: 'inout' }),
    F(8, { armR: [24, 70], armL: [-14, 30], torso: 2, head: 4, legR: [6, 2], legL: [-6, 2], root: [0, 1], face: 'happy' }, { ease: 'inout' }),
    F(6, { armR: [14, 12], armL: [-18, 8], torso: 2, head: 0, legR: [0, 0], legL: [0, 0], root: [0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
  whopperFlip: { loop: false, frames: flipFrames() },
  // On its back every angle reads turned a quarter: a leg's 0 points along the ground away from the head and 90
  // points at the sky. Kicked toward 90 the short legs ran up the side of the shorts block and vanished into it
  // (common.ts makeHips draws it over the leg roots), and past 90 they kicked into the root on the belly; between 0
  // and 50, bent at the knee, they clear the shorts and the feet paddle at the sky beyond them.
  pinned: { loop: true, frames: [
    F(5, { armR: [66, 26], armL: [58, 32], torso: 0, head: 12, legR: [10, 56], legL: [46, -6], root: [LIE_X, LIE_Y, LIE_ROT - 3], face: 'shout' }, { ease: 'inout' }),
    F(5, { armR: [62, 30], armL: [62, 28], torso: 0, head: 10, legR: [46, -6], legL: [10, 56], root: [LIE_X, LIE_Y, LIE_ROT + 3], face: 'shout' }, { ease: 'inout' }),
  ] },
  rollOff: { loop: false, frames: [
    F(6, { armR: [110, -10], armL: [100, -6], torso: 0, head: 8, legR: [70, 10], legL: [60, 16], root: [LIE_X, LIE_Y, LIE_ROT], face: 'grit' }, { ease: 'inout' }),
    F(8, { armR: [70, 30], armL: [40, 30], torso: 10, head: 4, legR: [70, -60], legL: [60, -50], root: [R(LIE_X / 2), R(LIE_Y / 2), R(LIE_ROT / 2)], face: 'grit' }, { ease: 'inout' }),
    F(6, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 0, legR: [0, 0], legL: [0, 0], root: [0, 0, 0], face: 'happy' }, { ease: 'out' }),
  ] },
});

/** Frames of each timed pose: the screen's beats are cut to these. */
export const POP_FRAMES = animFrames(GAG_ANIMS.rocketPop), BONK_FRAMES = animFrames(GAG_ANIMS.bonked);
export const CHOMP_FRAMES = animFrames(GAG_ANIMS.chomp), ROLL_FRAMES = animFrames(GAG_ANIMS.rollOff);
export const SHAKE_FRAMES = animFrames(GAG_ANIMS.shakeOff);
/** The somersault's length: its keys, less the held landing key. */
export const FLIP_FRAMES = FLIP_KEYS * FLIP_KEY;
