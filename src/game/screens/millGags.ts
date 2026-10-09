// MILL - the two jokes (docs/GDD.md section 5 "Every mini-game has two jokes"; game/gags.ts is the kit they are
// drawn with). game/screens/mill.ts is the rule - the chutes, the sacks, the tie - and was already past the size
// guide, so the jokes' beats live here as plain functions over the screen's own sim fields, called from its
// update() and draw(); their art is art/millGags.ts. Both have the four beats every joke in the game has:
//
// THE CLOG - a deal on a chute WAKING, one wake in CLOG_ODDS. TELL: from the moment it pours, that chute rattles
// and coughs, a bulge slips down its spout a notch at a time and the flour comes out of it in slugs (it still fills
// a sack). WIND-UP: the clog reaches the lip and waits there, rattling; the first critter filling under it is the
// one it goes on - the spout shudders, the critter looks up, '!', and is stuck there watching it come. BANG: the
// whole clog lands at once - FWUMP!, the world bumps three rows - and the critter is gone under a heap of the
// visit's own flour (rice on a rice visit), which slumps until just its ears and its eyes are poking out of the top.
// LOOK: out it pops ghost-white (COAT.flour), blinks, and shakes the lot off in a cloud. Nobody comes to fill under
// it? It goes on its own, lands on the planks with a puff, and that is all. The sack keeps its fill throughout:
// nothing gained, nothing lost.
//
// THE SNEEZE - a deal on a sack TIED, one in SNEEZE_ODDS. As the tie beat ends: 'AH...', the head goes back... and
// it goes away again, the critter relaxes (the false start, the oldest sneeze gag there is) - then 'AH-AH...',
// bigger, on tiptoe - then ACHOO!: the world bumps two rows, a huge cloud of the visit's own dust goes up and the
// critter is blown back a hop, and stands there dusty and dazed with stars round its head. The fresh sack in the
// paw is untouched.
//
// The odds are set so a round usually shows one joke or the other without either becoming every other sack. Played
// by bots that walk to the nearest live spout and fill (120 rounds: one to four seats, targets of 4, 6 and 8 sacks),
// one tie in five and one wake in four put a critter in a joke in three rounds out of four (1.4 a round), and show a
// joke or a clog's heap on the planks in four out of five. The sneeze carries the short rounds a full party plays
// (many ties, two or three wakes); the clog carries the long solo ones, catching somebody about two times in five -
// a bot camped under the other spout never comes. The two never share a seat: a seat is caught by the clog only
// while it is filling, and it is not filling through a tie, a sneeze or a clog.
//
// Determinism (docs/ARCHITECTURE.md section 0): the only rng read is the clog's roll at the wake, inside update();
// every beat is a countdown on a sim field (Chute.clog / clogT / victim, MillSeat.clogT / sneezeT, the screen's
// clogs / spills / sneezes), all of them in the screen's checksumFields(). The cards, the bump, the particles, the
// coats and the heap on the bare planks (`spillT`) are cosmetic and read no rng.
import { UI, VIEW_W } from '../../constants.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { ringAt } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import { F } from '../../content/critters/common.ts';
import { CHUTE_X, ROWS } from '../../art/backgrounds/mill.ts';
import { WAKING, POURING, TAG_H } from '../../art/millProps.ts';
import {
  gagTonesFor, drawClogBulge, drawClogPlug, drawClogLump, drawHeapDome, drawHeapLip, drawStuckGrains, BULGE_Y0, BULGE_Y1,
} from '../../art/millGags.ts';
import { gagBurst, gagBubble, gagBump, overHead, drawDizzy, coat, COAT } from '../gags.ts';
import { seatAnim } from '../minigame.ts';
import type { MillScreen, MillSeat, Chute } from './mill.ts';

const R = Math.round;

// ---------------------------------------------------------------- the clog
/** The deal: one wake in CLOG_ODDS is a clogged chute (rolled in rollClog, from the screen's wake). */
export const CLOG_ODDS = 4;
/**
 * The clog's timeline on its chute, counted down on `Chute.clogT` while it pours:
 *   the TELL     CLOG_SLIDE frames, clogT CLOG_FRAMES down to CLOG_LIP: every RATTLE_EVERY the spout rattles
 *                (RATTLE_SHAKE frames of shake), coughs a puff out of its lip and the bulge slips SLIP frames' worth
 *                down a notch; the column sputters, but it still fills the sack under it;
 *   the READY    clogT HOLDS at CLOG_LIP: the bulge is stuck at the lip, the spout still rattling every RATTLE_EVERY
 *                and still sputtering - and the FIRST frame a seat is filling under it, it goes, on that seat (catchClog
 *                drops clogT to CLOG_UP). It waits for as long as the pour has CLOG_LIP frames left to shudder and
 *                drop in; then it goes on its own, onto the planks, as the chute runs dry. A clog that went on one
 *                set frame mostly missed: the player camping under the spout ties its first sack at frame 90 and
 *                was in its tie beat when that clog went at 96, and a player at the other spout never came at all.
 *                A clog that waits for somebody to fill under it is a clog that lands on somebody;
 *   CLOG_UP      the SHUDDER, CLOG_UP frames: the mouth is stopped (nothing pours) and the spout shakes two rows a
 *                frame - the catch's wind-up, frame for frame;
 *   CLOG_FALL    the lump drops out of the lip, and at clogT 0 it LANDS - on its catch, or on the planks - and the
 *                chute pours on clear.
 * Caught the moment it reaches the lip, it lands 96 + 30 = 126 frames in, with 204 of the pour's 330 still to run:
 * a pour that clogs is not a pour lost.
 */
export const CLOG_SLIDE = 96, RATTLE_EVERY = 16, RATTLE_SHAKE = 6, SLIP = 4, CLOG_UP = 30, CLOG_FALL = 6;
export const CLOG_LIP = CLOG_UP + 1, CLOG_FRAMES = CLOG_SLIDE + CLOG_LIP;
/** The notches the bulge slips down the spout in: one per rattle. */
const NOTCHES = CLOG_SLIDE / RATTLE_EVERY;
/**
 * The clog's beat on the seat it catches, counted down on `MillSeat.clogT` from CLOG_SEAT with the stick locked:
 *   clogT > HEAP + LOOK      the WIND-UP, CLOG_UP frames (the chute's own shudder and drop, frame for frame);
 *   clogT == HEAP + LOOK     FWUMP: the bang, and under the heap it goes;
 *   LOOK < clogT             the HEAP, HEAP_FRAMES: engulfed for HEAP_HOLD, slumping over HEAP_SETTLE until the ears
 *                            and then the eyes are out of the top, then blinking out of it;
 *   clogT == LOOK            out it pops, ghost-white, and stands there blinking (GHOST_FRAMES)...
 *   clogT <= SHAKE_FRAMES    ...then shakes it all off in a cloud, a puff every SHAKE_PUFF frames.
 * 30 + 40 + 60 = 130 frames, a whisker over two seconds: a joke and not a penalty.
 */
export const HEAP_FRAMES = 40, HEAP_HOLD = 10, HEAP_SETTLE = 8;
export const GHOST_FRAMES = 26, SHAKE_FRAMES = 34, LOOK_FRAMES = GHOST_FRAMES + SHAKE_FRAMES, SHAKE_PUFF = 4;
export const CLOG_SEAT = CLOG_UP + HEAP_FRAMES + LOOK_FRAMES;
/**
 * The buried crouch: the `buried` pose's root drop, which is also where the heap is built from - the head's centre
 * in that pose is the feet less the rig's height plus its head radius, plus BURY_Y (lib/art/rig.ts computeJoints,
 * torso and head upright). Settled, the flour line runs EYE_CLEAR rows under that centre, under the whites
 * (critterFace draws them from -0.42r - 2 to -2), so the eyes and everything above them are out of the flour, and
 * the dome behind stands DOME_RISE head-radii over the centre, so its shoulders stand up either side of the head
 * (the head is IN the heap, not perched on it). Engulfed, both stand DOME_OVER
 * rows over the tallest ear tip (Seat.crown).
 */
export const BURY_Y = 2;
const EYE_CLEAR = 1, DOME_RISE = 0.9, DOME_OVER = 4;
/**
 * The heap on the bare planks, under a clog that caught nobody (cosmetic, `spillT`): it stands SPILL_HIGH tall,
 * slumps to SPILL_LOW over SPILL_SETTLE after SPILL_HOLD, and goes up in a puff at SPILL_FRAMES.
 */
const SPILL_FRAMES = 44, SPILL_HOLD = 10, SPILL_SETTLE = 12, SPILL_HIGH = 46, SPILL_LOW = 20;

// ---------------------------------------------------------------- the sneeze
/** The deal: one sack tied in SNEEZE_ODDS puts the flour up the tier's nose (rolled in the screen's tie()). */
export const SNEEZE_ODDS = 5;
/**
 * The sneeze, counted down on `MillSeat.sneezeT` from SNEEZE_FRAMES as the tie beat ends, the stick locked and the
 * fresh sack in the paw untouched throughout:
 *   AH_FRAMES      'AH...': the head goes back and the eyes shut;
 *   LULL_FRAMES    ...and it goes away again: the bubble shrinks and the critter relaxes, relieved;
 *   AHAH_FRAMES    'AH-AH...', bigger: up on its toes, leaning right back;
 *   ACHOO_AT       ACHOO!: the head snaps forward (SNAP frames) and the critter is BLOWN BACK a hop, BLOWN_STEP px a
 *                  frame for BLOWN_HOP frames, BLOWN_FRAMES in all;
 *   DAZED_FRAMES   standing in its own cloud, dusty and dazed, stars round its head, a wisp every DAZED_PUFF.
 * 20 + 10 + 20 + 20 + 40 = 110 frames.
 */
export const AH_FRAMES = 20, LULL_FRAMES = 10, AHAH_FRAMES = 20, BLOWN_FRAMES = 20, DAZED_FRAMES = 40, DAZED_PUFF = 10;
export const SNEEZE_FRAMES = AH_FRAMES + LULL_FRAMES + AHAH_FRAMES + BLOWN_FRAMES + DAZED_FRAMES;
const LULL_AT = SNEEZE_FRAMES - AH_FRAMES, AHAH_AT = LULL_AT - LULL_FRAMES;
export const ACHOO_AT = AHAH_AT - AHAH_FRAMES;
export const SNAP = 3, BLOWN_HOP = 9, BLOWN_STEP = 2;
/** The ACHOO's cloud: ACHOO_PUFFS bursts of ACHOO_CLOUD puffs, ACHOO_REACH px apart out in front of the face. */
const ACHOO_PUFFS = 3, ACHOO_CLOUD = 9, ACHOO_REACH = 11;

// ---------------------------------------------------------------- the words and where they go
const LOOKOUT = '!', FWUMP = 'FWUMP!', AH = 'AH...', AHAH = 'AH-AH...', ACHOO = 'ACHOO!';
/**
 * A bubble's tail goes this far over overHead(): the mill stacks a fill tag on every name plate, and a bubble whose
 * tail stabbed the tag would hide the one gauge the player is reading. A bang's burst is centred BURST_UP over that.
 */
const OVER_TAG = TAG_H + 4, BURST_UP = 16;
/**
 * How long each bubble is up, in frames. The kit's bubble stays up 44 frames, which is longer than any of these
 * beats, and two remarks over one head is one too many: 'AH...' is gone half way through the lull, 'AH-AH...' goes
 * as ACHOO! comes, and '!' goes as the lump lands. The life is the card's own field (game/gags.ts GagCard).
 */
const AH_LIFE = AH_FRAMES + LULL_FRAMES / 2, AHAH_LIFE = AHAH_FRAMES + 2, LOOKOUT_LIFE = CLOG_UP;

// ---------------------------------------------------------------- the poses
/**
 * The jokes' poses, an AnimPlayer overlay merged into the screen's own MILL_ANIMS (content/critters/common.ts is not
 * ours to touch). Every one keeps the sack in the near paw at weapon 90, the shared `carry` grip, because the sack
 * never leaves the paw: that is the "nothing lost" a player can see. Keys timed to the beats above, so a beat
 * change is a pose change.
 *   lookUp    the head snaps back to stare up the spout; as the lump drops, eyes wide, mouth open, paws up.
 *   buried    under the heap: a 2-row crouch, eyes screwed shut while it is engulfed, then open, blinking, the
 *             head ticking side to side so the ears twitch out of the top. The sack stays at the carry grip, up
 *             beside the hip where the heap's flank covers it (hanging from a paw at rest it showed under the foot).
 *   ghost     pops up out of the heap with its arms out, lands, and stands stiff as a post, blinking twice.
 *   shakeOff  a four-frame wiggle, eyes shut, the head and the torso thrown side to side.
 *   ah, lull, ahah, achoo, dazed   the sneeze, beat for beat.
 */
export const MILL_GAG_ANIMS = Object.freeze({
  lookUp: { loop: false, frames: [
    F(5, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: -4, head: -16, root: [0, 0], face: 'neutral' }, { ease: 'out' }),
    F(CLOG_UP - CLOG_FALL - 5, { armR: [62, 48], armL: [-20, 8], weapon: 90, torso: -8, head: -28, root: [0, -1], face: 'neutral' }, { interp: false }),
    F(CLOG_FALL, { armR: [118, 16], armL: [-150, -14], weapon: 40, torso: -10, head: -30, root: [0, 0], squash: 1.04, face: 'shout' }),
  ] },
  buried: { loop: false, frames: [
    F(HEAP_HOLD + HEAP_SETTLE, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 0, root: [0, BURY_Y], face: 'closed' }, { interp: false }),
    F(8, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 0, root: [0, BURY_Y], face: 'neutral' }, { interp: false }),
    F(3, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 0, root: [0, BURY_Y], face: 'closed' }, { interp: false }),
    F(6, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 6, root: [0, BURY_Y], face: 'neutral' }, { interp: false }),
    F(3, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 6, root: [0, BURY_Y], face: 'closed' }, { interp: false }),
    F(2, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: -5, root: [0, BURY_Y], face: 'neutral' }),
  ] },
  ghost: { loop: false, frames: [
    F(2, { armR: [14, 12], armL: [-18, 8], weapon: 90, torso: 4, head: 0, root: [0, 4], squash: 1.1, face: 'closed' }, { ease: 'in' }),
    F(4, { armR: [46, 10], armL: [-48, 10], weapon: 90, torso: -2, head: -4, root: [0, -10], stretch: 1.06, face: 'neutral' }, { ease: 'out' }),
    F(3, { armR: [32, 8], armL: [-34, 8], weapon: 90, torso: 0, head: 0, root: [0, 1], squash: 1.05, face: 'neutral' }, { ease: 'inout' }),
    F(8, { armR: [26, 8], armL: [-28, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'neutral' }, { interp: false }),
    F(3, { armR: [26, 8], armL: [-28, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'closed' }, { interp: false }),
    F(4, { armR: [26, 8], armL: [-28, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'neutral' }, { interp: false }),
    F(2, { armR: [26, 8], armL: [-28, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'closed' }),
  ] },
  shakeOff: { loop: true, frames: [
    F(2, { armR: [42, 24], armL: [-46, 24], weapon: 90, torso: 9, head: 14, root: [2, 0], face: 'closed' }, { ease: 'inout' }),
    F(2, { armR: [36, 20], armL: [-40, 20], weapon: 90, torso: -9, head: -14, root: [-2, 0], face: 'closed' }, { ease: 'inout' }),
  ] },
  ah: { loop: false, frames: [
    F(7, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 0, head: 0, root: [0, 0], face: 'neutral' }, { ease: 'out' }),
    F(AH_FRAMES - 7, { armR: [62, 50], armL: [-22, 8], weapon: 90, torso: -9, head: -18, root: [0, -1], stretch: 1.04, face: 'closed' }),
  ] },
  lull: { loop: false, frames: [
    F(4, { armR: [62, 50], armL: [-22, 8], weapon: 90, torso: -9, head: -18, root: [0, -1], stretch: 1.04, face: 'closed' }, { ease: 'inout' }),
    F(LULL_FRAMES - 4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 3, head: 4, root: [0, 1], face: 'happy' }),
  ] },
  ahah: { loop: false, frames: [
    F(4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 3, head: 4, root: [0, 1], face: 'happy' }, { ease: 'out' }),
    F(7, { armR: [70, 44], armL: [-40, 2], weapon: 90, torso: -12, head: -22, root: [0, -2], stretch: 1.06, face: 'closed' }, { ease: 'inout' }),
    F(AHAH_FRAMES - 11, { armR: [78, 38], armL: [-62, -4], weapon: 90, torso: -18, head: -32, root: [0, -4], stretch: 1.09, face: 'closed' }),
  ] },
  achoo: { loop: false, frames: [
    F(SNAP, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 22, head: 30, root: [0, 2], squash: 1.1, face: 'shout' }, { interp: false, smear: { from: -30, to: 40, a: 0.35 } }),
    F(3, { armR: [96, 30], armL: [70, 30], weapon: 70, legR: [24, -30], legL: [-4, -20], torso: -8, head: -4, root: [0, -6], face: 'dazed' }, { ease: 'out' }),
    F(BLOWN_HOP - 3, { armR: [104, 30], armL: [84, 30], weapon: 60, legR: [30, -46], legL: [-6, -30], torso: -14, head: -10, root: [0, -11], stretch: 1.04, face: 'dazed' }, { ease: 'in' }),
    F(4, { armR: [60, 50], armL: [-18, 8], weapon: 90, legR: [16, 10], legL: [-10, 12], torso: 8, head: 6, root: [0, 2], squash: 1.08, face: 'dazed' }, { ease: 'out' }),
    F(BLOWN_FRAMES - SNAP - BLOWN_HOP - 4, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 2, head: 2, root: [0, 0], face: 'dazed' }),
  ] },
  dazed: { loop: true, frames: [
    F(10, { armR: [60, 50], armL: [-18, 8], weapon: 90, torso: 4, head: 8, root: [1, 0], face: 'dazed' }, { ease: 'inout' }),
    F(10, { armR: [58, 50], armL: [-16, 8], weapon: 90, torso: -3, head: -6, root: [-1, 0], face: 'dazed' }, { ease: 'inout' }),
  ] },
});

// ---------------------------------------------------------------- the particles (cosmetic: the pool's own stream)
/**
 * The cloud either joke throws up: soft smoke-kind puffs in the visit's own dust, drawn in front of the cast, born
 * big (a smoke puff grows to 2.3x its size over its life, and the bang's cloud has to be big on the frame it lands).
 */
const CLOUD = { speed: 2.6, up: 1.2, vx: 0, color: '', size: 7, sizeJitter: 2, screen: true };
/** A wisp coming off a dusty critter while it stands there. */
const WISP = { speed: 1.1, up: 0.7, color: '', size: 4, sizeJitter: 1, screen: true };
/** The dust a shake throws: flung out sideways, fast, low. */
const FLUNG = { speed: 2.6, up: 0.4, color: '', size: 6, sizeJitter: 2, screen: true };
/** Grains a bang throws on a rice (or oat) visit: crumbs that arc out and drop. */
const SPRAY = { speed: 2.8, up: 1.6, color: '', size: 3, gravity: 0.25, life: 34, vrot: 0, screen: true };
/** The spill's FWUMP is nobody's: played softer than one that lands on somebody. */
const SOFT = { volume: 0.6 };
/** Reused by the draw-side joint reads (zero allocation in draw()). */
const HEAD: Point = { x: 0, y: 0 }, BODY: Point = { x: 0, y: 0 };

/**
 * Set the jokes up for this visit, from enter(): the tones (what the heap and the dust are made of on this visit's
 * GRAINS record), the particles' colours, the counters and the cosmetic spill timers.
 */
export function enterJokes(sc: MillScreen): void {
  const t = gagTonesFor(sc.grain.id);
  sc.jokeTones = t;
  CLOUD.color = t.cloud; WISP.color = t.cloud; FLUNG.color = t.cloud; SPRAY.color = t.grain;
  sc.clogs = 0; sc.spills = 0; sc.sneezes = 0;
  sc.spillT = new Int16Array(CHUTE_X.length).fill(SPILL_FRAMES);
}

/** The seat's head centre standing up, in screen rows: from its proportions, so update() can aim at it. */
function headY(s: MillSeat): number { return R(s.y - (s.rig.height - s.rig.p.headR) * s.rig.scale); }

/** A remark over a seat's head, up for `life` frames (see AH_LIFE). */
function bubble(s: MillSeat, text: string, life: number): void {
  gagBubble(R(s.x), overHead(s) - OVER_TAG, text, s.colour).life = life;
}

// ---------------------------------------------------------------- the clog: the sim
/** The deal, from the screen's wake: one chute in CLOG_ODDS wakes with a clog in it. */
export function rollClog(c: Chute): void {
  c.clog = rng.int(1, CLOG_ODDS) === 1 ? 1 : 0;
  c.clogT = c.clog ? CLOG_FRAMES : 0;
  c.victim = -1;
}

/** True while the clog stops the lip (the shudder and the drop): nothing comes out, so nobody fills. */
export function chuteChoked(c: Chute): boolean { return c.clog === 1 && c.clogT < CLOG_UP; }

/** True through the READY: the clog stuck at the lip, waiting for somebody to fill under it. */
function clogReady(c: Chute): boolean { return c.clog === 1 && c.clogT === CLOG_LIP; }

/**
 * One pouring frame of a clogged chute, from updateChutes before the pour's own countdown: the rattles through the
 * tell, the hold at the lip (going on its own once the pour has only CLOG_LIP frames left, so its shudder and drop
 * end on the pour's last frame), then the shudder, the drop and the landing.
 */
export function stepClogChute(sc: MillScreen, i: number): void {
  const c = sc.chutes[i], x = CHUTE_X[i];
  if (c.clogT > CLOG_LIP) {
    const t = --c.clogT;
    if ((CLOG_FRAMES - t - 1) % RATTLE_EVERY === 0) rattle(sc, x, 3);
    return;
  }
  if (c.clogT === CLOG_LIP) {
    if (c.t > CLOG_LIP) { if (sc.frame % RATTLE_EVERY === 0) rattle(sc, x, 4); return; }
    c.clogT = CLOG_UP;                              // the pour is running dry and nobody came: it goes on its own
    sc.game.audio.play('mill_creak');
    return;
  }
  const t = --c.clogT;
  if (t === CLOG_FALL) particles.burst(sc.grain.puffKind, x, ROWS.mouth + 6, 5, sc.puffOpts);
  else if (t === 0) {
    if (c.victim < 0) spill(sc, i);                 // a catch lands it from its own countdown, on this frame too
    c.clog = 0; c.victim = -1;
  }
}

/** A rattle: the knocks down the spout and `n` puffs of the visit's dust coughed out of its lip. */
function rattle(sc: MillScreen, x: number, n: number): void {
  particles.burst(sc.grain.puffKind, x, ROWS.mouth + 6, n, sc.puffOpts);
  sc.game.audio.play('mill_rattle');
}

/**
 * The seats' pass, for a seat that has just filled from chute `ci`: if that chute's clog is at the lip and nobody is
 * its catch yet, this seat is - the first one filling in party order, the seat the column is landing on. The clog
 * goes at once (its shudder starts on this frame, so the two countdowns land on one frame), the stick locks and the
 * wind-up starts.
 */
export function catchClog(sc: MillScreen, s: MillSeat, ci: number): void {
  const c = sc.chutes[ci];
  if (!clogReady(c) || c.victim >= 0) return;
  c.clogT = CLOG_UP; c.victim = s.index;
  s.clogT = CLOG_SEAT; s.chute = -1; s.moving = false;
  seatAnim(s, 'lookUp', true);
  bubble(s, LOOKOUT, LOOKOUT_LIFE);
  sc.game.audio.play('mill_creak');
}

/** One frame of a caught seat's beat: the bang, the heap, the pop, the shake and the recovery. */
export function stepClog(sc: MillScreen, s: MillSeat): void {
  const t = --s.clogT;
  if (t === HEAP_FRAMES + LOOK_FRAMES) bury(sc, s);
  else if (t === LOOK_FRAMES) popOut(sc, s);
  else if (t === SHAKE_FRAMES) { seatAnim(s, 'shakeOff', true); sc.game.audio.play('mill_shake'); puffOff(sc, s, 10); }
  else if (t > 0 && t < SHAKE_FRAMES && t % SHAKE_PUFF === 0) puffOff(sc, s, 4);
  else if (t === 0) seatAnim(s, 'carry', true);
}

/** FWUMP: the clog lands on its catch, and under the heap it goes. */
function bury(sc: MillScreen, s: MillSeat): void {
  const x = R(s.x), y = headY(s);
  sc.clogs++;
  seatAnim(s, 'buried', true);
  gagBurst(x, overHead(s) - OVER_TAG - BURST_UP, FWUMP, s.colour);
  gagBump(3);
  CLOUD.vx = 0;
  particles.burst('smoke', x, y, 22, CLOUD);
  if (sc.jokeTones.grains) particles.burst('crumb', x, y, 14, SPRAY);
  ringAt(x, y + 12, 6, 38, UI.cream, 3, 14, false, true);
  sc.game.audio.play('mill_fwump');
}

/** Out of the heap it pops: the heap goes up in a cloud and the critter stands there in it, ghost-white. */
function popOut(sc: MillScreen, s: MillSeat): void {
  const x = R(s.x), y = R(s.y - 18);
  seatAnim(s, 'ghost', true);
  CLOUD.vx = 0;
  particles.burst('smoke', x, y, 12, CLOUD);
  if (sc.jokeTones.grains) particles.burst('crumb', x, y, 8, SPRAY);
  sc.game.audio.play('mill_pop');
}

/** A cloud off the critter as it shakes: `n` puffs flung out from its middle, and its grains thrown off on a rice day. */
function puffOff(sc: MillScreen, s: MillSeat, n: number): void {
  const x = R(s.x), y = R(s.y - s.rig.height * s.rig.scale * 0.5);
  particles.burst('smoke', x, y, n, FLUNG);
  if (sc.jokeTones.grains && n > 3) particles.burst('crumb', x, y, n, SPRAY);
}

/** Nobody under it: the clog lands on the planks, a heap stands there a moment (cosmetic) and goes up in a puff. */
function spill(sc: MillScreen, i: number): void {
  const x = CHUTE_X[i];
  sc.spills++;
  sc.spillT[i] = 0;
  gagBurst(x, ROWS.pile - SPILL_HIGH - BURST_UP, FWUMP);
  CLOUD.vx = 0;
  particles.burst('smoke', x, ROWS.pile - 16, 12, CLOUD);
  sc.game.audio.play('mill_fwump', SOFT);
}

/** The cosmetic heaps on the planks: aged every update, up in a puff when their time is up. */
export function stepSpills(sc: MillScreen): void {
  const st = sc.spillT;
  for (let i = 0; i < st.length; i++) {
    if (st[i] >= SPILL_FRAMES) continue;
    if (++st[i] === SPILL_FRAMES) {
      particles.burst('smoke', CHUTE_X[i], ROWS.pile - SPILL_LOW / 2, 10, WISP);
      if (sc.jokeTones.grains) particles.burst('crumb', CHUTE_X[i], ROWS.pile - SPILL_LOW / 2, 6, SPRAY);
    }
  }
}

// ---------------------------------------------------------------- the sneeze: the sim
/** The joke, part one: the tie beat is over, the fresh sack is in the paw, and 'AH...'. */
export function startSneeze(sc: MillScreen, s: MillSeat): void {
  s.sneezeDue = 0; s.sneezeT = SNEEZE_FRAMES; sc.sneezes++;
  seatAnim(s, 'ah', true);
  bubble(s, AH, AH_LIFE);
  sc.game.audio.play('mill_ah');
}

/** One frame of the sneeze: the lull, the bigger AH-AH, the ACHOO, the hop back, the dazed stand and the recovery. */
export function stepSneeze(sc: MillScreen, s: MillSeat): void {
  const t = --s.sneezeT;
  if (t === LULL_AT) seatAnim(s, 'lull', true);
  else if (t === AHAH_AT) { seatAnim(s, 'ahah', true); bubble(s, AHAH, AHAH_LIFE); sc.game.audio.play('mill_ahah'); }
  else if (t === ACHOO_AT) achoo(sc, s);
  else if (t < ACHOO_AT - SNAP && t >= ACHOO_AT - SNAP - BLOWN_HOP) s.x -= s.facing * BLOWN_STEP;   // the screen clamps it
  else if (t === DAZED_FRAMES) seatAnim(s, 'dazed', true);
  else if (t > 0 && t < DAZED_FRAMES && t % DAZED_PUFF === 0) particles.burst('smoke', R(s.x), headY(s), 2, WISP);
  else if (t === 0) seatAnim(s, 'carry', true);
}

/** ACHOO: the head snaps forward, the burst, a bump, and a cloud of the visit's own dust goes up off the face. */
function achoo(sc: MillScreen, s: MillSeat): void {
  const fx = R(s.x + s.facing * s.rig.p.headR * s.rig.scale), fy = headY(s) + 4;
  seatAnim(s, 'achoo', true);
  gagBurst(R(s.x), overHead(s) - OVER_TAG - BURST_UP, ACHOO, s.colour);
  gagBump(2);
  // the cloud is blown out along the line of the sneeze, so it is already big on the frame it goes off
  CLOUD.vx = s.facing * 1.4;
  for (let i = 0; i < ACHOO_PUFFS; i++) particles.burst('smoke', fx + s.facing * i * ACHOO_REACH, fy - (i & 1) * 6, ACHOO_CLOUD, CLOUD);
  CLOUD.vx = 0;
  if (sc.jokeTones.grains) particles.burst('crumb', fx, fy, 10, SPRAY);
  ringAt(fx, fy, 4, 28, UI.cream, 2, 12, false, true);
  sc.game.audio.play('sneeze');
}

/** The round is over (finish()): every joke stops where it is, on the seats and on the chutes. */
export function quietJokes(sc: MillScreen): void {
  for (let i = 0; i < sc.seats.length; i++) { const s = sc.seats[i]; s.sneezeT = 0; s.sneezeDue = 0; s.clogT = 0; }
  for (let i = 0; i < sc.chutes.length; i++) { const c = sc.chutes[i]; c.clog = 0; c.clogT = 0; c.victim = -1; }
}

// ---------------------------------------------------------------- the draw side (reads the sim, writes nothing)
/**
 * The shake a chute is drawn with this frame: the wake's 1 px; through the tell, a 1 px rattle for RATTLE_SHAKE
 * frames at each notch; stuck at the lip, the same rattle on the beat its knocks are played on (`f` is the screen's
 * frame); and the shudder, two rows a frame.
 */
export function chuteShake(c: Chute, f: number): number {
  if (c.state === WAKING) return f & 1;
  if (c.state !== POURING || c.clog !== 1) return 0;
  const rattling = (f & 1) ? 1 : -1;
  if (c.clogT > CLOG_LIP) return (CLOG_FRAMES - c.clogT - 1) % RATTLE_EVERY < RATTLE_SHAKE ? rattling : 0;
  if (c.clogT === CLOG_LIP) return f % RATTLE_EVERY < RATTLE_SHAKE ? rattling : 0;
  return c.clogT > CLOG_FALL ? rattling * 2 : 0;
}

/** The bulge's row: a notch further down the spout at every rattle, slipping over SLIP frames, at the lip from the ready on. */
function bulgeRow(c: Chute): number {
  if (c.clogT <= CLOG_LIP) return BULGE_Y1;
  const e = CLOG_FRAMES - c.clogT - 1, n = (e / RATTLE_EVERY) | 0, p = e % RATTLE_EVERY;
  return BULGE_Y0 + ((BULGE_Y1 - BULGE_Y0) * (n + (p < SLIP ? p / SLIP : 1))) / NOTCHES;
}

/** What a clogged chute carries over its spout, after drawChute: the bulge through the tell, the plug through the shudder. */
export function drawChuteClog(sc: MillScreen, ctx: CanvasRenderingContext2D, i: number, shake: number): void {
  const c = sc.chutes[i];
  if (c.state !== POURING || c.clog !== 1 || c.clogT <= CLOG_FALL) return;
  const x = CHUTE_X[i] + shake;
  if (c.clogT <= CLOG_UP) drawClogPlug(ctx, x, sc.jokeTones);
  drawClogBulge(ctx, x, bulgeRow(c), shake !== 0, sc.jokeTones);
}

/** The lumps on their way down, in front of everybody (they land ON somebody): from the lip to the catch's crown, or to the planks. */
export function drawClogDrops(sc: MillScreen, ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < sc.chutes.length; i++) {
    const c = sc.chutes[i];
    if (c.state !== POURING || c.clog !== 1 || c.clogT <= 0 || c.clogT > CLOG_FALL) continue;
    const k = (CLOG_FALL + 1 - c.clogT) / (CLOG_FALL + 1), e = k * k;   // it falls, so it gathers speed
    const x0 = CHUTE_X[i], y0 = ROWS.mouth + 8;
    let x1 = x0, y1 = ROWS.pile - SPILL_HIGH;
    if (c.victim >= 0) { const v = sc.seats[c.victim]; x1 = v.x; y1 = v.y - v.rig.height * v.rig.scale; }
    drawClogLump(ctx, x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, sc.jokeTones);
  }
}

/** The heaps on the bare planks, behind the lanes (drawn with the chutes): a dome standing, slumping, then gone. */
export function drawSpills(sc: MillScreen, ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < sc.spillT.length; i++) {
    const t = sc.spillT[i];
    if (t >= SPILL_FRAMES) continue;
    const u = t < SPILL_HOLD ? 0 : t >= SPILL_HOLD + SPILL_SETTLE ? 1 : (t - SPILL_HOLD) / SPILL_SETTLE;
    drawHeapDome(ctx, CHUTE_X[i], ROWS.pile, R(ROWS.pile - SPILL_HIGH + (SPILL_HIGH - SPILL_LOW) * u * (2 - u)), sc.jokeTones);
  }
}

/** The coat a seat is painted in this frame (game/gags.ts coat): the ghost's flour after the clog, the dust after ACHOO. */
export function jokeCoat(sc: MillScreen, s: MillSeat): string | null {
  if (s.clogT > 0 && s.clogT <= LOOK_FRAMES) return COAT.flour;
  if (s.sneezeT > 0 && s.sneezeT <= ACHOO_AT) return sc.jokeTones.dusty;
  return null;
}

/**
 * A seat in the middle of a joke, drawn by the joke; false for a seat that is not (the screen draws it as usual).
 * The sack's state is already on the rig and the draw options are already set (screens/mill.ts drawSeat).
 *   under the heap  the dome behind it, the critter only ABOVE the flour line (what is under the flour is never
 *                   drawn: art/millGags.ts says why), then the lip of flour across that line in front. Engulfed, the
 *                   line is over the ear tips and nothing of the critter shows; slumping, the dome and the line come
 *                   down together and the ears come out first, then the eyes, which is where it stops;
 *   coated          the ghost after the clog or the dust after ACHOO (jokeCoat), and over the rig, read off the
 *                   joints that draw just placed: grains stuck to a rice ghost, the stars round a dazed head.
 */
export function drawSeatJoke(sc: MillScreen, ctx: CanvasRenderingContext2D, s: MillSeat, f: number): boolean {
  const rig = s.rig, o = s.opts, k = rig.scale, r = rig.p.headR * k, x = R(s.x);
  if (s.clogT > LOOK_FRAMES && s.clogT <= LOOK_FRAMES + HEAP_FRAMES) {
    const since = LOOK_FRAMES + HEAP_FRAMES - s.clogT;
    const u0 = since < HEAP_HOLD ? 0 : since >= HEAP_HOLD + HEAP_SETTLE ? 1 : (since - HEAP_HOLD) / HEAP_SETTLE, u = u0 * (2 - u0);
    const head = s.y + (BURY_Y - rig.height + rig.p.headR) * k;          // the head's centre in the buried crouch
    const over = s.y - rig.height * k - s.crown - DOME_OVER;            // over the tallest ear tip
    const line = R(over + (head + EYE_CLEAR - over) * u), top = R(over + (head - r * DOME_RISE - over) * u);
    drawHeapDome(ctx, x, R(s.y), top, sc.jokeTones);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VIEW_W, line); ctx.clip();
    drawRig(ctx, rig, s.player.pose, o);
    ctx.restore();
    drawHeapLip(ctx, x, line, R(r), sc.jokeTones);
    return true;
  }
  const c = jokeCoat(sc, s);
  if (c === null) return false;
  coat(rig, c);
  drawRig(ctx, rig, s.player.pose, o);
  coat(rig, null);
  if (s.clogT > SHAKE_FRAMES) {
    const h = jointScreen(rig, 'head', HEAD), b = jointScreen(rig, 'torso', BODY);
    drawStuckGrains(ctx, h.x, h.y, r, b.x, b.y - rig.p.torsoH * k * 0.5, s.facing, sc.jokeTones);
  } else if (s.sneezeT > 0 && s.sneezeT <= DAZED_FRAMES) {
    const h = jointScreen(rig, 'head', HEAD);
    drawDizzy(ctx, R(h.x), R(h.y - r - 4), f);
  }
  return true;
}
