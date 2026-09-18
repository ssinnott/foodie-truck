// Mini-game furniture shared by the mini-game screens (docs/GDD.md section 5 common rules): the seats (one rig +
// AnimPlayer per party member, built in enter(), never in draw()), the name plates above the tallest head part, the
// paper clock, the wooden sign that drops in on ropes to end the round, and the basket wrapper that adds the seat's
// ribbon and the catch squash to content/critters/items.js ITEMS.basket without touching it.
//
// SHARED, SO FROZEN. This started as the orchard's private helper and the coop now imports it too, which makes every
// number in here another owner's timing as well. Until docs/ARCHITECTURE.md section 5 records it (the integrator's
// call — see the orchard's deviations), treat this as the contract and change nothing in it for one screen's sake:
//   ROUND_FRAMES 2400, SIGN_SLAM 6, SIGN_HOLD 60
//   makeSeats(game, floorY) -> seats[]  | seatAnim(seat, name, restart?)
//   drawSeatPlate(ctx, seat, stack?)    | makeClock() / tickClock(clock) / endRound(clock, text) / roundOver(clock)
//   drawClock(ctx, clock, countStr, drawIcon, title) | drawEndSign(ctx, clock, frame)
// Anything ONE screen needs lives in that screen (the orchard keeps its own catch boxes, seat draw and poses).
//
// Everything simulated here (the clock, the sign's frame counter) is plain integers driven by update(); every
// Math.sin/atan2 lives in a draw helper, so headless peers step without drawing.
import { PLAYER_COLORS, UI, SIGNAL, VIEW_W } from '../constants.ts';
import { critterRig } from '../content/critters/common.ts';
import { getCritter } from '../content/critters/index.ts';
import { ITEMS } from '../content/critters/items.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { jointScreen } from '../lib/art/rig.ts';
import type { DrawRigOpts, Rig, RigWeapon } from '../lib/art/rig.ts';
import { LIGHT_X, LIGHT_Y } from '../lib/art/shading.ts';
import { drawText, measureText } from '../engine/text.ts';
import { drawTicket, drawBar, drawSign, drawNamePlate } from './ui.ts';
import type { Game } from './game.ts';

/**
 * The basket state a rig carries, merged into the library's `Rig` rather than restated as a wrapper type: the
 * basket renderers read them off a plain rig (content/critters/items.js ITEMS.basket, the ribbon wrapper below)
 * and every mini-game writes them, so a type that only some call sites knew about would be no type at all. This
 * is the merge lib/art/animation.js documents for its own `Frame`. OPTIONAL, because lib/art/rig.js buildRig
 * builds a complete `Rig` literal without them and a required field here would make that literal incomplete.
 */
declare module '../lib/art/rig.ts' {
  interface Rig {
    /** 0..1: how full the carried basket is drawn. */
    basketFill?: number;
    /** Scale about the basket rim while the catch beat plays; 1 is at rest. */
    basketSquash?: number;
    /** Glyph id for what is piling up in the basket (art/food.js; default 'apple'). */
    basketIcon?: string;
    /** Base hex for that glyph. */
    basketHex?: string;
  }
}

const R = Math.round;
/** GDD section 5: a mini-game lasts 40 seconds. */
export const ROUND_FRAMES = 2400;
/** The end sign slams in over 6 frames and is held 60 (GDD section 5). */
export const SIGN_SLAM = 6, SIGN_HOLD = 60;
/**
 * Extra rows a critter's tallest head part reaches above its skull (ears, toque, sunhat), measured off the rigs: the
 * plate sits above whatever is tallest, so the plate row is ragged and that is fine (docs/ART_STYLE.md section 12).
 */
const CROWN = { barley: 6, sorrel: 20, chicory: 22, cress: 18 };
const SCRATCH = { x: 0, y: 0 };
/** Option objects the draw helpers mutate instead of allocating per frame. */
const COUNT_TEXT = { size: 1, color: UI.ink, shadow: false };
const CLOCK_OPTS = { title: '', rules: false }, BAR_OPTS = { color: SIGNAL.good }, SIGN_OPTS = { swing: 0, rope: 96, size: 3 };

/**
 * Basket with the seat's ribbon: the same willow basket every critter carries, plus a 6x4 bow in the apron colour on
 * its rim (the apron IS the slot colour, so the bow needs no extra field) and a squash about the rim while
 * `rig.basketSquash` is above 1 (the catch beat). Drawn in hand space like every item; `upright` is the same
 * counter-rotation items.js uses, so the bow sits on the rim whatever the arm is doing.
 */
export const RIBBON_BASKET: RigWeapon = { attach: 'handR', length: 14, draw(ctx, rig) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  const k = rig.basketSquash || 1;
  // the bow rides INSIDE the squash: the catch beat is the one moment a player looks straight at the rim, and a
  // rigid bow on a squashing basket is the tell that the two are different objects bolted together
  if (k !== 1) { ctx.save(); ctx.rotate(a); ctx.translate(0, 8); ctx.scale(k, 1 / k); ctx.translate(0, -8); ctx.rotate(-a); }
  ITEMS.basket.draw(ctx, rig);
  if (!rig.override) {
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(3, 5, 8, 6);
    ctx.fillStyle = rig.col(rig.palette.primary); ctx.fillRect(4, 6, 6, 4);
    ctx.restore();
  }
  if (k !== 1) ctx.restore();
} };

/**
 * One seat at a mini-game: a party member's rig, its player and the state every screen keeps for it.
 *
 * A screen that keeps MORE per seat (the pond's cast state, the mill's tie timer, the dairy's refusal) declares
 * its own `interface PondSeat extends Seat { ... }` and annotates the field it stores them on; `makeSeats` is
 * generic so it hands that type straight back and the screen's own fields are as typed as these are.
 */
export interface Seat {
  /** Index in the party (0..n-1), which is NOT the slot. */
  index: number;
  /** Player slot 0..3: the seat's colour and its keys. */
  slot: number;
  /** Cast id ('barley'). */
  critter: string;
  /** Name plate text. */
  name: string;
  rig: Rig;
  player: AnimPlayer;
  /** The slot colour, the apron the rig already wears. */
  colour: string;
  /** Feet position in screen space. */
  x: number;
  y: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  moving: boolean;
  /** What this seat has gathered this round. */
  count: number;
  /** Frames left of the bump (collision) beat. */
  bumpT: number;
  /** Frames left of the catch beat. */
  catchT: number;
  /** The animation currently playing (see `seatAnim`). */
  anim: string;
  /** Rows the critter's tallest head part reaches above its skull, for the name plate. */
  crown: number;
  /** This seat's own drawRig options object, mutated per draw instead of allocated. */
  opts: DrawRigOpts;
}

/**
 * One seat per party member. `floorY(i)` gives the feet line for party index i. Each seat carries its own draw
 * options object so draw() mutates instead of allocating.
 */
export function makeSeats<S extends Seat = Seat>(game: Game, floorY: (i: number) => number): S[] {
  const party = game.run ? game.run.party : [{ slot: 0, critter: 'barley' }];
  const seats: Seat[] = [];
  for (let i = 0; i < party.length; i++) {
    const p = party[i], def = getCritter(p.critter), rig = critterRig(def, p.slot);
    rig.weapon = RIBBON_BASKET; rig.basketFill = 0; rig.basketSquash = 1;
    const player = new AnimPlayer(def.anims);
    seats.push({
      index: i, slot: p.slot, critter: def.id, name: def.name, rig, player, colour: PLAYER_COLORS[p.slot] || UI.paperDark,
      x: 0, y: floorY(i), facing: 1, moving: false, count: 0, bumpT: 0, catchT: 0, anim: '',
      crown: CROWN[def.id] != null ? CROWN[def.id] : 8,
      opts: { x: 0, y: 0, facing: 1, scale: 1 },
    });
  }
  // The seats this builds are exactly `Seat`; `S` is the caller's own extension of it, whose extra fields that
  // caller fills in straight after. The assertion is the whole point of the type parameter and costs nothing.
  return seats as S[];
}

/** Play `name` on a seat unless it is already playing (so loops keep their phase). */
export function seatAnim(seat: Seat, name: string, restart: boolean = false): void {
  if (seat.anim !== name || restart) { seat.anim = name; seat.player.play(name, { restart, fallback: 'idle' }); }
}

/**
 * A frame's worth of plate rectangles, so plates that would land on each other stack instead. Four seats, four
 * numbers each (x, y, w, h), written in place — a screen calls `resetPlates()` before its plate pass and passes
 * PLATES to every `drawSeatPlate`. A screen that passes nothing gets the old, unstacked behaviour.
 */
export interface PlateStack {
  /** How many rects have been written this frame. */
  n: number;
  /** The rects, four numbers each (x, y, w, h), written in place. */
  v: Int16Array;
}
export const PLATES: PlateStack = { n: 0, v: new Int16Array(4 * 4) };
export function resetPlates(): void { PLATES.n = 0; }
/** Plate box: 9 px tall with its 1 px ink, and this much clear air between two stacked rows. */
const PLATE_H = 11, PLATE_GAP = 2;

/**
 * Name plate above the tallest head part, read from the joints of the last draw of that seat. The plate row is
 * ragged by design (the judges' graft: y comes from ear tips, toque, sunhat) — ragged, but never occluded, so with a
 * `stack` the plate climbs a row at a time until it clears every plate already drawn this frame. Two critters at the
 * same x is the scoring moment, and a player has to be able to read whose basket is whose.
 */
export function drawSeatPlate(ctx: CanvasRenderingContext2D, seat: Seat, stack?: PlateStack): void {
  const j = jointScreen(seat.rig, 'head', SCRATCH);
  const top = j.y - seat.rig.p.headR * seat.rig.scale - seat.crown;
  const w = measureText(seat.name, 1) + 10, cx = R(j.x);
  let y = R(top) - 14;
  if (stack) {
    const x = cx - R(w / 2), v = stack.v;
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (let i = 0; i < stack.n; i++) {
        const k = i * 4;
        if (x < v[k] + v[k + 2] && x + w > v[k] && y < v[k + 1] + v[k + 3] && y + PLATE_H > v[k + 1]) { y = v[k + 1] - PLATE_H - PLATE_GAP; hit = true; }
      }
      if (!hit) break;
    }
    if (stack.n * 4 < v.length) { const k = stack.n * 4; v[k] = x; v[k + 1] = y; v[k + 2] = w; v[k + 3] = PLATE_H; stack.n++; }
  }
  drawNamePlate(ctx, seat.slot, seat.name, cx, y);
}

/** The round's clock and ending, plain data: frames left, the phase (0 play, 1 sign), and the sign's frame counter. */
export interface Clock {
  /** Frames left of the round. */
  timer: number;
  /** 0 = playing, 1 = the sign is dropping. */
  phase: number;
  /** Frames since the sign started dropping. */
  signT: number;
  /** The words on the board, built once by the screen that ends the round. */
  signText: string;
}
export function makeClock(): Clock { return { timer: ROUND_FRAMES, phase: 0, signT: 0, signText: '' }; }

/** Tick the clock; returns true on the frame the timer runs out (the caller ends the round). */
export function tickClock(clock: Clock): boolean {
  if (clock.phase !== 0) { clock.signT++; return false; }
  if (clock.timer > 0) clock.timer--;
  return clock.timer === 0;
}
/** Start the sign-drop ending with the words on the board (one string, built once). */
export function endRound(clock: Clock, text: string): void { clock.phase = 1; clock.signT = 0; clock.signText = text; }
/** True once the sign has slammed in and been held its 60 frames. */
export function roundOver(clock: Clock): boolean { return clock.phase === 1 && clock.signT >= SIGN_SLAM + SIGN_HOLD; }

/** The ingredient glyph a screen draws in its clock ticket. */
export type ClockIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;

/**
 * The paper clock: a small perforated ticket at the top centre with the ingredient icon, the party's `countStr`
 * ("3/4", built by the screen when it changes) and a bar draining as the 40 seconds go.
 */
export function drawClock(ctx: CanvasRenderingContext2D, clock: Clock, countStr: string, drawIcon: ClockIcon | null, title: string): void {
  const w = 132, h = 40, x = R(VIEW_W / 2 - w / 2), y = 6;
  CLOCK_OPTS.title = title;
  const top = drawTicket(ctx, x, y, w, h, CLOCK_OPTS);
  if (drawIcon) drawIcon(ctx, x + 14, top + 9);
  drawText(ctx, countStr, x + 26, top + 5, COUNT_TEXT);
  drawBar(ctx, x + 62, top + 7, 62, 6, clock.timer / ROUND_FRAMES, BAR_OPTS);
}

/**
 * The wooden end sign: drops from above the frame over SIGN_SLAM frames with a 2-frame overshoot, then hangs with a
 * slow swing. `frame` is any counter for the swing (draw-only sin).
 */
export function drawEndSign(ctx: CanvasRenderingContext2D, clock: Clock, frame: number): void {
  if (clock.phase !== 1) return;
  const t = clock.signT, restY = 96;
  let y;
  if (t < SIGN_SLAM) y = -110 + (restY + 110) * (t / SIGN_SLAM) + 6 * (t / SIGN_SLAM);
  else if (t < SIGN_SLAM + 4) y = restY + 6 - 6 * ((t - SIGN_SLAM) / 4);
  else y = restY;
  SIGN_OPTS.swing = t >= SIGN_SLAM ? Math.sin(frame * 0.04) * 0.02 : 0;
  drawSign(ctx, VIEW_W / 2, R(y) - SIGN_OPTS.rope, 220, 52, clock.signText, SIGN_OPTS);
}
