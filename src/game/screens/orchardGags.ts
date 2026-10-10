// PIPPIN ORCHARD'S TWO JOKES (docs/GDD.md section 5, "Every mini-game has two jokes"), built from the shared kit
// (game/gags.ts) and played on the seat that caught them. Both are dealt by the roll in orchard.ts updateApples - one
// apple in ten each, and nothing here spends a random number - and both are one countdown on the seat from the catch,
// with the stick locked and the basket down until it runs out. Neither costs an apple; neither scores one.
//
//   THE BOMB          TELL: the fuse on a falling apple. Caught: '!' over the head. WIND-UP: held up to the eye
//   (boomT)           while the fuse burns down; the paw starts to shake and the face goes to grit, and for the last
//                     few frames the eyes are squeezed shut and the head turned away. BANG: BOOM! on a starburst over
//                     the plate, smoke and embers off the paw, a hot ring, a cream flash, the world bumped three rows.
//                     LOOK: stood there in soot - a coat, so the ink and the eyes stay and it blinks out of it - with
//                     stars round its head and smoke off its ears; a COUGH, then it shakes the soot off in a shower
//                     of flakes and carries on.
//   THE WORMY APPLE   TELL: the bruise and the grub climbing out of it. Caught: '?' - held up and peered into. The
//   (wormyT)          grub's eyes come up over the rim, it pops up tall and blows a raspberry: PFFT! The critter jumps
//                     back, flings the apple over its shoulder (it lands behind and the grub crawls off) and shudders.
//                     BARLEY, the hungry one, shrugs and eats it in one gulp instead - CHOMP! - and the grub pops back
//                     up out of his mouth, says HI!, drops off and wriggles away. Barley never eats a bomb.
//
// Determinism (docs/ARCHITECTURE.md section 0): the countdowns are integers on the seat and in checksumFields(), every
// beat is a threshold on them, and which version of the wormy apple plays is read off the seat's critter, which every
// peer holds. The word cards, the particles, the litter (art/orchardGags.ts) and the poses are cosmetic; where they
// need a point on the critter in update() it comes from the rig's proportions (pawRoot, headRow), never from a draw.
import { UI, SIGNAL } from '../../constants.ts';
import { dsin, dcos } from '../../lib/engine/trig.ts';
import { jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F, muzzleGeom } from '../../content/critters/common.ts';
import type { CritterRig } from '../../content/critters/common.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt, burstCrumbs } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { ORCHARD } from '../../art/backgrounds/orchard.ts';
import { drawFuse, drawWormyApple, drawGrub, drawShiver, holeX, holeY, tossApple, dropGrub, PLAIN, RASPBERRY, FUSE_H } from '../../art/orchardGags.ts';
import { gagBurst, gagBubble, gagBump, overHead, drawDizzy, COAT } from '../gags.ts';
import { seatAnim, RIBBON_BASKET } from '../minigame.ts';
import type { Seat } from '../minigame.ts';
import type { Game } from '../game.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;

/** Rows above overHead() a starburst is centred on, so it sits over the name plate and the face stays in view. */
const BURST_UP = 16;
/** The words. Module constants: a card keeps the string it was handed, and nothing is built per frame. */
const NOTICE = '!', HUH = '?', BOOM = 'BOOM!', COUGH = 'COUGH', PFFT = 'PFFT!', CHOMP = 'CHOMP!', HI = 'HI!';

/**
 * The bomb, as one countdown on the seat (`boomT`, BOOM_TOTAL down to 0); every beat is a number of frames LEFT:
 *   boomT > SINGED_FRAMES    the HOLD (HOLD_FRAMES): `holdBomb`, a stare, under the '!' bubble; at TREMBLE_AT the
 *                            paw starts to shake and the face grits (`holdShake`); at BRACE_AT the eyes squeeze shut
 *                            and the head turns away (`holdBrace`) - the last thing before it goes;
 *   boomT == SINGED_FRAMES   the BANG;
 *   SHAKE_FRAMES < boomT     SINGED (to the bang): the soot coat, the stars, smoke off the ears, the stunned blink (`singed`), and
 *                            at COUGH_AT a cough with a puff of smoke in it (`cough`, under the COUGH bubble, which
 *                            is up from there to the end);
 *   0 < boomT <= SHAKE       it shakes the soot off (`shakeOff`): flakes everywhere, the coat gone at SOOT_OFF.
 * 40 + 105 frames is under two and a half seconds - a joke, not a penalty.
 */
const HOLD_FRAMES = 40, SINGED_FRAMES = 105, BOOM_TOTAL = HOLD_FRAMES + SINGED_FRAMES;
const TREMBLE_AT = SINGED_FRAMES + 26, BRACE_AT = SINGED_FRAMES + 8;
const SHAKE_FRAMES = 16, SOOT_OFF = 8, COUGH_AT = SHAKE_FRAMES + 28;
/** The bang's flash: a cream burst over the paw for this many frames; a puff of smoke off each ear every SMOKE_EVERY. */
const FLASH_FRAMES = 4, SMOKE_EVERY = 10;

/**
 * The wormy apple, as one countdown on the seat (`wormyT`, GRUB_TOTAL down to 0), every beat frames LEFT:
 *   GRUB_TOTAL..POP_AT   the LOOK: '?', held up to the eye (`peer`) with the bite hole empty - the grub ducked back
 *                        in when it was caught - and at PEEK_AT its eyes come up over the rim;
 *   POP_AT               it pops up tall (POP_FRAMES, with an overshoot);
 *   PFFT_AT              the BANG: it blows a raspberry for TONGUE_FRAMES - PFFT! - and the critter jumps back with
 *                        its mouth open, the apple out at arm's length (`recoil`);
 *   FLING_AT             a wind-up and a flick (`fling`): the apple leaves the paw at TOSS_AT, back over the head;
 *   SHUDDER_AT..0        a full-body shudder with the eyes screwed shut (`shudder`), and it carries on.
 */
const GRUB_TOTAL = 80, PEEK_AT = 62, POP_AT = 56, PFFT_AT = 46, FLING_AT = 32, TOSS_AT = 26, SHUDDER_AT = 20;
/**
 * The pop: frames to full height (overshooting by POP_OVER px on the way), the grub's height then, and while it
 * peeks; the frames its tongue is out; and how far out past Barley's muzzle it leans, standing in his mouth.
 */
const POP_FRAMES = 4, POP_OVER = 4, GRUB_RISE = 13, PEEK_RISE = 4, TONGUE_FRAMES = 12, GRUB_LEAN = 5;
/** The flung apple: px/frame back (away from the way the critter faces) and up. It lands on the seat's own lane. */
const TOSS_VX = 2.4, TOSS_VY = 4.2;

/**
 * Barley's wormy apple: the same LOOK, then he shrugs and eats it - and the grub comes back out:
 *   BARLEY_TOTAL..SHRUG_AT  the LOOK ('?', `peer`), as anyone's;
 *   SHRUG_AT                `shrug`: who cares;
 *   EAT_AT                  the cast's own `eat`, whose paw reaches the mouth EAT_BITE frames in (8 + 6, content/
 *                           critters/common.ts): CHOMP_AT is that frame - CHOMP!, a nom, crumbs, and the apple gone;
 *                           two chews follow (CHEW_EVERY apart) and then the smile, held;
 *   GAPE_AT                 the grub pops back up out of his open mouth (`gape`);
 *   HI_AT                   HI! - timed to pop as the CHOMP! card shrinks away (a burst is up 56 frames, shrinking
 *                           for its last 6: game/gags.ts), so the two never print over each other; it waves;
 *   DROP_AT                 it drops off onto the grass and wriggles away, and Barley shrugs again and carries on.
 */
const BARLEY_TOTAL = 120, SHRUG_AT = 100, EAT_AT = 88, EAT_BITE = 14, CHOMP_AT = EAT_AT - EAT_BITE;
const GAPE_AT = 36, HI_AT = 24, DROP_AT = 8;
const CHEW_EVERY = 10;
/** The cast member who eats the evidence (content/critters/barley.ts). */
const BARLEY = 'barley';

// ---------------------------------------------------------------- the poses

/**
 * The arm keys the jokes also need in update(), for a cosmetic spawned at the paw: the brace (where the bang goes
 * off), the peer (where the grub spits from) and the flick (where the apple leaves). Each is ONE key's numbers, read
 * by the anim below and by pawRoot, so the smoke comes out of the paw the critter is actually holding up.
 */
const BRACE = { torso: -10, upper: 92, lower: 10 }, PEER = { torso: 2, upper: 100, lower: 34 }, FLICK = { torso: -10, upper: 140, lower: 0 };
/** The singed stand: bolt upright, arms out a little, a whisker of squash - shocked, not hurt. */
const SINGED = { armR: [34, 6], armL: [-34, 6], legR: [6, 0], legL: [-6, 0], torso: -2, head: -4, squash: 1.03 };
/** A held 2-frame key that does not lerp into the next: the tremble, the shake and the shudder are steps, not a sway. */
const STEPPED = { interp: false };

/**
 * The orchard's own poses, on top of the shared table (the coop's COOP_ANIMS pattern; orchard.ts installs them with
 * setOverlay). A held apple sits in the NEAR paw beside the muzzle, never over it (ART_STYLE 0.7), the far arm down so
 * both paws read; a raised near arm goes up forward, and only the far one ever goes up behind the head (the jump
 * back). `face` is stepped, so a blink is a key of its own.
 *   holdBomb   the stare: the apple up at muzzle height, the head tipped to look at it.
 *   holdShake  the fuse is getting short: the paw trembling in 2-frame steps, `grit`.
 *   holdBrace  the last frames: at arm's length, leaning away, the head turned off it and the eyes squeezed `closed`.
 *   singed     the stand, trembling a pixel, staring out of the soot and blinking twice every 36 frames.
 *   cough      doubled over twice, the mouth open on each bark.
 *   shakeOff   a wet-dog shake: the body thrown forward and back in 2-frame steps.
 *   peer       the wormy apple held right up to the eye, the head bent to look into the hole.
 *   recoil     PFFT: a jump back with the mouth open, the apple held out at arm's length.
 *   fling      in, then a flick up past the muzzle (the apple goes on over the head), and the follow-through.
 *   shudder    eyes screwed shut, a 1 px shiver, stepping back up to where it stood before it jumped.
 *   shrug      Barley: forearms up, chin up, a smile - who cares.
 *   gape       Barley: the mouth wide open, the head back, the paws up - the grub is standing in it.
 */
export const ORCHARD_ANIMS = Object.freeze({
  holdBomb: { loop: true, frames: [
    F(8, { armR: [96, 30], armL: [-16, 8], torso: -2, head: 10, root: [0, 0], face: 'neutral' }),
    F(8, { armR: [98, 28], armL: [-14, 8], torso: -3, head: 12, root: [0, -1], face: 'neutral' }),
  ] },
  holdShake: { loop: true, frames: [
    F(2, { armR: [97, 30], armL: [-14, 8], torso: -4, head: 12, root: [0, -1], face: 'grit' }, STEPPED),
    F(2, { armR: [103, 22], armL: [-12, 10], torso: -4, head: 13, root: [1, -1], face: 'grit' }, STEPPED),
  ] },
  holdBrace: { loop: true, frames: [
    F(2, { armR: [BRACE.upper, BRACE.lower], armL: [-40, 12], torso: BRACE.torso, head: -16, root: [-1, 0], face: 'closed' }, STEPPED),
    F(2, { armR: [BRACE.upper + 4, BRACE.lower - 4], armL: [-42, 12], torso: BRACE.torso, head: -16, root: [-2, 0], face: 'closed' }, STEPPED),
  ] },
  singed: { loop: true, frames: [
    F(4, { ...SINGED, root: [0, 0], face: 'neutral' }), F(4, { ...SINGED, root: [1, 0], face: 'neutral' }),
    F(4, { ...SINGED, root: [0, 0], face: 'neutral' }), F(4, { ...SINGED, root: [1, 0], face: 'neutral' }),
    F(4, { ...SINGED, root: [0, 0], face: 'neutral' }), F(4, { ...SINGED, root: [1, 0], face: 'neutral' }),
    F(3, { ...SINGED, root: [0, 0], face: 'closed' }), F(3, { ...SINGED, root: [1, 0], face: 'neutral' }),
    F(3, { ...SINGED, root: [0, 0], face: 'closed' }), F(3, { ...SINGED, root: [1, 0], face: 'neutral' }),
  ] },
  cough: { loop: false, frames: [
    F(4, { ...SINGED, torso: 12, head: 14, root: [0, 1], squash: 1.07, face: 'shout' }, { ease: 'out' }),
    F(5, { ...SINGED, torso: 4, head: 4, root: [0, 0], face: 'closed' }),
    F(4, { ...SINGED, torso: 14, head: 16, root: [0, 1], squash: 1.07, face: 'shout' }, { ease: 'out' }),
    F(9, { ...SINGED, torso: 2, head: 0, root: [0, 0], face: 'closed' }),
    F(6, { ...SINGED, root: [0, 0], face: 'neutral' }),
  ] },
  shakeOff: { loop: true, frames: [
    F(2, { armR: [44, 10], armL: [-44, 10], torso: 10, head: 12, root: [-2, 0], face: 'closed' }, STEPPED),
    F(2, { armR: [30, 24], armL: [-30, 24], torso: -10, head: -12, root: [2, -1], face: 'closed' }, STEPPED),
  ] },
  peer: { loop: true, frames: [
    F(14, { armR: [PEER.upper, PEER.lower], armL: [-16, 8], torso: PEER.torso, head: 14, root: [0, 0], face: 'neutral' }),
    F(14, { armR: [PEER.upper + 2, PEER.lower - 2], armL: [-14, 8], torso: PEER.torso + 1, head: 16, root: [0, -1], face: 'neutral' }),
  ] },
  recoil: { loop: false, frames: [
    F(3, { armR: [84, 4], armL: [-90, 0], torso: -16, head: -14, root: [-1, 1], squash: 1.08, face: 'shout' }, { ease: 'out' }),
    F(6, { armR: [88, 0], armL: [-145, -15], legR: [24, 30], legL: [-10, 40], torso: -12, head: -10, root: [-4, -8], stretch: 1.04, face: 'shout' }, { ease: 'out' }),
    F(5, { armR: [86, 4], armL: [-115, -10], torso: -8, head: -8, root: [-5, 1], squash: 1.06, face: 'shout' }, { ease: 'in' }),
  ] },
  fling: { loop: false, frames: [
    F(4, { armR: [70, 60], armL: [-30, 10], torso: 6, head: 6, root: [-5, 0], face: 'grit' }, { ease: 'in' }),
    F(2, { armR: [FLICK.upper, FLICK.lower], armL: [-40, 10], torso: FLICK.torso, head: -12, root: [-5, -1], face: 'closed' }, { ease: 'overshoot' }),
    F(6, { armR: [FLICK.upper - 8, FLICK.lower + 8], armL: [-36, 10], torso: FLICK.torso + 2, head: -10, root: [-5, 0], face: 'closed' }),
  ] },
  shudder: { loop: false, frames: [
    F(2, { armR: [20, 30], armL: [-22, 26], torso: 4, head: 8, root: [-5, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [22, 28], armL: [-20, 28], torso: 4, head: 9, root: [-4, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [20, 30], armL: [-22, 26], torso: 4, head: 8, root: [-5, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [22, 28], armL: [-20, 28], torso: 4, head: 9, root: [-3, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [20, 30], armL: [-22, 26], torso: 4, head: 8, root: [-4, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [22, 28], armL: [-20, 28], torso: 4, head: 9, root: [-2, 1], squash: 1.05, face: 'closed' }, STEPPED),
    F(2, { armR: [20, 30], armL: [-22, 26], torso: 3, head: 8, root: [-3, 1], squash: 1.04, face: 'closed' }, STEPPED),
    F(2, { armR: [22, 28], armL: [-20, 28], torso: 3, head: 6, root: [-1, 0], squash: 1.03, face: 'hurt' }, STEPPED),
    F(2, { armR: [18, 20], armL: [-20, 14], torso: 2, head: 4, root: [-1, 0], face: 'hurt' }, STEPPED),
    F(2, { armR: [16, 14], armL: [-18, 10], torso: 2, head: 2, root: [0, 0], face: 'neutral' }, STEPPED),
  ] },
  shrug: { loop: false, frames: [
    F(4, { armR: [50, 50], armL: [-50, -50], torso: 0, head: -6, root: [0, -1], stretch: 1.03, face: 'neutral' }, { ease: 'out' }),
    F(8, { armR: [54, 46], armL: [-54, -46], torso: 0, head: -8, root: [0, -1], stretch: 1.03, face: 'happy' }),
  ] },
  gape: { loop: true, frames: [
    F(10, { armR: [36, 40], armL: [-36, 30], torso: -6, head: -10, root: [0, 0], face: 'shout' }),
    F(10, { armR: [38, 38], armL: [-38, 30], torso: -6, head: -12, root: [0, -1], face: 'shout' }),
  ] },
});

// ---------------------------------------------------------------- where things are, from the rig alone

/** Reused by pawRoot so the maths allocates nothing (it runs four times in enter() and once per cosmetic spawn). */
const PAW: Point = { x: 0, y: 0 };

/**
 * Root-space position of the near paw for a torso lean and arm angles (degrees): the same chain as lib/art/rig.ts
 * computeJoints but through the deterministic trig, so the catch box orchard.ts builds from it in enter() is
 * bit-identical on every peer. y is down-positive with the feet at 0 (so the paw's y is negative). The jokes read it
 * too, for the point a puff of smoke or a flung apple leaves the paw from.
 *
 * This lives with the orchard, not in game/minigame.js, because the coop does not catch anything: minigame.js is
 * shared with another owner's screen, and only furniture BOTH screens use belongs in it.
 */
export function pawRoot(rig: Rig, torsoRot: number, upper: number, lower: number): Point {
  const p = rig.p, hipY = rig.hipY;
  const c = dcos(torsoRot * DEG), s = dsin(torsoRot * DEG), shY = -(p.torsoH - 5);
  const sx = p.shoulderX * c - shY * s, sy = hipY + p.shoulderX * s + shY * c;
  const u = (torsoRot + upper) * DEG, l = (torsoRot + upper + lower) * DEG;
  const ex = sx + dsin(u) * p.upperArm, ey = sy + dcos(u) * p.upperArm;
  const wx = ex + dsin(l) * p.lowerArm, wy = ey + dcos(l) * p.lowerArm;
  PAW.x = wx + dsin(l) * p.handR * 0.6; PAW.y = wy + dcos(l) * p.handR * 0.6;
  return PAW;
}

/** Screen x of a seat's near paw held in `pose` (a BRACE / PEER / FLICK key), from the rig's proportions alone. */
function pawX(s: Seat, pose: { torso: number; upper: number; lower: number }): number {
  return R(s.x + s.facing * pawRoot(s.rig, pose.torso, pose.upper, pose.lower).x * s.rig.scale);
}
/** Screen y of the same paw (call straight after pawX: it reads the point pawX just solved). */
function pawY(s: Seat): number { return R(s.y + PAW.y * s.rig.scale); }
/** The row of a seat's head centre standing up, from the rig's height: where the ears and the mouth are measured from. */
function headRow(s: Seat): number { return R(s.y - (s.rig.height - s.rig.p.headR) * s.rig.scale); }

// ---------------------------------------------------------------- the joke state on a seat

/** The two countdowns a seat carries (orchard.ts OrchardSeat extends this). Both are sim state, both in the checksum. */
export interface JokeSeat extends Seat {
  /** Frames left of the bomb (BOOM_TOTAL..0); the seat neither moves nor catches while it runs. */
  boomT: number;
  /** Frames left of the wormy apple (GRUB_TOTAL, or BARLEY_TOTAL for Barley, ..0); the same lock. */
  wormyT: number;
}

/** What the jokes write back to the screen: the two counts (the tests and the desync canary read them) and the audio. */
export interface JokeScreen {
  game: Game;
  /** Bombs that have gone off in somebody's paw this round. */
  booms: number;
  /** Wormy apples caught this round. */
  grubs: number;
}

/** True while either joke has the seat: it neither moves nor catches. */
export function inJoke(s: JokeSeat): boolean { return s.boomT > 0 || s.wormyT > 0; }

/** True while the seat is drawn in soot: from the bang until halfway through shaking it off. */
export function sooty(s: JokeSeat): boolean { return s.boomT > SOOT_OFF && s.boomT <= SINGED_FRAMES; }

/** Both jokes over, the basket back in the paw: the round ended mid-joke (orchard.ts finish). */
export function endJokes(s: JokeSeat): void {
  if (!inJoke(s)) return;
  s.boomT = 0; s.wormyT = 0; s.rig.weapon = RIBBON_BASKET;
}

/** Shaken off or carried on: the basket is back in the paw and the seat is a player again. */
function recover(s: JokeSeat): void { s.rig.weapon = RIBBON_BASKET; seatAnim(s, 'catch', true); }

// ---------------------------------------------------------------- the bomb

/**
 * The wisps off a sooty critter - its ears, its cough, its shake - are a pale warm smoke: the bang's own dark smoke
 * (the particle default) vanishes against the soot it is coming off and against the grass behind it. The ash is the
 * light half of the flakes it shakes off, for the same reason: soot flakes alone are dark specks on a dark coat.
 */
const WISP = '#C9C1C3', ASH = '#9A929C';
/** The particles of the bang, the ear smoke, the cough and the shake, built once. */
const SMOKE_OPTS = { speed: 2.4, up: 1.2, sizeJitter: 2, screen: true }, EMBER_OPTS = { speed: 3, up: 1.6, screen: true };
const PUFF_OPTS = { speed: 0.5, up: 0.9, color: WISP, size: 5, sizeJitter: 1, screen: true };
const COUGH_OPTS = { speed: 0.8, up: 0.4, vx: 0, color: WISP, size: 5, sizeJitter: 1, screen: true };
const SOOT_OPTS = { speed: 3.4, up: 2.2, color: COAT.soot, sizeJitter: 1, floor: 0, screen: true };
const ASH_OPTS = { speed: 3, up: 2.4, color: ASH, sizeJitter: 1, floor: 0, screen: true };

/** A bomb in the paw: the basket goes down, the apple comes up, '!', and the fuse starts to burn. */
export function lightFuse(sc: JokeScreen, s: JokeSeat): void {
  s.boomT = BOOM_TOTAL; s.moving = false; s.catchT = 0;
  s.rig.weapon = null;
  seatAnim(s, 'holdBomb', true);
  gagBubble(s.x, overHead(s), NOTICE, s.colour);
  sc.game.audio.play('fuse');
}

/** One frame of the bomb: the hold's three faces, the bang, the singed stand and its cough, the shake, the recovery. */
export function stepBoom(sc: JokeScreen, s: JokeSeat): void {
  const t = --s.boomT;
  if (t === TREMBLE_AT) seatAnim(s, 'holdShake', true);
  else if (t === BRACE_AT) seatAnim(s, 'holdBrace', true);
  else if (t === SINGED_FRAMES) bang(sc, s);
  else if (t === COUGH_AT) cough(sc, s);
  else if (t === SHAKE_FRAMES) { seatAnim(s, 'shakeOff', true); flakes(s, 1); sc.game.audio.play('poof'); }
  else if (t === SOOT_OFF) { flakes(s, 2); sc.game.audio.play('poof'); }
  else if (t === 0) recover(s);
  // a wisp off each ear in turn while it stands there smoking
  if (t < SINGED_FRAMES && t > SHAKE_FRAMES && t % SMOKE_EVERY === 0) {
    const side = (t / SMOKE_EVERY) & 1 ? 1 : -1, r = s.rig.p.headR * s.rig.scale;
    particles.burst('smoke', s.x + side * R(r * 0.7), headRow(s) - R(r * 0.8), 1, PUFF_OPTS);
  }
}

/** The bang: smoke and embers off the paw, a hot ring, the flash, BOOM! over the plate, a bump, and the critter in soot. */
function bang(sc: JokeScreen, s: JokeSeat): void {
  const px = pawX(s, BRACE), py = pawY(s);
  sc.booms++;
  particles.burst('smoke', px, py, 14, SMOKE_OPTS);
  particles.burst('ember', px, py, 14, EMBER_OPTS);
  ringAt(px, py, 6, 38, SIGNAL.hot, 3, 14, false, true);
  ringAt(px, py, 4, 22, UI.cream, 2, 10, false, true);
  gagBurst(s.x, overHead(s) - BURST_UP, BOOM, s.colour);
  gagBump(3);
  seatAnim(s, 'singed', true);
  sc.game.audio.play('boom');
}

/** The cough: doubled over, a puff of smoke out of the mouth, and the word. */
function cough(sc: JokeScreen, s: JokeSeat): void {
  const r = s.rig.p.headR * s.rig.scale;
  COUGH_OPTS.vx = s.facing * 1.2;
  particles.burst('smoke', s.x + s.facing * R(r), headRow(s) + R(r * 0.5), 3, COUGH_OPTS);
  gagBubble(s.x, overHead(s), COUGH, s.colour);
  seatAnim(s, 'cough', true);
  sc.game.audio.play('orchard_cough');
}

/**
 * Shaking it off: soot and ash flakes thrown off both flanks to land round its feet, and a puff - once as the shake
 * starts and again, `n` times as many, on the frame the coat comes off, so the soot is seen to GO rather than vanish.
 */
function flakes(s: JokeSeat, n: number): void {
  const mid = R(s.y - s.rig.height * s.rig.scale * 0.5), half = R((s.rig.width * s.rig.scale) / 2);
  SOOT_OPTS.floor = s.y; ASH_OPTS.floor = s.y;
  for (let side = -1; side <= 1; side += 2) {
    particles.burst('crumb', s.x + side * half, mid, 5 * n, SOOT_OPTS);
    particles.burst('crumb', s.x + side * half, mid, 3 * n, ASH_OPTS);
  }
  particles.burst('smoke', s.x, mid, 2 * n, PUFF_OPTS);
}

// ---------------------------------------------------------------- the wormy apple

const SPIT_OPTS = { speed: 1.2, up: 0.6, vx: 0, screen: true };

/** A wormy apple in the paw: the basket goes down, the apple comes up to the eye, '?'. */
export function findGrub(sc: JokeScreen, s: JokeSeat): void {
  s.wormyT = s.critter === BARLEY ? BARLEY_TOTAL : GRUB_TOTAL; s.moving = false; s.catchT = 0;
  s.rig.weapon = null;
  sc.grubs++;
  seatAnim(s, 'peer', true);
  gagBubble(s.x, overHead(s), HUH, s.colour);
  sc.game.audio.play('wormy');
}

/** One frame of the wormy apple: the grub's version, or Barley's. */
export function stepWormy(sc: JokeScreen, s: JokeSeat): void {
  const t = --s.wormyT;
  if (s.critter === BARLEY) stepBarley(sc, s, t); else stepGrub(sc, s, t);
  if (t === 0) recover(s);
}

/** Anyone but Barley: the pop, the raspberry, the jump back, the fling and the shudder. */
function stepGrub(sc: JokeScreen, s: JokeSeat, t: number): void {
  if (t === POP_AT) sc.game.audio.play('orchard_pop');
  else if (t === PFFT_AT) {
    // the raspberry: spit off the grub's head, toward the face it is blowing at
    const gx = pawX(s, PEER) - s.facing * 3, gy = pawY(s) - 2 - GRUB_RISE;
    SPIT_OPTS.vx = -s.facing * 1.6;
    particles.burst('drop', gx, gy, 6, SPIT_OPTS);
    gagBurst(s.x, overHead(s) - BURST_UP, PFFT, s.colour);
    seatAnim(s, 'recoil', true);
    sc.game.audio.play('orchard_pfft');
  } else if (t === FLING_AT) seatAnim(s, 'fling', true);
  else if (t === TOSS_AT) {
    // back over the head and onto the lane behind; the thud is timed to the landing
    const air = tossApple(pawX(s, FLICK), pawY(s) - 2, -s.facing * TOSS_VX, -TOSS_VY, s.y);
    sc.game.audio.play('orchard_fling');
    sc.game.audio.play('splat', { delay: air / 60 });
  } else if (t === SHUDDER_AT) seatAnim(s, 'shudder', true);
}

/** Barley: the shrug, the gulp, the chews, the smile - and the grub back out of his mouth to say hello. */
function stepBarley(sc: JokeScreen, s: JokeSeat, t: number): void {
  if (t === SHRUG_AT || t === DROP_AT) seatAnim(s, 'shrug', true);
  else if (t === EAT_AT) seatAnim(s, 'eat', true);
  else if (t === CHOMP_AT) {
    // bits of the bruised skin and of the cream flesh inside it
    burstCrumbs(mouthX(s), mouthY(s), s.y, ORCHARD.wormy, 8, true);
    burstCrumbs(mouthX(s), mouthY(s), s.y, UI.cream, 6, true);
    gagBurst(s.x, overHead(s) - BURST_UP, CHOMP, s.colour);
    sc.game.audio.play('nom');
  } else if (t === CHOMP_AT - CHEW_EVERY || t === CHOMP_AT - CHEW_EVERY * 2) sc.game.audio.play('chew');
  else if (t === GAPE_AT) { seatAnim(s, 'gape', true); sc.game.audio.play('orchard_pop'); }
  else if (t === HI_AT) { gagBubble(s.x + s.facing * 6, overHead(s), HI, s.colour); sc.game.audio.play('orchard_hi'); }
  if (t === DROP_AT) dropGrub(mouthX(s), mouthY(s), s.y, s.facing);
}

/** Barley's mouth standing up, from the rig's proportions (the muzzle tip, ART_STYLE 0.6): where the grub comes from. */
function mouthX(s: Seat): number { return R(s.x + s.facing * s.rig.p.headR * 0.8 * s.rig.scale); }
function mouthY(s: Seat): number { return headRow(s) + R(s.rig.p.headR * 0.5 * s.rig.scale); }

// ---------------------------------------------------------------- drawn on the seat

/** Scratch points for the joints a joke reads after drawRig (draw-only). */
const PAW_PT: Point = { x: 0, y: 0 }, HEAD_PT: Point = { x: 0, y: 0 }, MOUTH_PT: Point = { x: 0, y: 0 };

/**
 * What a seat holds or wears through a joke, drawn straight after its drawRig and read off the joints it just
 * solved, so it is where the paw (or the head) actually is - the hive's honey strand does the same. `icon`/`hex` are
 * the visit's fruit and `size` its half-size (orchard.ts APPLE_S: the fruit in a paw is the fruit in the air); `f`
 * is any frame counter, for the fuse's spark, the stars and the grub's wave.
 */
export function drawJoke(ctx: CanvasRenderingContext2D, s: JokeSeat, icon: string, hex: string, size: number, f: number): void {
  if (s.boomT > 0) drawBomb(ctx, s, icon, hex, size, f);
  else if (s.wormyT > 0) {
    if (s.critter === BARLEY) drawBarley(ctx, s, icon, size, f);
    else drawWormy(ctx, s, icon, size, f);
  }
}

function drawBomb(ctx: CanvasRenderingContext2D, s: JokeSeat, icon: string, hex: string, size: number, f: number): void {
  const b = s.boomT;
  if (b > SINGED_FRAMES) {
    const p = jointScreen(s.rig, 'handN', PAW_PT), x = R(p.x), y = R(p.y) - 2;
    drawFood(ctx, icon, x, y, size, hex);
    ctx.fillStyle = UI.cream; ctx.fillRect(x - 4, y - 4, 3, 3);
    drawFuse(ctx, x, y - size, Math.ceil(FUSE_H * (b - SINGED_FRAMES) / HOLD_FRAMES), f);
    if (b <= TREMBLE_AT) drawShiver(ctx, x, y, size + 1, f);       // the paw shaking, from the moment the face grits
  } else if (b > SINGED_FRAMES - FLASH_FRAMES) {
    const p = jointScreen(s.rig, 'handN', PAW_PT), x = R(p.x), y = R(p.y) - 2;
    const k = SINGED_FRAMES - b, r = 14 + k * 6;
    ctx.fillStyle = UI.cream; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = SIGNAL.hot; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
  } else if (b > SHAKE_FRAMES) {
    // seeing stars: three of them round the head, just over the crown
    const h = jointScreen(s.rig, 'head', HEAD_PT);
    drawDizzy(ctx, R(h.x), R(h.y - s.rig.p.headR * s.rig.scale - 4), f);
  }
}

/** The grub's height out of the hole for a wormy apple `t` frames from its end: hidden, peeking, popping, up. */
function grubRise(t: number): number {
  if (t > PEEK_AT) return 0;
  if (t > POP_AT) return PEEK_RISE;
  const k = POP_AT - t;
  return k < POP_FRAMES ? PEEK_RISE + ((GRUB_RISE + POP_OVER - PEEK_RISE) * (k + 1)) / POP_FRAMES : GRUB_RISE;
}

function drawWormy(ctx: CanvasRenderingContext2D, s: JokeSeat, icon: string, size: number, f: number): void {
  const t = s.wormyT;
  if (t <= SHUDDER_AT) {
    // the shudder: tremble marks either side of the body, at the shoulders
    const n = jointScreen(s.rig, 'neck', HEAD_PT);
    drawShiver(ctx, n.x, n.y + 4, R((s.rig.width * s.rig.scale) / 2) + 2, f);
  }
  if (t <= TOSS_AT) return;                               // it has left the paw: art/orchardGags.ts has it now
  const p = jointScreen(s.rig, 'handN', PAW_PT), x = R(p.x), y = R(p.y) - 2, side = -s.facing;
  drawWormyApple(ctx, icon, x, y, size, side, false);
  // it rears back to blow: the raspberry is aimed AT the face, from a grub's length off it, not a lick
  const blowing = t <= PFFT_AT && t > PFFT_AT - TONGUE_FRAMES;
  drawGrub(ctx, holeX(x, side), holeY(y), grubRise(t), side, blowing ? -side * 3 : 0, blowing ? RASPBERRY : PLAIN);
}

/**
 * Barley's: the apple in the paw until the chomp, and the grub standing in his open mouth from the gape to the drop -
 * the muzzle's own mouth point (content/critters/common.ts muzzleGeom, as drawCritterMouth places it), turned with
 * the head and mapped to the screen the way lib/art/rig.ts jointScreen maps a joint.
 */
function drawBarley(ctx: CanvasRenderingContext2D, s: JokeSeat, icon: string, size: number, f: number): void {
  const t = s.wormyT;
  if (t > CHOMP_AT) {
    const p = jointScreen(s.rig, 'handN', PAW_PT);
    drawWormyApple(ctx, icon, R(p.x), R(p.y) - 2, size, -s.facing, false);
    return;
  }
  if (t > GAPE_AT || t <= DROP_AT) return;
  const m = mouthScreen(s.rig as CritterRig, MOUTH_PT), k = GAPE_AT - t;
  const rise = k < POP_FRAMES ? ((GRUB_RISE + POP_OVER) * (k + 1)) / POP_FRAMES : GRUB_RISE;
  // leaning out past the muzzle tip, so it stands in front of the face rather than over the nose; and for HI! it
  // waves - the whole grub swaying side to side, three px each way
  const lean = s.facing * GRUB_LEAN + (t <= HI_AT ? R(Math.sin(f * 0.35) * 3) : 0);
  drawGrub(ctx, R(m.x), R(m.y), rise, s.facing, lean, PLAIN);
}

/** The mouth on a critter's muzzle, in screen space, after the last drawRig of it. */
function mouthScreen(rig: CritterRig, out: Point): Point {
  const r = rig.p.headR, g = muzzleGeom(r, rig.build.muzzle != null ? rig.build.muzzle : 1);
  const mx = g.mx + R(g.rx * 0.2), my = g.my + R(g.ry * 0.45);
  const a = rig.joints.headAngle * DEG, c = Math.cos(a), sn = Math.sin(a), hd = rig.joints.head;
  const jx = hd.x + mx * c - my * sn, jy = hd.y + mx * sn + my * c, tf = rig.tf;
  const lx = jx * tf.c - jy * tf.s + tf.rx, ly = jx * tf.s + jy * tf.c + tf.ry;
  out.x = tf.x + lx * tf.fs; out.y = tf.y + ly * tf.ss;
  return out;
}
