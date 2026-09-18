// DAIRY - PUMP (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Dairy"). A byre on a warm afternoon: every seat
// sits STATIC on its own three-legged stool with a cow in front of it and a tin pail under the udder, and milks by
// ALTERNATING the two buttons. After an ACTION the next accepted press is ALT, after an ALT it is ACTION; the
// button that is not next does nothing at all but is visibly refused, because a player must never be punished for
// learning the game. PUMP_PER_PAIL accepted presses fill a pail, the pail hops onto the churn rack as +1 milk for
// the PARTY, a fresh one slides under the cow and the alternation resets.
//
// The cost is THE COW'S PATIENCE, and it is a moment of restraint rather than a reflex: each cow independently, on
// a seeded timer, telegraphs for TELEGRAPH frames (ear back, tail up, a SIGNAL.hot mark blinking over its rump -
// the same reserved danger colour the rooster's comb wears in the coop) and then opens a KICK_FRAMES window with
// the mark SOLID and the tail held up. (The cow also draws its near hind hoof up, but the milker sits in front of
// that leg and covers it: it is motion, not a tell, and the two tells above are the ones the window is sold on -
// see the note in art/dairyProps.js drawCow.) ANY press inside that window is a kick: the shared bump beat, the pail
// spills its progress, and one banked milk goes with it if the seat has one - the wormy apple's price, exactly.
// Sitting still through the window costs nothing and the cow settles.
//
// Determinism (docs/ARCHITECTURE.md section 0): every seat and every cow is a plain sim object built in enter() and
// never grown; the only randomness is rng.int for a cow's calm timer inside update(); input is read by seat slot
// only; nothing in update() calls Math.sin/cos or reads a clock. The stall geometry is arithmetic on each rig's own
// proportions with the two trig constants below precomputed, so four browsers place four identical stalls. The
// squirt's bright head, the jet's slide, the pail's hop arc, the splashes, the swallow and the particles are draw
// only and stay out of checksumFields().
import { UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { rng } from '../../lib/engine/rng.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt, burstDust } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig } from '../../lib/art/rig.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { ROWS, SEAT_X, SEAT_PITCH, CHURN_X, dairyLayers } from '../../art/backgrounds/dairy.ts';
import { drawCow, drawStool, drawPail, drawJet, drawChevrons, drawSplash, drawChurn, drawSwallow, TEAT_DX, TEAT_DY, PAIL_H } from '../../art/dairyProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawHint } from '../ui.ts';

const R = Math.round;

/**
 * THE NUMBERS, and the arithmetic that picked them. The five starting values (6 / 24 / 30 / 150..260 / a 3-frame
 * beat) came from the BRIEF this screen was built to, not from the design document: GDD section 5 owns the rules
 * every mini-game shares (the 40-second clock, the +1 and its ring, the bump beat, the sign and the hand-back to
 * the map, and "all randomness through rng inside update()") and the dairy obeys all of them, but its own bullet
 * is not written yet - section 5 still lists Orchard, Pond and Coop only, as it does for the mill, the hives and
 * the market garden. Whoever adds those four bullets should carry these numbers into them; until then this comment
 * is where they are justified, and nothing below quotes a line the document does not contain.
 *
 * PUMP_PER_PAIL 6 is kept: six alternating presses is about 1.2 s at a comfortable two-finger tap (5 presses/s,
 * one press per 12 frames), which is long enough for the cow to interrupt a pail and short enough that a pail is
 * never a chore. A solo player therefore banks the shipped fallback target of 3 in 3 x 72 = 216 frames of pressing.
 * The cow's cycle is CALM (150..260) + TELEGRAPH 24 + KICK 30 = 204..314 frames, so in those 216 frames a solo
 * player meets about one window and waits out at most 30 frames of it: ~250 frames, a tenth of the 2400-frame
 * round. A deliberate player at 2 presses/s (30 frames each) needs 6 x 30 x 3 = 540 frames plus two windows: ~600,
 * a quarter of the round. Both have the room to spare the brief asks for, and both leave the clock as a backstop
 * rather than the opponent - the cow is the opponent.
 *
 * TELEGRAPH 24 and KICK_FRAMES 30 are kept as given and they hold up: 24 frames (0.4 s) is two presses' worth of
 * warning at the fast rate and one at the slow one, which is exactly "you may finish this squirt, not the next";
 * 30 frames (0.5 s) of window is short enough that waiting it out never feels like a penalty. Shortening the
 * telegraph to 16 was tried on paper and rejected - at 5 presses/s that is three frames of reaction after the
 * press already in flight, which turns a restraint mechanic into a reflex one.
 */
const PUMP_PER_PAIL = 6, TELEGRAPH = 24, KICK_FRAMES = 30, CALM_MIN = 150, CALM_MAX = 260;
/** Cow states: calm, the telegraph, the window a press is punished in. */
const CALM = 0, WARN = 1, KICK = 2;
const COW_STATES = Object.freeze(['calm', 'warn', 'kick']);
/**
 * The squirt beat. The brief's 3 frames were doubled after the first capture: at a comfortable 12-frame press
 * cadence a 3-frame jet is drawn on a quarter of the frames, and the capture at the pump beat caught the gap - the
 * milker read as miming. At 6 the stream is up for half of a fast player's frames and reads as continuous milking,
 * and it is still well inside the 12, so a jet never survives into the next accepted press.
 */
const SQUIRT_FRAMES = 6;
/** The refusal: long enough to see the plate drain and jitter, short enough that the right button is never late. */
const REFUSE_FRAMES = 10;
/** The kick's bump beat: the shared 4/10/6 of `bump`, plus the grace before a seat can be kicked again. */
const BUMP_FRAMES = 21;
/** A fresh pail slides in: the tin squashes 3 % per frame left, the same landing beat the pond's bucket takes. */
const PAIL_LAND = 5, PAIL_LAND_K = 0.03;
/** The full pail's flight to the rack, and how high it arcs over the cows on the way. */
const HOP_FRAMES = 16, HOP_LIFT = 26, MAX_HOPS = 4;
/** The spilled pail: four inked sizes, a step every 5 frames, gone in 20 (art/dairyProps.js drawSplash). */
const SPLASH_STEP = 5, SPLASH_FRAMES = 20, MAX_SPLASHES = 4;
/** Odd stalls stand five rows nearer, so four identical stalls read as a row of stalls and not one stamp repeated. */
const STALL_DY = 5;
/**
 * Where a cow stands relative to its milker. Both come from the milker's OWN rig, because the cast is 48..64 px
 * tall and a fixed udder would leave Sorrel's paws a clear 10 px under the teats she is supposed to be holding:
 *   paw = shoulder + reach * (sin 126, -cos 126)   - 126 degrees is the arm angle every pump key is built around
 * The cow is then placed so its teats land on that paw. COW_BACK_MIN/MAX clamp how far behind the crew's line a
 * cow may stand, so the row is still a row (the mouse's cow comes forward to 8 rows instead of 4).
 */
const PAW_FWD = 0.8090, PAW_UP = 0.5878;
const COW_BACK_MIN = 8, COW_BACK_MAX = 16;
/**
 * The pail sits 13 px left of the udder's centre: clear of the milker's near toe, and far enough off the teat that
 * the jet runs at a slant. At -8 it was dead vertical and the capture read the stream as a drinking straw stood in
 * the tin; a stream that leans is a stream.
 */
const PAIL_DX = -13, PAIL_DY = -2;
/** The pump chevron's tag: on the floor at the pail's foot, overlapping its base (see drawChevrons for why here). */
const CHEV_DY = 2;
/**
 * The seated pose's root drop. Every DAIRY_ANIMS key carries it, and each seat's stool is cut to it: a chibi's hip
 * is only 11..16 px off the ground standing, so however the legs fold the stool can only ever be about a dozen px
 * tall - which is what a milking stool is. 4 is the drop that lands every one of the four casts' feet within a
 * pixel of the floor line with the knees folded under the hips (see SIT).
 */
const SIT_ROOT_Y = 4;
/** The chibi's hip is only 11..16 px off the ground, so a milking stool is a low one; each seat's is cut to its rig. */
const STOOL_MIN = 6;
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', MINUS_ONE = '-1', TITLE = 'BUTTERCUP DAIRY', SIGN_PREFIX = 'MILK: ';
const MILK_HEX = INGREDIENTS.milk.hex;

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void { drawFood(ctx, 'milk', x, y, 4, MILK_HEX); }

/**
 * The scene's own beats, an AnimPlayer overlay on top of the shared table (the pond's POND_ANIMS pattern). Every
 * key sets BOTH legs and the root, because a missing key resolves to DEFAULT_POSE and a seated critter would stand
 * up mid-beat.
 *
 * SIT is the milking stance: the thigh just past horizontal (88) with the shin folded back under it (a 26 degree
 * total) puts the knees up and the feet on the floor about 9 px in front of the stool, which is what sitting on a
 * 12 px stool looks like when the whole leg is 17 px long. The far leg is a touch less forward so two legs do not
 * print as one. Round 1 folded harder (96 / -74) and dropped the hip to 10 px, which left no stool to see.
 *
 * pumpR / pumpL are the alternation made visible ON the critter: the milking paw pulls down while the braced paw
 * rides up, and which one is down says which button just landed, so a player reading the chevron and a player
 * reading the crew learn the same rule. Both are non-looping and fall back to milkIdle when they finish, so a crew
 * that has stopped pumping breathes instead of freezing mid-pull.
 *
 * WHERE THE OFF PAW IS, and why it is not on a teat. Round 1 put both arms up at the udder (armR 126 / armL 122),
 * and both paws were then within 4 degrees of each other: the far arm is rooted 16..20 px BEHIND the near one
 * (shoulderF is at -shoulderX - 2 and shoulderX is 7..9 across the cast), so at that angle its paw landed inside
 * the critter's own skull - 4..9 px from the head joint against a head radius of 11..15 - and the far arm draws
 * before the head (ART_STYLE 0.3), so not one pixel of it survived in any frame. Every capture showed a one-pawed
 * milker, against 0's "a viewer must instantly pick out both paws".
 *
 * It cannot be fixed by opening the far arm toward the udder, and the geometry says so flatly: a chibi arm is
 * 15..18 px long, the far shoulder is 16..20 px behind the near one, so the far paw's reach in x STOPS about 15 px
 * short of where the near paw already is - 8 px past the udder's outer edge - and everything between the two is
 * the critter's own torso and skull, which draw over it. Measured across the four casts and the whole arm circle,
 * the far paw survives in exactly one place: BEHIND the body, where the stool is. So the milker strips the teat
 * one-pawed and braces the off paw back on the stool's seat, which is a posture a byre milker actually takes: 40
 * to 90 px of paw survive on every cast in every key (measured by rendering the seat with its far palette forced
 * to magenta and counting), the silhouette is open, and the pump beat still rocks the braced paw against the
 * milking one, so which paw is down goes on saying which button just landed.
 */
const SIT = { legR: [88, -62], legL: [76, -52] };
const DAIRY_ANIMS = Object.freeze({
  milkIdle: { loop: true, frames: [
    F(26, { ...SIT, armR: [126, 0], armL: [-30, -12], root: [0, SIT_ROOT_Y], torso: 4, head: 8, face: 'happy' }),
    F(26, { ...SIT, armR: [128, 2], armL: [-27, -10], root: [0, SIT_ROOT_Y + 1], torso: 6, head: 10, face: 'happy' }),
  ] },
  pumpR: { loop: false, frames: [
    F(4, { ...SIT, armR: [112, 8], armL: [-48, -18], root: [0, SIT_ROOT_Y + 1], torso: 6, head: 9, face: 'happy' }, { ease: 'out' }),
    F(9, { ...SIT, armR: [114, 6], armL: [-44, -16], root: [0, SIT_ROOT_Y], torso: 5, head: 8, face: 'happy' }),
  ] },
  pumpL: { loop: false, frames: [
    F(4, { ...SIT, armR: [138, -6], armL: [-16, -2], root: [0, SIT_ROOT_Y + 1], torso: 6, head: 9, face: 'happy' }, { ease: 'out' }),
    F(9, { ...SIT, armR: [136, -4], armL: [-19, -4], root: [0, SIT_ROOT_Y], torso: 5, head: 8, face: 'happy' }),
  ] },
  /** The refusal: the milking paw comes off the udder, the braced one lifts off the stool with it, and the face
   *  drops to concentration. No loss, no flinch. */
  balk: { loop: false, frames: [
    F(4, { ...SIT, armR: [152, -22], armL: [-54, -22], root: [0, SIT_ROOT_Y - 1], torso: -2, head: -4, face: 'neutral' }, { ease: 'out' }),
    F(6, { ...SIT, armR: [128, 0], armL: [-30, -12], root: [0, SIT_ROOT_Y], torso: 4, head: 8, face: 'happy' }, { ease: 'inout' }),
  ] },
  /**
   * The kick, on the shared bump's 5/10/6 beat and its hurt -> dazed faces, but seated: the stock `bump` sets
   * standing legs, so a kicked milker stood up off the stool for 21 frames and sat back down. The pond overrode
   * `bump` for the same reason (its rod snapped to the waterline); this one keeps the knees up and throws the root
   * backward instead, so the critter is shoved on the stool rather than launched off it.
   */
  bump: { loop: false, frames: [
    F(5, { legR: [118, -46], legL: [106, -40], armR: [-30, -20], armL: [-44, -16], root: [-5, SIT_ROOT_Y - 2], torso: -24, head: -20, squash: 1.08, face: 'hurt' }, { ease: 'out' }),
    F(10, { ...SIT, armR: [-6, 4], armL: [-18, 6], root: [-2, SIT_ROOT_Y], torso: -8, head: -6, face: 'hurt' }, { ease: 'inout' }),
    F(6, { ...SIT, armR: [18, 12], armL: [-6, 10], root: [0, SIT_ROOT_Y], torso: 2, head: 2, face: 'dazed' }),
  ] },
  /**
   * Seated cheer and seated sulk for the end sign: a paw up off the udder and the other thrown up BEHIND the
   * shoulder, or both down. The off arm goes back over the shoulder rather than forward for the same reason the
   * milking keys brace it back - forward of the body it is inside the skull and nothing of it draws.
   */
  cheer: { loop: true, frames: [
    F(10, { ...SIT, armR: [116, 20], armL: [-128, 14], root: [0, SIT_ROOT_Y - 1], torso: -4, head: -6, squash: 1.05, face: 'happy' }),
    F(14, { ...SIT, armR: [126, 14], armL: [-138, 6], root: [0, SIT_ROOT_Y - 3], torso: -6, head: -10, stretch: 1.04, face: 'happy' }),
    F(8, { ...SIT, armR: [118, 18], armL: [-130, 12], root: [0, SIT_ROOT_Y - 1], torso: -4, head: -6, squash: 1.06, face: 'happy' }),
  ] },
  sad: { loop: true, frames: [
    F(30, { ...SIT, armR: [56, 44], armL: [-30, -6], root: [0, SIT_ROOT_Y + 1], torso: 14, head: 22, face: 'hurt' }),
    F(30, { ...SIT, armR: [58, 46], armL: [-28, -8], root: [0, SIT_ROOT_Y + 2], torso: 16, head: 24, face: 'hurt' }),
  ] },
});

/** One pre-rendered backdrop layer and the screen y it is blitted at (art/backgrounds/dairy.ts dairyLayers). */
export interface DairyLayer {
  /** The offscreen canvas art/layers.ts makeLayer painted once. */
  L: { canvas: HTMLCanvasElement; w: number; h: number };
  /** Screen y its top row lands on. */
  y: number;
}

/** The byre's backdrop: painted on the first visit, kept for every visit after. */
export interface DairyLayers {
  /** Back wall with the churn rack and the eave the swallow flies under, down to the floor row. */
  wall: DairyLayer;
  /** The straw floor the stalls stand on. */
  floor: DairyLayer;
  /** The near lip, drawn over everything standing in the byre. */
  near: DairyLayer;
}

/** One cow's patience: the sim object enter() builds per stall and update() runs down (see stepCow). */
export interface Cow {
  /** Which of the two cow looks to draw (art/dairyProps.ts drawCow). */
  kind: number;
  /** CALM, WARN or KICK. */
  state: number;
  /** Frames left of the state it is in. */
  t: number;
}

/**
 * A seat at the dairy: the shared mini-game seat, the stall geometry enter() solves out of THIS milker's own rig,
 * the beat timers this screen keeps for it and its cow. The per-screen extension minigame.ts documents, so
 * `makeSeats<DairySeat>` hands these back with the screen's own fields as typed as the shared ones.
 */
export interface DairySeat extends Seat {
  /** Where this seat's cow stands: placed so its teats land on this milker's paw. */
  cowX: number;
  cowY: number;
  /** The teat the milking paw is on (the cow's udder point), where a squirt leaves from. */
  teatX: number;
  teatY: number;
  /** The tin pail under the udder, 13 px left of it. */
  pailX: number;
  pailY: number;
  /** The stool's height, cut to this rig's own hip. */
  stoolH: number;
  /** Which button is next: 0 = action, 1 = alt. */
  next: number;
  /** Accepted presses into the pail under the cow (0..PUMP_PER_PAIL). */
  fill: number;
  /** Frames left of the refusal beat (the wrong button). */
  refuseT: number;
  /** Frames left of the squirt the last accepted press started. */
  squirtT: number;
  /** Frames left of a fresh pail's landing squash. */
  pailT: number;
  /** This stall's cow. */
  cow: Cow;
}

/** A full pail on its way to the churn rack (cosmetic). */
export interface Hop {
  /** Frames into the flight; HOP_FRAMES means the slot is free. */
  t: number;
  /** Where the pail left the stall. */
  x0: number;
  y0: number;
  /** The slot on the rack it lands on. */
  tx: number;
  ty: number;
  /** The player slot whose pail it is, for the tin's band. */
  slot: number;
}

/** A kicked pail's spill, lying flat on the straw (cosmetic). */
export interface Splash {
  /** Frames into the spill; SPLASH_FRAMES means the slot is free. */
  t: number;
  x: number;
  y: number;
}

export class DairyScreen extends Screen {
  // The fields, for the checker only, in the order enter() fills them (the two the constructor seeds first).
  // `declare` for the reason game.ts gives over its own block: a plain field declaration would emit a class field
  // per name (es2022 defines them before the constructor body runs, and a screen's own declaration would also
  // define a base field back to undefined), and this screen has to keep the runtime it shipped with. `declare`
  // erases under tsc, under esbuild and under Node's type stripping alike, so the emitted class is the original.

  /** One seat per party member, in party order (not slot order); empty until enter() builds the stalls. */
  declare seats: DairySeat[];
  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The backdrop, pre-rendered once (art/backgrounds/dairy.ts dairyLayers) and blitted per frame. */
  declare layers: DairyLayers;
  /** The hop pool (cosmetic): MAX_HOPS slots handed out in turn. */
  declare hops: Hop[];
  /** The next hop slot to reuse. */
  declare hopCursor: number;
  /** The splash pool (cosmetic): MAX_SPLASHES slots handed out in turn. */
  declare splashes: Splash[];
  /** The next splash slot to reuse. */
  declare splashCursor: number;
  /** Milk the round is played to: what the order still needs, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Milk in the party's churns right now. */
  declare total: number;
  /** Kicks the party has taken this round (the playtest reads it). */
  declare kicks: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** The hint line along the bottom. */
  declare hint: string;
  /** The round's clock and its ending (game/minigame.ts). */
  declare clock: Clock;
  /** The sorted pass's fixed index array: four objects per stall (the cow, its pail, the stool, the milker). */
  declare sortIdx: Int16Array;
  /** Their sort keys (the row * 32 + the tiebreak), sorted alongside `sortIdx`. */
  declare sortKey: Float64Array;

  constructor(game: Game) { super(game, 'dairy'); this.seats = []; this.fields = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    this.layers = dairyLayers();
    particles.clear();
    this.seats = makeSeats<DairySeat>(game, (i) => ROWS.feet + (i & 1) * STALL_DY);
    const n = this.seats.length;
    // SEAT_X is the four-stall layout; a smaller party keeps the pitch and slides to the middle of the byre
    const shift = R((SEAT_X.length - n) * SEAT_PITCH / 2);
    for (let i = 0; i < n; i++) {
      const s = this.seats[i], rig = s.rig, p = rig.p;
      s.x = SEAT_X[i % SEAT_X.length] + shift;
      // the milking paw is on the teats and the off paw is braced on the stool, so the ribbon basket makeSeats
      // hands out has nowhere to go but across the udder
      rig.weapon = null;
      s.player.setOverlay(DAIRY_ANIMS);
      s.facing = -1;                                  // every milker works from its cow's right rear, facing the udder
      const reach = (p.upperArm + p.lowerArm + p.handR * 0.6) * rig.scale;
      const shoulderY = s.y + (rig.hipY + SIT_ROOT_Y - (p.torsoH - 5)) * rig.scale;
      const pawX = s.x - p.shoulderX * rig.scale - reach * PAW_FWD, pawY = shoulderY - reach * PAW_UP;
      // how far behind the crew's line this cow stands, so ITS teats land on THIS milker's paw (TEAT_DY is negative)
      const back = Math.max(COW_BACK_MIN, Math.min(COW_BACK_MAX, R(s.y - pawY + TEAT_DY)));
      s.cowY = s.y - back;
      s.cowX = R(pawX) - TEAT_DX;
      s.teatX = s.cowX + TEAT_DX; s.teatY = s.cowY + TEAT_DY;
      s.pailX = s.teatX + PAIL_DX; s.pailY = s.y + PAIL_DY;
      s.stoolH = Math.max(STOOL_MIN, R(-rig.hipY * rig.scale) - SIT_ROOT_Y + 1);
      s.next = 0; s.fill = 0; s.count = 0; s.bumpT = 0; s.refuseT = 0; s.squirtT = 0; s.pailT = 0;
      // The first calm is seeded off the SEAT INDEX, not off rng: the coop seeds its hens from `20 + i * 11` and
      // its rooster from ROOSTER_MIN, the orchard its first spawn from SPAWN_MIN, and the pond draws nothing until
      // a cast - none of the three touches rng in enter(). GDD section 5 wants randomness inside update(), and
      // drawing here would hang the byre's opening state off wherever the shared stream happened to be left.
      // i * 53 modulo the range walks the four cows a third of a cycle apart (150 / 203 / 256 / 198).
      s.cow = { kind: i & 1, state: CALM, t: CALM_MIN + (i * 53) % (CALM_MAX - CALM_MIN + 1) };
      seatAnim(s, 'milkIdle', true);
      // four people at four stools, not one pose printed four times: each breath starts a beat later (pose only)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, tx: 0, ty: 0, slot: 0 });
    this.hopCursor = 0;
    this.splashes = [];
    for (let i = 0; i < MAX_SPLASHES; i++) this.splashes.push({ t: SPLASH_FRAMES, x: 0, y: 0 });
    this.splashCursor = 0;
    const need = run ? run.order.needs.find((x) => x.id === 'milk') : null;
    // the remainder, not the whole order: the map may already have banked some (the orchard, pond and coop agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.kicks = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'PUMP: ' + game.input.keyText(0, 'action') + ' THEN ' + game.input.keyText(0, 'alt') + '   WATCH THE COW';
    this.clock = makeClock();
    // the sorted pass's fixed index array: four objects per stall (the cow, its pail, the stool, the milker)
    const total = n * 4;
    this.sortIdx = new Int16Array(total); this.sortKey = new Float64Array(total);
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) this.hops[i].t++;
    for (let i = 0; i < this.splashes.length; i++) if (this.splashes[i].t < SPLASH_FRAMES) this.splashes[i].t++;
    const clock = this.clock;
    if (clock.phase === 0) {
      for (let i = 0; i < this.seats.length; i++) { const s = this.seats[i]; this.stepCow(s); this.stepSeat(s, input); }
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat, no cow moves and no press counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('milk', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /** One cow's patience: calm for a seeded 150..260, then the telegraph, then the window, then calm again. */
  stepCow(s: DairySeat): void {
    const c = s.cow;
    if (c.state === CALM) { if (--c.t <= 0) { c.state = WARN; c.t = TELEGRAPH; } return; }
    if (c.state === WARN) { if (--c.t <= 0) { c.state = KICK; c.t = KICK_FRAMES; } return; }
    if (--c.t <= 0) { c.state = CALM; c.t = rng.int(CALM_MIN, CALM_MAX); }
  }

  /**
   * One seat's frame. The beats run down first because they lock the buttons, then the two presses are read by
   * SLOT (never anyPressed) and resolved in one place: inside the kick window ANY press is a kick, otherwise the
   * button that is next is a squirt and the other one is refused. A frame that carries both buttons at once counts
   * as the one that is next - a player mashing both is pumping, not cheating, and the alternation still advances.
   */
  stepSeat(s: DairySeat, input: Input): void {
    if (s.squirtT > 0) s.squirtT--;
    if (s.refuseT > 0) s.refuseT--;
    if (s.pailT > 0) s.pailT--;
    if (s.bumpT > 0) {
      s.bumpT--;
      if (s.bumpT === 0) seatAnim(s, 'milkIdle', true);
      s.player.tick();
      return;
    }
    const a = input.pressed(s.slot, 'action'), b = input.pressed(s.slot, 'alt');
    if (a || b) {
      if (s.cow.state === KICK) this.kick(s);
      else if (s.next === 0 ? a : b) this.pump(s);
      else this.refuse(s);
    }
    if (s.bumpT === 0 && s.refuseT === 0 && s.player.done) seatAnim(s, 'milkIdle');
    s.player.tick();
  }

  /** One accepted press: a squirt, the alternation flips, and the sixth one fills the pail. */
  pump(s: DairySeat): void {
    const down = s.next;
    s.next = s.next === 0 ? 1 : 0;
    s.fill++;
    s.squirtT = SQUIRT_FRAMES;
    seatAnim(s, down === 0 ? 'pumpR' : 'pumpL', true);
    ringAt(s.pailX, s.pailY - PAIL_H, 3, 10, UI.cream, 2, 10, true, true);
    if (s.fill >= PUMP_PER_PAIL) this.bank(s);
  }

  /**
   * A full pail: +1 milk for the PARTY, the pail flies to the next free slot on the churn rack, a fresh one slides
   * in under the cow and the alternation resets to ACTION so nobody has to remember where they were.
   */
  bank(s: DairySeat): void {
    s.fill = 0; s.next = 0; s.pailT = PAIL_LAND;
    s.count++; this.setTotal(this.total + 1);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    const slot = Math.min(this.total - 1, CHURN_X.length - 1);
    h.t = 0; h.x0 = s.pailX; h.y0 = s.pailY; h.tx = CHURN_X[slot]; h.ty = ROWS.rack; h.slot = s.slot;
    ringAt(s.pailX, s.pailY - PAIL_H, 4, 18, SIGNAL.dairy, 2, 16, false, true);
    floatText(s.pailX, s.pailY - PAIL_H - 16, PLUS_ONE, s.colour, 1, true);
  }

  /** The wrong button: nothing happens to the pail, and the seat says so. */
  refuse(s: DairySeat): void { s.refuseT = REFUSE_FRAMES; seatAnim(s, 'balk', true); }

  /**
   * A press inside the kick window. The pail's progress is gone and, if the seat has banked any milk, one of those
   * goes too - the wormy apple's price, and the coop's hen's, so a player who has met one mini-game knows this one.
   * The alternation resets with it: a kicked milker should be looking at the cow, not remembering a button.
   */
  kick(s: DairySeat): void {
    s.bumpT = BUMP_FRAMES; s.fill = 0; s.next = 0; s.refuseT = 0; s.squirtT = 0; s.pailT = 0;
    seatAnim(s, 'bump', true);
    const sp = this.splashes[this.splashCursor]; this.splashCursor = (this.splashCursor + 1) % this.splashes.length;
    sp.t = 0; sp.x = s.pailX - 15; sp.y = s.pailY - 1;   // beside the pail, clear of the chevron tag at its foot
    burstDust(s.pailX, s.pailY, 3, 1.2, true);
    // paper-dark rings, never mint: SIGNAL.dairy says "press on this beat" and must never also say "you lost it"
    ringAt(s.pailX, s.pailY - 4, 4, 20, UI.paperDark, 2, 18, true, true);
    if (s.count > 0) {
      s.count--; this.setTotal(this.total - 1);
      // thrown to the milker's OPEN side, into the gap between this stall and the next cow's nose: at +18 it
      // landed on the sheep's own brow through the whole bump beat, and ART_STYLE 0.6 keeps that row clear
      floatText(s.x + 26, s.y - 58, MINUS_ONE, s.colour, 1, true);
    }
    this.kicks++;
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat that banked anything cheers, one that did not sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.bumpT = 0; s.refuseT = 0; s.squirtT = 0; s.cow.state = CALM;
      seatAnim(s, s.count > 0 ? 'cheer' : 'sad', true);
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layers, f = this.frame;
    blitAt(ctx, L.wall.L, 0, L.wall.y);
    this.drawFlier(ctx, f);
    this.drawChurns(ctx);
    blitAt(ctx, L.floor.L, 0, L.floor.y);
    particles.draw(ctx, null, 'back');
    // ground contact first: every cow, every pail, every milker, then the spills lying flat on the straw
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      drawShadow(ctx, s.cowX - 6, s.cowY, 78, 0.38, 0);
      drawShadow(ctx, s.pailX, s.pailY, 26, 0.32, 0);
      drawShadow(ctx, s.x, s.y, s.rig.width + 18, 0.4, 0);   // wide enough to carry the stool's feet too
    }
    for (let i = 0; i < this.splashes.length; i++) { const sp = this.splashes[i]; if (sp.t < SPLASH_FRAMES) drawSplash(ctx, sp.x, sp.y, (sp.t / SPLASH_STEP) | 0); }
    this.drawSorted(ctx, f);
    for (let i = 0; i < this.seats.length; i++) this.drawJetAt(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    // the chevrons after the near lip: the one thing a first-time player must read is never behind anything
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const refused = s.refuseT > 0;
      drawChevrons(ctx, s.pailX, s.pailY + CHEV_DY, s.next, refused ? UI.paperDark : s.colour, SIGNAL.dairy,
        refused && (f & 1) ? 1 : 0, ((f >> 3) & 1) === 0);
    }
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /**
   * Back to front by the row each thing stands on, slot as the tiebreak: the cow is behind its pail, the pail is
   * behind the stool, and the milker is in front of all three. Odd stalls stand five rows nearer, so this really
   * does interleave - a nearer stall's cow draws over the stall behind it where their edges meet.
   */
  drawSorted(ctx: CanvasRenderingContext2D, f: number): void {
    const idx = this.sortIdx, key = this.sortKey, ns = this.seats.length;
    let n = 0;
    for (let i = 0; i < ns; i++) {
      const s = this.seats[i];
      idx[n] = i * 4; key[n++] = s.cowY * 32 + i;
      idx[n] = i * 4 + 1; key[n++] = s.pailY * 32 + 4 + i;
      idx[n] = i * 4 + 2; key[n++] = s.y * 32 + 8 + i;
      idx[n] = i * 4 + 3; key[n++] = s.y * 32 + 12 + i;
    }
    for (let i = 1; i < n; i++) {
      const k = key[i], id = idx[i]; let j = i - 1;
      while (j >= 0 && key[j] > k) { key[j + 1] = key[j]; idx[j + 1] = idx[j]; j--; }
      key[j + 1] = k; idx[j + 1] = id;
    }
    for (let i = 0; i < n; i++) {
      const id = idx[i], s = this.seats[(id / 4) | 0], kind = id & 3;
      if (kind === 0) this.drawCowAt(ctx, s, f);
      else if (kind === 1) this.drawPailAt(ctx, s);
      else if (kind === 2) drawStool(ctx, s.x, s.y, s.stoolH);
      else this.drawSeat(ctx, s);
    }
  }

  /**
   * One cow. The telegraph BLINKS the warning mark on a 4-frame beat and the window holds it solid with the hoof
   * cocked, so the two halves of the beat are two pictures rather than two speeds (the coop's rooster learned the
   * same lesson the other way round: its comb had to keep flashing through the charge). The chew is a slow
   * index-hashed beat off the frame counter, one cow to the next, so a row of four never chews in unison.
   */
  drawCowAt(ctx: CanvasRenderingContext2D, s: DairySeat, f: number): void {
    const c = s.cow, warn = c.state === WARN, kickWin = c.state === KICK;
    const ear = warn || kickWin ? 1 : 0;
    const tail = kickWin ? 1 : warn ? 1 - c.t / TELEGRAPH : 0;
    const mark = kickWin || (warn && ((f >> 2) & 1)) ? SIGNAL.hot : null;
    const chew = c.state === CALM && (((f + s.slot * 37) >> 4) & 3) === 0 ? 1 : 0;
    drawCow(ctx, s.cowX, s.cowY, c.kind, ear, tail, chew, kickWin ? 1 : 0, mark);
  }

  drawPailAt(ctx: CanvasRenderingContext2D, s: DairySeat): void {
    drawPail(ctx, s.pailX, s.pailY, s.fill / PUMP_PER_PAIL, s.slot, s.pailT > 0 ? 1 + s.pailT * PAIL_LAND_K : 1);
  }

  /**
   * The squirt, drawn AFTER the sorted pass and stopped dead on the pail's rim. Inside the pass it belonged behind
   * the milker, which is where a stream from a teat physically is - and the capture showed the price: the paw is ON
   * the teat, so the paw covered every pixel of it and an accepted press had no jet at all. In front, the stream
   * leaves from under the paw and still ends at the rim, so it reads as milk going INTO the tin.
   */
  drawJetAt(ctx: CanvasRenderingContext2D, s: DairySeat): void {
    if (s.squirtT <= 0 || s.bumpT > 0) return;
    const k = 1 - s.squirtT / SQUIRT_FRAMES;
    drawJet(ctx, s.teatX - 5, s.teatY, s.pailX + 2, s.pailY - PAIL_H + 2, SIGNAL.dairy, k);
  }

  drawSeat(ctx: CanvasRenderingContext2D, s: DairySeat): void {
    const o = s.opts;
    o.x = s.x; o.y = s.y; o.facing = s.facing;
    drawRig(ctx, s.rig, s.player.pose, o);
  }

  /**
   * The banked pail on its way to the rack: a flat parabola over the cows, dropping onto its slot, with its own
   * shadow racing along the byre floor under it and shrinking as it climbs. The coop's popped egg and the
   * orchard's falling apples both carry one (coop.js drawArc, orchard.js draw) and for the same reason: a grey tin
   * pail crossing four brown cows needs the ground mark to say how high it is. The 26 and the 0.32 are the seat's
   * own pail shadow, so the tin leaves the floor with the shadow it was already standing in.
   */
  drawHop(ctx: CanvasRenderingContext2D, h: Hop): void {
    if (h.t >= HOP_FRAMES) return;
    const k = h.t / HOP_FRAMES;
    const x = h.x0 + (h.tx - h.x0) * k, y = h.y0 + (h.ty - h.y0) * k - Math.sin(k * Math.PI) * HOP_LIFT;
    drawShadow(ctx, x, h.y0, 26, 0.32, h.y0 - y);
    drawPail(ctx, x, y, 1, h.slot, 1);
  }

  /** The rack is the party's score: one churn per banked milk, minus whatever is still in the air. */
  drawChurns(ctx: CanvasRenderingContext2D): void {
    let flying = 0;
    for (let i = 0; i < this.hops.length; i++) if (this.hops[i].t < HOP_FRAMES) flying++;
    const n = Math.min(CHURN_X.length, Math.max(0, this.total - flying));
    for (let i = 0; i < n; i++) drawChurn(ctx, CHURN_X[i], ROWS.rack);
  }

  /**
   * The byre's swallow, flying its circuit under the eave. Draw only: it reads the screen's frame counter and
   * nothing else, never drops below the churn rack, and is the single per-frame mark on 640 px of wall.
   */
  drawFlier(ctx: CanvasRenderingContext2D, f: number): void {
    const span = 700, t = (f * 0.9) % span;
    drawSwallow(ctx, -30 + t, 72 + Math.sin(t * 0.021) * 16, (f >> 2) & 1);
  }

  override summary() {
    return {
      total: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText, kicks: this.kicks,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), next: s.next, fill: s.fill, count: s.count, bumpT: s.bumpT, refuseT: s.refuseT })),
      cows: this.seats.map((s) => [COW_STATES[s.cow.state], s.cow.t]),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total, this.kicks);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.next, s.fill, s.count, s.bumpT, s.refuseT, s.squirtT, s.pailT, s.cow.state, s.cow.t);
    }
    return f;
  }
}
