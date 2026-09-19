// The world map (docs/GDD.md section 4, docs/ARCHITECTURE.md section 5): one shared truck on a 1920x1080 storybook
// plane. Every seated player's stick is a vector; they are summed (the driver's x1.5), quantised to 16 headings on
// dcos/dsin tables built here, and the truck turns one step per 4 frames, rolling 2.2 px/frame on a lane and 1.0 in
// the fields; water stops it - the river except on its bridges, the millpond, the cove's sea. Arriving within 40 px
// of a landmark's door opens its mini-game while the shopping list is short, or the line waiting there once the
// pantry is full (docs/GDD.md section 3); otherwise a wooden sign says why not.
//
// THE ROAD (docs/CONTENT_ROADMAP.md section B): the day's crossings, `run.crossings`, come out on their lane one at
// a time - a flock of sheep dawdling across it, or a duck parade in single file. A crossing that is ON its lane
// blocks the truck exactly as water does, a half-token short, with a SHEEP! or DUCKS! sign; ALT honks, and a honk
// within HONK_R scatters the herd off the lane over CLEAR_FRAMES (the one thing the honk is for). Left alone, sheep
// clear on their own AUTO_SHEEP frames after the truck first ran up against them and ducks finish crossing in
// AUTO_DUCKS, so nobody is ever stuck; once a crossing is done the next one comes out. The herd's walkers are laid
// out from fixed offset tables about the crossing's spot, so a peer needs only the crossing's state and its timer.
// THE TIPPED CART (`run.cart`): a hand cart on the verge with its load spilled across the lane at one more of those
// spots. While the pantry is short, driving over the spill is +1 of the first ingredient the list is short of (the
// float, the ring and the catch's pip), and the cart is righted; the compass is re-pointed in case that filled a
// line. Once the pantry is full the cart is only a cart.
// THE WEATHER (`run.weather`): a drizzle day draws rain across the view, splashes the wheels on the lanes and puts a
// MUD PATCH (`run.mud`) on one more spot, where the truck slows to field speed, throws mud, and comes out wearing
// the splatter for the rest of the day (`run.muddy`); a fog day fades the world to milk beyond FOG_R of the truck
// and lights every landmark's lantern, so the compass arrow does the work. Nothing slows or blocks but the mud.
// And Barley, when aboard, waves at every flock the truck is held by: BAAA! from the cab, once per crossing.
//
// Everything in update() is deterministic: input by seat only, distances from + - * / and Math.sqrt, no clock, no
// Math.random; run.truck { x, y, heading, at } is the state that survives between visits and feeds the desync canary.
// The camera, the animation players, the sails, the bees, the smoke and the particles are visual and never hashed.
import { VIEW_W, VIEW_H, SIGNAL, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, Run, ScreenParams, TruckState } from '../game.ts';
import { dcos, dsin } from '../../lib/engine/trig.ts';
import { approach } from '../../lib/engine/math.ts';
import { particles } from '../../engine/particles.ts';
import { drawShadow, steamPuff, ringAt, floatText } from '../../art/fx.ts';
import { pulse } from '../../art/layers.ts';
import { measureText } from '../../engine/text.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import type { Pose } from '../../lib/art/poses.ts';
import type { Rig } from '../../lib/art/rig.ts';
import { WORLD_W, WORLD_H, PLACES } from '../../content/places.ts';
import { WEATHER_DRIZZLE, WEATHER_FOG } from '../run.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { drawFood } from '../../art/food.ts';
import { INK } from '../../art/layers.ts';
import { drawTruck } from '../../art/truck.ts';
import {
  CHUNK_W, CHUNK_H, CHUNKS_X, CHUNKS_Y, DRIVE_MIN_X, DRIVE_MAX_X, DRIVE_MIN_Y, DRIVE_MAX_Y, LANE_HALF, RIVER_BLOCK, SPOTS, SIGN_AT, PARK_AT,
  ROADSIDE_TREES, GLINTS, chunkLayer, treeSprite, signSprite, cloudShadowSprite, destGlowSprite, laneDist, waterBlocked,
  wallBlocked, drawSails, drawHen, drawBee, drawPhoneRing, drawSheep, drawDuck, MAP,
} from '../../art/backgrounds/map.ts';
import type { Crossing } from '../game.ts';
import { drawShoppingHud, drawLinesHud, drawLineTag, drawSeatPlates, drawWheel, drawDestArrow, drawHonk, drawSignPlate, drawMapHint } from '../maphud.ts';

const HEADINGS = 16;
/** Unit vectors of the 16 headings (0 = east, clockwise on screen), from the deterministic trig. */
const COS = new Float64Array(HEADINGS), SIN = new Float64Array(HEADINGS);
for (let h = 0; h < HEADINGS; h++) { COS[h] = dcos(h * Math.PI / 8); SIN[h] = dsin(h * Math.PI / 8); }
/** Integer orbit table for the hive's bees (32 steps, radius 10): no trig in draw for these either. */
const BEE_X = new Int8Array(32), BEE_Y = new Int8Array(32);
for (let i = 0; i < 32; i++) { BEE_X[i] = Math.round(Math.cos(i * Math.PI / 16) * 10); BEE_Y[i] = Math.round(Math.sin(i * Math.PI / 16) * 6); }
const LANE_SPEED = 2.2, FIELD_SPEED = 1.0, TURN_EVERY = 4, ARRIVE_R = 40, DRIVER = 'chicory', DRIVER_WEIGHT = 1.5;
const HONK_FRAMES = 30, SQUASH_FRAMES = 4, SIGN_FRAMES = 90, RING_FRAMES = 60, TOKEN_SCALE = 0.5;
const KIND_TREE = 0, KIND_SIGN = 1, KIND_SAILS = 2, KIND_TRUCK = 3, KIND_HERD = 4, KIND_CART = 5;
/** The tipped cart: the truck takes its spill within CART_R of the spot. */
const CART_R = 36, THANKS = 'THANKS!';
/** The mud patch's reach, the fog's clear radius and its full-milk radius, and the rain's streak count. */
const MUD_R = 44, FOG_R = 120, FOG_FAR = 280, RAIN_N = 70, WAVE_TXT = 'BAAA!';
/** The splatter a muddy truck wears: fleck offsets about the token's anchor (x, y, size). */
const SPLATTER = Int8Array.of(-16, -4, 3, -9, -2, 2, 11, -3, 3, 17, -6, 2, -3, -9, 2, 6, -11, 2, -20, -8, 2, 14, -12, 2);
/**
 * The crossings. A crossing ON its lane blocks the truck within BLOCK_R of its spot; a honk within HONK_R scatters
 * it over CLEAR_FRAMES; left alone, sheep clear AUTO_SHEEP frames after the first block and ducks in AUTO_DUCKS.
 * The herd is laid out from these tables: each walker OFF_PERP px across the lane and OFF_ALONG px along it from
 * the spot (the first `herd` entries), so a flock is a ragged line across the road and a duck family a file; the
 * scatter carries each walker SCATTER px further out on its own side.
 */
const CROSS_PENDING = 0, CROSS_ON = 1, CROSS_CLEARING = 2, CROSS_DONE = 3;
const BLOCK_R = 40, HONK_R = 150, CLEAR_FRAMES = 60, AUTO_SHEEP = 600, AUTO_DUCKS = 90, SCATTER = 64, BAA_CD = 90, HERD_MAX = 9;
const OFF_PERP = Int8Array.of(-18, -9, 0, 8, 17, -26, 25, -34, 33);
const OFF_ALONG = Int8Array.of(-10, 12, -2, 14, 4, -16, 10, -6, 2);
const DUCK_PERP = Int8Array.of(-30, -20, -11, -2, 7, 16, 25);
const SHEEP_TXT = 'SHEEP!', DUCKS_TXT = 'DUCKS!';
const DUST = { size: 2, life: 20, vy: -0.15 };
/** Mud off the wheels (crumbs of soil that fall back to the lane), and a puddle's splash on a drizzle day. */
const MUD_OPTS = { speed: 1.6, up: 1.8, color: '#7A6249', sizeJitter: 1 };
const PUDDLE_OPTS = { speed: 1.2, up: 1.4 };
// The signs an arrival that opens nothing drops in: while the pantry is short, a landmark the list does not need
// (or home, which has no queue and nothing to gather); once it is full, a landmark with no line, one whose line has
// been served, or home again.
const NOTHING = 'NOTHING NEEDED HERE', GATHER = 'FILL THE PANTRY FIRST', NO_LINE = 'NO LINE HERE', LINE_DONE = 'THIS LINE IS SERVED', WAITING = 'THE LINES ARE WAITING';
const CLOUDS = [[200, 260], [900, 700], [1500, 420]];
/** The phone rings once, on the day's first drive: remembered per run so every later visit to the map stays quiet. */
let rungRun: Run | null = null;
/** The LINE SERVED sign is raised on the first visit after a line was finished: how many were served at the last visit. */
let signedRun: Run | null = null, signedLines = 0;
/** The line tag over a queue's signpost sits above the sign sprite (26 rows) and the lantern over it. */
const TAG_ABOVE = 46;
/**
 * A line that is waiting where the truck already stands (the pantry filled at that very landmark) opens on its
 * own after this many frames: arrival fires on `truck.at` CHANGING, and nobody should have to drive off and back
 * to be let in. A mini-game is never reopened this way - a round hands back to the map with the truck still at
 * its landmark, and if that landmark supplies something else the list is short of, the player must be free to
 * drive on rather than be pulled straight into the next round.
 */
const REOPEN_FRAMES = 45;

/** Rough relative luminance of a #rrggbb fur, used once in enter() to seat the crew by value. */
function lum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b;
}
function placeIndex(id: string): number { for (let i = 0; i < PLACES.length; i++) if (PLACES[i].id === id) return i; return -1; }
/** The heading whose unit vector is most aligned with (vx, vy): a dot-product argmax, so no atan2 in the sim. */
function bestHeading(vx: number, vy: number): number {
  let best = 0, bd = -Infinity;
  for (let h = 0; h < HEADINGS; h++) { const d = vx * COS[h] + vy * SIN[h]; if (d > bd) { bd = d; best = h; } }
  return best;
}

/**
 * A pre-rendered offscreen sprite: exactly what art/layers.ts `makeLayer` hands back (`treeSprite`, `signSprite`,
 * `cloudShadowSprite`, `destGlowSprite` all return one). Stated here rather than imported because art/layers.ts is
 * still untyped; when its turn comes this becomes an import of the shape that file owns.
 */
export interface MapLayer {
  canvas: HTMLCanvasElement;
  /** The layer's own pixel size (its canvas width / height). */
  w: number;
  h: number;
}

/** A point in world coordinates: the signpost bases of art/backgrounds/map.ts SIGN_AT are these. */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * One entry of the y-sorted pass. Trees and signposts carry a baked layer; the mill's sails and the truck draw
 * themselves, so their `L` is null and `w`/`h` exist only to cull them.
 */
export interface MapSprite {
  /** KIND_TREE, KIND_SIGN, KIND_SAILS, KIND_TRUCK or KIND_HERD (one walker of a crossing: `ci` is the crossing, `k` the walker). */
  kind: number;
  /** World position of the anchor: bottom centre of the sprite. */
  x: number;
  y: number;
  /** The baked sprite to blit, or null for the two that are drawn by hand. */
  L: MapLayer | null;
  /** Bounding size used to cull against the camera. */
  w: number;
  h: number;
  /** Width of the ground shadow drawn under it; 0 draws none. */
  shadow: number;
  /** KIND_HERD only: the crossing (an index into run.crossings) and the walker within it. */
  ci?: number;
  k?: number;
}

/** One party member on the map: the rig in the seat's apron colour, its player and its name plate. */
export interface MapSeat {
  /** Player slot 0..3: the seat's colour and the sticks it reads. */
  slot: number;
  /** Cast id ('barley'). */
  critter: string;
  rig: Rig;
  player: AnimPlayer;
  /** Name plate text ('P1 BARLEY'). */
  plateText: string;
  /** Measured plate width, so the HUD card is sized once in enter() and not per frame. */
  plateW: number;
  /** True for the seat carrying the x1.5 steering weight; exactly one seat has it. */
  isDriver: boolean;
}

/** A head riding in the truck's hatch, in hatch order (driver first). */
export interface MapHead {
  rig: Rig;
  /** The seat player's live pose object: the player rewrites it in place, so this reference stays current. */
  pose: Pose;
}

/** The map camera: the eased fractional follow and the integer origin draw() blits against. */
export interface MapCamera {
  /** Camera origin in world space, rounded: what every blit subtracts. */
  x: number;
  y: number;
  /** The unrounded follow, eased toward the truck (see `snapCamera`). */
  fx: number;
  fy: number;
}

/** The paper tag over a landmark where a line is waiting: where its signpost is, and the words built in enter(). */
export interface LineTag {
  /** The line this tag belongs to (an index into run.lines), so a served one stops drawing. */
  line: number;
  /** World position of the signpost base. */
  x: number;
  y: number;
  /** '2 IN LINE'. */
  text: string;
  /** Measured tag width. */
  w: number;
}

/** The options object handed to art/truck.js drawTruck; one per screen, mutated rather than reallocated. */
export interface TruckDrawOpts {
  /** Token scale on the map (TOKEN_SCALE). */
  scale: number;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  /** Bob phase, 0 or 1. */
  bob: number;
  /** Wheel phase 0..3. */
  wheel: number;
  /** Vertical scale about the tyre line; 1 at rest. */
  squash: number;
  heads: MapHead[];
}

export class MapScreen extends Screen {
  // The fields, for the checker only, in the order the constructor and then enter() assign them. `declare`, not
  // plain declarations, for the reason game.ts's Screen and Game state at length: a plain field declaration emits
  // a class field per name (es2022 defines them before the constructor body runs), which would define every one
  // of these back to undefined over what the constructor has just written. `declare` erases under tsc, under
  // esbuild and under Node's type stripping alike, so the emitted class is the one that shipped.

  /** The y-sorted cast of the map, rebuilt by enter(): roadside trees, signposts, the mill's sails, the truck. */
  declare sprites: MapSprite[];
  /** Indices into `sprites`, reused by the per-frame y-sort (it is nearly sorted every frame). */
  declare order: number[];
  /** One entry per party member, in party order. */
  declare seats: MapSeat[];
  /** The heads in the hatch: the driver, then the rest in the order that keeps two pale furs apart. */
  declare heads: MapHead[];
  /** The checksum scratch array `checksumFields()` fills and hands back; never reallocated. */
  declare sum: number[];

  /** run.truck itself (game.ts Run): the state that survives between visits to this screen. */
  declare truck: TruckState;
  /** Current speed in px/frame along the heading, eased toward the lane or field speed. */
  declare speed: number;
  /** The heading the summed sticks are asking for (0..15), or -1 when nobody is pushing. */
  declare want: number;
  /** Frames until the truck may step its heading again (TURN_EVERY between steps). */
  declare turnCd: number;
  /** Which way the token is drawn: 1 = right, -1 = left. */
  declare facing: number;
  /** Frames left of the honk bubble. */
  declare honk: number;
  /** Frames left of the honk's squash beat. */
  declare squashT: number;
  /** Frames left of the wooden sign plate. */
  declare signTimer: number;
  /** What the sign says (NOTHING / GATHER). */
  declare signText: string;
  /** Measured width of the sign plate, taken once when the sign is raised. */
  declare signW: number;
  /** Frames left of the phone ringing at home. */
  declare ring: number;
  /** Frames until another river splash may spawn. */
  declare splashCd: number;
  /** Distance rolled since the last wheel step, accumulated for `wheelStep`. */
  declare wheelAcc: number;
  /** Wheel phase 0..3. */
  declare wheelStep: number;
  /** Steering-wheel lean, eased toward +-0.45 while turning. */
  declare lean: number;
  /** Bitmask of the player slots pushing a stick this frame, for the wheel widget. */
  declare pushMask: number;
  /** True while the truck is held by the river or a wall this frame. */
  declare blocked: boolean;
  /** Landmark id the compass points at: the first missing ingredient's, or the nearest line still waiting. */
  declare destId: string;
  /** True once the pantry is full and the truck is serving: the HUD shows the lines, not the shopping list. */
  declare serving: boolean;
  /** The line `destId` is (an index into run.lines), or -1 while gathering. */
  declare destLine: number;
  /** The lines HUD's rows, one per queue, worded once in enter(). */
  declare lineRows: string[];
  /** One tag per queue, drawn over its signpost while it waits. */
  declare lineTags: LineTag[];
  /** The signpost base of `destId`: where the lantern glow and the compass arrow sit. */
  declare destSign: WorldPoint;
  /** The one entry of `sprites` that moves: the truck, whose x/y are rewritten every update. */
  declare truckSprite: MapSprite;
  /** One sprite per walker of every crossing, HERD_MAX per crossing, in crossing order; positioned every update. */
  declare herd: MapSprite[];
  /** Frames before the herd will bleat or quack at the truck again. */
  declare baaCd: number;
  /** The tipped cart's sprite in the y-sort (parked off-world on a day without one). */
  declare cartSprite: MapSprite;
  /** The lantern glow over the destination's sign. */
  declare glow: MapLayer;
  /** The drifting cloud shadow, blitted three times. */
  declare cloud: MapLayer;
  /** Frames until the line waiting where the truck already stands opens by itself (REOPEN_FRAMES); 0 when none is. */
  declare reopen: number;
  /** Dev-only: frames of the east nudge on seat 0 (0 outside an autotest capture). */
  declare devDrive: number;
  /** The camera following the truck. */
  declare cam: MapCamera;
  /** The reused drawTruck options object; built on the first draw (see `truckOpts`). */
  declare _to?: TruckDrawOpts;

  constructor(game: Game) { super(game, 'map'); this.sprites = []; this.order = []; this.seats = []; this.heads = []; this.sum = [0, 0, 0, 0, 0, 0]; this.lineRows = []; this.lineTags = []; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    const run = this.game.run, truck = run.truck;
    particles.clear();
    if (truck.x === 0 && truck.y === 0) { truck.x = PARK_AT.x; truck.y = PARK_AT.y; truck.heading = 0; truck.at = 'home'; }
    this.truck = truck;
    this.speed = 0; this.want = -1; this.turnCd = 0; this.facing = COS[truck.heading] < 0 ? -1 : 1;
    this.honk = 0; this.squashT = 0; this.signTimer = 0; this.signText = ''; this.signW = 0; this.ring = 0; this.splashCd = 0;
    this.wheelAcc = 0; this.wheelStep = 0; this.lean = 0; this.pushMask = 0; this.blocked = false; this.baaCd = 0;
    // the crew: one rig per seat in the seat's apron colour, one animation player each; heads ride in the windows
    this.seats.length = 0; this.heads.length = 0;
    for (const p of run.party) {
      const def = getCritter(p.critter), rig = critterRig(def, p.slot), player = new AnimPlayer(def.anims);
      player.play('idle');
      const plateText = `P${p.slot + 1} ${def.name}`;
      this.seats.push({ slot: p.slot, critter: p.critter, rig, player, plateText, plateW: measureText(plateText, 1) + 8, isDriver: false });
    }
    // the driver sits in the cab: the hare when seated, else seat 0. Whoever it is carries the x1.5 steering weight
    // (GDD section 4), so the critter visibly driving and the weighted sum can never disagree.
    const di = Math.max(0, this.seats.findIndex((s) => s.critter === DRIVER));
    this.seats[di].isDriver = true;
    this.heads.push({ rig: this.seats[di].rig, pose: this.seats[di].player.pose });
    // the hatch holds three 7 px heads shoulder to shoulder, so two pale furs must not end up neighbours
    // (ART_STYLE section 0.1). With three aboard the fur furthest from the other two takes the middle slot;
    // with two or fewer there is nothing to collide. Deterministic: a fixed function of the party.
    const rest = [];
    for (let i = 0; i < this.seats.length; i++) if (i !== di) rest.push(this.seats[i]);
    if (rest.length === 3) {
      let mid = 0, bd = -1;
      for (let m = 0; m < 3; m++) {
        const lm = lum(rest[m].rig.palette.skin);
        let d = 2;
        for (let k = 0; k < 3; k++) if (k !== m) { const e = Math.abs(lum(rest[k].rig.palette.skin) - lm); if (e < d) d = e; }
        if (d > bd) { bd = d; mid = m; }
      }
      rest.splice(1, 0, rest.splice(mid, 1)[0]);
    }
    for (const s of rest) this.heads.push({ rig: s.rig, pose: s.player.pose });
    this.pickDest();
    // the phone rings as the truck opens for the day, and never again
    if (rungRun !== run) { rungRun = run; this.ring = RING_FRAMES; }
    // the first visit after a line was finished says so, and how many are left
    const servedNow = run.linesServed();
    if (signedRun === run && servedNow > signedLines) this.raiseSign(`LINE SERVED!  ${run.lines.length - servedNow} TO GO`);
    signedRun = run; signedLines = servedNow;
    // a queue right here: the arrival re-fires on its own after a beat (see REOPEN_FRAMES)
    this.reopen = truck.at && run.screenForPlace(truck.at) === 'line' ? REOPEN_FRAMES : 0;
    // the y-sorted cast of the map: roadside trees, signposts, the mill's sails and the truck
    this.sprites.length = 0;
    for (const t of ROADSIDE_TREES) { const L = treeSprite(t[2]); this.sprites.push({ kind: KIND_TREE, x: t[0], y: t[1], L, w: L.w, h: L.h, shadow: 18 + t[2] * 4 }); }
    for (const p of PLACES) { const s = SIGN_AT[p.id], L = signSprite(p.sign); this.sprites.push({ kind: KIND_SIGN, x: s.x, y: s.y, L, w: L.w, h: L.h, shadow: 16 }); }
    this.sprites.push({ kind: KIND_SAILS, x: SPOTS.millHub.x, y: SPOTS.millHub.y + 52, L: null, w: 70, h: 100, shadow: 0 });
    this.truckSprite = { kind: KIND_TRUCK, x: truck.x, y: truck.y, L: null, w: 44, h: 40, shadow: 40 };
    this.sprites.push(this.truckSprite);
    // the crossings' walkers: a fixed HERD_MAX sprites per crossing, the ones past the herd's count parked off-world
    this.herd = [];
    for (let ci = 0; ci < run.crossings.length; ci++) for (let k = 0; k < HERD_MAX; k++) {
      const sp: MapSprite = { kind: KIND_HERD, x: -1000, y: -1000, L: null, w: 20, h: 16, shadow: 12, ci, k };
      this.herd.push(sp); this.sprites.push(sp);
    }
    this.placeHerds();
    this.cartSprite = { kind: KIND_CART, x: run.cart ? run.cart.x : -1000, y: run.cart ? run.cart.y : -1000, L: null, w: 40, h: 24, shadow: 26 };
    this.sprites.push(this.cartSprite);
    this.sum.length = 8 + run.crossings.length * 3;
    this.order.length = 0; for (let i = 0; i < this.sprites.length; i++) this.order.push(i);
    this.glow = destGlowSprite(); this.cloud = cloudShadowSprite();
    // dev-only nudge so a capture can show the truck rolling: seat 0 is pushed east for the first two seconds
    this.devDrive = this.game.options.debug && this.game.options.autotest ? 120 : 0;
    this.cam = { x: 0, y: 0, fx: truck.x - VIEW_W / 2, fy: truck.y - VIEW_H / 2 };
    this.snapCamera(true);
    // paint the chunks this first frame will blit while the fade is still over us: a chunk repaints the whole
    // authored world, so meeting four of them on frame one is a visible hitch
    for (let r = Math.floor(this.cam.y / CHUNK_H); r <= Math.min(CHUNKS_Y - 1, Math.floor((this.cam.y + VIEW_H - 1) / CHUNK_H)); r++) {
      for (let c = Math.floor(this.cam.x / CHUNK_W); c <= Math.min(CHUNKS_X - 1, Math.floor((this.cam.x + VIEW_W - 1) / CHUNK_W)); c++) chunkLayer(r * CHUNKS_X + c);
    }
  }
  snapCamera(hard: boolean): void {
    const c = this.cam, tx = this.truck.x - VIEW_W / 2, ty = this.truck.y - VIEW_H / 2;
    if (hard) { c.fx = tx; c.fy = ty; } else { c.fx += (tx - c.fx) * 0.1; c.fy += (ty - c.fy) * 0.1; }
    c.fx = Math.max(0, Math.min(WORLD_W - VIEW_W, c.fx)); c.fy = Math.max(0, Math.min(WORLD_H - VIEW_H, c.fy));
    c.x = Math.round(c.fx); c.y = Math.round(c.fy);
  }

  override update(): void {
    super.update();
    const inp = this.game.input, game = this.game, truck = this.truck;
    if (inp.anyPressed('start') >= 0 && !(game.net && game.net.active)) { game.push('pause'); return; }
    particles.update();
    for (const s of this.seats) s.player.tick();
    // steering: every seat's stick summed, the driver's weighted; the wheel widget lights the seats that push
    let vx = 0, vy = 0, mask = 0;
    for (const s of this.seats) {
      const ax = inp.axisX(s.slot), ay = inp.axisY(s.slot);
      if (ax !== 0 || ay !== 0) mask |= 1 << s.slot;
      const w = s.isDriver ? DRIVER_WEIGHT : 1;
      vx += ax * w; vy += ay * w;
    }
    if (this.devDrive > 0) { this.devDrive--; vx += 1; mask |= 1; }
    this.pushMask = mask;
    const pushing = vx !== 0 || vy !== 0;
    this.want = pushing ? bestHeading(vx, vy) : -1;
    if (this.turnCd > 0) this.turnCd--;
    let leanTo = 0;
    if (this.want >= 0 && this.want !== truck.heading) {
      const d = (this.want - truck.heading + HEADINGS) % HEADINGS, dir = d <= HEADINGS / 2 ? 1 : -1;
      leanTo = dir * 0.45;
      if (this.turnCd === 0) { truck.heading = (truck.heading + dir + HEADINGS) % HEADINGS; this.turnCd = TURN_EVERY; }
    }
    this.lean = approach(this.lean, leanTo, 0.08);
    const onLane = laneDist(truck.x, truck.y) <= LANE_HALF + 2;
    const inMud = this.inMud(truck.x, truck.y);
    const target = pushing ? (onLane && !inMud ? LANE_SPEED : FIELD_SPEED) : 0;
    this.speed = approach(this.speed, target, this.speed < target ? 0.12 : 0.25);
    this.blocked = false;
    if (this.speed > 0) {
      let nx = truck.x + COS[truck.heading] * this.speed, ny = truck.y + SIN[truck.heading] * this.speed;
      nx = nx < DRIVE_MIN_X ? DRIVE_MIN_X : nx > DRIVE_MAX_X ? DRIVE_MAX_X : nx;
      ny = ny < DRIVE_MIN_Y ? DRIVE_MIN_Y : ny > DRIVE_MAX_Y ? DRIVE_MAX_Y : ny;
      if (waterBlocked(nx, ny)) {
        // the splash belongs in the water in front of the nose, not under the truck: every block keeps the token a
        // half-length short of the bank, so a ring at the centre lands on grass and the cream word on the cream hatch
        this.speed = 0; this.blocked = true;
        if (this.splashCd === 0) {
          ringAt(nx + COS[truck.heading] * RIVER_BLOCK, ny + SIN[truck.heading] * RIVER_BLOCK, 4, 18, MAP.skyTop, 2, 16, true);
          floatText(nx, ny - 40, 'SPLASH', MAP.skyTop); this.splashCd = 30;
          game.audio.play('splash');
        }
      } else if (wallBlocked(nx, ny)) { this.speed = 0; this.blocked = true; }
      else if (this.crossingAt(nx, ny) >= 0) {
        // a herd across the lane: held a half-token short of it, the sign says what, and the herd answers back
        const c = this.game.run.crossings[this.crossingAt(nx, ny)];
        this.speed = 0; this.blocked = true;
        if (c.t === 0) c.t = 1;   // the clock on "it clears on its own" starts the first time the truck runs up against it
        const txt = c.kind === 0 ? SHEEP_TXT : DUCKS_TXT;
        if (this.signTimer === 0 || this.signText !== txt) this.raiseSign(txt);
        if (this.baaCd === 0) { game.audio.play(c.kind === 0 ? 'baa' : 'quack'); this.baaCd = BAA_CD; }
        // the hungry one waves at every flock, once, from the cab: a sheep among sheep
        if (c.kind === 0 && !c.waved) { const b = this.seats.find((x) => x.critter === 'barley'); if (b) { c.waved = 1; floatText(truck.x, truck.y - 46, WAVE_TXT, PLAYER_COLORS[b.slot]); } }
      } else { truck.x = nx; truck.y = ny; }
      this.wheelAcc += this.speed; this.wheelStep = Math.floor(this.wheelAcc / 5) & 3;
      if (!onLane && (this.frame % 6) === 0) particles.spawn('dust', truck.x - COS[truck.heading] * 12, truck.y, DUST);
      // the mud: it flies off the wheels, and the truck wears it home; the drizzle's puddles splash on the lanes
      if (inMud) { if (!game.run.muddy) game.run.muddy = 1; if ((this.frame & 3) === 0) particles.burst('crumb', truck.x - COS[truck.heading] * 10, truck.y + 2, 2, MUD_OPTS); }
      else if (onLane && game.run.weather === WEATHER_DRIZZLE && (this.frame % 8) === 0) particles.burst('drop', truck.x, truck.y + 2, 1, PUDDLE_OPTS);
    }
    if (this.splashCd > 0) this.splashCd--;
    if (COS[truck.heading] > 0.01) this.facing = 1; else if (COS[truck.heading] < -0.01) this.facing = -1;
    // arrival: the first landmark whose door is within reach; leaving one clears `at` so it can fire again
    let near = -1;
    for (let i = 0; i < PLACES.length; i++) { const dx = PLACES[i].x - truck.x, dy = PLACES[i].y - truck.y; if (dx * dx + dy * dy < ARRIVE_R * ARRIVE_R) { near = i; break; } }
    if (this.reopen > 0 && --this.reopen === 0) truck.at = '';
    if (near < 0) truck.at = '';
    else if (truck.at !== PLACES[near].id) { truck.at = PLACES[near].id; this.arrive(near); }
    if (inp.anyPressed('alt') >= 0) { this.honk = HONK_FRAMES; this.squashT = SQUASH_FRAMES; game.audio.play('honk'); this.honkHerd(); }
    if (this.baaCd > 0) this.baaCd--;
    this.stepCrossings();
    this.takeCart();
    if (this.honk > 0) this.honk--;
    if (this.squashT > 0) this.squashT--;
    if (this.signTimer > 0) this.signTimer--;
    if (this.ring > 0) this.ring--;
    this.truckSprite.x = truck.x; this.truckSprite.y = truck.y;
    this.snapCamera(false);
  }
  /**
   * Where the day wants us: the landmark of the first missing ingredient while the pantry is short; once it is
   * full, the nearest line still waiting (squared distances, no sqrt: the compass is drawn, never hashed); home
   * when the day is done. And the queues' HUD rows and signpost tags, worded once; a served line keeps its row
   * (washed back) and loses its tag. Called on entry, and again the moment the tipped cart fills a line.
   */
  pickDest(): void {
    const run = this.game.run, truck = this.truck;
    this.serving = run.complete();
    this.destLine = -1;
    if (!this.serving) {
      const miss = run.missing();
      this.destId = miss.length ? run.placeFor(miss[0].id) : 'home';
    } else {
      let bd = Infinity;
      for (let i = 0; i < run.lines.length; i++) {
        if (run.lines[i].served) continue;
        const p = PLACES.find((x) => x.id === run.lines[i].place);
        if (!p) continue;
        const dx = p.x - truck.x, dy = p.y - truck.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; this.destLine = i; }
      }
      this.destId = this.destLine >= 0 ? run.lines[this.destLine].place : 'home';
    }
    this.destSign = SIGN_AT[this.destId] || SIGN_AT.home;
    this.lineRows.length = 0; this.lineTags.length = 0;
    for (let i = 0; i < run.lines.length; i++) {
      const ln = run.lines[i], p = PLACES.find((x) => x.id === ln.place), sg = SIGN_AT[ln.place];
      const left = ln.customers.length - (i === run.line ? run.customer : 0);
      this.lineRows.push(`${p ? p.sign : ln.place.toUpperCase()}  ${ln.served ? 'SERVED' : left + ' IN LINE'}`);
      const text = `${left} IN LINE`;
      if (sg) this.lineTags.push({ line: i, x: sg.x, y: sg.y, text, w: measureText(text, 1) + 12 });
    }
  }

  /** The tipped cart: over its spill while the list is short of something, and that something is +1. */
  takeCart(): void {
    const run = this.game.run, cart = run.cart, truck = this.truck;
    if (!cart || cart.taken || this.serving) return;
    const dx = cart.x - truck.x, dy = cart.y - truck.y;
    if (dx * dx + dy * dy >= CART_R * CART_R) return;
    const miss = run.missing();
    if (!miss.length) return;
    const need = miss[0], ing = INGREDIENTS[need.id];
    cart.taken = 1;
    run.gather(need.id, 1);
    ringAt(cart.x, cart.y - 6, 4, 22, SIGNAL.map, 2, 16, true);
    floatText(cart.x, cart.y - 34, '+1 ' + ing.name, ing.hex);
    floatText(cart.x + 26, cart.y - 20, THANKS, MAP.skyTop);
    this.game.audio.play('catch');
    this.pickDest();
  }

  /** True within MUD_R of the drizzle day's mud patch. */
  inMud(x: number, y: number): boolean {
    const m = this.game.run.mud;
    if (!m) return false;
    const dx = m.x - x, dy = m.y - y;
    return dx * dx + dy * dy < MUD_R * MUD_R;
  }

  /** The crossing ON its lane whose spot is within BLOCK_R of (x, y), or -1. */
  crossingAt(x: number, y: number): number {
    const cs = this.game.run.crossings;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.state !== CROSS_ON) continue; const dx = c.x - x, dy = c.y - y; if (dx * dx + dy * dy < BLOCK_R * BLOCK_R) return i; }
    return -1;
  }

  /** A honk within HONK_R of a crossing on its lane scatters it: the herd runs off the road over CLEAR_FRAMES. */
  honkHerd(): void {
    const cs = this.game.run.crossings, t = this.truck;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.state !== CROSS_ON) continue;
      const dx = c.x - t.x, dy = c.y - t.y;
      if (dx * dx + dy * dy < HONK_R * HONK_R) this.scatter(c);
    }
  }

  scatter(c: Crossing): void {
    c.state = CROSS_CLEARING; c.t = CLEAR_FRAMES;
    for (let k = 0; k < c.herd; k++) particles.spawn('dust', c.x + c.dx * OFF_ALONG[k] - c.dy * OFF_PERP[k], c.y + c.dy * OFF_ALONG[k] + c.dx * OFF_PERP[k], DUST);
    this.game.audio.play(c.kind === 0 ? 'baa' : 'quack');
  }

  /** The crossings' clocks: a blocked herd clears on its own in time, a scattering one finishes, and the next comes out. */
  stepCrossings(): void {
    const cs = this.game.run.crossings;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.state === CROSS_ON) {
        if (c.t > 0 && ++c.t >= (c.kind === 0 ? AUTO_SHEEP : AUTO_DUCKS)) this.scatter(c);
      } else if (c.state === CROSS_CLEARING) {
        if (--c.t <= 0) { c.state = CROSS_DONE; c.t = 0; const next = cs.find((n) => n.state === CROSS_PENDING); if (next) next.state = CROSS_ON; }
      }
    }
    this.placeHerds();
  }

  /**
   * Every walker's world position from its crossing's state: across the lane at its table offset while ON, sliding
   * SCATTER px further out on its own side through the clear (and standing there once done), and parked off the
   * world while pending. Ducks are a file straight across the lane; sheep a ragged line.
   */
  placeHerds(): void {
    const cs = this.game.run.crossings;
    for (let i = 0; i < this.herd.length; i++) {
      const sp = this.herd[i], c = cs[sp.ci], k = sp.k;
      if (k >= c.herd || c.state === CROSS_PENDING) { sp.x = -1000; sp.y = -1000; continue; }
      const perp = c.kind === 0 ? OFF_PERP[k] : DUCK_PERP[k], along = c.kind === 0 ? OFF_ALONG[k] : 0;
      const side = perp < 0 ? -1 : 1;
      const out = c.state === CROSS_CLEARING ? SCATTER * (1 - c.t / CLEAR_FRAMES) : c.state === CROSS_DONE ? SCATTER : 0;
      const off = perp + side * out;
      sp.x = c.x + c.dx * along - c.dy * off; sp.y = c.y + c.dy * along + c.dx * off;
    }
  }

  arrive(i: number): void {
    const run = this.game.run, id = PLACES[i].id, screen = run.screenForPlace(id);
    if (screen) {
      // pulling up at a queue: the run stands on that line before its screen opens, so the first customer is at the hatch
      if (screen === 'line') run.startLine(run.lineAt(id));
      this.game.audio.play('truck_stop');
      this.game.fadeTo(() => this.game.replace(screen, { place: id }));
      return;
    }
    if (!this.serving) this.raiseSign(id === 'home' ? GATHER : NOTHING);
    else this.raiseSign(id === 'home' ? WAITING : run.lines.some((l) => l.place === id) ? LINE_DONE : NO_LINE);
  }
  /** Drop the wooden sign in with `text` on it. */
  raiseSign(text: string): void {
    this.signText = text;
    this.signW = measureText(text, 1) + 24;
    this.signTimer = SIGN_FRAMES;
    this.game.audio.play('sign_drop');
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const cam = this.cam, truck = this.truck, f = this.frame;
    const c0 = Math.floor(cam.x / CHUNK_W), c1 = Math.min(CHUNKS_X - 1, Math.floor((cam.x + VIEW_W - 1) / CHUNK_W));
    const r0 = Math.floor(cam.y / CHUNK_H), r1 = Math.min(CHUNKS_Y - 1, Math.floor((cam.y + VIEW_H - 1) / CHUNK_H));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ctx.drawImage(chunkLayer(r * CHUNKS_X + c).canvas, c * CHUNK_W - cam.x, r * CHUNK_H - cam.y);
    // the drizzle day's mud patch, on the lane: a soft brown pool with a darker rim, before anything stands on it
    const mud = this.game.run.mud;
    if (mud && this.inView(mud.x, mud.y, 60)) {
      ctx.fillStyle = MAP.woodDark; ctx.beginPath(); ctx.ellipse(mud.x - cam.x, mud.y - cam.y, MUD_R, MUD_R * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MAP.soil; ctx.beginPath(); ctx.ellipse(mud.x - cam.x, mud.y - cam.y - 1, MUD_R - 4, MUD_R * 0.55 - 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MAP.skyTop; ctx.globalAlpha = 0.35; ctx.fillRect(mud.x - cam.x - 12, mud.y - cam.y - 6, 10, 2); ctx.fillRect(mud.x - cam.x + 8, mud.y - cam.y + 4, 6, 2); ctx.globalAlpha = 1;
    }
    // the cheap per-frame marks on the ground: glints, hens, bees, the phone, the chimney
    ctx.fillStyle = MAP.skyTop;
    for (let i = 0; i < GLINTS.length; i++) {
      if (!(((f + i * 7) >> 4) & 1)) continue;
      const gx = GLINTS[i][0] - cam.x, gy = GLINTS[i][1] - cam.y;
      if (gx >= 0 && gx < VIEW_W && gy >= 0 && gy < VIEW_H) ctx.fillRect(gx, gy, 2, 1);
    }
    for (let i = 0; i < SPOTS.hens.length; i++) { const h = SPOTS.hens[i]; if (this.inView(h.x, h.y, 16)) drawHen(ctx, h.x - cam.x, h.y - cam.y, ((f + i * 12) >> 4) & 1, i === 0 ? 1 : -1); }
    if (this.inView(SPOTS.hiveCentre.x, SPOTS.hiveCentre.y, 20)) for (let i = 0; i < 4; i++) { const k = ((f >> 1) + i * 8) & 31; drawBee(ctx, SPOTS.hiveCentre.x + BEE_X[k] - cam.x, SPOTS.hiveCentre.y + BEE_Y[k] - cam.y); }
    if (this.ring > 0 && this.inView(SPOTS.phone.x, SPOTS.phone.y, 20)) drawPhoneRing(ctx, SPOTS.phone.x - cam.x, SPOTS.phone.y - cam.y, this.ring > RING_FRAMES - 30 ? ((f >> 1) & 1) * 2 - 1 : 0);
    if (this.inView(SPOTS.chimney.x, SPOTS.chimney.y, 24)) { steamPuff(ctx, SPOTS.chimney.x - cam.x, SPOTS.chimney.y - cam.y, f, 24); steamPuff(ctx, SPOTS.chimney.x - cam.x + 1, SPOTS.chimney.y - cam.y, f + 12, 24); }
    particles.draw(ctx, cam, 'back');
    // shadows first, then the y-sorted pass (insertion sort on a reused index list: it is nearly sorted every frame)
    const sp = this.sprites, ord = this.order;
    let n = 0;
    for (let i = 0; i < sp.length; i++) { const s = sp[i]; if (s.x + s.w / 2 < cam.x || s.x - s.w / 2 > cam.x + VIEW_W || s.y < cam.y || s.y - s.h > cam.y + VIEW_H) continue; ord[n++] = i; }
    for (let i = 1; i < n; i++) { const v = ord[i]; let j = i - 1; while (j >= 0 && (sp[ord[j]].y > sp[v].y || (sp[ord[j]].y === sp[v].y && ord[j] > v))) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = v; }
    for (let i = 0; i < n; i++) { const s = sp[ord[i]]; if (s.shadow) drawShadow(ctx, s.x - cam.x, s.y - cam.y, s.shadow, 0.35); }
    for (let i = 0; i < n; i++) {
      const s = sp[ord[i]], sx = s.x - cam.x, sy = s.y - cam.y;
      if (s.kind === KIND_TRUCK) this.drawTruck(ctx, sx, sy);
      else if (s.kind === KIND_SAILS) drawSails(ctx, SPOTS.millHub.x - cam.x, SPOTS.millHub.y - cam.y, f * 0.3);
      else if (s.kind === KIND_HERD) this.drawWalker(ctx, s, sx, sy, f);
      else if (s.kind === KIND_CART) this.drawCart(ctx, sx, sy);
      else ctx.drawImage(s.L.canvas, sx - (s.L.w >> 1), sy - s.L.h);
    }
    // the lantern glow over the destination's sign (the map's one signal colour), then the drifting cloud shadows
    const gs = this.destSign, gx = gs.x - cam.x, gy = gs.y - 18 - cam.y;
    if (gx > -24 && gx < VIEW_W + 24 && gy > -24 && gy < VIEW_H + 24) {
      ctx.globalAlpha = 0.5 + 0.3 * pulse(f, 90); ctx.drawImage(this.glow.canvas, gx - 22, gy - 22); ctx.globalAlpha = 1;
      // the lantern itself: a 4x5 gold lamp on an ink hook above the board
      ctx.fillStyle = MAP.plum; ctx.fillRect(gx - 3, gy - 22, 6, 2); ctx.fillRect(gx - 1, gy - 20, 2, 2);
      ctx.fillStyle = SIGNAL.map; ctx.fillRect(gx - 2, gy - 18, 4, 5);
    }
    for (let i = 0; i < CLOUDS.length; i++) {
      const cx = ((CLOUDS[i][0] + f * 0.15) % (WORLD_W + 160)) - 160 - cam.x, cy = CLOUDS[i][1] - cam.y;
      if (cx > -160 && cx < VIEW_W && cy > -60 && cy < VIEW_H) ctx.drawImage(this.cloud.canvas, Math.round(cx), cy);
    }
    this.drawWeather(ctx, f);
    // the tags over the queues that are still waiting: the picture says where the lines are before the HUD does
    if (this.serving) {
      for (let i = 0; i < this.lineTags.length; i++) {
        const t = this.lineTags[i];
        if (this.game.run.lines[t.line].served || !this.inView(t.x, t.y - TAG_ABOVE, 40)) continue;
        drawLineTag(ctx, t.x - cam.x, t.y - TAG_ABOVE - cam.y, t.text, t.w);
      }
    }
    particles.draw(ctx, cam, 'front');
    if (this.honk > 0) drawHonk(ctx, truck.x - cam.x + this.facing * 8, truck.y - cam.y - 44, (HONK_FRAMES - this.honk) / HONK_FRAMES);
    // HUD
    if (this.serving) drawLinesHud(ctx, this.game.run, this.lineRows, this.destLine);
    else drawShoppingHud(ctx, this.game.run);
    drawSeatPlates(ctx, this.seats);
    drawWheel(ctx, this.pushMask, this.lean);
    drawDestArrow(ctx, gs.x - cam.x, gs.y - 12 - cam.y, f);
    if (this.signTimer > 0) drawSignPlate(ctx, this.signText, this.signW, SIGN_FRAMES - this.signTimer);
    drawMapHint(ctx);
  }
  /**
   * The weather, over the world and under the HUD. Drizzle: RAIN_N streaks of river-blue on a frame hash, falling
   * a little to the left. Fog: the world fades to milk beyond FOG_R of the truck (a radial gradient, clear inside,
   * full at FOG_FAR), and every landmark's lantern is drawn again over the fog so the lamps are what you steer by.
   */
  drawWeather(ctx: CanvasRenderingContext2D, f: number): void {
    const w = this.game.run.weather, cam = this.cam, truck = this.truck;
    if (w === WEATHER_DRIZZLE) {
      ctx.strokeStyle = MAP.river; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < RAIN_N; i++) {
        const x = (i * 97 + ((f * 2) % 640) * ((i & 1) ? 1 : 0)) % VIEW_W, y = (i * 53 + f * 7) % (VIEW_H + 12) - 12;
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      return;
    }
    if (w !== WEATHER_FOG) return;
    const tx = truck.x - cam.x, ty = truck.y - cam.y - 12;
    const g = ctx.createRadialGradient(tx, ty, FOG_R, tx, ty, FOG_FAR);
    g.addColorStop(0, 'rgba(251,227,196,0)'); g.addColorStop(1, 'rgba(251,227,196,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (const p of PLACES) {
      const sg = SIGN_AT[p.id]; if (!sg) continue;
      const gx = sg.x - cam.x, gy = sg.y - 18 - cam.y;
      if (gx < -24 || gx > VIEW_W + 24 || gy < -24 || gy > VIEW_H + 24) continue;
      ctx.globalAlpha = p.id === this.destId ? 0.9 : 0.55; ctx.drawImage(this.glow.canvas, gx - 22, gy - 22); ctx.globalAlpha = 1;
      ctx.fillStyle = SIGNAL.map; ctx.fillRect(gx - 2, gy - 18, 4, 5);
    }
  }
  inView(wx: number, wy: number, m: number): boolean { const c = this.cam; return wx >= c.x - m && wx <= c.x + VIEW_W + m && wy >= c.y - m && wy <= c.y + VIEW_H + m; }
  drawTruck(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const moving = this.speed > 0.2;
    drawTruck(ctx, sx, sy, this.truckOpts(moving ? ((this.frame >> 2) & 1) : 0));
    // the mud it drove through, worn for the rest of the day: brown flecks about the wheel arches
    if (this.game.run.muddy) { ctx.fillStyle = MAP.soil; for (let i = 0; i < SPLATTER.length; i += 3) ctx.fillRect(sx + SPLATTER[i], sy + SPLATTER[i + 1], SPLATTER[i + 2], SPLATTER[i + 2]); }
  }
  /** One walker of a crossing: a sheep dawdling (the walk beat only while it scatters) or a duck in the file. */
  drawWalker(ctx: CanvasRenderingContext2D, s: MapSprite, sx: number, sy: number, f: number): void {
    const c = this.game.run.crossings[s.ci], moving = c.state === CROSS_CLEARING;
    const facing = c.state === CROSS_ON ? (((s.k + s.ci) & 1) ? -1 : 1) : (c.kind === 0 ? OFF_PERP[s.k] : DUCK_PERP[s.k]) < 0 ? -1 : 1;
    const walk = moving ? ((f + s.k * 5) >> 2) & 1 : 0;
    if (c.kind === 0) drawSheep(ctx, sx, sy, facing, walk);
    else drawDuck(ctx, sx, sy, facing, s.k === 0 ? 1 : 0, walk);
  }

  /**
   * The tipped cart: a plank bed on one big wheel with two handles, tipped onto its side with its load spilled
   * across the lane (the first short ingredient's glyph, three of them, so what it gives is what it shows); righted
   * and empty once the truck has been over it.
   */
  drawCart(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
    const run = this.game.run, taken = !run.cart || run.cart.taken || this.serving;
    ctx.save(); ctx.translate(sx, sy);
    if (!taken) ctx.rotate(-0.5);
    // the wheel, the bed, the handles
    ctx.beginPath(); ctx.arc(-8, -6, 6, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = MAP.trunk; ctx.fill();
    ctx.fillStyle = MAP.skyTop; ctx.fillRect(-9, -7, 2, 2);
    ctx.beginPath(); ctx.rect(-14, -18, 26, 10); ctx.stroke(); ctx.fillStyle = MAP.wall; ctx.fill();
    ctx.fillStyle = MAP.trunk; ctx.fillRect(-13, -12, 24, 3);
    ctx.fillStyle = INK; ctx.fillRect(12, -16, 10, 2); ctx.fillRect(12, -11, 10, 2);
    ctx.restore();
    if (taken) return;
    const miss = run.missing();
    if (!miss.length) return;
    const ing = INGREDIENTS[miss[0].id];
    drawFood(ctx, ing.icon, sx + 14, sy - 3, 5, ing.hex); drawFood(ctx, ing.icon, sx + 26, sy + 1, 5, ing.hex); drawFood(ctx, ing.icon, sx + 20, sy - 10, 5, ing.hex);
  }

  /** Reuse one options object for drawTruck (zero allocation in draw). */
  truckOpts(bob: number): TruckDrawOpts {
    const o = this._to || (this._to = { scale: TOKEN_SCALE, facing: 1, bob: 0, wheel: 0, squash: 1, heads: this.heads });
    o.facing = this.facing; o.bob = bob; o.wheel = this.wheelStep; o.squash = this.squashT > 0 ? 1.1 : 1; o.heads = this.heads;
    return o;
  }

  override summary() {
    const t = this.truck;
    return {
      truck: { x: Math.round(t.x), y: Math.round(t.y), heading: t.heading, at: t.at }, speed: Math.round(this.speed * 100) / 100, dest: this.destId, destLine: this.destLine, serving: this.serving, sign: this.signTimer > 0 ? this.signText : '', honk: this.honk > 0, blocked: this.blocked, seats: this.seats.length,
      crossings: this.game.run.crossings.map((c) => ({ x: c.x, y: c.y, kind: c.kind, herd: c.herd, state: c.state, t: c.t, waved: c.waved })),
      cart: this.game.run.cart ? { x: this.game.run.cart.x, y: this.game.run.cart.y, taken: this.game.run.cart.taken } : null,
      weather: this.game.run.weather, mud: this.game.run.mud ? { x: this.game.run.mud.x, y: this.game.run.mud.y } : null, muddy: this.game.run.muddy, inMud: this.inMud(t.x, t.y),
    };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const t = this.truck, s = this.sum;
    s[0] = t.x; s[1] = t.y; s[2] = t.heading; s[3] = this.speed; s[4] = placeIndex(t.at); s[5] = this.reopen;
    const cs = this.game.run.crossings;
    for (let i = 0; i < cs.length; i++) { s[6 + i * 3] = cs[i].state; s[7 + i * 3] = cs[i].t; s[8 + i * 3] = cs[i].waved; }
    s[6 + cs.length * 3] = this.game.run.cart ? this.game.run.cart.taken : 0;
    s[7 + cs.length * 3] = this.game.run.muddy;
    return s;
  }
}
