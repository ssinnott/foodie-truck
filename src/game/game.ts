// Game: screen stack, shared services, the current run (docs/ARCHITECTURE.md section 5). Ported from the
// sibling game's shell; the run object is new and is the only cross-screen state.
//
// THE FIELDS ARE `declare`d, NOT INITIALISED. Every field below is already assigned by its constructor, so the
// declarations exist for the checker alone: a plain field declaration would emit a class field per name (es2022
// defines them before the constructor body runs) and these two classes have to keep the runtime they shipped
// with - a screen subclass's own declarations included, since a field redeclared over one a base constructor has
// already written would define it back to undefined. `declare` erases under tsc, under esbuild (tools/build.js,
// tools/server.js) and under Node's type stripping alike, so the emitted classes are the originals. Same
// reasoning, and same shape, as the field block in lib/art/animation.ts's AnimPlayer.
import { VIEW_W, VIEW_H } from '../constants.ts';
import type { Rng } from '../lib/engine/rng.ts';
import type { AnimSet } from '../lib/art/animation.ts';
import type { RigBuild } from '../lib/art/rig.ts';

/**
 * The input service: engine/input.ts's singleton itself, so the shell's view of it can never drift from the
 * module screens actually call (`game.input.pressed(slot, 'action')`).
 */
export type Input = typeof import('../engine/input.ts')['input'];

/** One line of an order or of the shopping list: an ingredient (content/recipes.js INGREDIENTS), how many are wanted, how many are in. */
export interface OrderNeed {
  id: string;
  amount: number;
  have: number;
  /** What the kitchen has taken back out of the pantry (the shopping list only; an order's own lines never move). */
  used: number;
}

/** What the customer at the hatch ordered: one content/recipes.js ORDERS recipe, with their name on it. */
export interface Order {
  id: string;
  dish: string;
  /** The village diner who ordered it ('owl', content/critters/customers.js). */
  customer: string;
  /** What they said at the hatch. */
  line: string;
  /** Kitchen stations in order (content/places.js STATIONS). */
  steps: string[];
  needs: OrderNeed[];
}

/** One seat of the party, in slot order. */
export interface PartySeat {
  /** Player slot 0..3: the seat's colour, its keys and its place in the START packet. */
  slot: number;
  /** Cast id ('barley'). */
  critter: string;
  score: number;
}

/** One customer in a line: who they are, what they ordered, and the stars they gave it (0 until served). */
export interface RunCustomer {
  /** Diner id ('owl', content/critters/customers.js). */
  customer: string;
  /** ORDERS id ('applePie'). */
  recipe: string;
  /** 0 until served, then 1..3. */
  stars: number;
}

/** One queue of the day: the landmark it waits at, who is in it, and whether the truck has served it. */
export interface RunLine {
  /** Landmark id (content/places.js PLACES, never 'home'). */
  place: string;
  customers: RunCustomer[];
  /** True once the last customer in it has been served. */
  served: boolean;
}

/** One line as `planDay` lays it out, before the run adds the served state. */
export interface DayPlanLine {
  place: string;
  customers: { customer: string; recipe: string }[];
}

/** What `planDay` draws from a seed: the menu and the lines. */
export interface DayPlan {
  /** ORDERS ids on the day's menu. */
  recipes: string[];
  lines: DayPlanLine[];
}

/** Where the truck is on the world map, kept between visits to the map screen. */
export interface TruckState {
  x: number;
  y: number;
  /** Heading in radians. */
  heading: number;
  /** Id of the landmark it is standing at ('home', content/places.js PLACES). */
  at: string;
}

/**
 * The current run (game/run.js startRun): the day's plan, the party, the shopping list and what has been gathered,
 * the line being served. The ONLY state shared between screens, and deliberately plain data so netplay can hash
 * it and every peer can rebuild it from the START packet.
 */
export interface Run {
  seed: number;
  party: PartySeat[];
  /** The day's menu: ORDERS ids, in the order the board prints them. */
  recipes: string[];
  /** The queues, one per landmark that has one. */
  lines: RunLine[];
  /** The shopping list: every order's ingredients summed; `have` gathered, `used` cooked. */
  needs: OrderNeed[];
  /** The line the truck is serving (an index into `lines`): the last one it pulled up at. */
  line: number;
  /** The customer at the hatch (an index into that line's customers). */
  customer: number;
  /** What that customer ordered. */
  order: Order;
  /** How many dishes the truck has served today. */
  served: number;
  /** The line `serve()` finished last; -1 before the first one. */
  lastServed: number;
  score: number;
  truck: TruckState;
  /** Frames spent in the run. */
  frame: number;
  /** The shopping-list line for an ingredient, or null when the day never asks for it. */
  need(id: string): OrderNeed | null;
  /** How many of `id` have been gathered. */
  have(id: string): number;
  /** What is left in the pantry: gathered, less what the kitchen has cooked with. */
  stock(id: string): number;
  /** Add `amount` of an ingredient (clamped to what the day needs). Returns true when that line is complete. */
  gather(id: string, amount?: number): boolean;
  /** True when the whole shopping list is in the truck. */
  complete(): boolean;
  /** The shopping-list lines still short, in order. */
  missing(): OrderNeed[];
  /** The landmark that supplies an ingredient id, or ''. */
  placeFor(id: string): string;
  /** The line still waiting at a landmark (an index into `lines`), or -1. */
  lineAt(placeId: string): number;
  /** Which screen a landmark opens: a mini-game while the pantry is short, the line once it is full, else ''. */
  screenForPlace(placeId: string): string;
  /** Pull up at line `i`: its first customer comes to the hatch. */
  startLine(i: number): Order;
  /** Bank the stars against the customer at the hatch, cook their dish out of the pantry, call the next. */
  serve(stars: number): void;
  /** True once everyone in the line the truck stands at has been served. */
  lineDone(): boolean;
  /** How many lines have been served. */
  linesServed(): number;
  /** The day's star total. */
  stars(): number;
  /** The day is done when every line has been served. */
  dayComplete(): boolean;
  /** The run as plain data for window.__game.summary() and the playtest; keys are run.js's own. */
  summary(): Record<string, unknown>;
}

/** One playable cast member: the default export of a content/critters/*.ts species file. */
export interface CritterDef {
  /** Cast id ('barley'), the same string a run's party carries. */
  id: string;
  /** Name plate text ('BARLEY'). */
  name: string;
  fullName: string;
  /** Role line on the select card ('THE HUNGRY ONE'). */
  role: string;
  species: string;
  /** The critter's own hex, for cards and portraits. */
  colour: string;
  bio: string;
  /** The rig description (content/critters/common.ts critterBuild). */
  build: RigBuild;
  /** The animation table (content/critters/common.ts makeCritterAnims). */
  anims: AnimSet;
}

/**
 * What a screen is entered with: `game.push(id, params)` hands it straight to `enter(params)`.
 *
 * The keys below are the ones screens read today; the index signature is there because this IS an open bag - one
 * screen's hand-off to the next, typed by neither of them - and a screen that starts passing a new key should not
 * have to come back and edit this shell to do it. Hence `any`: params are read, not checked.
 */
export interface ScreenParams {
  /** Lobby: open the room flow at once (an invite link, or ?skipTo=lobby). */
  autoRoom?: boolean;
  /** Map / mini-game: the landmark a dev jump (?place=) lands on. */
  place?: string;
  /** Results: the stars the kitchen awarded. */
  stars?: number;
  /** Results: the score the kitchen banked. */
  score?: number;
  [key: string]: any;
}

/** A screen factory: what `registerScreen` stores and `_make` calls. */
export type ScreenFactory = (game: Game) => Screen;

/** The fade-to-black state machine (`fadeTo`). */
export interface Fade {
  /** 0 = clear, 1 = full black. */
  alpha: number;
  /** 1 = fading out, -1 = fading back in, 0 = idle. */
  dir: number;
  /** Alpha per fixed step. */
  speed: number;
  /** What to run at full black (usually a replace); cleared as it is called. */
  then: (() => void) | null;
}

/** The options bag (main.ts parseOptions, the URL query): the defaults the shell sets, plus the dev/test jumps. */
export interface GameOptions {
  debug: boolean;
  autotest: boolean;
  /** The run's seed: every peer draws from the same one. */
  seed: number;
  /** ?skipTo=<screen id>: open on that screen with a run already started. */
  skipTo: string;
  /** ?room=CODE: the online room to join. */
  room: string;
  /** ?host=1: host a room instead of joining one. */
  host: boolean;
  /** 'mqtt' (room codes) or 'broadcast' (the same-machine end-to-end test hook). */
  transport: string;
  /** ?critters=0,1,2,3: cast indices to seat for a skipTo run. */
  critters?: number[];
  /** ?place=orchard: the landmark a skipTo mini-game opens at. */
  place?: string;
  /** ?order=N: the recipe (1-based ORDERS index) forced onto the day's menu and into the first customer's paws. */
  order?: number;
  /** ?recipes=0,2: the ORDERS indices the day's menu is made of, instead of the seeded draw. */
  recipes?: number[];
  /** ?netrelay=1: the netplay relay debug view. */
  netrelay?: boolean;
}

/** What the shell is constructed with (main.ts boot). */
export interface GameServices {
  input: Input;
  rng: Rng;
  options?: Partial<GameOptions>;
}

/** Base screen. Subclasses set `id` and override enter/exit/update/draw. */
export class Screen {
  /** The shell that owns the stack this screen is on. */
  declare game: Game;
  /** Screen id; `Game._make` fills the factory's key in when a subclass leaves it empty. */
  declare id: string;
  /** When true, screens below are drawn first (overlay). */
  declare transparent: boolean;
  /** Fixed steps since the screen was made, counted by `update()`. */
  declare frame: number;
  /** What the screen was entered with. */
  declare params: ScreenParams;

  constructor(game: Game, id: string = 'screen') {
    this.game = game;
    this.id = id;
    /** When true, screens below are drawn first (overlay). */
    this.transparent = false;
    this.frame = 0;
    this.params = {};
  }
  /** Called when pushed / replaced onto the stack. */
  enter(params: ScreenParams = {}): void { this.params = params; }
  /** Called when popped / replaced away. */
  exit(): void {}
  /** Fixed step. */
  update(): void { this.frame++; }
  /** Render. */
  draw(ctx: CanvasRenderingContext2D): void { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  /** Optional: contribute to window.__game.summary(). */
  summary() { return {}; }
  /**
   * The numbers the netplay checksum hashes (net/checksum.js): every field of this screen's simulation that can
   * diverge. Declared, never implemented - a screen that simulates nothing has none, and checksum.js tests for
   * the method before it calls it, so this is a signature for the checker and not a member that exists.
   */
  checksumFields?(): readonly unknown[];
}

/** Game shell: owns the screen stack and the shared services (input, rng, options, net, run). */
export class Game {
  /** Keyboard / gamepad / netplay input (engine/input.ts). */
  declare input: Input;
  /** The seeded RNG every gameplay draw goes through (lib/engine/rng.ts). */
  declare rng: Rng;
  /** The shell's defaults with main.ts's parsed URL options over them. */
  declare options: GameOptions;
  /** The screen stack, lowest first; the last entry is the live screen. */
  declare screens: Screen[];
  /** Screen id -> factory, filled by `registerScreen` at boot. */
  declare factories: Record<string, ScreenFactory>;
  /** Playable cast registry [{ id, name, build, anims, ... }] (content/critters/index.js). */
  declare critters: CritterDef[];
  /**
   * The live online session (net/session.js createNetSession) or null.
   *
   * `any` deliberately: the session object grows its own API after the literal that starts it (`net.end = ...`,
   * `net.summary = ...`, the lockstep hooks), so no type written here would describe the thing screens are
   * handed. net/session.js owns that shape; the shell only ever holds it and passes it on.
   */
  declare net: any;
  /** The current run (game/run.js): the day's plan, the party, what has been gathered. Null between runs. */
  declare run: Run | null;
  /** Fixed steps since boot. */
  declare frame: number;
  /** The fade-to-black state machine. */
  declare fade: Fade;

  /**
   * @param {{ input: object, rng: object, options?: object }} services
   */
  constructor({ input, rng, options = {} }: GameServices) {
    this.input = input;
    this.rng = rng;
    this.options = { debug: false, autotest: false, seed: 1, skipTo: '', room: '', host: false, transport: 'mqtt', ...options };
    this.screens = [];
    this.factories = {};
    /** Playable cast registry [{ id, name, build, anims, ... }] (content/critters/index.js). */
    this.critters = [];
    /** The live online session (net/session.js) or null. */
    this.net = null;
    /** The current run (game/run.js): the order, the party, what has been gathered. Null between runs. */
    this.run = null;
    this.frame = 0;
    this.fade = { alpha: 0, dir: 0, speed: 0.05, then: null };
  }
  /** Register a screen factory: id -> (game) => Screen. */
  registerScreen(id: string, factory: ScreenFactory): void { this.factories[id] = factory; }
  get screenIds(): string[] { return Object.keys(this.factories); }
  _make(id: string): Screen {
    const f = this.factories[id];
    if (!f) throw new Error(`Unknown screen '${id}'`);
    const s = f(this);
    if (!s.id) s.id = id;
    return s;
  }
  /** Top screen or null. */
  get screen(): Screen | null { return this.screens.length ? this.screens[this.screens.length - 1] : null; }
  /** Id of the top screen ('' when empty). */
  screenId(): string { return this.screen ? this.screen.id : ''; }
  /** Push a screen on top (overlay if it declares `transparent`). */
  push(id: string, params: ScreenParams = {}): Screen {
    const s = this._make(id);
    this.screens.push(s);
    s.enter(params);
    return s;
  }
  /** Replace the top screen (or push when empty). */
  replace(id: string, params: ScreenParams = {}): Screen {
    const top = this.screens.pop();
    if (top) top.exit();
    return this.push(id, params);
  }
  /** Replace the whole stack with one screen. */
  reset(id: string, params: ScreenParams = {}): Screen {
    while (this.screens.length) this.screens.pop().exit();
    return this.push(id, params);
  }
  /** Pop the top screen. */
  pop(): Screen {
    const top = this.screens.pop();
    if (top) top.exit();
    return top;
  }
  /** Fade to black, then run `fn` (usually a replace), then fade back in. */
  fadeTo(fn: () => void, speed: number = 0.06): void {
    if (this.fade.dir === 1) return;
    this.fade.dir = 1; this.fade.speed = speed; this.fade.then = fn;
  }
  /** Fixed step: fade bookkeeping + top screen update. */
  update(): void {
    this.frame++;
    const f = this.fade;
    if (f.dir === 1) { f.alpha = Math.min(1, f.alpha + f.speed); if (f.alpha >= 1) { f.dir = -1; const fn = f.then; f.then = null; if (fn) fn(); } }
    else if (f.dir === -1) { f.alpha = Math.max(0, f.alpha - f.speed); if (f.alpha <= 0) f.dir = 0; }
    const top = this.screen;
    if (top && f.dir !== 1) top.update();
  }
  /** Draw the stack: from the lowest opaque screen up, then the fade overlay. */
  draw(ctx: CanvasRenderingContext2D): void {
    let start = this.screens.length - 1;
    while (start > 0 && this.screens[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.screens.length; i++) this.screens[i].draw(ctx);
    if (this.fade.alpha > 0) {
      ctx.globalAlpha = this.fade.alpha; ctx.fillStyle = '#2a1f1a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
    }
  }
}
