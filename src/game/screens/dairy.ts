// DAIRY - PUMP (docs/GDD.md section 5; docs/ART_STYLE.md section 1 "Dairy"). A byre on a warm afternoon: every seat
// sits STATIC on its own three-legged stool with a cow in front of it and a tin pail under the udder, and milks by
// TAPPING `action` over and over. Every press is a squirt; PUMP_PER_PAIL of them fill a pail, the pail hops onto
// the churn rack as +1 milk for the PARTY and a fresh one slides under the cow. The cows are placid: nothing in
// this byre kicks, refuses or costs anything, and the only question the scene asks is how fast you can tap.
//
// A BUTTER visit is the same byre with a second beat: a barrel churn stands beside every stall, the full pail pours
// into it instead of flying to the rack, the milker turns round on the stool and CRANKS - the same tapping, on a
// handle - and CHURN_PRESSES turns later a pat of butter hops to the rack as +1 butter, a fresh pail slides in and
// the milker turns back to the cow. Milk is what you pump and butter is what you turn, so the two visits are two
// jobs and not one job with two glyphs (docs/GDD.md section 5).
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
import { INGREDIENTS } from '../../content/recipes.ts';
import { gatherTarget } from '../run.ts';
import { ROWS, SEAT_X, SEAT_PITCH, CHURN_X, dairyLayers } from '../../art/backgrounds/dairy.ts';
import {
  drawCow, drawStool, drawPail, drawJet, drawChevrons, drawChurn, drawSwallow, drawBarrelChurn, drawCrankArm,
  TEAT_DX, TEAT_DY, PAIL_H, CHURN_W, CHURN_ABOVE_HUB, SIT_ROOT_Y, STOOL_MIN, DAIRY_ANIMS,
} from '../../art/dairyProps.ts';
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
 * CHURN_PRESSES 12: the same dozen as the pail, so a pat of butter is exactly twice the tapping of a pail of milk.
 * The butter orders ask for one or two (content/recipes.js), which is 24..48 taps at a child's pace inside a
 * 2400-frame round with half the clock to spare; asking more per pat would make butter the one thing in the game a
 * slow tapper cannot finish, and the whole point of the dozen is that nobody can.
 */
const CHURN_PRESSES = 12;
/** The crank turns this far per press (draw-only), so twelve presses are one full turn: the round is the number. */
const CRANK_STEP = 360 / CHURN_PRESSES;
/** The two beats a butter seat is in: pumping the cow, or cranking the churn. */
const MILK = 0, CHURN = 1;
/** The barrel stands this far right of the crank hub (its axle is on the near face, in from the chime). */
const CHURN_DX = 10;
/**
 * The squirt beat. At a comfortable 12-frame press cadence a 6-frame jet is up for half of a fast player's frames
 * and reads as continuous milking, and it is still well inside the 12, so a jet never survives into the next press.
 */
const SQUIRT_FRAMES = 6;
/** A fresh pail slides in: the tin squashes 3 % per frame left, the same landing beat the pond's bucket takes. */
const PAIL_LAND = 5, PAIL_LAND_K = 0.03;
/** The full pail's flight to the rack, and how high it arcs over the cows on the way. */
const HOP_FRAMES = 16, HOP_LIFT = 26, MAX_HOPS = 4;
/** What is in the air: a pail to the rack (milk), a pail into the churn (the pour), a pat of butter to the rack. */
const HOP_PAIL = 0, HOP_POUR = 1, HOP_BUTTER = 2;
/** The pour is a short hop and a low one: the pail goes over the milker's shoulder into the barrel beside it. */
const POUR_FRAMES = 12, POUR_LIFT = 20;
/** The pat of butter on the rack and in the air: art/food.js's own glyph at this half-size. */
const PAT_S = 6;
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
const FALLBACK_TARGET = 3;
const PLUS_ONE = '+1', TITLE = 'BUTTERCUP DAIRY';

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
  /** MILK or CHURN: which of the two beats a butter seat is in (always MILK on a milk visit). */
  phase: number;
  /** Turns of the crank on the current pat (0..CHURN_PRESSES). */
  churn: number;
  /** The barrel churn beside this stall: its base on the milker's row, its crank hub where the turned paw lands. */
  churnX: number;
  hubX: number;
  hubY: number;
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
  /** HOP_PAIL, HOP_POUR or HOP_BUTTER: what is flying and where it lands. */
  kind: number;
  /** Frames the flight takes and how high it arcs: the rack hop's, or the pour's shorter, lower ones. */
  frames: number;
  lift: number;
}

export class DairyScreen extends Screen {
  // The fields, for the checker only, in the order enter() fills them (the two the constructor seeds first).
  // `declare` for the reason game.ts gives over its own block: a plain field declaration would emit a class field
  // per name (es2022 defines them before the constructor body runs, and a screen's own declaration would also
  // define a base field back to undefined), and this screen has to keep the runtime it shipped with. `declare`
  // erases under tsc, under esbuild and under Node's type stripping alike, so the emitted class is the original.

  /** One seat per party member, in party order (not slot order); empty until enter() builds the stalls. */
  declare seats: DairySeat[];
  /**
   * What this visit gathers (game/run.js gatherTarget): milk by the pail, or butter, which is a pail of milk and
   * then the churn (see `butter`). `icon`/`hex` are its glyph, the sign prefix its name.
   */
  declare ing: string;
  declare icon: string;
  declare hex: string;
  declare signPrefix: string;
  declare clockIcon: (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
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
  /** True on a butter visit: the barrel churns stand, and a full pail pours instead of banking. */
  declare butter: boolean;
  /** The sorted pass's fixed index array: five objects per stall (the cow, its pail, the stool, the churn, the milker). */
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
      // the churn: on the milker's other side, its crank hub where the SAME paw lands once the milker has turned
      // round on the stool (the mirror of the udder's placement, off this rig's own arm)
      s.phase = MILK; s.churn = 0;
      s.hubX = R(s.x + p.shoulderX * rig.scale + reach * PAW_FWD); s.hubY = R(pawY);
      s.churnX = s.hubX + CHURN_DX;
      seatAnim(s, 'milkIdle', true);
      // four people at four stools, not one pose printed four times: each breath starts a beat later (pose only)
      for (let k = i * 11; k > 0; k--) s.player.tick();
    }
    this.hops = [];
    for (let i = 0; i < MAX_HOPS; i++) this.hops.push({ t: HOP_FRAMES, x0: 0, y0: 0, tx: 0, ty: 0, slot: 0, kind: HOP_PAIL, frames: HOP_FRAMES, lift: HOP_LIFT });
    this.hopCursor = 0;
    this.ing = gatherTarget(run, params.place, 'dairy');
    const ing = INGREDIENTS[this.ing] || INGREDIENTS.milk;
    this.icon = ing.icon; this.hex = ing.hex; this.signPrefix = ing.name + ': ';
    this.butter = this.ing === 'butter';
    const icon = this.icon, hex = this.hex;
    this.clockIcon = (c, x, y) => drawFood(c, icon, x, y, 4, hex);
    const need = run ? run.need(this.ing) : null;
    // the remainder, not the whole order: the map may already have banked some (the orchard, pond and coop agree)
    this.target = need ? Math.max(1, need.amount - need.have) : FALLBACK_TARGET;
    this.total = 0;
    this.countStr = '0/' + this.target;
    const key = game.input.keyText(0, 'action');
    this.hint = this.butter ? 'MILK: TAP ' + key + '   THEN CHURN: TAP ' + key + ' OVER AND OVER' : 'MILK: TAP ' + key + ' OVER AND OVER';
    this.cardKey = key;
    this.clock = makeClock();
    // the sorted pass's fixed index array: five objects per stall (the cow, its pail, the stool, the churn, the milker)
    const total = n * 5;
    this.sortIdx = new Int16Array(total); this.sortKey = new Float64Array(total);
  }

  override update(): void {
    super.update();
    const game = this.game, input = game.input;
    if (input.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (let i = 0; i < this.hops.length; i++) { const h = this.hops[i]; if (h.t < h.frames) h.t++; }
    const clock = this.clock;
    if (clock.phase === 0) {
      for (let i = 0; i < this.seats.length; i++) this.stepSeat(this.seats[i], input);
      if (this.total >= this.target) this.finish();
    } else {
      // the sign hangs: the crew holds its last beat and no press counts
      for (let i = 0; i < this.seats.length; i++) this.seats[i].player.tick();
      if (roundOver(clock)) {
        if (game.run) game.run.gather(this.ing, this.total);
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
    if (input.pressed(s.slot, 'action')) { if (s.phase === CHURN) this.crank(s); else this.pump(s); }
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
    if (s.fill >= PUMP_PER_PAIL) { if (this.butter) this.pour(s); else this.bank(s); }
  }

  /** A hop slot, filled in: what flies, from where to where, over how many frames and how high. */
  hop(kind: number, x0: number, y0: number, tx: number, ty: number, slot: number, frames: number, lift: number): void {
    const h = this.hops[this.hopCursor]; this.hopCursor = (this.hopCursor + 1) % this.hops.length;
    h.t = 0; h.kind = kind; h.x0 = x0; h.y0 = y0; h.tx = tx; h.ty = ty; h.slot = slot; h.frames = frames; h.lift = lift;
  }

  /**
   * A full pail: +1 milk for the PARTY, the pail flies to the next free slot on the churn rack, and a fresh one
   * slides in under the cow.
   */
  bank(s: DairySeat): void {
    s.fill = 0; s.pailT = PAIL_LAND;
    s.count++; this.setTotal(this.total + 1);
    const slot = Math.min(this.total - 1, CHURN_X.length - 1);
    this.hop(HOP_PAIL, s.pailX, s.pailY, CHURN_X[slot], ROWS.rack, s.slot, HOP_FRAMES, HOP_LIFT);
    ringAt(s.pailX, s.pailY - PAIL_H, 4, 18, SIGNAL.dairy, 2, 16, false, true);
    floatText(s.pailX, s.pailY - PAIL_H - 16, PLUS_ONE, s.colour, 1, true);
  }

  /**
   * A full pail on a butter visit: nothing is banked yet. The pail hops over the milker's shoulder into the barrel,
   * the milker turns round on the stool to face the crank, and the seat is in its CHURN beat until the pat is out.
   * The fresh pail slides in now rather than after the pat, so the cow is never left without one.
   */
  pour(s: DairySeat): void {
    s.fill = 0; s.pailT = PAIL_LAND;
    s.phase = CHURN; s.churn = 0; s.facing = 1;
    this.hop(HOP_POUR, s.pailX, s.pailY, s.churnX, s.hubY - CHURN_ABOVE_HUB - 4, s.slot, POUR_FRAMES, POUR_LIFT);
    ringAt(s.pailX, s.pailY - PAIL_H, 4, 18, SIGNAL.dairy, 2, 16, false, true);
    seatAnim(s, 'milkIdle', true);
  }

  /** One turn of the crank: the paws swap over as they do on the udder, and the twelfth turn brings the butter. */
  crank(s: DairySeat): void {
    const down = s.churn & 1;
    s.churn++;
    s.squirtT = SQUIRT_FRAMES;   // the crank's swing between one press and the next reads this, as the jet does
    seatAnim(s, down === 0 ? 'pumpR' : 'pumpL', true);
    ringAt(s.hubX, s.hubY, 3, 10, UI.cream, 2, 10, true, true);
    if (s.churn >= CHURN_PRESSES) this.pat(s);
  }

  /** The butter comes: +1 for the PARTY, the pat hops out of the barrel to the rack, and the milker turns back to the cow. */
  pat(s: DairySeat): void {
    s.churn = 0; s.phase = MILK; s.facing = -1;
    s.count++; this.setTotal(this.total + 1);
    const slot = Math.min(this.total - 1, CHURN_X.length - 1);
    this.hop(HOP_BUTTER, s.churnX, s.hubY - CHURN_ABOVE_HUB - 6, CHURN_X[slot], ROWS.rack, s.slot, HOP_FRAMES, HOP_LIFT);
    ringAt(s.churnX, s.hubY - CHURN_ABOVE_HUB, 4, 18, SIGNAL.dairy, 2, 16, false, true);
    floatText(s.churnX, s.hubY - CHURN_ABOVE_HUB - 18, PLUS_ONE, s.colour, 1, true);
    seatAnim(s, 'milkIdle', true);
  }

  setTotal(n: number): void { this.total = n; this.countStr = n + '/' + this.target; }

  /** The round is over: drop the sign; a seat that banked anything cheers, one that did not sulks. */
  finish(): void {
    if (this.clock.phase !== 0) return;
    endRound(this.clock, this.signPrefix + this.total);
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
      if (this.butter) drawShadow(ctx, s.churnX, s.y, CHURN_W + 12, 0.35, 0);
    }
    this.drawSorted(ctx, f);
    for (let i = 0; i < this.seats.length; i++) this.drawJetAt(ctx, this.seats[i]);
    for (let i = 0; i < this.hops.length; i++) this.drawHop(ctx, this.hops[i]);
    blitAt(ctx, L.near.L, 0, L.near.y);
    particles.draw(ctx, null, 'front');
    // the chevrons after the near lip: the one thing a first-time player must read is never behind anything. The
    // lit chevron swaps sides with every press, so a tapping player sees the taps land - at the pail's foot while
    // the seat pumps, at the churn's foot while it cranks, so the tag is always under the thing the taps go into.
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.phase === CHURN) drawChevrons(ctx, s.churnX, s.y + CHEV_DY, s.churn & 1, s.colour, SIGNAL.dairy, 0, ((f >> 3) & 1) === 0);
      else drawChevrons(ctx, s.pailX, s.pailY + CHEV_DY, s.fill & 1, s.colour, SIGNAL.dairy, 0, ((f >> 3) & 1) === 0);
    }
    resetPlates();
    for (let i = 0; i < this.seats.length; i++) drawSeatPlate(ctx, this.seats[i], PLATES);
    drawClock(ctx, this.clock, this.countStr, this.clockIcon, TITLE);
    drawControlCard(ctx, this.frame, this.frame, SCHEMES, this.cardKey);
    drawHint(ctx, this.hint);
    drawEndSign(ctx, this.clock, f);
  }

  /**
   * Back to front by the row each thing stands on, slot as the tiebreak: the cow is behind its pail, the pail is
   * behind the stool, the churn (a butter visit only) behind the milker, and the milker is in front of all four.
   * Odd stalls stand five rows nearer, so this really does interleave - a nearer stall's cow draws over the stall
   * behind it where their edges meet. The crank's arm is laid back over the milker straight after it, so the knob
   * a cranking seat is turning reads on top of the paw that is turning it.
   */
  drawSorted(ctx: CanvasRenderingContext2D, f: number): void {
    const idx = this.sortIdx, key = this.sortKey, ns = this.seats.length;
    let n = 0;
    for (let i = 0; i < ns; i++) {
      const s = this.seats[i];
      idx[n] = i * 5; key[n++] = s.cowY * 32 + i;
      idx[n] = i * 5 + 1; key[n++] = s.pailY * 32 + 4 + i;
      idx[n] = i * 5 + 2; key[n++] = s.y * 32 + 8 + i;
      if (this.butter) { idx[n] = i * 5 + 3; key[n++] = s.y * 32 + 12 + i; }
      idx[n] = i * 5 + 4; key[n++] = s.y * 32 + 16 + i;
    }
    for (let i = 1; i < n; i++) {
      const k = key[i], id = idx[i]; let j = i - 1;
      while (j >= 0 && key[j] > k) { key[j + 1] = key[j]; idx[j + 1] = idx[j]; j--; }
      key[j + 1] = k; idx[j + 1] = id;
    }
    for (let i = 0; i < n; i++) {
      const id = idx[i], s = this.seats[(id / 5) | 0], kind = id % 5;
      if (kind === 0) this.drawCowAt(ctx, s, f);
      else if (kind === 1) this.drawPailAt(ctx, s);
      else if (kind === 2) drawStool(ctx, s.x, s.y, s.stoolH);
      else if (kind === 3) drawBarrelChurn(ctx, s.churnX, s.y, s.hubY, this.crankAngle(s), s.phase !== CHURN);
      else { this.drawSeat(ctx, s); if (s.phase === CHURN) drawCrankArm(ctx, s.churnX, s.hubY, this.crankAngle(s)); }
    }
  }

  /**
   * The crank's angle, draw-only: CRANK_STEP per press, and through the SQUIRT_FRAMES after a press it swings the
   * last step in rather than snapping, so a tap is seen to turn the handle. The arm starts pointing at the milker
   * (180, the handle at rest where the paw is) so the first turn goes over the top.
   */
  crankAngle(s: DairySeat): number {
    const swing = s.phase === CHURN && s.squirtT > 0 ? CRANK_STEP * (s.squirtT / SQUIRT_FRAMES) : 0;
    return 180 + s.churn * CRANK_STEP - swing;
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
    if (s.squirtT <= 0 || s.bumpT > 0 || s.phase === CHURN) return;
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
    if (h.t >= h.frames) return;
    const k = h.t / h.frames;
    const x = h.x0 + (h.tx - h.x0) * k, y = h.y0 + (h.ty - h.y0) * k - Math.sin(k * Math.PI) * h.lift;
    if (h.kind === HOP_BUTTER) { drawShadow(ctx, x, h.y0, 16, 0.3, h.y0 - y); drawFood(ctx, 'butter', R(x), R(y), PAT_S, this.hex); return; }
    drawShadow(ctx, x, h.y0, 26, 0.32, h.y0 - y);
    drawPail(ctx, x, y, 1, h.slot, 1);
  }

  /**
   * The rack is the party's score: one tin churn per banked milk, or one pat of butter per pat churned, minus
   * whatever is still in the air on its way there.
   */
  drawChurns(ctx: CanvasRenderingContext2D): void {
    let flying = 0;
    for (let i = 0; i < this.hops.length; i++) { const h = this.hops[i]; if (h.t < h.frames && h.kind !== HOP_POUR) flying++; }
    const n = Math.min(CHURN_X.length, Math.max(0, this.total - flying));
    for (let i = 0; i < n; i++) { if (this.butter) drawFood(ctx, 'butter', CHURN_X[i], ROWS.rack - PAT_S, PAT_S, this.hex); else drawChurn(ctx, CHURN_X[i], ROWS.rack); }
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
      seats: this.seats.map((s) => ({ slot: s.slot, x: R(s.x), fill: s.fill, count: s.count, bumpT: s.bumpT, phase: s.phase, churn: s.churn })),
      cows: this.seats.map((s) => s.cow.kind),
    };
  }

  /** Every sim field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.clock.timer, this.clock.phase, this.clock.signT, this.total);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      f.push(s.fill, s.count, s.bumpT, s.squirtT, s.pailT, s.phase, s.churn, s.facing);
    }
    return f;
  }
}
