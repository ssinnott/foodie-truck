// THE HIVES' TWO JOKES (docs/GDD.md section 5, "every mini-game has two jokes"; game/gags.ts is the kit they are
// drawn with). They live beside screens/hive.ts rather than in it because together they are as long as the rest of
// the scene. This module owns the jokes' numbers, their poses, their beat-by-beat stepping and the marks that are
// only drawn while one runs; the screen owns WHEN - it rolls both deals, starts each joke on the frame it lands and
// clears it in finish() - the way the orchard owns its bomb.
//
//   THE CURIOUS BEE (the scene's first joke, made bigger). One dip in BEE_ODDS has a visitor: BEE_AT frames into
//   the hold one bee peels off the swarm and the hold PAUSES where it is for the whole beat, the stick and the button
//   ignored. TELL: it dives out of the swarm and once round the head, buzzing louder. WIND-UP: it lands on the nose
//   ('!'), the critter goes cross-eyed and trembles, then stiff as a board. BANG: over backwards like a plank, about
//   its feet - FLUMP!, a bump, dust off the ground. LOOK: flat on its back with the bee still on its nose. Then the
//   bee buzzes off, the critter springs up, and the hold runs on from where it was. Nothing is lost.
//
//   THE HONEY FLOOD (the new one). One skep fill in OVER_ODDS comes in OVERFULL, and shows it: honey running down
//   the straw, brimming in the doorway, a pool and a drip at its foot (art/hiveProps.ts drawOoze) - the TELL, which a
//   sharp eye can walk past and a child can go straight for. A hold there runs as normal until its last
//   SWELL_FRAMES, when the skep swells and groans ('!') - the WIND-UP; letting go even then costs nothing and leaves
//   the skep overfull. If the hold lands it scores +1 like any dip, and the skep BURPS its honey over the dipper:
//   GLOOP!, a bump, a fat tongue of honey over the head - the BANG. LOOK: the critter is honey all over (the kit's
//   coat, its eyes blinking out of it, a glint going on its crown) and stuck in a pool: the stick only strains it
//   toward the push, toffee strands stretching from its feet, while two bees come down and settle on it. Then SHLUP!
//   it pops free, shakes itself, and the honey runs off it from the ears down. BARLEY never gets stuck: the hungry
//   one licks it all off instead (a nom a lick, a third of the coat a lick, then a pat of the belly and MMM!),
//   quicker than anyone struggles free.
//
// Determinism (docs/ARCHITECTURE.md section 0): everything that decides anything is the seat's own integer
// countdowns (beeT, floodT) and the skep's `over` flag, stepped in update() and hashed in checksumFields(); both
// deals are the screen's rng rolls. Nothing here reads rng. The word cards, the bump, the particles, the bees
// settling on the honey and every position read back off a rig are cosmetic and draw-only.
import { UI } from '../../constants.ts';
import { particles } from '../../engine/particles.ts';
import { burstDust, burstCrumbs, ringAt } from '../../art/fx.ts';
import { drawRig, jointScreen } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import type { Point } from '../../lib/art/rigParts.ts';
import type { PoseSpec } from '../../lib/art/poses.ts';
import { F, muzzleGeom } from '../../content/critters/common.ts';
import type { CritterRig } from '../../content/critters/common.ts';
import { mix } from '../../art/palettes.ts';
import { drawBee, drawHoneyPool, drawHoneyWave, drawToffee } from '../../art/hiveProps.ts';
import { gagBurst, gagBubble, gagBump, overHead, coat, COAT } from '../gags.ts';
import { seatAnim } from '../minigame.ts';
import type { Input } from '../game.ts';
import type { HiveScreen, HiveSeat } from './hive.ts';

const R = Math.round, DEG = Math.PI / 180;
/** The hungry one (docs/GDD.md section 2): the seat a flood is a meal for rather than a trap. */
const BARLEY = 'barley';

// ---------------------------------------------------------------- the numbers

/** The bee's deal: one dip in BEE_ODDS has a visitor - never a dip at an overfull skep (one joke on a seat at a time). */
export const BEE_ODDS = 8;
/** How far into the hold the visitor comes: BEE_AT frames, the moment it used to land. */
export const BEE_AT = 20;
/**
 * The bee's beats in frames, run as one countdown on the seat (beeT, BEE_TOTAL down to 0):
 *   CIRCLE   the tell: a dive out of the swarm (BEE_DIVE of it), then once round the head, louder, and in onto the nose
 *   TREMBLE  on the nose: '!', cross-eyed, a 1 px tremble
 *   STIFF    rigid as a board, the arms snapped to its sides...
 *   FALL     ...and over backwards like a plank about its feet, gathering speed (root rotation 0 to -90)
 *   LIE      FLUMP!: flat on its back with the bee still on its nose
 *   SPRING   the bee buzzes off and the critter springs back up into its dip
 * 120 frames, two seconds: a joke, not a penalty, and the hold it paused keeps every frame it had.
 */
export const BEE_CIRCLE = 24, BEE_TREMBLE = 32, BEE_STIFF = 6, BEE_FALL = 12, BEE_LIE = 30, BEE_SPRING = 16;
/** The frame (counted from the bee's coming) each beat starts on. */
export const BEE_LANDS = BEE_CIRCLE, BEE_RIGID = BEE_LANDS + BEE_TREMBLE, BEE_FLUMP = BEE_RIGID + BEE_STIFF + BEE_FALL, BEE_UP = BEE_FLUMP + BEE_LIE;
export const BEE_TOTAL = BEE_UP + BEE_SPRING;
/**
 * The dive out of the swarm and the flight back to it, and the circle: CIRCLE_R either side of the head and
 * CIRCLE_RY deep, once round in the rest of BEE_CIRCLE. One and a half turns in 12 frames, the first cut, was a blur
 * that read as a bee standing still in front of the face; one turn in 16 is a bee you can watch go round.
 */
const BEE_DIVE = 8, BEE_AWAY = 12, CIRCLE_R = 26, CIRCLE_RY = 9;
/**
 * The bee's middle sits this many rows over the muzzle's centre line and a pixel past its tip: its feet on the nose
 * (common.ts draws the nose 4 rows tall at that tip), half of it out over the end, where it reads as ON the nose and
 * not as a bee on the brow in front of the eyes.
 */
const NOSE_UP = 5;

/** The flood's deal: one skep fill in OVER_ODDS comes in overfull (the five the round opens on are dealt too). */
export const OVER_ODDS = 6;
/**
 * The wind-up: the last SWELL_FRAMES of a hold at an overfull skep, the dome swelling up to SWELL_PX each way (and a
 * 1 px throb). At 3 the first cut's 36 px dome grew to 42 and nobody saw it swell; at 4 it strains visibly.
 */
export const SWELL_FRAMES = 24, SWELL_PX = 4;
/**
 * The flood's beats after the bang, as one countdown on the seat (floodT):
 *   GLOOP   the wave comes down: squashed under it, the coat on
 *   STUCK   stuck in the pool; the stick strains toward the push; two bees come down and settle on it
 *   POP     SHLUP!: up out of the honey with a hop
 *   DRAIN   it shakes itself, and the honey runs off it from the ears down
 * Barley's instead: GLOOP, then LICKS of LICK_FRAMES each (a nom a lick, a third of the coat a lick), then
 * SMACK_FRAMES pleased with himself, MMM!. His MMM comes after the licks and not before them: GLOOP's card is still
 * up for most of the licking, and a bubble popped on top of it buried the bang's word. With the 24-frame swell
 * before the bang that is 144 frames on the seat for anyone else and 108 for Barley, who was never going to be
 * stuck in honey.
 */
export const GLOOP_FRAMES = 18, STUCK_FRAMES = 60, POP_FRAMES = 14, DRAIN_FRAMES = 28;
export const FLOOD_TOTAL = GLOOP_FRAMES + STUCK_FRAMES + POP_FRAMES + DRAIN_FRAMES;
export const LICKS = 3, LICK_FRAMES = 14, SMACK_FRAMES = 24;
export const LICK_TOTAL = GLOOP_FRAMES + LICKS * LICK_FRAMES + SMACK_FRAMES;
/** The frames (counted from the bang) the stuck critter pops free and starts to drain, and Barley's last lick ends. */
export const SHLUP_AT = GLOOP_FRAMES + STUCK_FRAMES, DRAIN_AT = SHLUP_AT + POP_FRAMES, LICKED = GLOOP_FRAMES + LICKS * LICK_FRAMES;
/** Into each lick, the frame the dipper reaches the mouth: the nom, the crumbs, and a third of the coat gone. */
const NOM_AT = 5;
/** The wave hangs off the skep for WAVE_FRAMES after the bang, peeling away from the doorway as it pours; the burst skep sags for SAG_FRAMES. */
const WAVE_FRAMES = 10, SAG_FRAMES = 6, SAG_PX = 2;
/** A drop of honey off a coated critter every DRIP_EVERY frames; the strain's creak every STRETCH_EVERY while the stick pushes. */
const DRIP_EVERY = 7, STRETCH_EVERY = 16;
/** The two bees that settle on the honey: the frame after the gloop each one lands (each flies in over HB_FLY first). */
const HB_LAND = Int8Array.of(10, 24), HB_FLY = 10;

const NOTICE = '!', MMM = 'MMM!', GLOOP = 'GLOOP!', SHLUP = 'SHLUP!', FLUMP = 'FLUMP!';
/** Rows above overHead() a bang's starburst is centred on (game/gags.ts: over the name plate, clear of the face). */
const BURST_UP = 16;
/** SHLUP comes as the critter hops out of the honey (the pop's 14-row hop): its card goes up with it, clear of the plate. */
const POP_RISE = 14;
/**
 * The FLUMP card comes down this many rows from the standing card's place: the critter is lying on the grass, and a
 * card left up where its head was hung 60 rows over nothing - but its plate has gone down with its head, so no
 * lower than this, which keeps the overshooting card clear of the plate on every rig in the cast.
 */
const LIE_DROP = 24;
/**
 * The '!' points at the BACK of the head, this far behind the feet point: the critter is mid-dip when it says it,
 * and a bubble straight over its head sat on the honey strand climbing from the doorway to the dipper.
 */
const NOTICE_BACK = 16;
/** A toffee strand is honey pulled thin, so it is paler than the honey it comes out of - and so it reads on the coat and the pool. */
const TOFFEE = mix(COAT.honey, UI.cream, 0.4);
/** Sound options, built once: the bee leaving and the honey bees arriving are quieter than the bee coming. */
const SOFT = { volume: 0.5 };
/** Honey drops: the bang's splash off the crown and the drip off a coated critter; `floor` is set to the seat's feet per use. */
const SPLASH = { speed: 2.8, up: 2.2, color: COAT.honey, size: 4, floor: 0, screen: true };
const DRIP = { speed: 0.5, up: 0, color: COAT.honey, size: 4, floor: 0, life: 24, screen: true };

// ---------------------------------------------------------------- the poses

/** The dip stance a bee finds the critter in (screens/hive.ts HIVE_ANIMS.dip's second key), with the legs every key sets. */
const DIPPING: PoseSpec = { armR: [122, 16], armL: [-150, -18], weapon: -34, legR: [0, 0], legL: [0, 0], torso: -7 };
/** Stiff as a board: arms pinned to its sides, the dipper straight down the near leg, legs together, a whisker taller, `dazed`. */
const PLANK: PoseSpec = { armR: [4, 0], armL: [-4, 0], weapon: 4, legR: [0, 0], legL: [0, 0], torso: 0, head: -4, stretch: 1.05, face: 'dazed' };
/** Honey-logged: arms held out from the body, legs a little apart in the pool. */
const DRIPPING: PoseSpec = { armR: [44, 22], armL: [-48, 16], weapon: 44, legR: [8, 0], legL: [-8, 0] };

/**
 * The jokes' poses, merged into the scene's overlay (screens/hive.ts HIVE_ANIMS, the coop's COOP_ANIMS pattern):
 * none of them belongs in the cast tables. The plank's fall is a ROOT rotation, which drawRig turns about the feet,
 * so a critter going over backwards keeps its heels where they stood; the screen lifts it by half its own width
 * while it lies (hiveGags lieLift) so it rests on its back and not through the lane.
 */
export const HIVE_GAG_ANIMS = Object.freeze({
  /** The tell: the dip held, the head bobbing after the bee going round it. */
  beeWatch: { loop: true, frames: [
    F(6, { ...DIPPING, head: -20, root: [0, -2], stretch: 1.04, face: 'neutral' }, { ease: 'inout' }),
    F(6, { ...DIPPING, head: -6, root: [0, -2], stretch: 1.04, face: 'neutral' }, { ease: 'inout' }),
  ] },
  /**
   * On the nose: the head drawn back off it a little, cross-eyed (`dazed`: the x eyes read as crossed on the bee), a
   * 1 px tremble. Only a little: tipped back the old joke's 28 degrees the muzzle's tip came up level with the eyes,
   * and a bee on it read as a bee on the brow.
   */
  beeNose: { loop: true, frames: [
    F(2, { ...DIPPING, torso: -7, head: -10, root: [1, -2], stretch: 1.04, face: 'dazed' }, { ease: 'inout' }),
    F(2, { ...DIPPING, torso: -7, head: -10, root: [-1, -2], stretch: 1.04, face: 'dazed' }, { ease: 'inout' }),
  ] },
  /** Rigid, then over backwards: `in`, so the fall gathers speed and lands hard. */
  plank: { loop: false, frames: [
    F(BEE_STIFF, { ...DIPPING, torso: -7, head: -10, root: [0, -2], stretch: 1.04, face: 'dazed' }, { ease: 'out' }),
    F(BEE_FALL, { ...PLANK, root: [0, 0, 0] }, { ease: 'in' }),
    F(1, { ...PLANK, root: [0, 0, -90] }, { ease: 'linear' }),
  ] },
  /** FLUMP: one 2 px bounce off the ground, then dead flat. */
  flat: { loop: false, frames: [
    F(3, { ...PLANK, root: [0, -2, -90] }, { ease: 'out' }),
    F(3, { ...PLANK, root: [0, 0, -90] }, { ease: 'in' }),
    F(1, { ...PLANK, root: [0, 0, -90] }, { ease: 'linear' }),
  ] },
  /** Back up: spun off the ground past upright with the knees tucked, down onto its feet, and straight into the dip. */
  spring: { loop: false, frames: [
    F(4, { ...PLANK, root: [0, 0, -90] }, { ease: 'in' }),
    F(5, { ...DIPPING, legR: [24, -36], legL: [-8, -24], head: -10, root: [0, -14, 12], stretch: 1.08, face: 'shout' }, { ease: 'out' }),
    F(5, { ...DIPPING, head: -10, root: [0, -4, -4], face: 'happy' }, { ease: 'in' }),
    F(2, { ...DIPPING, head: -13, root: [0, 0, 0], squash: 1.08, face: 'grit' }, { ease: 'out' }),
  ] },
  /** Under the wave: squashed flat with the arms flung up, then straightening out, dripping, `hurt`. */
  gulped: { loop: false, frames: [
    F(4, { armR: [150, 6], armL: [-160, -6], weapon: -24, legR: [10, 20], legL: [-10, 20], torso: 8, head: 16, root: [0, 3], squash: 1.16, face: 'closed' }, { ease: 'out' }),
    F(GLOOP_FRAMES - 5, { ...DRIPPING, torso: 4, head: 12, root: [0, 1], squash: 1.05, face: 'hurt' }, { ease: 'inout' }),
    F(1, { ...DRIPPING, torso: 5, head: 14, root: [0, 1], squash: 1.03, face: 'hurt' }, { ease: 'linear' }),
  ] },
  /** Stuck, the stick at rest: feet planted in the pool, looking down at them, swaying a little about them. */
  stuck: { loop: true, frames: [
    F(20, { ...DRIPPING, torso: 5, head: 16, root: [0, 1, -2], face: 'hurt' }, { ease: 'inout' }),
    F(20, { ...DRIPPING, armR: [50, 26], armL: [-42, 14], torso: 7, head: 20, root: [0, 1, 2], squash: 1.02, face: 'hurt' }, { ease: 'inout' }),
  ] },
  /**
   * Stuck, the stick pushed: the whole critter heaves toward it about its stuck feet (the root's lean pivots on
   * them, so they stay in the pool), arms reaching, `grit`, and the near knee hauled right up so that foot comes a
   * few rows out of the honey with the toffee stretching under it - then sinks back. On 5-7 px legs a knee lifted
   * any less left the strands too short to see.
   */
  strain: { loop: true, frames: [
    F(8, { armR: [100, 24], armL: [64, 34], weapon: -10, legR: [72, -42], legL: [-14, 6], torso: 16, head: -8, root: [0, 0, 12], face: 'grit' }, { ease: 'inout' }),
    F(8, { armR: [82, 34], armL: [50, 40], weapon: 0, legR: [34, -16], legL: [-12, 4], torso: 12, head: -4, root: [0, 1, 7], squash: 1.03, face: 'grit' }, { ease: 'inout' }),
  ] },
  /** SHLUP: a crouch, up out of the honey with a hop, and down on clean ground. */
  pop: { loop: false, frames: [
    F(4, { armR: [60, 40], armL: [-50, 30], weapon: 40, legR: [20, 30], legL: [-14, 30], torso: 12, head: 8, root: [0, 3], squash: 1.12, face: 'grit' }, { ease: 'in' }),
    F(6, { armR: [130, 10], armL: [-150, -10], weapon: -20, legR: [24, -40], legL: [6, -30], torso: -4, head: -10, root: [0, -14], stretch: 1.08, face: 'shout' }, { ease: 'out' }),
    F(4, { ...DRIPPING, legR: [10, 16], legL: [-8, 16], torso: 4, head: 2, root: [0, 2], squash: 1.1, face: 'happy' }, { ease: 'in' }),
    F(1, { ...DRIPPING, legR: [0, 0], legL: [0, 0], torso: 2, head: 0, root: [0, 0], face: 'happy' }, { ease: 'linear' }),
  ] },
  /** Shaking it off like a wet dog: body and head twisting against each other every 3 frames, eyes shut. */
  shake: { loop: true, frames: [
    F(3, { armR: [36, 20], armL: [-36, 16], weapon: 50, legR: [4, 0], legL: [-4, 0], torso: -10, head: 12, root: [-1, 0], face: 'closed' }, { ease: 'inout' }),
    F(3, { armR: [52, 30], armL: [-24, 10], weapon: 60, legR: [4, 0], legL: [-4, 0], torso: 10, head: -12, root: [1, 0], face: 'closed' }, { ease: 'inout' }),
  ] },
  /** Barley's lick: the shared `eat`'s paw to the muzzle and its chew, looped one lick per LICK_FRAMES - the dipper is what he licks. */
  lick: { loop: true, frames: [
    F(NOM_AT, { armR: [92, 42], armL: [-10, 14], weapon: 30, legR: [0, 0], legL: [0, 0], torso: -4, head: 8, face: 'shout' }, { ease: 'overshoot' }),
    F(4, { armR: [86, 38], armL: [-8, 14], weapon: 30, legR: [0, 0], legL: [0, 0], torso: -2, head: 4, face: 'closed' }, { ease: 'inout' }),
    F(LICK_FRAMES - NOM_AT - 4, { armR: [70, 50], armL: [-10, 14], weapon: 50, legR: [0, 0], legL: [0, 0], torso: 0, head: 0, face: 'happy' }, { ease: 'inout' }),
  ] },
  /** ...and pleased with himself: chin up, the near paw on his belly (the diners' `tummy` arm), `happy`. */
  smack: { loop: true, frames: [
    F(6, { armR: [-40, 124], armL: [-20, 30], weapon: 60, legR: [0, 0], legL: [0, 0], torso: -4, head: -10, root: [0, 0], squash: 1.04, face: 'happy' }, { ease: 'inout' }),
    F(6, { armR: [-36, 118], armL: [-16, 30], weapon: 64, legR: [0, 0], legL: [0, 0], torso: -2, head: -8, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
  ] },
});

// ---------------------------------------------------------------- the curious bee, stepped

/**
 * The bee comes: the screen calls this BEE_AT frames into a hold that has one due. From here the hold pauses where
 * it is (dipT keeps its count and the skep stays claimed), and stepBee runs the rest.
 */
export function beeComes(sc: HiveScreen, s: HiveSeat): void {
  s.beeDue = 0; s.beeT = BEE_TOTAL;
  seatAnim(s, 'beeWatch', true);
  sc.game.audio.play('hive_zoom');
}

/** One frame of the bee: each beat lands on the frame the countdown crosses it, and at 0 the hold runs on. */
export function stepBee(sc: HiveScreen, s: HiveSeat): void {
  const gone = BEE_TOTAL - --s.beeT;
  if (gone === BEE_LANDS) {
    sc.bees++;
    gagBubble(R(s.x - s.facing * NOTICE_BACK), overHead(s), NOTICE, s.colour);
    seatAnim(s, 'beeNose', true);
    sc.game.audio.play('buzz');
  } else if (gone === BEE_RIGID) seatAnim(s, 'plank', true);
  else if (gone === BEE_FLUMP) {
    // the bang: flat on its back. The card stands over the middle of the body, which now lies behind the feet
    const len = R(s.rig.height * s.rig.scale), mid = R(s.x - s.facing * len / 2);
    gagBurst(mid, overHead(s) - BURST_UP + LIE_DROP, FLUMP, s.colour);
    gagBump(2);
    burstDust(R(s.x - s.facing * (len - 8)), s.y, 6, 1.8, true);
    burstDust(mid, s.y, 4, 1.4, true);
    seatAnim(s, 'flat', true);
    sc.game.audio.play('hive_flump');
  } else if (gone === BEE_UP) {
    seatAnim(s, 'spring', true);
    sc.game.audio.play('buzz', SOFT);
    sc.game.audio.play('hive_boing');
  }
  if (s.beeT === 0) seatAnim(s, s.dipT > 0 ? 'dip' : 'carry', true);
}

// ---------------------------------------------------------------- the honey flood, stepped

/** Frames the flood holds a seat after the bang: Barley licks his way out quicker than anyone struggles free. */
export function floodTotal(s: HiveSeat): number { return s.critter === BARLEY ? LICK_TOTAL : FLOOD_TOTAL; }

/** The wind-up: SWELL_FRAMES from the end of a hold at an overfull skep it starts to give ('!' and a groan; the screen draws the swell). */
export function floodSwells(sc: HiveScreen, s: HiveSeat): void {
  gagBubble(R(s.x - s.facing * NOTICE_BACK), overHead(s), NOTICE, s.colour);
  sc.game.audio.play('hive_groan');
}

/**
 * The bang. The hold has landed and the screen has already scored it (+1, the ring, the jar): the overfull skep
 * `skep` burps its honey over the dipper and the seat is held for floodTotal() frames.
 */
export function floodLands(sc: HiveScreen, s: HiveSeat, skep: number): void {
  s.floodT = floodTotal(s); s.floodSkep = skep; s.moving = false;
  sc.floods++;
  gagBurst(R(s.x), overHead(s) - BURST_UP, GLOOP, s.colour);
  gagBump(2);
  const crown = s.y - R(s.rig.height * s.rig.scale);
  SPLASH.floor = s.y; particles.burst('drop', s.x, crown, 14, SPLASH);
  ringAt(s.x, crown, 6, 30, UI.cream, 3, 14, false, true);
  seatAnim(s, 'gulped', true);
  sc.game.audio.play('hive_gloop');
}

/** One frame of the flood; at 0 the seat is clean and a player again. */
export function stepFlood(sc: HiveScreen, s: HiveSeat, input: Input): void {
  const gone = floodTotal(s) - --s.floodT;
  if (s.critter === BARLEY) stepLicks(sc, s, gone); else stepStuck(sc, s, gone, input);
  // honey dripping off it for as long as any is left on it, a drop a few frames apart along its width (a fixed
  // walk through the body's span, not a random number: the drop is cosmetic and the rng is the simulation's)
  if (gone % DRIP_EVERY === 0 && gone < (s.critter === BARLEY ? LICKED : FLOOD_TOTAL)) {
    DRIP.floor = s.y;
    particles.burst('drop', s.x + ((gone * 5) % 17) - 8, s.y - 10 - ((gone * 3) % 23), 1, DRIP);
  }
  if (s.floodT === 0) { s.floodSkep = -1; seatAnim(s, 'carry', true); }
}

/** Everyone but Barley: stuck in the pool (the stick only strains), SHLUP!, then shaken off. */
function stepStuck(sc: HiveScreen, s: HiveSeat, gone: number, input: Input): void {
  if (gone >= GLOOP_FRAMES && gone < SHLUP_AT) {
    const ax = input.axisX(s.slot);
    if (ax !== 0) {
      // the push turns it to face the way it is pulling - facing is simulation state, and the input that set it
      // is the lockstep input every peer holds
      s.facing = ax < 0 ? -1 : 1;
      if (s.anim !== 'strain' || gone % STRETCH_EVERY === 0) sc.game.audio.play('hive_stretch');
      seatAnim(s, 'strain');
    } else seatAnim(s, 'stuck');
    for (let i = 0; i < HB_LAND.length; i++) if (gone === GLOOP_FRAMES + HB_LAND[i] - HB_FLY) sc.game.audio.play('buzz', SOFT);
  } else if (gone === SHLUP_AT) {
    gagBurst(R(s.x), overHead(s) - BURST_UP - POP_RISE, SHLUP, s.colour);
    SPLASH.floor = s.y; particles.burst('drop', s.x, s.y - 2, 8, SPLASH);
    seatAnim(s, 'pop', true);
    sc.game.audio.play('hive_shlup');
  } else if (gone === DRAIN_AT) seatAnim(s, 'shake', true);
}

/** Barley: a nom a lick (crumbs of honey off his chops), then a pleased pat of the belly - MMM! */
function stepLicks(sc: HiveScreen, s: HiveSeat, gone: number): void {
  if (gone === GLOOP_FRAMES) seatAnim(s, 'lick', true);
  else if (gone > GLOOP_FRAMES && gone < LICKED && (gone - GLOOP_FRAMES) % LICK_FRAMES === NOM_AT) {
    burstCrumbs(R(s.x + s.facing * s.rig.p.headR), s.y - R(s.rig.height * s.rig.scale * 0.6), s.y, COAT.honey, 5, true);
    sc.game.audio.play('nom');
  } else if (gone === LICKED) {
    gagBubble(R(s.x - s.facing * NOTICE_BACK), overHead(s), MMM, s.colour);
    seatAnim(s, 'smack', true);
  }
}

// ---------------------------------------------------------------- drawn (draw-only reads of the rigs)

/** Scratch for the draw-only reads below: joints off a rig's last drawRig, never simulation state. */
const HEAD: Point = { x: 0, y: 0 }, SPOT: Point = { x: 0, y: 0 }, NOSE: Point = { x: 0, y: 0 };
/** The clean critter is redrawn inside a clip this far either side of its feet: wide enough for any pose and the dipper. */
const CLIP_W = 80;

/**
 * Where a bee sits on a seat's nose as last drawn: on top of the muzzle's tip in head space (content/critters/
 * common.ts muzzleGeom: the nose is drawn at that tip, `NOSE_UP` rows over it is the bee's middle), turned through the
 * head's own angle and then the root transform drawRig used - so the bee rides the head tipping back, the tremble,
 * the topple to the ground and the spring back up. (jointScreen's maths with the head's step in front of it; the
 * trig is draw-only.)
 */
function noseOf(rig: Rig, out: Point): Point {
  const j = rig.joints.head, t = rig.tf, a = rig.joints.headAngle * DEG, c = Math.cos(a), sn = Math.sin(a);
  const g = muzzleGeom(rig.p.headR, (rig as CritterRig).build.muzzle);
  const hx = g.mx + g.rx + 1, hy = g.my - NOSE_UP;
  const nx = j.x + hx * c - hy * sn, ny = j.y + hx * sn + hy * c;
  const lx = nx * t.c - ny * t.s + t.rx, ly = nx * t.s + ny * t.c + t.ry;
  out.x = R(t.x + lx * t.fs); out.y = R(t.y + ly * t.ss);
  return out;
}

/**
 * Rows a seat is lifted while it leans back past upright (the plank's fall, the lie, the spring), so it comes to
 * rest ON its back: drawRig turns the root about the feet, which would leave half the body through the lane.
 * Half the rig's own width at -90, so a narrow Sorrel and a broad Barley both lie on the ground.
 */
export function lieLift(s: HiveSeat): number {
  const rot = s.player.pose.root.rot;
  return rot < 0 ? R(Math.sin(-rot * DEG) * s.rig.width * s.rig.scale / 2) : 0;
}

/** How far behind its feet a seat leaning back reaches along the ground (its whole height, lying flat): where its shadow goes. */
export function lieBack(s: HiveSeat): number {
  const rot = s.player.pose.root.rot;
  return rot < 0 ? R(Math.sin(-rot * DEG) * s.rig.height * s.rig.scale) : 0;
}

/**
 * The curious bee wherever beeT has it (draw-only: the countdown, the swarm's point (sx, sy) and the seat's rig).
 * The dive and the circle come first, the circle's far half drawn BEFORE the critter (`behind`) so the bee goes
 * round the head and not across it - the dizzy stars' trick (game/gags.ts drawDizzy); then it sits on the nose
 * through the tremble, the fall and the lie; then it is away up to the swarm over BEE_AWAY frames.
 */
export function drawCuriousBee(ctx: CanvasRenderingContext2D, s: HiveSeat, f: number, sx: number, sy: number, behind: boolean): void {
  if (s.beeT <= 0) return;
  const gone = BEE_TOTAL - s.beeT, rig = s.rig;
  let x: number, y: number;
  if (gone < BEE_LANDS) {
    // down out of the swarm to just in front of the face, then once round the head on a flat ellipse at brow height
    // (in front - under the chin, the near side - round the back - over the crown, the far side - and in front
    // again), pulled in onto the nose over the last of the turn, so the turn ends where the next beat starts
    const head = jointScreen(rig, 'head', HEAD), nose = noseOf(rig, NOSE);
    const k = gone < BEE_DIVE ? 0 : (gone - BEE_DIVE) / (BEE_LANDS - BEE_DIVE), a = Math.PI * 2 * k, m = k * k * k;
    const cx = head.x + s.facing * Math.cos(a) * CIRCLE_R, cy = head.y - 3 + Math.sin(a) * CIRCLE_RY;
    if (gone < BEE_DIVE) { const d = gone / BEE_DIVE; x = sx + (cx - sx) * d; y = sy + (cy - sy) * d; }
    else { x = cx + (nose.x - cx) * m; y = cy + (nose.y - cy) * m; }
    if ((gone >= BEE_DIVE && Math.sin(a) < 0 && m < 0.5) !== behind) return;
  } else {
    if (behind) return;
    const nose = noseOf(rig, NOSE);
    x = nose.x; y = nose.y;
    if (gone >= BEE_UP) {
      const k = (gone - BEE_UP) / BEE_AWAY;
      if (k >= 1) return;
      x += (sx - x) * k; y += (sy - y) * k - Math.sin(k * Math.PI) * 14;
    }
  }
  drawBee(ctx, R(x), R(y), (f >> 1) & 1);
}

/**
 * The row above which a flooded critter is clean again: the top of its ears while it is all honey, the feet once
 * it is clean, and the honey's level between. Everyone else drains over DRAIN_FRAMES as it shakes; Barley's drops a
 * third of the way at each nom.
 */
function cleanRow(s: HiveSeat, gone: number): number {
  const top = s.y - R(s.rig.height * s.rig.scale) - s.crown - 2, bot = s.y + 2;
  let k: number;
  if (s.critter === BARLEY) {
    const licks = gone < GLOOP_FRAMES + NOM_AT ? 0 : 1 + (((gone - GLOOP_FRAMES - NOM_AT) / LICK_FRAMES) | 0);
    k = licks >= LICKS ? 1 : licks / LICKS;
  } else k = gone < DRAIN_AT ? 0 : (gone - DRAIN_AT) / DRAIN_FRAMES;
  return R(top + (bot - top) * k);
}

/**
 * A seat in a flood, in its place in the sorted pass: the coat kit's honey over the whole rig, its ink and its eyes
 * kept (game/gags.ts coat); then, once the honey starts to go, the clean critter drawn again over it inside a clip
 * from the top of the frame down to the honey's level (the second draw does not step the secondary chains, which
 * the first already has); a glint going on the crown and the belly where the honey still is; and, while it is
 * stuck, the toffee strands from its feet down into the pool.
 */
export function drawFloodSeat(ctx: CanvasRenderingContext2D, s: HiveSeat, f: number): void {
  const rig = s.rig, o = s.opts, pose = s.player.pose;
  const gone = floodTotal(s) - s.floodT, clean = cleanRow(s, gone), top = s.y - R(rig.height * rig.scale) - s.crown - 2;
  if (clean > s.y) { drawRig(ctx, rig, pose, o); return; }
  coat(rig, COAT.honey); drawRig(ctx, rig, pose, o); coat(rig, null);
  if (clean > top) {
    ctx.save(); ctx.beginPath(); ctx.rect(R(s.x) - CLIP_W, 0, CLIP_W * 2, clean); ctx.clip();
    o.secondary = false; drawRig(ctx, rig, pose, o); o.secondary = true;
    ctx.restore();
  }
  // the glisten: a cream glint on the crown and one on the belly, on alternate beats, wherever the honey still is.
  // Lit from the top-left, which a left-facing (flipped) critter wears top-right, like every other highlight
  const head = jointScreen(rig, 'head', HEAD), hr = rig.p.headR * rig.scale, tw = (f >> 3) & 1;
  const gx = R(head.x - s.facing * hr * 0.45), gy = R(head.y - hr * 0.6);
  ctx.fillStyle = UI.cream;
  if (tw && gy > clean) ctx.fillRect(gx - 1, gy, 3, 2);
  const body = jointScreen(rig, 'torso', SPOT), by = R(body.y - rig.p.torsoH * rig.scale * 0.5);
  if (!tw && by > clean) ctx.fillRect(R(body.x - s.facing * 3), by, 2, 3);
  if (s.critter === BARLEY || gone < GLOOP_FRAMES || gone >= SHLUP_AT) return;
  // the toffee: two strands from each ankle down into the pool, fanned a little either side of where that foot
  // was stuck (half the hip span off the feet point, either way: the same two points whichever way it faces)
  const hip = R(rig.p.hipX * rig.scale);
  for (let side = 0; side < 2; side++) {
    const a = jointScreen(rig, side ? 'ankleF' : 'ankleN', SPOT), ax = R(a.x), ay = R(a.y);
    const gx2 = R(s.x) + (side ? -s.facing : s.facing) * hip;
    drawToffee(ctx, ax, ay, gx2 - 3, s.y, TOFFEE);
    drawToffee(ctx, ax, ay, gx2 + 3, s.y, TOFFEE);
  }
}

/** Under a flooded seat's feet, before it is drawn: the pool it stands in, drying up over the last of the beat. */
export function drawFloodPool(ctx: CanvasRenderingContext2D, s: HiveSeat): void {
  if (s.floodT <= 0) return;
  const total = floodTotal(s), w = s.rig.width * s.rig.scale, rx = R(w * 0.8 * Math.min(1, s.floodT / DRAIN_FRAMES + 0.25));
  if (total - s.floodT < 2 || rx < 4) return;
  drawHoneyPool(ctx, R(s.x), s.y, rx, COAT.honey);
}

/**
 * The bang's wave and the skep's sag (draw-only, off floodT): the burp arcs from the doorway at (dx, dy) onto the
 * head for WAVE_FRAMES, peeling off the skep as it pours. Drawn after the plates with the dip strands, whose reason
 * it shares: the payoff is the one thing a name card must never cover.
 */
export function drawFloodWave(ctx: CanvasRenderingContext2D, s: HiveSeat, dx: number, dy: number): void {
  if (s.floodT <= 0) return;
  const gone = floodTotal(s) - s.floodT;
  if (gone >= WAVE_FRAMES) return;
  const head = jointScreen(s.rig, 'head', HEAD), hr = s.rig.p.headR * s.rig.scale;
  drawHoneyWave(ctx, dx, dy, R(head.x), R(head.y - hr * 0.7), gone / WAVE_FRAMES, COAT.honey);
}

/** How far the skep a flood just burst from is sagging this frame (a negative swell for drawSkep), or 0. */
export function floodSag(s: HiveSeat, skep: number): number {
  return s.floodT > 0 && s.floodSkep === skep && floodTotal(s) - s.floodT < SAG_FRAMES ? -SAG_PX : 0;
}

/**
 * The two bees that come down and settle on the honey (cosmetic: no field counts them): one on the crown and one
 * on the near elbow, flying in from the swarm's point (sx, sy) over HB_FLY frames, sitting tight while the critter
 * is stuck or licking, and away when it pops free or Barley has licked himself clean.
 */
export function drawHoneyBees(ctx: CanvasRenderingContext2D, s: HiveSeat, f: number, sx: number, sy: number): void {
  if (s.floodT <= 0) return;
  const gone = floodTotal(s) - s.floodT, leave = s.critter === BARLEY ? LICKED : SHLUP_AT, rig = s.rig;
  for (let i = 0; i < HB_LAND.length; i++) {
    const land = GLOOP_FRAMES + HB_LAND[i];
    if (gone < land - HB_FLY || gone >= leave + HB_FLY) continue;
    let x: number, y: number;
    if (i === 0) { const h = jointScreen(rig, 'head', HEAD); x = h.x - s.facing * 3; y = h.y - rig.p.headR * rig.scale - 3; }
    else { const e = jointScreen(rig, 'elbowN', SPOT); x = e.x; y = e.y - 4; }
    if (gone < land) {
      const k = (gone - land + HB_FLY) / HB_FLY, fx = sx + (i ? 24 : -24);
      x = fx + (x - fx) * k; y = sy + (y - sy) * k;
    } else if (gone >= leave) {
      const k = (gone - leave) / HB_FLY;
      x += s.facing * (i ? 30 : -30) * k; y -= 50 * k;
    }
    // a settled bee flips its wing slowly; a flying one at the swarm's own beat
    drawBee(ctx, R(x), R(y), gone >= land && gone < leave ? (f >> 3) & 1 : (f >> 1) & 1);
  }
}
