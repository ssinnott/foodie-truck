// THE KITCHEN'S JOKES (docs/GDD.md section 6; game/gags.ts is the furniture every scene's jokes share). The kitchen
// is the finale and its rule is the strictest in the game: A JOKE NEVER HOLDS A PLAYER STILL. Nothing here touches a
// step, a score, a timing or anything in the batch; the one beat that holds a seat at all is the hungry one's eat,
// and any push of his stick, press of his button or hold at the step being cooked ends it on that frame
// (screens/kitchen.ts updateSeats). Four jokes, each with the four beats of the orchard's bomb - a TELL, a WIND-UP,
// the BANG on a word card, and a LOOK that stays on whoever it happened to:
//   THE CEILING SLICE (the new one) - a chop flicks a slice of the ingredient up off the board, spinning, and it
//     sticks to the ceiling over the board. It hangs there dripping (the tell) and peels off a little at a time,
//     sagging on a sticky strand of itself (the wind-up); once it dangles by the strand alone it lets go onto the
//     first head that comes under it - PLOP!, worn for a second and a half and then shaken off - or, if nobody comes,
//     onto the floor: SPLAT!. If the head is the hungry one's he eats it: CHOMP!, a proper chew, MMM!.
//   THE BITE (Barley's own, bigger) - on a completed step he helps himself to an ingredient: CHOMP!, three chews
//     with the crumbs flying, the swallow, MMM!.
//   THE POT LID (bigger) - after a stove step it rattles harder and harder with steam squirting out under it, blows
//     off with a CLANG!, spinning up like a saucer, and clatters home onto the pot - or onto a head near the stove,
//     where it sits with the stars going round before it hops home.
//   THE FLOUR (bigger) - after an oven step the door puffs a cloud, POOF!, that turns whoever is at the oven
//     flour-white for two and a half seconds, blinking out of it and coughing, while they cook on.
//
// Determinism (docs/ARCHITECTURE.md section 0). Every deal is one roll on the gameplay rng inside update(), made
// whether it lands or not: the bite's, the lid's and the flour's where kitchen.ts has always made them, the slice's
// here on the first chop of every chopping. THE SLICE IS SIMULATION - it lands by the seats' positions, and on the
// hungry one it starts his eat beat - so its clock, its spot, whom it fell on, and the hats and the flour (which keep
// a second joke off a seat already in one) are integers in checksumFields(). The LID, the cards, the drips, the
// splats, the crumbs and the clouds are cosmetic: started by a sim event and timed by integer counters, so every peer
// draws the same ones, but nothing reads them back. Every array is built once, in the constructor; draw() allocates
// nothing.
import { UI, PLAYER_COLORS } from '../constants.ts';
import { rng } from '../lib/engine/rng.ts';
import { particles } from '../engine/particles.ts';
import { burstCrumbs, burstSparkle, burstSteam, ringAt } from '../art/fx.ts';
import { ITEMS } from '../content/critters/items.ts';
import { STATIONS } from '../content/places.ts';
import { FACE } from '../lib/art/poses.ts';
import type { RigWeapon } from '../lib/art/rig.ts';
import { gagBurst, gagBubble, coat, COAT, drawDizzy } from './gags.ts';
import { ROWS, PROP_X, X_MIN, X_MAX } from '../art/backgrounds/kitchen.ts';
import { POT, BOARD, OVEN } from '../art/kitchenProps.ts';
import {
  SLICE_R, LID_RX, LID_RY, SLICE_ITEM, CHOMP, SHAKE, COUGH, CHEW_EVENT, GULP_EVENT, SPLAT_STEPS, beatFrames, eventAt, sliceTones, sliceTip,
  drawSlice, drawCeilingSlice, drawDrip, drawHatSlice, drawFloorSplat, drawPotLid,
} from '../art/kitchenGags.ts';
import type { Seat } from './screens/kitchen.ts';
import type { Audio } from './game.ts';

export { KITCHEN_ANIMS } from '../art/kitchenGags.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;
/** Station indices (content/places.ts STATIONS), by id. */
const CHOP_I = STATIONS.findIndex((s) => s.id === 'chop'), OVEN_I = STATIONS.findIndex((s) => s.id === 'oven');
/** The hungry one (docs/GDD.md section 2), whose joke is eating, and who eats the evidence. */
export const BARLEY = 'barley';
/** At most this many seats (one per player colour): the per-seat tables are this long and never reallocated. */
const MAX_SEATS = PLAYER_COLORS.length;

// ---------------------------------------------------------------- the deals
/**
 * THE SLICE'S DEAL: one chopping in SLICE_ODDS flicks a slice, on one of its chops SLICE_FIRST..SLICE_LAST - one roll
 * on the board's first chop (`chop`), made whether it lands or not. Never the first chop or two, so the ingredient is
 * halved on the board before a piece of it can fly (and a test can hold the deal off after the first chop).
 */
export const SLICE_ODDS = 3, SLICE_FIRST = 3, SLICE_LAST = 6;
const SLICE_SPAN = SLICE_LAST - SLICE_FIRST + 1;
/** The room's two other jokes, one roll each when their station's step completes (kitchen.ts completeStep). One in
 *  six, they went unnoticed: a visit cooks at most one stove step and one oven step, so most visits never showed one. */
export const LID_CHANCE = 1 / 3, POOF_CHANCE = 1 / 3;

// ---------------------------------------------------------------- the beats
/**
 * THE CEILING SLICE's one clock, `sliceT`, frames since the flick: up off the board to the ceiling in FLICK; the TELL,
 * stuck there and dripping, until PEEL_AT; the WIND-UP, PEEL_STAGES peels PEEL_STEP apart (each sagging it a little
 * further off the ceiling over PEEL_SNAP frames) until READY_AT, when it dangles by its strand and shivers; then it
 * lets go the first frame a free cook is UNDER it, or at GIVE_UP onto the floor. FALL frames down (`fallT`).
 */
export const FLICK = 14, PEEL_AT = 60, PEEL_STAGES = 3, PEEL_STEP = 30, READY_AT = PEEL_AT + PEEL_STAGES * PEEL_STEP, GIVE_UP = READY_AT + 120;
export const FALL = 14;
const PEEL_SNAP = 6;
/** A cook is under the slice while its feet are within UNDER px of it: a head's width either side. */
export const UNDER = 16;
/** The LOOK: the slice is worn HAT_FRAMES, the last SHAKE_FRAMES of them shaken off (on a cook with nothing else to
 *  do), and then it slides off the back of the head to the floor in FLING frames, FLING_DX behind them. */
export const HAT_FRAMES = 90, SHAKE_FRAMES = beatFrames(SHAKE);
const FLING = 14, FLING_DX = 18, FLING_HOP = 10;
/** The hungry one's eat beat, his bite's and the slice's alike: the chomp's own length. MMM! comes MMM_AT frames
 *  into it, at the swallow - and then too when the stick has cut the beat short, so it never pops on top of the
 *  CHOMP! still up from the bite. */
export const EAT_FRAMES = beatFrames(CHOMP), MMM_AT = eventAt(CHOMP, GULP_EVENT);
/**
 * THE LID's clock, `lidT`: RATTLE frames rattling harder and harder on the pot - the hop growing from 1 to RATTLE_AMP
 * rows and quickening, steam squirting out under it every JET_SLOW and then every JET_FAST frames - then off with a
 * CLANG!: UP frames up, SPINS spins in the air, DOWN frames back down onto the pot or onto a head standing within
 * LID_REACH of it, and CLATTER frames settling. On a head it sits LID_HAT frames with the stars going round, then
 * hops HOP frames home to the pot (HOP_ARC rows high) and clatters there. 76 frames on the pot.
 */
export const RATTLE = 32, UP = 14, DOWN = 16, CLATTER = 14, LID_HAT = 48, HOP = 16, LID_REACH = 24;
const RATTLE_AMP = 6, JET_SLOW = 6, JET_FAST = 2, SPINS = 2, HOP_ARC = 26;
/** The head it lands on sees stars first and says OW! OW_LATE frames after: the double-take, and the CLANG! has gone. */
const OW_LATE = 28;
const APEX_T = RATTLE + UP, LAND_T = APEX_T + DOWN, OFF_T = LAND_T + LID_HAT, HOME_T = OFF_T + HOP;
/** The lid's settling hops on the pot, a row count per frame of the clatter. */
const CLATTER_HOP = Int8Array.of(0, 3, 4, 3, 0, 2, 2, 0, 1, 1, 0, 0, 0, 0);
/**
 * THE FLOUR: floured FLOUR_FRAMES; it coughs COUGH_AT frames in - a blink or two after the POOF!, whose card has
 * gone by then (the two stand in the same rows over the oven) - and again at COUGH_AGAIN (the cough beat plays on a
 * cook with nothing else to do), blinks out of the flour for BLINK frames every BLINK_EVERY, and shakes it off over
 * the last SHAKE_FRAMES.
 */
export const FLOUR_FRAMES = 150, COUGH_AT = 58, COUGH_AGAIN = 104;
const COUGH_FRAMES = beatFrames(COUGH), BLINK_EVERY = 28, BLINK = 4;

// ---------------------------------------------------------------- where things are
/** The slice sticks to the ceiling and hangs from CEIL_Y; a dropped slice and a slid-off one land on FLOOR_Y. */
const CEIL_Y = 1, FLOOR_Y = ROWS.feet + 3;
/** The slice leaves the board from the ingredient on it, and swings FLICK_SWING px out on its way up. In the air it
 *  tumbles, its depth flipping between face-on and TUMBLE_MIN px - never thinner, or mid-turn it is a lost sliver. */
const BOARD_Y = BOARD.y - 8, FLICK_SWING = 10, TUMBLE_MIN = 4;
/** Drips off the stuck slice: one every DRIP_EVERY frames from DRIP_START frames after it sticks, falling DRIP_G
 *  px/frame^2 - on the floor inside DRIP_LIFE frames, so no older one is looked at. */
const DRIP_START = 8, DRIP_EVERY = 18, DRIP_G = 0.2, DRIP_LIFE = 60;
/** The slice keeps SLICE_CLEAR px of air to the right of the order ticket, whose width is the order's (a long dish
 *  name widens it over the board). */
const SLICE_CLEAR = 6;
/**
 * The pot lid on the pot (its centre, sat on the rim) and at the top of its flight: up past the STOVE sign, and no
 * higher than APEX_Y, because the HOW TO PLAY card (rows 12..74, kitchen.ts) is raised for every new step - so
 * always for the one after this stove step - and a lid flying behind it is a lid nobody sees. The CLANG! goes up
 * over the pot as it blows off, CLANG_DX left of it, clear of the card and of the oven's timing card.
 */
const POT_CX = POT.x + POT.w / 2, LID_Y = POT.y - 4, APEX_Y = 86, CLANG_DX = 16, CLANG_Y = POT.y - 34;
/** The POOF! over the oven, and the flour cloud: out of the door and round whoever is at the oven. */
const OVEN_CX = OVEN.x + OVEN.w / 2, DOOR_Y = OVEN.y + 30, POOF_Y = OVEN.y - 46;
/** A card over a cook: a remark's tail tip PLATE_GAP rows over its name plate, a burst BURST_LIFT rows over that -
 *  and the SPLAT! over a slice on the floor stands where a cook's would, over the heads rather than in the faces. */
const PLATE_GAP = 3, BURST_LIFT = 16;
/** Floor splats: SPLATS of them at once, each stepping down a size every SPLAT_STEP frames. */
const SPLATS = 4, SPLAT_STEP = 24;

// ---------------------------------------------------------------- words, sounds, particles (built once)
const PLOP = 'PLOP!', SPLAT = 'SPLAT!', CHOMP_WORD = 'CHOMP!', MMM = 'MMM!', CLANG = 'CLANG!', OW = 'OW!', POOF = 'POOF!', COUGH_WORD = 'COUGH';
const IDLE = 'idle', SLICE_KEY = 'slice', FOOD_KEY = 'food';
/** The food in the hungry one's paw for his bite: the cast's own held-food item (`as` for kitchen.ts's reason). */
const FOOD_ITEM = ITEMS.food as RigWeapon;
/** The slice slapping onto the ceiling, a slice on the floor and the lid on a head: the plop and the clang again. */
const STICK_SOUND = { volume: 0.5, pitch: 1.5 }, FLOOR_SOUND = { pitch: 0.8 }, BONK_SOUND = { pitch: 0.7 }, HARDER = { pitch: 1.25, volume: 1.2 };
const CHOMP_CRUMBS = 7, CHEW_CRUMBS = 3, PLOP_CRUMBS = 6, SPLAT_CRUMBS = 8, FLICK_CRUMBS = 3, FLING_CRUMBS = 3;
const JET = { vx: 0, vy: -0.5, size: 3, life: 24, screen: true };
const LAUNCH_STEAM = 10;
/** The flour: the cloud out of the door, the one round each cook in it, a cough's puff and the last of it shaken off. */
const CLOUD = { color: COAT.flour, speed: 2.6, up: 1.1, size: 6, sizeJitter: 2, life: 64, gravity: -0.015, screen: true };
const ENGULF = { color: COAT.flour, speed: 1.8, up: 0.6, size: 7, sizeJitter: 2, life: 70, gravity: -0.01, screen: true };
const PUFF = { color: COAT.flour, speed: 1.0, up: 0.3, size: 3, life: 30, vx: 0, gravity: -0.01, screen: true };
const CLOUD_PUFFS = 26, ENGULF_PUFFS = 18, COUGH_PUFFS = 4, SHAKE_PUFFS = 10;

/** What the jokes need of the kitchen screen: its seats, its sound, and the two things it does to a cook. */
export interface GagHost {
  seats: Seat[];
  game: { audio: Audio };
  playAnim(s: Seat, name: string, restart: boolean): void;
  clearItem(s: Seat): void;
}

/** The kitchen's jokes: one per screen, built in its constructor, reset by enter(), stepped by update(). */
export class KitchenGags {
  // `declare` for the reason kitchen.ts gives over its own fields.
  /** kitchen.ts's name plate: the lowest row its top may take, and how far over a cook's crown it floats. */
  declare plateMax: number;
  declare plateLift: number;
  declare audio: Audio | null;
  /** THE SLICE (simulation). The chop of this chopping that flicks it, 0 for none; its clock (-1: no slice up); its
   *  fall's clock (-1: not falling); the ceiling spot it sticks to; the seat it falls on (-1: the floor); how many
   *  have come down this visit. */
  declare deal: number;
  declare sliceT: number;
  declare fallT: number;
  declare sliceX: number;
  declare target: number;
  declare slices: number;
  /** Per seat (simulation): frames left wearing a slice, and frames left floured. */
  declare hatT: Int16Array;
  declare flourT: Int16Array;
  /** What the slice is a slice of (cosmetic: its colour). */
  declare sliceHex: string;
  /** Per seat (cosmetic): frames until the MMM! of the eat it is in, 0 for none due. */
  declare mmmT: Int16Array;
  /** Per seat (cosmetic): a worn slice sliding off - frames into it (-1: none), from where, to where on the floor. */
  declare flingT: Int16Array;
  declare flingX: Float32Array;
  declare flingY: Float32Array;
  declare flingTo: Float32Array;
  /** The splats on the floor (cosmetic): where, frames since (SPLAT_STEPS * SPLAT_STEP: free), which colour. */
  declare splatX: Float32Array;
  declare splatT: Int16Array;
  declare splatHex: string[];
  declare splatNext: number;
  /** THE LID (cosmetic): its clock (-1: quiet), the seat it came down on (-1: the pot), and whether it is sat on the
   *  pot since it came home (the pot had no lid until it rattled one up); and the counts. */
  declare lidT: number;
  declare lidOn: number;
  declare lidHome: boolean;
  declare lids: number;
  declare poofs: number;
  /** A floury cook's face while it blinks, put back after its draw. */
  declare faceWas: number;
  /** Scratch points, refilled in place. */
  declare pt: { x: number; y: number };
  declare top: { x: number; y: number; a: number };

  constructor(plateMax: number, plateLift: number) {
    this.plateMax = plateMax; this.plateLift = plateLift; this.audio = null;
    this.hatT = new Int16Array(MAX_SEATS); this.flourT = new Int16Array(MAX_SEATS); this.mmmT = new Int16Array(MAX_SEATS);
    this.flingT = new Int16Array(MAX_SEATS); this.flingX = new Float32Array(MAX_SEATS); this.flingY = new Float32Array(MAX_SEATS); this.flingTo = new Float32Array(MAX_SEATS);
    this.splatX = new Float32Array(SPLATS); this.splatT = new Int16Array(SPLATS); this.splatHex = [];
    for (let k = 0; k < SPLATS; k++) this.splatHex.push(UI.cream);
    this.pt = { x: 0, y: 0 }; this.top = { x: 0, y: 0, a: 0 };
    this.faceWas = 0;
    this.enter(null, 0);
  }

  /** A fresh visit: no slice, no hats, no flour, no lid. The slice will stick to the ceiling over the board, or
   *  further along if the order ticket (its right edge at `ticketRight`, the order's own width) reaches over it. */
  enter(audio: Audio | null, ticketRight: number): void {
    this.audio = audio; this.sliceX = Math.max(PROP_X[CHOP_I], ticketRight + SLICE_CLEAR + SLICE_R + 2);
    this.deal = 0; this.sliceT = -1; this.fallT = -1; this.target = -1; this.slices = 0; this.sliceHex = UI.cream;
    this.hatT.fill(0); this.flourT.fill(0); this.mmmT.fill(0); this.flingT.fill(-1);
    this.splatT.fill(SPLAT_STEPS * SPLAT_STEP); this.splatNext = 0;
    this.lidT = -1; this.lidOn = -1; this.lidHome = false; this.lids = 0; this.poofs = 0;
  }

  play(name: string, opts?: { volume?: number; pitch?: number }): void { if (this.audio) this.audio.play(name, opts); }

  /** The row a remark's tail tip goes on over a cook: over its name plate, from the rig's proportions (so update()
   *  can ask), the plate placed the way kitchen.ts places it - its plateLift over the crown, never below plateMax. */
  over(s: Seat): number { return Math.min(R(ROWS.feet - s.rig.height * s.rig.scale - s.crown - this.plateLift), this.plateMax) - PLATE_GAP; }

  /** The muzzle, from the rig's proportions: where food goes in and crumbs and coughs come out (into `pt`). */
  mouth(s: Seat): void {
    const r = s.rig.p.headR * s.rig.scale;
    this.pt.x = s.x + s.facing * r * 0.8; this.pt.y = ROWS.feet - s.rig.height * s.rig.scale + r * 1.3;
  }

  /** The top of a cook's skull as it was last drawn, and the head's angle (into `top`): where a hat sits. Draw-only. */
  crown(s: Seat): void {
    const r = s.rig.p.headR * s.rig.scale, a = s.rig.joints.headAngle * DEG;
    this.top.x = s.head.x + s.facing * r * Math.sin(a); this.top.y = s.head.y - r * Math.cos(a); this.top.a = s.facing * a;
  }

  /** True while seat `i` is in none of the jokes: never two at once on one seat. */
  free(seats: Seat[], i: number): boolean { return this.hatT[i] === 0 && this.flourT[i] === 0 && seats[i].eatT === 0; }

  // ---------------------------------------------------------------- the slice (simulation)
  /**
   * A chop landed on the board (kitchen.ts stepStation): `count` is the chopping's count after it and `hex` the
   * ingredient on the board. The first chop deals; the dealt chop flicks - one slice up at a time.
   */
  chop(count: number, hex: string): void {
    if (count === 1) { const r = rng.int(1, SLICE_ODDS * SLICE_SPAN); this.deal = r <= SLICE_SPAN ? SLICE_FIRST + r - 1 : 0; }
    if (count !== this.deal) return;
    this.deal = 0;
    if (this.sliceT >= 0 || this.fallT >= 0) return;
    this.sliceT = 0; this.target = -1; this.sliceHex = hex;
    sliceTones(hex);   // mixed here, once, so no draw ever has to
    burstCrumbs(PROP_X[CHOP_I], BOARD_Y, BOARD.y - 1, hex, FLICK_CRUMBS, true);
    this.play('kitchen_flick');
  }

  /** One frame of the slice: up, stuck, peeling, waiting for a head, falling, landing. */
  stepSlice(host: GagHost): void {
    if (this.fallT >= 0) { if (++this.fallT >= FALL) this.land(host); return; }
    if (this.sliceT < 0) return;
    const t = ++this.sliceT;
    if (t === FLICK) {
      // SPLUT: it sticks, and a little of it rains back down
      ringAt(this.sliceX, CEIL_Y + 6, 2, 14, UI.cream, 2, 10, false, true);
      burstCrumbs(this.sliceX, CEIL_Y + 8, ROWS.feet, this.sliceHex, FLICK_CRUMBS, true);
      this.play('kitchen_plop', STICK_SOUND);
    } else if (t >= PEEL_AT && t < READY_AT && (t - PEEL_AT) % PEEL_STEP === 0) this.play('kitchen_peel');
    if (t < READY_AT) return;
    const i = this.under(host.seats);
    if (i >= 0 || t >= GIVE_UP) { this.fallT = 0; this.target = i; }
  }

  /** The free cook nearest under the slice (the lower seat on a tie), or -1. */
  under(seats: Seat[]): number {
    let best = -1, bd = UNDER + 1;
    for (let i = 0; i < seats.length; i++) {
      const d = Math.abs(seats[i].x - this.sliceX);
      if (d < bd && this.free(seats, i)) { best = i; bd = d; }
    }
    return best;
  }

  /** It lands: on a head (PLOP!, worn), in the hungry one's mouth (CHOMP!), or on the floor (SPLAT!). */
  land(host: GagHost): void {
    const seats = host.seats, i = this.target;
    this.sliceT = -1; this.fallT = -1; this.slices++;
    if (i < 0 || i >= seats.length) {
      this.splat(this.sliceX, this.sliceHex);
      burstCrumbs(this.sliceX, FLOOR_Y - 2, FLOOR_Y, this.sliceHex, SPLAT_CRUMBS, true);
      gagBurst(this.sliceX, this.plateMax - PLATE_GAP - BURST_LIFT, SPLAT);
      this.play('kitchen_plop', FLOOR_SOUND);
      return;
    }
    const s = seats[i];
    if (s.def.id === BARLEY) { this.eat(host, s, i, SLICE_ITEM, null, this.sliceHex); return; }   // he eats the evidence
    this.hatT[i] = HAT_FRAMES;
    burstCrumbs(s.x, ROWS.feet - s.rig.height * s.rig.scale, ROWS.feet, this.sliceHex, PLOP_CRUMBS, true);
    gagBurst(s.x, this.over(s) - BURST_LIFT, PLOP, PLAYER_COLORS[s.slot]);
    this.play('kitchen_plop');
  }

  /** A worn slice slides off the back of the head and lands on the floor behind (cosmetic). */
  fling(s: Seat, i: number): void {
    this.flingT[i] = 0; this.flingX[i] = s.x; this.flingY[i] = ROWS.feet - s.rig.height * s.rig.scale;
    this.flingTo[i] = Math.max(X_MIN, Math.min(X_MAX, s.x - s.facing * FLING_DX));
    burstCrumbs(s.x, this.flingY[i], ROWS.feet, this.sliceHex, FLING_CRUMBS, true);
  }

  /** A slice on the floor: the next splat slot. */
  splat(x: number, hex: string): void {
    const k = this.splatNext; this.splatNext = (k + 1) % SPLATS;
    this.splatX[k] = x; this.splatT[k] = 0; this.splatHex[k] = hex;
  }

  /** How far the stuck slice has peeled at `t` on its clock: a stage at a time, each dropped over PEEL_SNAP frames. */
  peel(t: number): number {
    if (t < PEEL_AT) return 0;
    if (t >= READY_AT) return 1;
    const u = t - PEEL_AT, stage = Math.floor(u / PEEL_STEP);
    return (stage + Math.min(1, (u - stage * PEEL_STEP) / PEEL_SNAP)) / PEEL_STAGES;
  }

  /** The slice's beat by name, for the tests: none, up, hang (the tell), peel (the wind-up), ready, fall. */
  phase(): string {
    if (this.fallT >= 0) return 'fall';
    const t = this.sliceT;
    return t < 0 ? 'none' : t < FLICK ? 'up' : t < PEEL_AT ? 'hang' : t < READY_AT ? 'peel' : 'ready';
  }

  // ---------------------------------------------------------------- the hungry one (simulation: his eat beat)
  /** Barley helps himself (kitchen.ts rolls it on every completed step): an ingredient off the order's own list -
   *  never one out of the batch, so nothing about the dish changes - and the chomp. */
  bite(host: GagHost, s: Seat, i: number, icon: string, hex: string): void { this.eat(host, s, i, FOOD_ITEM, icon, hex); }

  /** The eat beat, for the bite and the slice alike: the food in the paw, the chomp, CHOMP! and the crumbs. */
  eat(host: GagHost, s: Seat, i: number, item: RigWeapon, icon: string | null, hex: string): void {
    s.eatT = EAT_FRAMES; s.weapon = item === SLICE_ITEM ? SLICE_KEY : FOOD_KEY;
    s.rig.weapon = item; s.rig.heldIcon = icon; s.rig.heldHex = hex;
    host.playAnim(s, CHOMP, true);
    this.mmmT[i] = MMM_AT;
    this.mouth(s);
    burstCrumbs(this.pt.x, this.pt.y, ROWS.feet, hex, CHOMP_CRUMBS, true);
    gagBurst(s.x, this.over(s) - BURST_LIFT, CHOMP_WORD, PLAYER_COLORS[s.slot]);
    this.play('kitchen_chomp');
  }

  /** A chew (the chomp's CHEW_EVENT keys): crumbs off the muzzle and a nom. */
  chew(s: Seat): void {
    this.mouth(s);
    burstCrumbs(this.pt.x, this.pt.y, ROWS.feet, s.rig.heldHex || this.sliceHex, CHEW_CRUMBS, true);
    this.play('nom');
  }

  // ---------------------------------------------------------------- the room's jokes
  /** The pot lid (kitchen.ts rolls it when a stove step completes): it starts to rattle. */
  lid(): void { this.lidT = 0; this.lidOn = -1; this.lidHome = false; this.lids++; this.play('rattle'); }

  /** One frame of the lid (cosmetic): harder and harder, off with a CLANG!, down onto the pot or a head, home. */
  stepLid(seats: Seat[]): void {
    if (this.lidT < 0) return;
    const t = ++this.lidT;
    if (t < RATTLE) {
      if (t % (t < RATTLE / 2 ? JET_SLOW : JET_FAST) === 0) {
        const side = (t >> 1) & 1 ? 1 : -1;
        JET.vx = side * 1.8;
        particles.spawn('steam', POT_CX + side * (LID_RX - 2), LID_Y + 2, JET);
      }
      if (t === RATTLE / 2) this.play('rattle', HARDER);
    } else if (t === RATTLE) {
      // the bang: blown off the pot on a gust of steam
      burstSteam(POT_CX, LID_Y, LAUNCH_STEAM, true);
      ringAt(POT_CX, LID_Y, 4, 28, UI.cream, 2, 12, false, true);
      burstSparkle(POT_CX, LID_Y - 6, 6, UI.cream, true);
      gagBurst(POT_CX - CLANG_DX, CLANG_Y, CLANG);
      this.play('kitchen_launch');
      this.play('kitchen_clang');
    } else if (t === APEX_T) this.lidOn = this.lidTarget(seats);
    else if (t === LAND_T) this.play(this.lidOn >= 0 ? 'kitchen_clang' : 'kitchen_clatter', this.lidOn >= 0 ? BONK_SOUND : undefined);
    else if (this.lidOn >= 0 && t === LAND_T + OW_LATE) { const s = seats[this.lidOn]; gagBubble(s.x, this.over(s), OW, PLAYER_COLORS[s.slot]); }
    else if (this.lidOn >= 0 && t === HOME_T) this.play('kitchen_clatter');
    if (t >= (this.lidOn >= 0 ? HOME_T : LAND_T) + CLATTER) { this.lidT = -1; this.lidOn = -1; this.lidHome = true; }
  }

  /** The head the lid comes down on: the nearest cook within LID_REACH of the pot who is in no joke already, or -1
   *  for the pot itself. Cosmetic, so it may read anything. */
  lidTarget(seats: Seat[]): number {
    let best = -1, bd = LID_REACH + 1;
    for (let i = 0; i < seats.length; i++) {
      const d = Math.abs(seats[i].x - POT_CX);
      if (d < bd && this.free(seats, i)) { best = i; bd = d; }
    }
    return best;
  }

  /** The flour (kitchen.ts rolls it when an oven step completes): POOF! out of the door, and every free cook at the
   *  oven floured. `owner` did the baking; the card wears their colour. */
  poof(seats: Seat[], owner: Seat | null): void {
    this.poofs++;
    particles.burst('smoke', OVEN_CX, DOOR_Y, CLOUD_PUFFS, CLOUD);
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      if (s.station !== OVEN_I || !this.free(seats, i)) continue;
      this.flourT[i] = FLOUR_FRAMES;
      particles.burst('smoke', s.x, ROWS.feet - s.rig.height * s.rig.scale * 0.6, ENGULF_PUFFS, ENGULF);
    }
    gagBurst(OVEN_CX, POOF_Y, POOF, owner ? PLAYER_COLORS[owner.slot] : undefined);
    ringAt(OVEN_CX, DOOR_Y, 6, 40, UI.cream, 3, 16, false, true);
    this.play('poof');
    this.play('kitchen_whump');
  }

  /** A floury cough: COUGH, and a puff of it out of the muzzle. */
  cough(s: Seat): void {
    this.mouth(s);
    PUFF.vx = s.facing * 1.2;
    particles.burst('smoke', this.pt.x, this.pt.y, COUGH_PUFFS, PUFF);
    PUFF.vx = 0;
    gagBubble(s.x, this.over(s), COUGH_WORD, PLAYER_COLORS[s.slot]);
    this.play('kitchen_cough');
  }

  // ---------------------------------------------------------------- the frame
  /** One fixed step of every joke (kitchen.ts update, after the stations and before the anims are picked). */
  update(host: GagHost): void {
    const seats = host.seats;
    this.stepSlice(host);
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i], ev = s.player.events;
      // the hungry one's chews and his swallow, read off his chomp's keys: the paw is empty once it has gone down (only
      // while the beat runs - one the stick has ended has emptied it already, and may be holding the next knife)
      for (let k = 0; k < ev.length; k++) {
        if (ev[k].name === CHEW_EVENT) this.chew(s);
        else if (ev[k].name === GULP_EVENT && s.eatT > 0) host.clearItem(s);
      }
      ev.length = 0;
      // ...and MMM!, on the swallow's frame whether he is still at it or the stick took him off it: it went down
      if (this.mmmT[i] > 0 && --this.mmmT[i] === 0) { gagBubble(s.x, this.over(s), MMM, PLAYER_COLORS[s.slot]); this.play('kitchen_mmm'); }
      if (this.hatT[i] > 0 && --this.hatT[i] === 0) this.fling(s, i);
      if (this.flourT[i] > 0) {
        const left = --this.flourT[i], t = FLOUR_FRAMES - left;
        if (t === COUGH_AT || t === COUGH_AGAIN) this.cough(s);
        else if (left === 0) particles.burst('smoke', s.x, ROWS.feet - s.rig.height * s.rig.scale * 0.5, SHAKE_PUFFS, PUFF);
      }
      if (this.flingT[i] >= 0 && ++this.flingT[i] >= FLING) {
        this.flingT[i] = -1;
        this.splat(this.flingTo[i], this.sliceHex);
        this.play('kitchen_plop', STICK_SOUND);
      }
    }
    for (let k = 0; k < SPLATS; k++) if (this.splatT[k] < SPLAT_STEPS * SPLAT_STEP) this.splatT[k]++;
    this.stepLid(seats);
  }

  /** The beat a cook in a joke plays when it has nothing else to do (kitchen.ts pickAnim): a cough in the flour, the
   *  shake that gets the flour or the slice off; otherwise idle. */
  restAnim(i: number): string {
    const f = this.flourT[i];
    if (f > 0) {
      const t = FLOUR_FRAMES - f;
      if ((t >= COUGH_AT && t < COUGH_AT + COUGH_FRAMES) || (t >= COUGH_AGAIN && t < COUGH_AGAIN + COUGH_FRAMES)) return COUGH;
      if (f <= SHAKE_FRAMES) return SHAKE;
    }
    const h = this.hatT[i];
    return h > 0 && h <= SHAKE_FRAMES ? SHAKE : IDLE;
  }

  // ---------------------------------------------------------------- drawing (allocation-free)
  /** Behind the cooks: the slice stuck to the ceiling and its drips, the splats on the floor, the lid on its pot. */
  drawBack(ctx: CanvasRenderingContext2D, f: number): void {
    const t = this.sliceT;
    if (t >= FLICK && this.fallT < 0) {
      const p = this.peel(t);
      // it swings on its strand, more as it sags; dangling by the strand alone, it shivers
      const wob = t >= READY_AT ? ((f >> 1) & 1 ? 0.07 : -0.07) : Math.sin(f * 0.21) * (0.03 + 0.08 * p);
      drawCeilingSlice(ctx, this.sliceX, CEIL_Y, p, wob, this.sliceHex);
      // drip, drip: each from where the slice's lowest point was when it formed
      const first = Math.max(0, Math.ceil((t - FLICK - DRIP_START - DRIP_LIFE) / DRIP_EVERY)), last = Math.floor((t - FLICK - DRIP_START) / DRIP_EVERY);
      for (let k = first; k <= last; k++) {
        const born = FLICK + DRIP_START + k * DRIP_EVERY, dt = t - born;
        sliceTip(this.sliceX, CEIL_Y, this.peel(born), this.pt);
        const y = this.pt.y + 0.5 * DRIP_G * dt * dt;
        if (y < FLOOR_Y) drawDrip(ctx, this.pt.x, y, this.sliceHex);
      }
    }
    for (let k = 0; k < SPLATS; k++) {
      const st = this.splatT[k];
      if (st < SPLAT_STEPS * SPLAT_STEP) drawFloorSplat(ctx, this.splatX[k], FLOOR_Y, (st / SPLAT_STEP) | 0, this.splatHex[k]);
    }
    const lt = this.lidT;
    if (lt >= 0 && lt < RATTLE) {
      // rattling: the hop grows and quickens, and it rocks
      const fast = lt >= RATTLE / 2, up = ((lt >> (fast ? 1 : 2)) & 1) ? 1 + R((RATTLE_AMP - 1) * lt / RATTLE) : 0;
      drawPotLid(ctx, POT_CX, LID_Y - up, up ? ((lt >> 2) & 1 ? 0.1 : -0.1) : 0, 1);
    } else if (lt >= 0 && lt >= (this.lidOn >= 0 ? HOME_T : LAND_T)) {
      const u = lt - (this.lidOn >= 0 ? HOME_T : LAND_T), hop = CLATTER_HOP[Math.min(u, CLATTER_HOP.length - 1)];
      drawPotLid(ctx, POT_CX, LID_Y - hop, hop ? ((u & 1) ? 0.12 : -0.12) : 0, 1);
    } else if (lt < 0 && this.lidHome) drawPotLid(ctx, POT_CX, LID_Y, 0, 1);
  }

  /** Before a cook's drawRig: the flour coat, and the eyes shut for a blink out of it. */
  dress(s: Seat, i: number, f: number): void {
    if (this.flourT[i] <= 0) return;
    coat(s.rig, COAT.flour);
    this.faceWas = s.player.pose.face;
    if (f % BLINK_EVERY < BLINK) s.player.pose.face = FACE.closed;
  }

  /** After it: the coat off, and whatever is on the head - the slice, or the lid with the stars going round it. */
  undress(ctx: CanvasRenderingContext2D, s: Seat, i: number, f: number): void {
    if (this.flourT[i] > 0) { coat(s.rig, null); s.player.pose.face = this.faceWas; }
    if (this.hatT[i] > 0) {
      this.crown(s);
      // shaking it off, it jiggles
      const jig = this.hatT[i] <= SHAKE_FRAMES ? ((f >> 1) & 1 ? 0.25 : -0.25) : 0;
      drawHatSlice(ctx, this.top.x, this.top.y + 1, this.top.a + jig, this.sliceHex);
    }
    const lt = this.lidT;
    if (this.lidOn === i && lt >= LAND_T && lt < OFF_T) {
      this.crown(s);
      drawPotLid(ctx, this.top.x, this.top.y - LID_RY + 1, this.top.a + s.facing * 0.18, 1);
      drawDizzy(ctx, R(this.top.x), R(this.top.y - LID_RY * 2 - 6), f);
    }
  }

  /** In front of everything in the room: the slice on its way up and on its way down, worn slices sliding off, the
   *  lid in the air. After the cooks, whose heads it lands on (their joints are this frame's). */
  drawFront(ctx: CanvasRenderingContext2D, seats: Seat[], f: number): void {
    const t = this.sliceT;
    if (t >= 0 && t < FLICK && this.fallT < 0) {
      // up off the board, spinning, swinging out and back
      const k = t / FLICK, x = PROP_X[CHOP_I] + (this.sliceX - PROP_X[CHOP_I]) * k - Math.sin(k * Math.PI) * FLICK_SWING;
      const y = BOARD_Y + (CEIL_Y + 4 - BOARD_Y) * (1 - (1 - k) * (1 - k));
      drawSlice(ctx, x, y, SLICE_R, Math.max(TUMBLE_MIN, SLICE_R * Math.abs(Math.cos(t * 0.55))), t * 0.8, this.sliceHex);
    }
    if (this.fallT >= 0) {
      // down off its strand, tumbling, onto the head it chose (the hungry one's open mouth) or the floor
      sliceTip(this.sliceX, CEIL_Y, 1, this.pt);
      const x0 = this.pt.x, y0 = this.pt.y - SLICE_R, s = this.target >= 0 ? seats[this.target] : null;
      let x1 = this.sliceX, y1 = FLOOR_Y - 3;
      if (s) {
        this.crown(s);
        if (s.def.id === BARLEY) { this.mouth(s); x1 = this.pt.x; y1 = this.pt.y; } else { x1 = this.top.x; y1 = this.top.y - 2; }
      }
      const k = this.fallT / FALL, ft = this.fallT;
      drawSlice(ctx, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k * k, SLICE_R, Math.max(TUMBLE_MIN, SLICE_R * Math.abs(Math.cos(ft * 0.5))), ft * 0.45, this.sliceHex);
    }
    for (let i = 0; i < seats.length; i++) {
      const ft = this.flingT[i];
      if (ft < 0) continue;
      const k = ft / FLING, x = this.flingX[i] + (this.flingTo[i] - this.flingX[i]) * k;
      const y = this.flingY[i] + (FLOOR_Y - 3 - this.flingY[i]) * k * k - FLING_HOP * Math.sin(k * Math.PI);
      drawSlice(ctx, x, y, SLICE_R, Math.max(TUMBLE_MIN, SLICE_R * Math.abs(Math.cos(ft * 0.6))), -seats[i].facing * ft * 0.4, this.sliceHex);
    }
    const lt = this.lidT;
    if (lt >= RATTLE && lt < LAND_T) {
      // off: spinning up and back down, the saucer flipping as it goes
      const air = lt - RATTLE, spin = air / (UP + DOWN), rot = spin * SPINS * TAU, flip = Math.abs(Math.cos(spin * SPINS * Math.PI));
      if (lt < APEX_T) { const k = air / UP; drawPotLid(ctx, POT_CX, LID_Y + (APEX_Y - LID_Y) * (1 - (1 - k) * (1 - k)), rot, flip); }
      else {
        let x1 = POT_CX, y1 = LID_Y;
        if (this.lidOn >= 0) { this.crown(seats[this.lidOn]); x1 = this.top.x; y1 = this.top.y - LID_RY + 1; }
        const k = (lt - APEX_T) / DOWN;
        drawPotLid(ctx, POT_CX + (x1 - POT_CX) * k, APEX_Y + (y1 - APEX_Y) * k * k, rot, flip);
      }
    } else if (this.lidOn >= 0 && lt >= OFF_T && lt < HOME_T) {
      // hopping home off the head
      this.crown(seats[this.lidOn]);
      const k = (lt - OFF_T) / HOP, x0 = this.top.x, y0 = this.top.y - LID_RY + 1;
      drawPotLid(ctx, x0 + (POT_CX - x0) * k, y0 + (LID_Y - y0) * k - HOP_ARC * Math.sin(k * Math.PI), k * TAU, 1);
    }
  }

  // ---------------------------------------------------------------- the record
  /** The simulation's fields, for kitchen.ts checksumFields: the slice, then each seat's hat and flour. */
  checksum(out: number[], n: number): void {
    out.push(this.deal, this.sliceT, this.fallT, this.sliceX, this.target, this.slices);
    for (let i = 0; i < n; i++) out.push(this.hatT[i], this.flourT[i]);
  }

  /** For window.__game.summary(): the slice's beat and where it is, the hats and the flour by seat, the lid. */
  summary(n: number) {
    return {
      deal: this.deal, sliceT: this.sliceT, fallT: this.fallT, sliceX: this.sliceX, sliceOn: this.target, slices: this.slices, slicePhase: this.phase(),
      hats: Array.from(this.hatT.subarray(0, n)), flour: Array.from(this.flourT.subarray(0, n)),
      splats: this.splatT.reduce((c, v) => c + (v < SPLAT_STEPS * SPLAT_STEP ? 1 : 0), 0),
      lidT: this.lidT, lidOn: this.lidOn, lidHome: this.lidHome, lids: this.lids, poofs: this.poofs,
    };
  }
}
