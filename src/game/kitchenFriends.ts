// THE FRIENDS IN THE KITCHEN (docs/GDD.md section 6): the two of the cast who ride along with the party
// (game/friends.ts) lend a hand while the crew cook - one TAKES THE ORDERS and the other RUNS ABOUT.
//
// The ORDER-TAKER stands on the floor under the hatch with an order pad on a clipboard and takes the line's orders a
// diner at a time, front of the line first: the diner waves and says their dish (a paper bead with its picture
// comes up over their head), the friend looks up at them, writes it down a line at a time with their head over the
// pad, and nods; then the next diner, all down the line, and after a breather round it again - until the bell,
// when the pad goes away and they cheer the plates out. The RUNNER runs about the floor in front of the counter,
// from one spot to the next at random, stopping between dashes for a breath, a hop, a cheer or a look round, and
// cheering on the spot when the bell rings.
//
// NOTHING HERE IS SIMULATION. The friends take no input, claim no step, score nothing and draw nothing from the
// gameplay rng: the runner's chances come off a stream of its own (makeRng, seeded from the run's seed and day),
// stepped on the fixed step in update() as the kitchen's flights are, so every peer draws the same runner while
// none of it reaches checksumFields - a friend could not make two peers disagree about a dish if it tried. The
// order-taker is a frame counter and the line's own order. Both stand IN FRONT of the walk lane, their feet below
// row 300, so neither ever reaches the counter - no station, prop, timing card or plate on the shelf is ever covered
// - and a cook is only ever passed in front of, as anyone nearer the front of the room would be. Rigs, players and
// the runner's stream are built once in enter(), and draw() allocates nothing.
import { UI } from '../constants.ts';
import { makeRng } from '../lib/engine/rng.ts';
import type { RngInstance } from '../lib/engine/rng.ts';
import { drawRig, jointScreen } from '../lib/art/rig.ts';
import type { DrawRigOpts, Rig, RigWeapon } from '../lib/art/rig.ts';
import type { Point } from '../lib/art/rigParts.ts';
import type { AnimPlayer, AnimSet } from '../lib/art/animation.ts';
import { drawShadow } from '../art/fx.ts';
import { drawDish } from '../art/dishes.ts';
import { F } from '../content/critters/common.ts';
import { ITEMS } from '../content/critters/items.ts';
import { ridersFor } from './friends.ts';
import type { FriendJob } from './friends.ts';
import type { Run } from './game.ts';

const R = Math.round, TAU = Math.PI * 2;
/** Where the order-taker stands: on the floor under the hatch's left half, facing the line - between the plates'
 *  counts on the shelf above them (x 516 and 572), and far enough forward that the tallest hat in the cast (the head
 *  chef's toque, 95 px over the feet at the top of the listen) stays under the counts' row (234..241). */
export const TAKER_X = 552, TAKER_Y = 337;
/** The runner's patch of floor: the front of the room, from clear of the crate in the near corner to clear of the
 *  order-taker, every foot far enough forward of the walk lane (whose cooks stand on row 252) that the tallest ears
 *  in the cast, mid-hop, stay under the counter's top (row 206): measured, row 220 at the worst. */
export const RUN_X0 = 96, RUN_X1 = 466, RUN_Y0 = 308, RUN_Y1 = 334;
/** The runner's pace across the floor (px/frame, chosen per dash) and up and down it, and the shortest dash worth
 *  setting off on. A cook walks at 2. */
const RUN_SPEED_MIN = 2, RUN_SPEED_MAX = 3, RUN_SPEED_Y = 1, MIN_DASH = 70;
/** Between dashes: a breath of BREATH frames, or a hop (the cast's own), a cheer of CHEER_REST, or a look round
 *  that turns about every LOOK_TURN frames for LOOK_REST; the chances of each, in that order, sum to one. */
const BREATH_MIN = 18, BREATH_MAX = 50, CHEER_REST = 36, LOOK_REST = 40, LOOK_TURN = 13;
const REST_ODDS = [0.45, 0.2, 0.15, 0.2];
/** Salt for the runner's own stream, so the same seed never draws the day's plan and the runner's first dash alike. */
const RUN_SALT = 0x5c3f;
/** One diner's order: they wave for WAVE_FRAMES and their bead is up from the start until BEAD_OFF; the friend looks
 *  up, writes from WRITE_AT (a line every LINE_EVERY frames, three lines), nods at NOD_AT, and the next diner is
 *  asked at TAKE_FRAMES. A breather of ROUND_REST after the back of the line, then the front again. */
const WAVE_FRAMES = 24, WRITE_AT = 16, LINE_EVERY = 10, PAD_LINES = 3, NOD_AT = 50, BEAD_OFF = 60, TAKE_FRAMES = 70, ROUND_REST = 120;
/** The bead over the diner being asked: its radius and the dish's size in it, by the diner's draw scale, a POINT_H
 *  point under it, and how far over the head's centre it floats (in head radii, clear of the tallest ears). The bead
 *  swells in over BEAD_POP frames. */
const BEAD_R = 8, BEAD_S = 4, BEAD_R_SMALL = 6, BEAD_S_SMALL = 3, POINT_H = 3, BEAD_LIFT = 2.3, BEAD_POP = 6;
/** The bell's cheer: the runner throws theirs CHEER_LAG after the order-taker. */
const CHEER_LAG = 6;

/**
 * The order-taker's own three beats, laid over the cast's table (AnimPlayer.setOverlay) so no cast member's own
 * animations change: LISTEN with the pad up in front of the chest and the head tipped up at the hatch, WRITE with
 * the head down over the pad and the paw working it, and the NOD that says got it. The pad is held where the cast's
 * own stir is (ART_STYLE section 8): in front of the chest, the paw well clear of the muzzle, the off paw down at
 * the far side so the apron stays visible.
 */
const PAD = { armR: [60, 44], armL: [-18, 8], weapon: 90 };
const TAKER_ANIMS: AnimSet = {
  listen: { loop: true, frames: [
    F(26, { ...PAD, torso: -2, head: -10, root: [0, 0], face: 'happy' }),
    F(26, { ...PAD, armR: [62, 42], torso: -1, head: -12, root: [0, 1], face: 'happy' }),
  ] },
  write: { loop: true, frames: [
    F(5, { ...PAD, torso: 4, head: 12, face: 'neutral' }, { ease: 'inout' }),
    F(5, { ...PAD, armR: [64, 40], torso: 5, head: 13, face: 'neutral' }, { ease: 'inout' }),
  ] },
  nod: { loop: false, frames: [
    F(5, { ...PAD, torso: 2, head: 16, face: 'happy' }, { ease: 'in' }),
    F(6, { ...PAD, torso: -2, head: -6, face: 'happy' }, { ease: 'out' }),
    F(6, { ...PAD, torso: -2, head: -10, face: 'happy' }),
  ] },
};

/** A friend's rig: the cast's own, plus the lines the order pad (content/critters/items.ts ITEMS.pad) reads off it. */
export interface FriendRig extends Rig {
  /** How many lines of the current order are written on the pad, 0..3. */
  padLines?: number;
}

/** One friend on the kitchen floor. */
export interface KitchenFriend {
  critter: string;
  job: FriendJob;
  rig: FriendRig;
  player: AnimPlayer;
  /** The animation it was last told to play, for the summary. */
  anim: string;
  /** Feet centre on the floor, and which way it faces. */
  x: number;
  y: number;
  facing: number;
  /** RUNNER: where it is running to and how fast across (0 while resting), and the frames left of its rest. */
  tx: number;
  ty: number;
  speed: number;
  restT: number;
  /** RUNNER: how it is resting ('idle', 'hop', 'cheer', 'look'). */
  rest: string;
  /** The drawRig options, reused every frame. */
  opts: DrawRigOpts;
}

/** A diner at the hatch, as much of one as the order-taker needs (screens/kitchen.ts HatchCustomer is one). */
export interface HatchDiner {
  rig: Rig;
  player: AnimPlayer;
  scale: number;
  served: boolean;
  dishId: string;
}

/**
 * The friends in the kitchen: built by `enter()` from the run's party, stepped by `update()` once a fixed step and
 * drawn by `draw()`, both handed the diners at the hatch. Empty for a party of four, which brings nobody.
 */
export class KitchenFriends {
  // `declare` for the reason game.ts gives: the fields are the constructor's and enter()'s own assignments.
  /** The friends, in friends.ts order: the order-taker first. */
  declare list: KitchenFriend[];
  /** The runner's own stream of chances (never the gameplay singleton). */
  declare r: RngInstance;
  /** The diner being asked for their order (an index into the line), or -1 between rounds and after the bell. */
  declare asking: number;
  /** Frames into the current order (or into the breather between rounds). */
  declare t: number;
  /** Orders written down so far, and dashes the runner has set off on: the summary's. */
  declare takes: number;
  declare dashes: number;
  /** Frames since the bell rang, or -1 before it. */
  declare bellT: number;
  /** Scratch for the asked diner's head, refilled by draw(); never reallocated. */
  declare head: Point;

  constructor() { this.list = []; this.r = makeRng(1); this.asking = -1; this.t = 0; this.takes = 0; this.dashes = 0; this.bellT = -1; this.head = { x: 0, y: 0 }; }

  /** Seat the friends the party brings: the order-taker under the hatch with the pad, the runner somewhere on its floor. */
  enter(run: Run): void {
    this.r = makeRng((((run.seed | 0) ^ RUN_SALT) + Math.imul(run.day | 0, 7919)) >>> 0 || 1);
    this.t = 0; this.takes = 0; this.dashes = 0; this.bellT = -1;
    this.list = ridersFor(run.party, run.party.length).map((f): KitchenFriend => {
      const k: KitchenFriend = {
        critter: f.critter, job: f.job, rig: f.rig as FriendRig, player: f.player, anim: '', x: TAKER_X, y: TAKER_Y, facing: 1,
        tx: 0, ty: 0, speed: 0, restT: 0, rest: 'idle', opts: { x: 0, y: 0, facing: 1 },
      };
      if (f.job === 'order') {
        k.player.setOverlay(TAKER_ANIMS);
        k.rig.weapon = ITEMS.pad as RigWeapon; k.rig.padLines = 0;   // `as`: items.ts is untyped (kitchen.ts says why)
        this.play(k, 'listen');
      } else {
        const r = this.r;
        k.x = r.int(RUN_X0, RUN_X1); k.y = r.int(RUN_Y0, RUN_Y1); k.facing = r.chance(0.5) ? 1 : -1;
        k.restT = r.int(BREATH_MIN, BREATH_MAX);
        this.play(k, 'idle');
      }
      return k;
    });
    // the front of the line is asked first - by the order-taker, if one came: a full truck brings nobody to ask
    this.asking = this.list.length && this.list[0].job === 'order' ? 0 : -1;
  }

  play(k: KitchenFriend, name: string, restart = false): void { k.anim = name; k.player.play(name, { restart, fallback: 'idle' }); }

  /** One fixed step: the order-taker works down the line, the runner runs; the bell stops both for a cheer. */
  update(diners: readonly HatchDiner[], served: boolean): void {
    if (served && this.bellT < 0) this.bell(diners);
    for (let i = 0; i < this.list.length; i++) {
      const k = this.list[i];
      k.player.tick();
      if (this.bellT >= 0) { if (this.bellT === i * CHEER_LAG) this.play(k, 'cheer', true); continue; }
      if (k.job === 'order') this.takeOrders(k, diners); else this.runAbout(k);
    }
    if (this.bellT >= 0) this.bellT++;
  }

  /** The bell: the asking stops, a waving diner puts their paw down for the plate, and the pad is tucked away -
   *  the cheer raises the near arm, and the paw must be empty for it or the pad crosses the face. */
  bell(diners: readonly HatchDiner[]): void {
    this.bellT = 0;
    const d = this.asking >= 0 ? diners[this.asking] : null;
    if (d && d.player.name === 'wave') d.player.play('idle', { restart: true });
    this.asking = -1;
    for (const k of this.list) { k.rig.weapon = null; k.rig.padLines = 0; }
  }

  /** The order-taker's round of the line: a diner at a time, front first, then a breather and the front again. */
  takeOrders(k: KitchenFriend, diners: readonly HatchDiner[]): void {
    const t = this.t++;
    if (k.anim === 'nod' && k.player.done) this.play(k, 'listen');
    if (this.asking < 0) {
      // the breather after the back of the line: stand with the pad and listen, then ask the front again
      if (this.t >= ROUND_REST) { this.asking = 0; this.t = 0; }
      return;
    }
    const d = diners[this.asking];
    if (t === 0) { k.rig.padLines = 0; this.play(k, 'listen'); if (d && !d.served) d.player.play('wave', { restart: true }); }
    if (t === WAVE_FRAMES && d && !d.served) d.player.play('idle', { restart: true });
    if (t === WRITE_AT) this.play(k, 'write');
    if (t > WRITE_AT && (t - WRITE_AT) % LINE_EVERY === 0 && (k.rig.padLines || 0) < PAD_LINES) k.rig.padLines = (k.rig.padLines || 0) + 1;
    if (t === NOD_AT) { this.play(k, 'nod', true); this.takes++; }
    if (this.t >= TAKE_FRAMES) {
      this.t = 0;
      if (++this.asking >= diners.length) this.asking = -1;
    }
  }

  /** The runner: dash to a spot, rest there a beat, pick the next spot - all on its own stream. */
  runAbout(k: KitchenFriend): void {
    if (k.speed > 0) {
      const dx = k.tx - k.x, dy = k.ty - k.y;
      k.x += dx > 0 ? Math.min(k.speed, dx) : Math.max(-k.speed, dx);
      k.y += dy > 0 ? Math.min(RUN_SPEED_Y, dy) : Math.max(-RUN_SPEED_Y, dy);
      if (k.x === k.tx && k.y === k.ty) this.restAt(k);
      return;
    }
    // resting: a look round turns about on a beat; a hop ends when it lands; anything else runs out its frames
    if (k.rest === 'look' && k.restT % LOOK_TURN === 0) k.facing = -k.facing;
    if (k.rest === 'hop' ? k.player.done : --k.restT <= 0) this.dash(k);
  }

  /** Arrive somewhere: stop and pick how to rest there. */
  restAt(k: KitchenFriend): void {
    const r = this.r, roll = r.next();
    k.speed = 0;
    if (roll < REST_ODDS[0]) { k.rest = 'idle'; k.restT = r.int(BREATH_MIN, BREATH_MAX); this.play(k, 'idle'); }
    else if (roll < REST_ODDS[0] + REST_ODDS[1]) { k.rest = 'hop'; k.restT = 0; this.play(k, 'hop', true); }
    else if (roll < REST_ODDS[0] + REST_ODDS[1] + REST_ODDS[2]) { k.rest = 'cheer'; k.restT = CHEER_REST; this.play(k, 'cheer', true); }
    else { k.rest = 'look'; k.restT = LOOK_REST; this.play(k, 'idle'); }
  }

  /** Set off for a fresh spot on the floor, at least MIN_DASH across from here so every dash is a real run. */
  dash(k: KitchenFriend): void {
    const r = this.r;
    let tx = r.int(RUN_X0, RUN_X1);
    if (Math.abs(tx - k.x) < MIN_DASH) tx = k.x + MIN_DASH <= RUN_X1 ? k.x + MIN_DASH + r.int(0, RUN_X1 - k.x - MIN_DASH) : k.x - MIN_DASH - r.int(0, Math.max(0, k.x - MIN_DASH - RUN_X0));
    k.tx = tx; k.ty = r.int(RUN_Y0, RUN_Y1); k.speed = r.int(RUN_SPEED_MIN, RUN_SPEED_MAX);
    k.facing = k.tx > k.x ? 1 : -1;
    this.dashes++;
    this.play(k, 'run');
  }

  /**
   * The friends on the floor, nearer the back first (the floor is y-sorted, and both stand in front of the cooks),
   * each on its shadow; then the bead over the diner being asked, with their dish in it. Call after the cooks.
   */
  draw(ctx: CanvasRenderingContext2D, diners: readonly HatchDiner[]): void {
    // two friends at most, y-sorted: the one further back first
    const a = this.list[0], b = this.list[1];
    if (b && b.y < a.y) { this.drawOne(ctx, b); this.drawOne(ctx, a); }
    else if (a) { this.drawOne(ctx, a); if (b) this.drawOne(ctx, b); }
    if (this.asking >= 0 && this.asking < diners.length && this.t < BEAD_OFF) this.drawBead(ctx, diners[this.asking]);
  }

  /** One friend on their shadow. */
  drawOne(ctx: CanvasRenderingContext2D, k: KitchenFriend): void {
    const o = k.opts;
    o.x = R(k.x); o.y = R(k.y); o.facing = k.facing;
    drawShadow(ctx, o.x, o.y, k.rig.width + 6, 0.4, 0);
    drawRig(ctx, k.rig, k.player.pose, o);
  }

  /** The diner's order said out loud: a paper bead over their head with the dish's picture in it, pointing down at
   *  them, swelling in as they speak up (from a third of its size, so the paper is never a ring with no inside).
   *  Sized by the row of the line they stand in. */
  drawBead(ctx: CanvasRenderingContext2D, d: HatchDiner): void {
    const h = this.head, small = d.scale < 0.9;
    jointScreen(d.rig, 'head', h);
    const k = Math.min(1, Math.max(2, this.t) / BEAD_POP), br = (small ? BEAD_R_SMALL : BEAD_R) * k, s = (small ? BEAD_S_SMALL : BEAD_S) * k;
    const x = R(h.x), y = R(h.y - d.rig.p.headR * d.scale * BEAD_LIFT - br);
    ctx.fillStyle = UI.ink;
    ctx.beginPath(); ctx.moveTo(x - POINT_H - 1, y + br - 2); ctx.lineTo(x + POINT_H + 1, y + br - 2); ctx.lineTo(x, y + br + POINT_H + 1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, br + 1, 0, TAU); ctx.fill();
    ctx.fillStyle = UI.paper;
    ctx.beginPath(); ctx.moveTo(x - POINT_H + 1, y + br - 2); ctx.lineTo(x + POINT_H - 1, y + br - 2); ctx.lineTo(x, y + br + POINT_H - 1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, br - 1, 0, TAU); ctx.fill();
    if (k >= 1) drawDish(ctx, d.dishId, x, y + 1, s);
  }

  /** For the tests: who is where doing what, whose order is being taken, and how many orders and dashes so far. */
  summary() {
    return {
      friends: this.list.map((k) => ({ critter: k.critter, job: k.job, x: R(k.x), y: R(k.y), facing: k.facing, anim: k.anim, pad: k.rig.weapon ? (k.rig.padLines || 0) : -1 })),
      asking: this.asking, takes: this.takes, dashes: this.dashes, bell: this.bellT >= 0,
    };
  }
}
