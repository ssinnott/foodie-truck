// DAIRY - PUMP (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Dairy"). A byre on a warm afternoon: every seat
// sits STATIC on its own three-legged stool with a cow in front of it and a tin pail under the udder, and milks by
// TAPPING `action` over and over. Every press is a squirt; PUMP_PER_PAIL of them fill a pail, the pail hops onto
// the churn rack as +1 milk for the PARTY and a fresh one slides under the cow. The cows are placid: nothing in
// this byre kicks, refuses or costs anything, and the only question the scene asks is how fast you can tap.
//
// Determinism (docs/ARCHITECTURE.md section 0): every seat is a plain sim object built in enter() and never grown;
// nothing in update() draws from rng, calls Math.sin/cos or reads a clock, and input is read by seat slot only. The
// stall geometry is arithmetic on each rig's own proportions with the two trig constants below precomputed, so four
// browsers place four identical stalls. The squirt's bright head, the jet's slide, the pail's hop arc, the swallow
// and the particles are draw only and stay out of checksumFields().
import { UI, SIGNAL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Input, ScreenParams } from '../game.ts';
import { particles } from '../../engine/particles.ts';
import { blitAt } from '../../art/layers.ts';
import { drawShadow, floatText, ringAt } from '../../art/fx.ts';
import { drawFood } from '../../art/food.ts';
import { drawRig } from '../../lib/art/rig.ts';
import { F } from '../../content/critters/common.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { ROWS, SEAT_X, SEAT_PITCH, CHURN_X, dairyLayers } from '../../art/backgrounds/dairy.ts';
import { drawCow, drawStool, drawPail, drawJet, drawChevrons, drawChurn, drawSwallow, TEAT_DX, TEAT_DY, PAIL_H } from '../../art/dairyProps.ts';
import { makeSeats, seatAnim, drawSeatPlate, makeClock, tickClock, endRound, roundOver, drawClock, drawEndSign, PLATES, resetPlates } from '../minigame.ts';
import type { Clock, Seat } from '../minigame.ts';
import { drawControlCard } from '../controlcard.ts';
import type { CardScheme } from '../controlcard.ts';
import { drawHint } from '../ui.ts';

/** The HOW TO PLAY card's pictograms (game/controlcard.ts), in the order they are read. */
const SCHEMES: readonly CardScheme[] = Object.freeze(['mash']);
const R = Math.round;

/**
 * PUMP_PER_PAIL 12: twelve taps is about 2.4 s at a comfortable 5 presses/s and 6 s at a careful 2 presses/s, so a
 * solo player banks the shipped fallback target of 3 in under a third of the 2400-frame round even at the slow
 * rate - long enough that a pail feels earned, short enough that the clock stays a backstop and never the
 * opponent: this scene has no opponent.
 */
const PUMP_PER_PAIL = 12;
/**
 * The squirt beat. At a comfortable 12-frame press cadence a 6-frame jet is up for half of a fast player's frames
 * and reads as continuous milking, and it is still well inside the 12, so a jet never survives into the next press.
 */
const SQUIRT_FRAMES = 6;
/** A fresh pail slides in: the tin squashes 3 % per frame left, the same landing beat the pond's bucket takes. */
const PAIL_LAND = 5, PAIL_LAND_K = 0.03;
/** The full pail's flight to the rack, and how high it arcs over the cows on the way. */
const HOP_FRAMES = 16, HOP_LIFT = 26, MAX_HOPS = 4;
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
const PLUS_ONE = '+1', TITLE = 'BUTTERCUP DAIRY', SIGN_PREFIX = 'MILK: ';
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
 * pumpR / pumpL are the tapping made visible ON the critter: the milking paw pulls down while the braced paw rides
 * up, and the two alternate press by press so a run of taps reads as a rhythm rather than one pose stuttering.
 * Both are non-looping and fall back to milkIdle when they finish, so a crew that has stopped pumping breathes
 * instead of freezing mid-pull.
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

/** One cow: which of the two looks to draw (art/dairyProps.ts drawCow). It stands there and chews. */
export interface Cow {
  kind: number;
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
  /** Presses into the pail under the cow (0..PUMP_PER_PAIL). */
  fill: number;
  /** Frames left of the squirt the last press started. */
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
  /** Milk the round is played to: what the order still needs, or FALLBACK_TARGET with no run. */
  declare target: number;
  /** Milk in the party's churns right now. */
  declare total: number;
  /** "3/4" for the clock ticket, rebuilt by setTotal() as the count changes. */
  declare countStr: string;
  /** The hint line along the bottom. */
  declare hint: string;
  /** What the action key is called on seat 0's device, for the HOW TO PLAY card. */
  declare cardKey: string;
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
      s.fill = 0; s.count = 0; s.bumpT = 0; s.squirtT = 0; s.pailT = 0;
      s.cow = { kind: i & 1 };
      seatAnim(s, 'milkIdle', true);
      // four people at four stools, not one pose printed four times: each breath starts a beat later (pose only)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, tx: 0, ty: 0, slot: 0 });
    this.hopCursor = 0;
    const need = run ? run.order.needs.find((x) => x.id === 'milk') : null;
    // the remainder, not the whole order: the map may already have banked some (the orchard, pond and coop agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    this.hint = 'MILK: TAP ' + game.input.keyText(0, 'action') + ' OVER AND OVER';
    this.cardKey = game.input.keyText(0, 'action');
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
    const clock = this.clock;
    if (clock.phase === 0) {
      for (let i = 0; i < this.seats.length; i++) this.stepSeat(this.seats[i], input);
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat and no press counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather('milk', this.total);
        game.replace('map');
        return;
      }
    }
    if (tickClock(clock)) this.finish();
  }

  /**
   * One seat's frame. The beats run down first, then the press is read by SLOT (never anyPressed): every `action`
   * press is a squirt, and the twelfth one fills the pail. `bumpT` is only ever set by the shared furniture (a seat
   * arrives with it at 0 and nothing here raises it), but it is still honoured so the shared bump beat, if a future
   * rule ever uses it, locks the buttons the way it does in every other mini-game.
   */
  stepSeat(s: DairySeat, input: Input): void {
    if (s.squirtT > 0) s.squirtT--;
    if (s.pailT > 0) s.pailT--;
    if (s.bumpT > 0) {
      s.bumpT--;
      if (s.bumpT === 0) seatAnim(s, 'milkIdle', true);
      s.player.tick();
      return;
    }
    if (input.pressed(s.slot, 'action')) this.pump(s);
    if (s.bumpT === 0 && s.player.done) seatAnim(s, 'milkIdle');
    s.player.tick();
  }

  /** One press: a squirt, the paws swap over, and the twelfth one fills the pail. */
  pump(s: DairySeat): void {
    const down = s.fill & 1;
    s.fill++;
    s.squirtT = SQUIRT_FRAMES;
    seatAnim(s, down === 0 ? 'pumpR' : 'pumpL', true);
    ringAt(s.pailX, s.pailY - PAIL_H, 3, 10, UI.cream, 2, 10, true, true);
    if (s.fill >= PUMP_PER_PAIL) this.bank(s);
  }

  /**
   * A full pail: +1 milk for the PARTY, the pail flies to the next free slot on the churn rack, and a fresh one
   * slides in under the cow.
   */
  bank(s: DairySeat): void {
    s.fill = 0; s.pailT = PAIL_LAND;
    s.count++; this.setTotal(this.total + 1);
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    const slot = Math.min(this.total - 1, CHURN_X.length - 1);
    h.t = 0; h.x0 = s.pailX; h.y0 = s.pailY; h.tx = CHURN_X[slot]; h.ty = ROWS.rack; h.slot = s.slot;
    ringAt(s.pailX, s.pailY - PAIL_H, 4, 18, SIGNAL.dairy, 2, 16, false, true);
    floatText(s.pailX, s.pailY - PAIL_H - 16, PLUS_ONE, s.colour, 1, true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat that banked anything cheers, one that did not sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, SIGN_PREFIX + this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      s.bumpT = 0; s.squirtT = 0;
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
    // ground contact first: every cow, every pail, every milker
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      drawShadow(ctx, s.cowX - 6, s.cowY, 78, 0.38, 0);
      drawShadow(ctx, s.pailX, s.pailY, 26, 0.32, 0);
      drawShadow(ctx, s.x, s.y, s.rig.width + 18, 0.4, 0);   // wide enough to carry the stool's feet too
    }
    this.drawSorted(ctx, f);
    for (let i = 0; i < this.seats.length; i++) this.drawJetAt(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    // the chevrons after the near lip: the one thing a first-time player must read is never behind anything. The
    // lit chevron swaps sides with every press, so a tapping player sees the taps land.
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      drawChevrons(ctx, s.pailX, s.pailY + CHEV_DY, s.fill & 1, s.colour, SIGNAL.dairy, 0, ((f >> 3) & 1) === 0);
    }
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
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
   * One cow, chewing: a slow index-hashed beat off the frame counter, one cow to the next, so a row of four never
   * chews in unison. Ears up, tail down, no mark: there is nothing to warn about in this byre.
   */
  drawCowAt(ctx: CanvasRenderingContext2D, s: DairySeat, f: number): void {
    const chew = (((f + s.slot * 37) >> 4) & 3) === 0 ? 1 : 0;
    drawCow(ctx, s.cowX, s.cowY, s.cow.kind, 0, 0, chew, 0, null);
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
      total: this.total, target: this.target, timer: this.clock.timer, phase: this.clock.phase, sign: this.clock.signText,
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), fill: s.fill, count: s.count, bumpT: s.bumpT })),
      cows: this.seats.map((s) => s.cow.kind),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.fill, s.count, s.bumpT, s.squirtT, s.pailT);
    }
    return f;
  }
}
