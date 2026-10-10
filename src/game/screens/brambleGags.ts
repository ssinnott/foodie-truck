// BRAMBLE BANK - THE JOKES (docs/GDD.md section 5; the shared kit is game/gags.ts). The bank's two, both built the
// orchard bomb's way - a seeded deal on a berry the crew was going to pick anyway, a TELL drawn on the bush, a held
// beat on the seat with the stick locked, a BANG with its own word card and sound, and a LOOK - and both dealt by
// the ONE roll a ripening berry already made (dealBerry), so no berry is ever both:
//
//   THE THORN        a bramble drawn across the berry. The reach goes in, the thorn goes in and the critter goes
//                    rigid; OW!, a leap straight up, a landing, and four hops on one foot blowing on the pricked paw
//                    while the bush shakes its leaves out. The berry is still there for the next reach, the thorn gone.
//   THE SQUISHY ONE  the berry ripens twice the size, glossy, wobbling on its spot. Picked, it is held up to be
//                    admired; it wobbles, it swells - SPLUT! - and the critter stands coated head to toe in its
//                    juice, blinking out of it and dripping, then licks a paw (MMM!) and shakes it off. The squished
//                    berry is not scored (the bomb's rule) and its spot is a green pea again. Barley, the hungry one,
//                    licks itself clean instead: nom, nom, nom, the juice going a third at a time.
//
// Neither costs a point, a berry already banked or anything but the time. Both are sim state on the seat (prickT,
// squishT, spot): countdowns stepped from the screen's update(), every random number from the rng singleton, nothing
// read back from a draw. The word cards, the particles, the bush's shake and the juice on the path are cosmetic, on
// their own pools and the visit's own stream (`vis`), and stay out of checksumFields(). Split out of the screen
// (game/screens/bramble.ts) for its size: the screen owns the bank and calls in here.
import { UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt, burstCrumbs, burstDust } from '../../art/fx.ts';
import type { RigWeapon } from '../../lib/art/rig.ts';
import { seatAnim, RIBBON_BASKET } from '../minigame.ts';
import { gagBurst, gagBubble, gagHush, overHead } from '../gags.ts';
import type { GagCard } from '../gags.ts';
import { BUSH, BERRY_S, SPOTS, SWOLLEN, SWELL_MAX, PRICK_RISE } from '../../art/brambleProps.ts';
import { BUSH_X, ROWS } from '../../art/backgrounds/bramble.ts';
import type { BrambleScreen, BrambleSeat, Bush } from './bramble.ts';

/**
 * The seat's own ribbon basket (game/minigame.ts RIBBON_BASKET) in its FAR paw: where the basket goes while a joke
 * has the near paw busy (art/brambleProps.ts says why), so it hangs behind the critter and never vanishes.
 */
export const FAR_BASKET: RigWeapon = { attach: 'handL', length: RIBBON_BASKET.length, draw: RIBBON_BASKET.draw };

/**
 * THE DEAL: one roll per ripening berry, 1..DEAL_ODDS - the squishy one on SQUISH_ROLL, a thorn on THORN_ROLL, a
 * plain berry on anything else. One berry in seven each, two in seven between them: a bank round asks for four to
 * eight berries, so about three rounds in four show a joke (1 - (5/7)^4 is .74, and .87 over six picks) without one
 * berry in two being one. The thorn used to be one in eight on a round of four, and most rounds never saw it.
 */
export const DEAL_ODDS = 7, SQUISH_ROLL = 1, THORN_ROLL = 2;
/**
 * THE THORN, one countdown on the seat (`prickT`, from PRICK_TOTAL down), its keys the `pricked` pose's
 * (art/brambleProps.ts) one for one:
 *   PRICK_REACH   the near paw goes up into the bush; at its end the thorn goes in (the prick's tick, a cream ring);
 *   PRICK_FREEZE  rigid, stretched tall, teeth gritted: the beat before the bang;
 *   PRICK_LEAP    OW! - the crouch (LEAP_CROUCH), the leap straight up (LEAP_AIR) and the landing's squash, with the
 *                 bush shaking (BUSH_SHAKE frames) and its leaves flying;
 *   PRICK_HOP     four hops on one foot, blowing on the paw;
 *   PRICK_SETTLE  back to the basket. 70 frames: the old prick was 24, and nobody noticed it.
 */
export const PRICK_REACH = 6, PRICK_FREEZE = 6, PRICK_LEAP = 14, PRICK_HOP = 36, PRICK_SETTLE = 8;
export const PRICK_TOTAL = PRICK_REACH + PRICK_FREEZE + PRICK_LEAP + PRICK_HOP + PRICK_SETTLE;
const LEAP_CROUCH = 2, LEAP_AIR = 6;
/** Frames the pricked bush shakes for, from the OW!. */
export const BUSH_SHAKE = 24;
/**
 * THE SQUISHY ONE, one countdown on the seat (`squishT`, from SQUISH_TOTAL down):
 *   SQUISH_HOLD   the wind-up: up in the paw and admired; SQUISH_SWELL frames in it starts to wobble ('!') and
 *                 swells from SWOLLEN to SWELL_MAX times a berry's size; the bang lands as the hold ends;
 *   SQUISH_DRIP   the look: coated in the berry's juice (art/brambleProps.ts JUICE), dripping, blinking;
 *   SQUISH_LICK   a paw licked, MMM!;
 *   SQUISH_SHAKE  shaken off like a wet dog, the juice line sweeping down the body as it goes.
 * 140 frames, ten more than the orchard's bomb. Barley's look is GULP_LOOK instead (below), so Barley's whole
 * countdown is GULP_TOTAL.
 */
export const SQUISH_HOLD = 30, SQUISH_SWELL = 14, SQUISH_DRIP = 70, SQUISH_LICK = 24, SQUISH_SHAKE = 16;
export const SQUISH_LOOK = SQUISH_DRIP + SQUISH_LICK + SQUISH_SHAKE, SQUISH_TOTAL = SQUISH_HOLD + SQUISH_LOOK;
/**
 * BARLEY EATS THE EVIDENCE: a beat of shock (GULP_SHOCK, the first keys of `drip`: long enough to read the SPLUT!
 * before MMM! knocks it away), then GULP_LICKS licks of GULP_LICK frames each, the paw at the mouth GULP_NOM frames
 * into each (nom, crumbs of berry, a third of the juice gone), then a pat of the tummy (GULP_PAT). Clean 74 frames
 * after the bang instead of 110, and a seat 124 frames in the joke instead of 140: the hungry one's way is quicker.
 */
export const GULP_SHOCK = 30, GULP_LICK = 18, GULP_LICKS = 3, GULP_NOM = 8, GULP_PAT = 10;
export const GULP_LOOK = GULP_SHOCK + GULP_LICK * GULP_LICKS + GULP_PAT, GULP_TOTAL = SQUISH_HOLD + GULP_LOOK;
/** The hungry one (content/critters/barley.ts). */
const HUNGRY = 'barley';
/** A drop of juice off a coated critter every DRIP_EVERY frames. */
const DRIP_EVERY = 7;
/** Rows above overHead() a bang's card is centred on (game/gags.ts), so it sits over the plate and the face stays clear. */
const BURST_UP = 16;
/** Where the held berry is, near enough (heldX): a head's radius and HELD_DX px out in front of the feet. */
const HELD_DX = 8;
/** The held berry wobbles at the bush's pace until the '!', faster after it, and at the double for the hold's last FRANTIC frames. */
const FRANTIC = 8;
const OW = 'OW!', SPLUT = 'SPLUT!', NOTICE = '!', MMM = 'MMM!';
/**
 * The particles, built once (ARCHITECTURE section 8); the berry's and the juice's colours are written in by
 * setJuice() when a visit opens, and the floors per seat as they spawn. Drops of the berry's own flesh and of its
 * juice from the bang, single drips off a coated critter, a spray off the shake, and the bush's own leaves.
 */
const PULP = { speed: 4.4, up: 2.6, color: '', size: 4, sizeJitter: 1, life: 40, floor: 0, screen: true };
const SPRAY = { speed: 3.4, up: 1.8, color: '', size: 4, sizeJitter: 1, life: 48, floor: 0, screen: true };
const DRIP = { vx: 0, vy: 0.6, color: '', size: 4, gravity: 0.22, life: 30, floor: 0, screen: true };
const FLING = { speed: 3.6, up: 1.2, color: '', size: 4, life: 30, floor: 0, screen: true };
/**
 * The bush's leaves, thrown up over the bank to show against the dark hedge - in its lit green and the pale green of
 * an unripe pea, because its own darker greens vanish into the bush they came off.
 */
const LEAVES = { speed: 3, up: 3.2, color: BUSH.leafLit, color2: BUSH.green, size: 5, life: 80, screen: true };
/** The splash drawn in the paw for the first SPLASH_FRAMES of the bang, growing from SPLASH_R0 by SPLASH_GROW a frame. */
export const SPLASH_FRAMES = 5, SPLASH_R0 = 8, SPLASH_GROW = 2;

/** The visit's berry and its juice, for the particles (the screen's enter()). */
export function setJuice(hex: string, juice: string): void { PULP.color = hex; SPRAY.color = DRIP.color = FLING.color = juice; }

/**
 * Put a word card up over a seat, knocking its last one away first: game/gags.ts cards age on their own, and the
 * squishy one's '!' was still up when its SPLUT! landed on top of it, its rim showing round the burst. One card over
 * a head at a time - the bang interrupts the remark (gagHush). Cosmetic: the card's own life is all that is touched.
 */
function say(s: BrambleSeat, card: GagCard): void {
  if (s.card !== card) gagHush(s.card, s.colour);
  s.card = card;
}

/**
 * The deal, for a berry that has just ripened (or was ripe when the truck pulled up) on spot `k` of bush `b`: ONE
 * roll from the rng singleton - the same one roll the thorn alone used to make, so the stream keeps its shape.
 */
export function dealBerry(b: Bush, k: number): void {
  const bit = 1 << k, roll = rng.int(1, DEAL_ODDS);
  b.thorn = roll === THORN_ROLL ? b.thorn | bit : b.thorn & ~bit;
  b.squish = roll === SQUISH_ROLL ? b.squish | bit : b.squish & ~bit;
}

// ---------------------------------------------------------------- the thorn

/** The reach goes in at spot `k` of bush `i` with the near paw (the basket to the far one): the beat runs in stepPrick. */
export function startPrick(sc: BrambleScreen, s: BrambleSeat, i: number, k: number): void {
  sc.pricks++;
  s.prickT = PRICK_TOTAL; s.spot = i * SPOTS + k; s.moving = false;
  s.rig.weapon = FAR_BASKET;
  seatAnim(s, 'pricked', true);
}

/**
 * One frame of the thorn: the prick, the OW! and the leap, the landing, the hops, the basket back in the near paw
 * at the end (the bush shakes on its own clock). The OW! card goes up PRICK_RISE further than a standing bang's,
 * because the critter does: centred over a standing head, the leap carried the name plate up under it.
 */
export function stepPrick(sc: BrambleScreen, s: BrambleSeat): void {
  const e = PRICK_TOTAL - --s.prickT, audio = sc.game.audio;
  if (e === PRICK_REACH) {
    // the paw is in the bush: a cream ring on the berry, never SIGNAL.hot - nothing on this bank is a danger
    ringAt(sc.spotX(s.spot), sc.spotY(s.spot), 3, 12, UI.cream, 2, 12, false, true);
    audio.play('prick');
  } else if (e === PRICK_REACH + PRICK_FREEZE) {
    const i = (s.spot / SPOTS) | 0;
    say(s, gagBurst(s.x, overHead(s) - BURST_UP - PRICK_RISE, OW, s.colour));
    sc.shakes[i] = BUSH_SHAKE;
    particles.burst('leaf', BUSH_X[i], ROWS.bushBase - 32, 12, LEAVES);
    audio.play('bramble_ow'); audio.play('bramble_rustle');
  } else if (e === PRICK_REACH + PRICK_FREEZE + LEAP_CROUCH + LEAP_AIR) burstDust(s.x, s.y, 5, 1.6, true);
  else if (e === PRICK_REACH + PRICK_FREEZE + PRICK_LEAP || e === PRICK_REACH + PRICK_FREEZE + PRICK_LEAP + PRICK_HOP / 2) audio.play('bramble_blow');
  if (s.prickT === 0) { s.spot = -1; s.rig.weapon = RIBBON_BASKET; }
}

// ---------------------------------------------------------------- the squishy one

/** The squishy one picked at spot `k` of bush `i` (the screen has taken it off the bush): up in the near paw, the basket to the far one. */
export function startSquish(sc: BrambleScreen, s: BrambleSeat, i: number, k: number): void {
  s.squishT = s.critter === HUNGRY ? GULP_TOTAL : SQUISH_TOTAL; s.spot = i * SPOTS + k; s.moving = false;
  s.rig.weapon = FAR_BASKET;
  seatAnim(s, 'admire', true);
  sc.game.audio.play('grip');
}

/** Frames since the squishy one was picked. */
function elapsed(s: BrambleSeat): number { return (s.critter === HUNGRY ? GULP_TOTAL : SQUISH_TOTAL) - s.squishT; }

/** True while a seat still has the squishy one in its paw (the hold, before the bang): the screen draws it there. */
export function holding(s: BrambleSeat): boolean { return s.squishT > 0 && elapsed(s) < SQUISH_HOLD; }

/** One frame of the squishy one: the hold, the '!', the bang, then the look - Barley's, or everyone else's. */
export function stepSquish(sc: BrambleScreen, s: BrambleSeat): void {
  s.squishT--;
  const e = elapsed(s);
  if (e === SQUISH_SWELL) { say(s, gagBubble(s.x, overHead(s), NOTICE, s.colour)); sc.game.audio.play('bramble_wobble'); }
  else if (e === SQUISH_HOLD) splut(sc, s);
  else if (s.squishT === 0) recover(s);
  else if (e > SQUISH_HOLD) {
    if (s.critter === HUNGRY) stepGulp(sc, s, e - SQUISH_HOLD); else stepDrip(sc, s, e - SQUISH_HOLD);
  }
}

/**
 * Where the held berry is, near enough: out in front of the muzzle, from the rig's proportions (update() has no
 * joints to read). The bang's particles, its ring and the splash in the paw all go off here.
 */
export function heldX(s: BrambleSeat): number { return s.x + s.facing * (s.rig.p.headR + HELD_DX) * s.rig.scale; }
export function heldY(s: BrambleSeat): number { return s.y - (s.rig.height - s.rig.p.headR) * s.rig.scale; }

/** Frames since the bang while the splash is still in the paw (0..SPLASH_FRAMES-1), else -1 (draw-only). */
export function splashing(s: BrambleSeat): number {
  const t = s.squishT > 0 ? elapsed(s) - SQUISH_HOLD : -1;
  return t >= 0 && t < SPLASH_FRAMES ? t : -1;
}

/** SPLUT!: the berry goes in the paw - juice everywhere, a splat on the path, and the critter coated in it. */
function splut(sc: BrambleScreen, s: BrambleSeat): void {
  const x = heldX(s), y = heldY(s);
  sc.squishes++;
  seatAnim(s, 'drip', true);
  PULP.floor = SPRAY.floor = s.y + 2;
  particles.burst('drop', x, y, 16, PULP);
  particles.burst('drop', x, y, 22, SPRAY);
  ringAt(x, y, 6, 30, UI.cream, 3, 14, false, true);
  sc.splat(s.x + s.facing * 4, s.y + 2);
  say(s, gagBurst(s.x, overHead(s) - BURST_UP, SPLUT, s.colour));
  sc.game.audio.play('bramble_splut');
}

/** Everyone but Barley, `t` frames after the bang: dripping, then the lick, then the shake. */
function stepDrip(sc: BrambleScreen, s: BrambleSeat, t: number): void {
  const audio = sc.game.audio;
  if (t === SQUISH_DRIP) { seatAnim(s, 'lick', true); say(s, gagBubble(s.x, overHead(s), MMM, s.colour)); audio.play('bramble_slurp'); }
  else if (t === SQUISH_DRIP + SQUISH_LICK) { seatAnim(s, 'shakeOff', true); fling(s); audio.play('bramble_shake'); }
  else if (t === SQUISH_DRIP + SQUISH_LICK + SQUISH_SHAKE / 2) fling(s);
  else if (t < SQUISH_DRIP + SQUISH_LICK && t % DRIP_EVERY === 0) drip(sc, s);
}

/** Barley, `t` frames after the bang: the shock, three licks clean (nom), a pat of the tummy. */
function stepGulp(sc: BrambleScreen, s: BrambleSeat, t: number): void {
  const lick = t - GULP_SHOCK, licking = GULP_LICK * GULP_LICKS;
  if (lick === 0) { seatAnim(s, 'slurp', true); say(s, gagBubble(s.x, overHead(s), MMM, s.colour)); sc.game.audio.play('bramble_slurp'); }
  else if (lick === licking) seatAnim(s, 'pat', true);
  else if (lick > 0 && lick < licking && lick % GULP_LICK === GULP_NOM) {
    sc.game.audio.play('nom');
    burstCrumbs(heldX(s), heldY(s) + 6, s.y + 1, sc.hex, 4, true);   // crumbs of berry: the evidence going
  }
  if (t % DRIP_EVERY === 0 && juiceLeft(s) > 0) drip(sc, s);
}

/** One drop of juice off a coated critter, from a point on its body drawn from the visit's cosmetic stream (never the sim's rng). */
function drip(sc: BrambleScreen, s: BrambleSeat): void {
  const half = (s.rig.width >> 1) - 3, h = s.rig.height * s.rig.scale;
  DRIP.floor = s.y + 1;
  particles.spawn('drop', s.x + sc.vis.int(-half, half), s.y - sc.vis.int(10, h - 10), DRIP);
}

/** The shake flings the juice off: a spray either side of the body. */
function fling(s: BrambleSeat): void {
  FLING.floor = s.y + 2;
  particles.burst('drop', s.x, s.y - ((s.rig.height * s.rig.scale) >> 1), 10, FLING);
}

/** Shaken off, or licked clean: the basket back in the paw, and the seat a player again. */
function recover(s: BrambleSeat): void {
  s.rig.weapon = RIBBON_BASKET; s.spot = -1;
  seatAnim(s, 'carry', true);
}

/**
 * How much of a seat is still coated, 0..1, read DOWN from the top of the head - the screen coats the rows below
 * that line - so the juice can leave the way it came: none until the bang, all of it through the drip and the lick,
 * then the line sweeps down the body through the shake, or for Barley drops a third at every nom. Pure: squishT and
 * the constants, so the draw and the summary agree and update() never needs it.
 */
export function juiceLeft(s: BrambleSeat): number {
  if (s.squishT <= 0) return 0;
  if (s.critter === HUNGRY) {
    if (s.squishT > GULP_LOOK) return 0;
    const lick = GULP_LOOK - s.squishT - GULP_SHOCK;
    const noms = lick < GULP_NOM ? 0 : Math.min(GULP_LICKS, (((lick - GULP_NOM) / GULP_LICK) | 0) + 1);
    return 1 - noms / GULP_LICKS;
  }
  if (s.squishT > SQUISH_LOOK) return 0;
  return s.squishT >= SQUISH_SHAKE ? 1 : s.squishT / SQUISH_SHAKE;
}

/** The held berry's half-size this frame (draw-only): SWOLLEN times a berry until the '!', then swelling to SWELL_MAX at the bang. */
export function heldSize(s: BrambleSeat): number {
  const e = elapsed(s), k = e <= SQUISH_SWELL ? 0 : Math.min(1, (e - SQUISH_SWELL) / (SQUISH_HOLD - SQUISH_SWELL));
  return BERRY_S * (SWOLLEN + (SWELL_MAX - SWOLLEN) * k);
}

/** The held berry's wobble phase on frame `f` (draw-only): the bush's slow sway, then faster, then frantic. */
export function heldPhase(s: BrambleSeat, f: number): number {
  const e = elapsed(s);
  return e < SQUISH_SWELL ? f >> 3 : e < SQUISH_HOLD - FRANTIC ? f >> 2 : f >> 1;
}

/** The round ended mid-joke (the screen's finish()): every beat dropped where it stood, the basket back in the paw. */
export function endJokes(s: BrambleSeat): void {
  s.prickT = 0; s.squishT = 0; s.spot = -1;
  s.rig.weapon = RIBBON_BASKET;
}
