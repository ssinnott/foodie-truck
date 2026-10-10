// THE BYRE'S TWO JOKES (docs/GDD.md section 5), run for screens/dairy.ts: the deal, both jokes' beats frame by frame,
// and the draw-only reading of those beats the screen hands to the cow, the tongue, the cowlick and the stars. Kept
// beside the screen rather than in it because the screen was already at its 600 lines (docs/ARCHITECTURE.md
// section 0), and because a joke is the one part of a stall that has a timeline.
//
// THE DEAL. Every pail a stall starts is a deal: one in JOKE_ODDS carries a joke, on a seeded squirt JOKE_FROM..JOKE_TO
// of it (never its first two and never its twelfth, whose hop is that pail's own beat), and the joke is the cowlick
// or the tail at even odds. It is kept as ONE count per stall - `jokeIn`, squirts to go, with `jokeKind` saying which
// joke is waiting at the end of it - so the two can never meet on a seat, and so a test can hold the jokes off the
// way it holds the finish line off (jokeIn = 999). Per pail and not per squirt, because the party's total is what a
// round is played to: a stall's squirts are the round's divided by the seats, and a squirt count dealt per stall
// (the tail's old 20..40) gave a four-seat round of four pails no joke at all, every time. One pail in three is a
// joke in four rounds out of five at four pails, whoever is milking.
//
// THE COWLICK (`lickT`, one countdown from LICK_TOTAL):
//   TELL      LICK_TELL: the cow turns her head round onto her near flank and eyes the milker sidelong, the tip of her
//             tongue out and wiggling. Milking goes on - the seat is free - and a moo says to look.
//   WIND-UP   LICK_WIND, buttons locked: the tongue unrolls toward the milker's face, who freezes and stares up at
//             it; the '!' goes up at the last moment.
//   BANG      SHLURP!: one big lick up the face. The milker is lifted onto its toes with its eyes squeezed shut.
//   LOOK      LICK_LOOK, buttons still locked: the fur it licked is left standing straight up in a quiff. The milker
//             stares up at it, takes hold and pats it down over its brow... lets go: BOING, back up it springs...
//             pats it down again... BOING... holds it down a good while, and this time it stays. The cow has long
//             since turned back to her hay.
// THE TAIL (`swishT`, one countdown from SWISH_TOTAL), the old 20-frame flick made a joke. A sharp eye sees it
// coming: the tuft twitches for the last TWITCH squirts before it is due.
//   WIND-UP   SWISH_WIND, buttons locked: up goes the tail over the rump, swinging faster and faster with a whoosh at
//             every pass, the ears go back; the milker looks up ('!'), then hunches with its eyes shut.
//   BANG      THWAP!: the tail comes over and across the face, and the milker somersaults backward off the stool...
//   LOOK      ...lands on its bottom in the straw, and sits there with the stars going round its head;
//   RECOVERY  SWISH_CLIMB: it scrambles back up onto the stool.
// Neither costs anything: the pail keeps every squirt it had, and nothing in here touches `fill`, `churn` or a count.
//
// Determinism (docs/ARCHITECTURE.md section 0): the deal is the rng singleton's, drawn on the squirt that starts a
// joke (and in enter() for the first, as the bramble and the beach deal theirs); the beats are integer countdowns on
// the seat, in checksumFields(). The cards, the particles, the sounds and everything under "draw" read the sim and
// never write it, and the tongue, the cowlick and the stars are placed off the rig's joints after the seat's draw.
import { UI } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { tones } from '../../lib/art/shading.ts';
import { particles } from '../../engine/particles.ts';
import { drawShadow, ringAt, burstDust } from '../../art/fx.ts';
import { getCritter } from '../../content/critters/index.ts';
import { gagBurst, gagBubble, overHead, drawDizzy } from '../gags.ts';
import { seatAnim } from '../minigame.ts';
import { drawCow, MILK, SIT_ROOT_Y, TAIL_X, TAIL_Y, TAIL_UP, TAIL_LO, TAIL_REST, TAIL_LAG, TURN_MOUTH_X, TURN_MOUTH_Y } from '../../art/dairyProps.ts';
import { drawTongue, drawQuiff, drawLash, LAND_X } from '../../art/dairyGags.ts';
import type { DairyScreen, DairySeat } from './dairy.ts';

const R = Math.round;

/** The two jokes a stall can be dealt (`jokeKind`). */
export const LICK = 0, TAIL = 1;
/**
 * The deal: a pail carries a joke on a roll of 1 in JOKE_ODDS, on squirt JOKE_FROM..JOKE_TO of it. Pails are rolled
 * one at a time until one comes up, at most JOKE_CAP of them, so the gap between two jokes is a pail count that can
 * be one or eight and has no memory - every pail is the same 1 in 3 whatever the last one did.
 */
export const JOKE_ODDS = 3, JOKE_FROM = 3, JOKE_TO = 10, JOKE_CAP = 8;
/** The cowlick's countdown: the tell (seat free), the wind-up and the look (buttons locked); the bang is lickT == LICK_LOOK. */
export const LICK_TELL = 40, LICK_WIND = 24, LICK_LOOK = 128, LICK_TOTAL = LICK_TELL + LICK_WIND + LICK_LOOK;
/**
 * The cowlick in frames. The head comes round in LICK_TURN; the '!' pops LICK_SPOT frames before the bang; the lick
 * sweeps up the face in LICK_SWEEP and the tongue is reeled back in over LICK_BACK; the cow holds her look a smug
 * LICK_SMUG more before she turns back to her hay.
 */
const LICK_TURN = 8, LICK_SPOT = 10, LICK_SWEEP = 6, LICK_BACK = 8, LICK_SMUG = 10;
/**
 * The look's beats, counted down from LICK_LOOK (art/dairyGags.ts plays each as an anim of exactly this length):
 * LICKED on its toes and back down; STUN, staring up at the thing on its head; a PAT (the paw is up there from
 * PAT_ON frames in) and the spring back, BOING; a GLARE; the same again; then the PRESS that keeps it down and the
 * rest of the look smiling (quiffDone). LICKED + STUN is the 42 frames that let the SHLURP! card (56 frames, the
 * kit's) shrink away before the first BOING! goes up where it was.
 */
const LICKED = 20, STUN = 22, PAT = 14, PAT_ON = 5, GLARE = 12, PRESS = 18;
const STUN_AT = LICK_LOOK - LICKED, PAT_1 = STUN_AT - STUN, SPRING_1 = PAT_1 - PAT, PAT_2 = SPRING_1 - GLARE, SPRING_2 = PAT_2 - PAT;
const PRESS_AT = SPRING_2 - GLARE, DONE_AT = PRESS_AT - PRESS;
/** The tail's countdown: the wind-up, then the bang at swishT == SWISH_BANG, the spin, the dizzy sit and the climb. */
export const SWISH_WIND = 30, SWISH_SPIN = 18, SWISH_DIZZY = 48, SWISH_CLIMB = 14;
export const SWISH_BANG = SWISH_SPIN + SWISH_DIZZY + SWISH_CLIMB, SWISH_TOTAL = SWISH_WIND + SWISH_BANG;
/**
 * The tuft twitches for the last TWITCH squirts before a tail is due: the tell a sharp eye can see coming. The tail
 * cocks up and out behind to TWITCH_A, where the tuft flicks over the rump in clear air - hanging, it is behind the
 * milker's own body and the next stall's cow, and a twitch there was a twitch nobody saw.
 */
const TWITCH = 3, TWITCH_A = 120;
/**
 * The wind-up's swing: the tail goes up over LIFT frames to SWING_MID (straight up) and swings about it, its phase
 * pi * (frames / SWING_T)^2 so each pass comes sooner than the last, its reach growing from SWING_A0 to SWING_A1.
 * A whoosh plays at every pass through the middle: frames SWING_T * sqrt(n), worked out once below.
 */
const LIFT = 6, SWING_MID = 180, SWING_T = 14, SWING_A0 = 30, SWING_A1 = 54, SWING_LAG = 34;
const WHOOSH = new Int8Array(5);
for (let n = 0; n < WHOOSH.length; n++) WHOOSH[n] = R(SWING_T * Math.sqrt(n));
/** The lash: the tail's follow-through after the bang (LASH_A, trailing LASH_LAG) easing back to rest over SETTLE frames, and the swoosh's LASH frames. */
const LASH_A = 40, LASH_LAG = 40, SETTLE = 14, LASH = 7;
/** The swoosh's arc, canvas degrees about the tail's root: from over the rump, down across the milker, out behind it. */
const LASH_FROM = 222, LASH_TO = 38;
/** The tongue: poking out POKE px in the tell, unrolled to REACH of the way to the face with a CURL at its tip, SAG at its middle. */
const POKE = 5, REACH = 0.82, CURL = 4, SAG = 5;
/** Its width (px of pink) through the beats: the tip poking out, unrolling, and flat across a face for the lick. */
const TONGUE_POKE = 4, TONGUE_UNROLL = 5, TONGUE_LICK = 7;
/**
 * Where on the milker's head it goes, in head radii from the head joint (x toward the face): the face it unrolls
 * toward (the front of the muzzle), the chin the lick starts at, and the crown it ends over.
 */
const FACE_X = 0.7, FACE_Y = 0.35, CHIN_X = 0.6, CHIN_Y = 0.9, CROWN_X = 0.1, CROWN_Y = -1.3;
/**
 * The quiff springing up, frame by frame (1 stands, above it overshoots), how many frames the patted-down lock
 * takes to go at the end, and how many degrees it quivers either way while it stands.
 */
const SPRING = Float32Array.of(0.25, 0.7, 1.2, 1.32, 1.12, 0.9, 0.96, 1.05, 1);
const FADE = 12, QUIVER = 4;
/** Cards and their words: a burst BURST_UP rows over the head's bubble row, so it sits over the name plate. */
const BURST_UP = 16, NOTICE = '!', SHLURP = 'SHLURP!', BOING = 'BOING!', THWAP = 'THWAP!';
/** How far forward of the feet the seated head is, for the bang's ring and drops (draw-free: the joints are a draw's). */
const HEAD_FWD = 4;
/** The lick's slobber, a few milk-white drops off the face: the particle options, built once (`floor` is the seat's, set per bang). */
const SLOBBER = { speed: 1.6, up: 1.2, color: MILK, floor: 0, screen: true };

// ---------------------------------------------------------------- the sim
/**
 * Deal a stall's next joke: whole pails skipped on a 1 in JOKE_ODDS roll each, then a squirt into the pail that
 * carries it, and which joke. `left` is how many squirts are left of the pail the stall is on (0 for a fresh one,
 * which may itself carry the joke) and `pail` the squirts in a pail, so `jokeIn` counts every squirt from here.
 */
export function dealJoke(s: DairySeat, left: number, pail: number): void {
  let pails = 0;
  while (pails < JOKE_CAP && rng.int(1, JOKE_ODDS) !== 1) pails++;
  s.jokeIn = left + pails * pail + rng.int(JOKE_FROM, JOKE_TO);
  s.jokeKind = rng.int(LICK, TAIL);
}

/** True while either joke is playing on a seat (the cowlick's tell included). */
export function joking(s: DairySeat): boolean { return s.lickT > 0 || s.swishT > 0; }

/**
 * The joke a stall was dealt has come due on a squirt that is not a pail's twelfth. The next one is dealt at once;
 * a joke due while the other is still playing on this seat (a fast tapper can squirt through the cowlick's tell into
 * the next pail) is simply dealt again, so the two never share a seat.
 */
export function startJoke(sc: DairyScreen, s: DairySeat, left: number, pail: number): void {
  const kind = s.jokeKind, busy = joking(s);
  dealJoke(s, left, pail);
  if (busy) return;
  if (kind === LICK) { s.lickT = LICK_TOTAL; sc.game.audio.play('dairy_moo'); return; }
  s.swishT = SWISH_TOTAL; s.squirtT = 0;
  seatAnim(s, 'swishBrace', true);
  gagBubble(s.x + s.facing * HEAD_FWD, overHead(s), NOTICE, s.colour);
  sc.game.audio.play('swish');
}

/** One frame of whichever joke is playing on a seat. True while it holds the buttons: everything but the cowlick's tell. */
export function stepJoke(sc: DairyScreen, s: DairySeat): boolean {
  if (s.swishT > 0) { stepTail(sc, s); return s.swishT > 0; }
  if (s.lickT > 0) { stepLick(sc, s); return s.lickT > 0 && s.lickT <= LICK_WIND + LICK_LOOK; }
  return false;
}

/** The round is over (or the screen is leaving): no joke survives the end sign. */
export function clearJoke(s: DairySeat): void { s.lickT = 0; s.swishT = 0; }

function stepLick(sc: DairyScreen, s: DairySeat): void {
  const t = --s.lickT, hx = s.x + s.facing * HEAD_FWD;
  if (t === LICK_WIND + LICK_LOOK) { s.squirtT = 0; seatAnim(s, 'lickWait', true); }
  else if (t === LICK_LOOK + LICK_SPOT) gagBubble(hx, overHead(s), NOTICE, s.colour);
  else if (t === LICK_LOOK) {
    // the bang: SHLURP!, a ring and the slobber off the face, and up it goes onto its toes
    sc.licks++;
    const hy = headY(s);
    gagBurst(hx, overHead(s) - BURST_UP, SHLURP, s.colour);
    ringAt(hx, hy, 4, 18, UI.cream, 2, 12, false, true);
    SLOBBER.floor = s.y; particles.burst('drop', hx, hy, 5, SLOBBER);
    seatAnim(s, 'licked', true);
    sc.game.audio.play('dairy_shlurp');
  } else if (t === STUN_AT) seatAnim(s, 'quiffStun', true);
  else if (t === PAT_1 || t === PAT_2) seatAnim(s, 'quiffPat', true);
  else if (t === SPRING_1 || t === SPRING_2) {
    // over the quiff and the name plate it has pushed up (quiffClear), not over the head the plate usually sits on
    gagBubble(hx, overHead(s) - quiffClear(s), BOING, s.colour);
    seatAnim(s, 'quiffGlare', true);
    sc.game.audio.play('dairy_boing');
  } else if (t === PRESS_AT) seatAnim(s, 'quiffPress', true);
  else if (t === DONE_AT) seatAnim(s, 'quiffDone', true);
  else if (t === 0) seatAnim(s, 'milkIdle', true);
}

function stepTail(sc: DairyScreen, s: DairySeat): void {
  const t = --s.swishT, e = SWISH_TOTAL - t;
  if (t > SWISH_BANG) { for (let n = 1; n < WHOOSH.length; n++) if (WHOOSH[n] === e) sc.game.audio.play('swish'); }
  else if (t === SWISH_BANG) {
    // the bang: THWAP!, and off the stool it goes
    sc.swishes++;
    const hx = s.x + s.facing * HEAD_FWD;
    gagBurst(hx, overHead(s) - BURST_UP, THWAP, s.colour);
    ringAt(hx, headY(s), 4, 22, UI.cream, 2, 12, false, true);
    seatAnim(s, 'thwapSpin', true);
    sc.game.audio.play('dairy_thwap');
  } else if (t === SWISH_DIZZY + SWISH_CLIMB) {
    // down on its bottom in the straw, LAND_X behind the stool
    burstDust(s.x + s.facing * LAND_X * s.rig.scale, s.y, 6, 1.4, true);
    seatAnim(s, 'thwapSit', true);
    sc.game.audio.play('dairy_flump');
  } else if (t === SWISH_CLIMB) seatAnim(s, 'thwapClimb', true);
  else if (t === 0) seatAnim(s, 'milkIdle', true);
}

/** The seated head's centre row from the rig's proportions (update() has no joints to read: those are a draw's). */
function headY(s: DairySeat): number { return R(s.y + SIT_ROOT_Y - (s.rig.height - s.rig.p.headR) * s.rig.scale); }

// ---------------------------------------------------------------- draw (reads the sim, writes nothing)
/** How far round the cow has her head this frame (art/dairyProps.ts drawCow `look`): round for the tell, back after the lick. */
function cowLook(s: DairySeat): number {
  const t = s.lickT, back = LICK_LOOK - LICK_SWEEP - LICK_BACK - LICK_SMUG;
  if (t <= 0) return 0;
  if (t > LICK_WIND + LICK_LOOK) return Math.min(1, (LICK_TOTAL - t) / LICK_TURN);
  return t > back ? 1 : Math.max(0, (t - back + LICK_TURN) / LICK_TURN);
}

/**
 * The stall's cow, with whatever her jokes are doing to her: the head round for the cowlick, the tail and the ears
 * through the swish, and the two tells - her ear flicking before a cowlick is due, her tuft twitching before a tail
 * is. `chew` is the screen's slow jaw beat; a cow staring round at somebody does not chew.
 */
export function drawStallCow(ctx: CanvasRenderingContext2D, s: DairySeat, f: number, chew: number): void {
  const look = cowLook(s), due = !joking(s) && s.jokeIn <= TWITCH;
  let a = TAIL_REST, lag = TAIL_LAG, ear = 0;
  if (s.swishT > SWISH_BANG) {
    // winding up: up over the rump and swinging, each pass sooner than the last, the tuft trailing like a whip
    const e = SWISH_TOTAL - s.swishT, up = Math.min(1, e / LIFT), phi = Math.PI * (e / SWING_T) * (e / SWING_T);
    const reach = SWING_A0 + (SWING_A1 - SWING_A0) * (e / SWISH_WIND);
    a = TAIL_REST + ((SWING_MID - TAIL_REST) + reach * Math.sin(phi)) * up;
    lag = TAIL_LAG + (-SWING_LAG * Math.cos(phi) - TAIL_LAG) * up;
    ear = up;
  } else if (s.swishT > SWISH_BANG - SETTLE) {
    // the follow-through, easing back to the hang
    const k = (SWISH_BANG - s.swishT) / SETTLE;
    a = LASH_A + (TAIL_REST - LASH_A) * k; lag = LASH_LAG + (TAIL_LAG - LASH_LAG) * k;
  } else if (due && s.jokeKind === TAIL) { a = TWITCH_A + 14 * Math.sin(f * 0.55); lag = 25 * Math.sin(f * 0.95); }
  if (due && s.jokeKind === LICK) ear = 0.5 + 0.5 * Math.sin(f * 0.5);
  drawCow(ctx, s.cowX, s.cowY, s.cow.kind, ear, a, look > 0 ? 0 : chew, 0, null, look, lag);
}

/** A second contact shadow under a seat the tail has thrown, wherever its rig's root has carried it (and shrinking as it flies). */
export function drawJokeShadow(ctx: CanvasRenderingContext2D, s: DairySeat): void {
  if (s.swishT <= 0 || s.swishT > SWISH_BANG) return;
  const p = s.player.pose.root, sc = s.rig.scale;
  drawShadow(ctx, s.x + s.facing * p.x * sc, s.y, s.rig.width + 6, 0.36, Math.max(0, -p.y * sc));
}

/** The head and near-paw joints of the seat's last draw (written in place). */
const HEAD: Point = { x: 0, y: 0 }, PAW: Point = { x: 0, y: 0 };
/** The standing cowlick's top above the head's top, in head radii (art/dairyGags.ts QUIFF rises 1.86 r off a root 0.9 r up). */
const QUIFF_TOP = 1.8;
/** The cowlick this frame (quiffState): [0] how far it stands (-1 none), [1] how far the paw has it pulled down. */
const QS = new Float32Array(2);

/**
 * The rows a standing cowlick reaches above the head's own crown, for the name plate to stand clear of (0: none).
 * The plate goes up once, when the quiff first stands, and comes down once, when it is pressed down for good: a
 * plate bobbing with every pat would be one more thing moving over a head that already has two.
 */
export function quiffClear(s: DairySeat): number {
  quiffState(s.lickT);
  if (QS[0] <= 0) return 0;
  return Math.max(0, R(s.rig.p.headR * s.rig.scale * QUIFF_TOP) - s.crown);
}

/**
 * The cowlick this frame, from the look's countdown, into QS: how far it stands (1 up, 0 pressed down for good,
 * above 1 the spring's overshoot, -1 no cowlick at all - before the tongue has swept past the crown, and once the
 * lick is over) and how far a pat has it pulled down to the paw (0..1, all the way PAT_ON frames into the pat).
 * It springs back up the frame the paw lets go: SPRING_1, SPRING_2. The press keeps it, and it stays down.
 */
function quiffState(t: number): void {
  const up = LICK_LOOK - LICK_SWEEP;
  QS[1] = 0;
  if (t <= 0 || t > up) { QS[0] = -1; return; }
  QS[0] = 1;
  if (t > PAT_1) { if (t > up - SPRING.length) QS[0] = SPRING[up - t]; }
  else if (t > SPRING_1) QS[1] = Math.min(1, (PAT_1 - t) / PAT_ON);
  else if (t > PAT_2) { if (SPRING_1 - t < SPRING.length) QS[0] = SPRING[SPRING_1 - t]; }
  else if (t > SPRING_2) QS[1] = Math.min(1, (PAT_2 - t) / PAT_ON);
  else if (t > PRESS_AT) { if (SPRING_2 - t < SPRING.length) QS[0] = SPRING[SPRING_2 - t]; }
  else if (t > DONE_AT) QS[1] = Math.min(1, (PRESS_AT - t) / PAT_ON);
  else QS[0] = 0;
}

/**
 * Everything a joke draws over its seat, after the sorted pass (the rig's joints are this frame's): the tongue and
 * the cowlick, the swoosh of the lash and the stars.
 */
export function drawJokeMarks(ctx: CanvasRenderingContext2D, s: DairySeat, f: number): void {
  if (s.lickT > 0) drawLick(ctx, s, f);
  if (s.swishT > 0 && s.swishT <= SWISH_BANG) {
    const t = s.swishT;
    if (t > SWISH_BANG - LASH) drawLash(ctx, s.cowX + TAIL_X, s.cowY + TAIL_Y, TAIL_UP + TAIL_LO, LASH_FROM, LASH_TO, (SWISH_BANG - t) / LASH);
    if (t <= SWISH_DIZZY + SWISH_CLIMB && t > SWISH_CLIMB) {
      const h = jointScreen(s.rig, 'head', HEAD);
      drawDizzy(ctx, h.x, h.y - s.rig.p.headR * s.rig.scale - 4, f);
    }
  }
}

/** The tongue through the cowlick's beats, from the cow's turned mouth to the milker's face; then the cowlick itself. */
function drawLick(ctx: CanvasRenderingContext2D, s: DairySeat, f: number): void {
  const t = s.lickT, rig = s.rig, r = rig.p.headR * rig.scale;
  const h = jointScreen(rig, 'head', HEAD);
  const mx = s.cowX + TURN_MOUTH_X, my = s.cowY + TURN_MOUTH_Y;
  const fx = h.x + s.facing * r * FACE_X, fy = h.y + r * FACE_Y, dx = fx - mx, dy = fy - my, d = Math.hypot(dx, dy) || 1;
  if (t > LICK_WIND + LICK_LOOK) {
    // the tell: just the tip, out and wiggling, once she is all the way round
    if (cowLook(s) >= 1) drawTongue(ctx, mx, my, mx + (dx / d) * (POKE + Math.sin(f * 0.35) * 1.5), my + (dy / d) * POKE + 1, 1, TONGUE_POKE, 0);
  } else if (t > LICK_LOOK) {
    // the wind-up: unrolling toward the face, the roll at its tip shrinking as it comes out
    const k = (LICK_WIND + LICK_LOOK - t) / LICK_WIND, e = k * k * (3 - 2 * k), len = POKE + (d * REACH - POKE) * e;
    drawTongue(ctx, mx, my, mx + (dx / d) * len, my + (dy / d) * len, SAG * e, TONGUE_UNROLL, R(CURL * (1 - e)));
  } else if (t > LICK_LOOK - LICK_SWEEP - LICK_BACK) {
    // the lick: the tip goes up the face from the chin to over the crown, then is reeled back in
    const chinX = h.x + s.facing * r * CHIN_X, chinY = h.y + r * CHIN_Y, topX = h.x + s.facing * r * CROWN_X, topY = h.y + r * CROWN_Y;
    let tx: number, ty: number;
    if (t > LICK_LOOK - LICK_SWEEP) { const k = (LICK_LOOK - t) / LICK_SWEEP; tx = chinX + (topX - chinX) * k; ty = chinY + (topY - chinY) * k; }
    else { const k = (LICK_LOOK - LICK_SWEEP - t) / LICK_BACK; tx = topX + (mx - topX) * k; ty = topY + (my - topY) * k; }
    drawTongue(ctx, mx, my, tx, ty, -SAG, TONGUE_LICK, 0);
  }
  quiffState(t);
  if (QS[0] < 0) return;
  // it turns with the head, while it stands it quivers, and a pat pulls its crest down to the top of the paw
  const lift = QS[0], hold = QS[1], fur = s.fur, quiver = lift === 1 && hold === 0 ? Math.sin(f * 0.4) * QUIVER : 0;
  const ang = s.facing * (rig.joints.headAngle + s.player.pose.root.rot + quiver);
  const paw = jointScreen(rig, 'handN', PAW), pawTop = paw.y - rig.p.handR * rig.scale * 0.8;
  drawQuiff(ctx, h.x, h.y, r * Math.min(1, t / FADE), ang, s.facing, lift, hold, paw.x, pawTop, fur, tones(rig, fur).sh);
}

/** The cowlick's fur: the critter's own, or for a cast member whose fur is skin (the human chef) the hair. */
export function quiffFur(s: DairySeat): string {
  const def = getCritter(s.critter);
  return def.species === 'human' ? s.rig.palette.hair : s.rig.palette.skin;
}
