// TITLE (docs/GDD.md section 10): the parked truck on the dusk lane, a crate of produce on the verge, the crew
// idling beside it, the FOODIE TRUCK sign swinging over the whole picture and a chalk A-frame menu.
//
// Nothing here simulates anything: the only state is which menu row is selected, so `checksumFields` is one
// number and the screen is trivially net-safe. The lane and the sign are pre-rendered layers (art/logo.js); the
// five cast members are the only per-frame drawing, each on its own beat of the shared animation table.
import { VIEW_W, UI, REPO_URL, REPO_LABEL, KOFI_URL, KOFI_LABEL } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { drawTextOutlined } from '../../engine/text.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { Rig, RigWeapon } from '../../lib/art/rig.ts';
import { drawShadow } from '../../art/fx.ts';
import { drawTruck, STOCK_STYLE } from '../../art/truck.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { truckStyleFor } from '../garage.ts';
import { critterRig } from '../../content/critters/common.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { drawFood } from '../../art/food.ts';
import { LIGHT_X, LIGHT_Y } from '../../lib/art/shading.ts';
import { CRITTERS } from '../../content/critters/index.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawSlate, drawMenuRows, drawHint, drawHintSpans, hintSpans } from '../ui.ts';
import { links } from '../../engine/links.ts';
import { confirmPressed, navY } from '../menuinput.ts';
import { readWeek } from '../week.ts';
import type { WeekRecord } from '../week.ts';
import { startRun, shapeOf, DAYS_PER_WEEK } from '../run.ts';
import { drawLane, drawLogoSign, drawCrate, drawBlock, TRUCK_Y, CREW_Y } from '../../art/logo.ts';

/**
 * The menu, and the screen each row opens. SOURCE is a link, not a screen.
 *
 * The first row is PLAY or CONTINUE - the same row in two states, never both - depending on whether there is a
 * week in progress (game/week.ts). PLAY starts a fresh week at the character select; CONTINUE reseats the party
 * the saved week was being played by and opens its board straight away.
 */
const ROWS = ['PLAY', 'ONLINE', 'GARAGE', 'BOOK', 'CONTROLS', 'CREW', 'SOURCE'];
const PLAY_ROW = 0, PLAY_TEXT = 'PLAY', CONTINUE_TEXT = 'CONTINUE';
const SOURCE_ROW = ROWS.length - 1;
/**
 * The two addresses on one paper strip along the bottom: where this build came from, and where to tip the cook.
 *
 * The repository one is the SOURCE row's other half - the row opens it, and the address is both what a click
 * lands on and what to type where no tab ever opens. The Ko-fi one is a click only. It gets no row and no key:
 * it is a thing to find rather than a thing the game asks for on the way in, and the eight actions are the
 * game's (engine/actions.ts), not a donation's.
 */
const LINK_Y = 346;
const [REPO_ZONE, KOFI_ZONE] = hintSpans([REPO_LABEL, KOFI_LABEL], LINK_Y);
/** The answer to a follow, on its own strip above the addresses - which is what makes "BELOW" below. */
const NOTICE_Y = LINK_Y - 16;
/** How long that answer stays up, in frames (60 = a second). */
const NOTICE_FRAMES = 150;
const LINK_OPENED = 'OPENED IN A NEW TAB';
/** Nothing is lost when the tab is refused: the address is on the strip below either way. */
const LINK_BLOCKED = 'NEW TAB BLOCKED - THE ADDRESS IS BELOW';
/** An address lit: ink gone warm, never one of the reserved signal colours (constants.ts SIGNAL). */
const LINK_LIT = UI.wood;
/**
 * The A-frame slate on the verge, right of the crew. It stood at x 426, 176 wide, while the crew were four; the
 * fifth member takes the lane up to ~478, so the board is 36 px narrower and starts where the lineup stops (its
 * widest row, CONTINUE, is 56 px of the 140). It grew 18 px taller when BOOK joined the list: five rows at a 14
 * pitch cleared the old 104, six do not, and a row clipped by the frame is worse than a slightly taller A-frame.
 * GARAGE made seven, and the board grew one more pitch UPWARD so its legs still stand on the same patch of lane.
 */
const SLATE = { x: 482, y: 152, w: 140, h: 136 };
/**
 * Where the truck parks, the crate it was loaded from, and where the crew lines up.
 *
 * The crew used to stand ACROSS the truck's hatch: the awning, the serving window and the chalk board behind
 * them read as coloured slabs, and the board stuck out from behind Barley's shoulder as an unreadable green
 * lump. They now stand clear of the hatch and only the first one laps the cab, so the picture reads
 * truck | crew | menu left to right, and the truck is a truck.
 */
const TRUCK_X = 150, CRATE_X = 56, CRATE_Y = 300;
/**
 * Wider and unevenly spaced, not a 48 px rank: once each critter carries its own beat the knife, the raised paw
 * and the basket all need room around them, and at the old pitch Cress's basket hung over Chicory's chest.
 * The chef stands behind the chopping block, so their gap is the block's width. The head chef closes the line
 * at the right, turned in toward the crew: the boss facing the workers, and beside the day's menu.
 */
const CREW_X = [196, 264, 346, 400, 454];
/**
 * The crew are drawn a third up from the sprite's own scale: at 1x, five 56 px critters on a 360 px picture read
 * as a row of tokens rather than as the cast, and the cast is one of the three things this screen has to say.
 */
const CREW_SCALE = 1.35;
/**
 * The apple Barley is working on. `ITEMS.food` draws at s 5, which is smaller than the 5 px paw that ART_STYLE
 * section 0.3 draws OVER the item, so on the lane it read as a red sliver behind a cream disc; this is the same
 * `drawFood` apple at s 8, big enough to clear the paw at every angle of the chew. The counter-rotation is
 * `items.js upright()`: the apple stays the right way up whatever the arm is doing.
 */
const APPLE: RigWeapon = { attach: 'handR', length: 12, draw(ctx, rig) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  ctx.save(); ctx.rotate(a); drawFood(ctx, 'apple', 1, 2, 8, UI.red); ctx.restore();
} };
/** The chopping block stands where the blade comes down, with a clear strip of lane either side of it. */
const BLOCK_X = 307, BLOCK_Y = 294;

/** One seat's turn on the lane: the beat it plays, the prop it plays it with, and how it is timed. */
export interface CrewAct {
  /** Which beat of the shared table this seat plays (content/critters/common.ts makeCritterAnims). */
  anim: string;
  /**
   * The prop the beat is authored around, or null for empty paws. The ITEMS entries carry `as RigWeapon`:
   * content/critters/items.ts is not typed yet, so its `attach: 'handR'` widens to `string` and its entries miss
   * RigWeapon's `attach?: HandName` by that one field. The table IS a table of rig weapons - rig.ts reads exactly
   * these keys back off it - so the assertion says what items.ts cannot yet.
   */
  item: RigWeapon | null;
  /** 1 = facing right, -1 = facing left: three of the five turn in toward the others. */
  facing: number;
  /** px off the others' baseline, so the row is a group standing about rather than a rank. */
  dy: number;
  /** Frames a finished one-shot sits on its last key before it goes again (a repeated action, not a stutter). */
  hold: number;
  /** Frames into its own beat the screen opens this seat on. */
  phase: number;
}

/**
 * The lineup is STAGED, not ranked. Four critters shoulder to shoulder in the same neutral `idle`, empty-pawed,
 * every eye on the lens, was a passport photo: the silhouettes differed by costume and by nothing else, and the
 * screen advertised a food truck with no food in it. Each seat now plays its OWN beat off the shared table with
 * the prop that beat is authored around (content/critters/items.js), so the row reads as a working crew:
 * Barley has an apple, Sorrel is chopping over the block, Chicory waves back down the line, Cress walks the
 * basket up it and Rowan, at the head of the line, tastes from the spoon - three of them turned in toward the
 * others instead of ten eyes on the lens. `dy` sets each one a few pixels off the others' baseline so the row is
 * a group standing about rather than a rank, `hold` is how long a one-shot beat sits on its last key before it
 * goes again (a repeated action, not a stutter), and `phase` opens the screen with all five on different beats.
 * Pose, prop, facing and footing only - no rig art or anim exists for this screen alone.
 */
const CREW_ACT: CrewAct[] = [
  { anim: 'eat', item: APPLE, facing: 1, dy: 0, hold: 0, phase: 12 },
  { anim: 'chop', item: ITEMS.knife as RigWeapon, facing: 1, dy: -5, hold: 30, phase: 20 },
  { anim: 'wave', item: null, facing: -1, dy: -2, hold: 0, phase: 5 },
  { anim: 'carry', item: ITEMS.basket as RigWeapon, facing: -1, dy: 1, hold: 0, phase: 31 },
  { anim: 'taste', item: ITEMS.spoon as RigWeapon, facing: -1, dy: -3, hold: 36, phase: 8 },
];
/** The sign swings +-0.02 rad about its top centre, slowly enough to read as weight. */
const SWING = 0.02, SWING_RATE = 0.045;
/** PRESS START is on for 40 of every 60 frames: a blink, not a strobe. */
const BLINK_PERIOD = 60, BLINK_ON = 40;
const START_Y = 314;
const TRUCK_OPTS = { scale: 2, wheel: 0, style: STOCK_STYLE as TruckStyle };
/**
 * PRESS START, and what it says to somebody holding a phone. Two constants rather than one string built from
 * `keyText`, because this line is drawn at size 2 in the middle of the screen: it is the one prompt in the game
 * that has to be right the FIRST time it is read, and a player who has no keyboard should not be hunting for a
 * key that is not there. Picked in draw() by the live device, the way every other hint line in the game is.
 */
const START_TEXT = 'PRESS START', START_TEXT_TOUCH = 'TAP GO';

/**
 * One seat of the lineup: the rig, the player walking that seat's own beat, the beat itself and where the beat has
 * got to. Built ONCE in enter(), one per cast member in cast order; only `wait` moves after that.
 */
export interface TitleSeat {
  /** The rig built for this cast entry, in the off-duty apron: nobody is seated on the title. */
  rig: Rig;
  /** Walking this seat's own beat off the critter's shared animation table. */
  player: AnimPlayer;
  /** The beat, prop, facing and footing this seat plays (CREW_ACT, by cast index). */
  act: CrewAct;
  /** Frames the finished one-shot has sat on its last key, counted against `act.hold`. */
  wait: number;
}

export class TitleScreen extends Screen {
  // The fields, for the checker only, in constructor order. `declare`, not plain declarations, for the reason
  // game/game.ts states over its own block: a plain field declaration emits a class field per name (es2022
  // defines them before the constructor body runs, and a screen's own declaration would also define a base
  // field back to undefined), which would change the runtime this screen shipped with. `declare` erases under
  // tsc, under esbuild and under Node's type stripping alike, so the emitted class is the original's.

  /** The lineup, in cast order: built by enter(), ticked by update(), drawn by draw(). */
  declare crew: TitleSeat[];
  /** Which ROWS row the slate stands on; the one number this screen can diverge on. */
  declare sel: number;
  /**
   * The week in progress, read ONCE here in enter() and never in update() (docs/MULTIPLAYER.md: no localStorage
   * on the simulation path). null when there is none, which is what makes the first row say PLAY.
   */
  declare week: WeekRecord | null;
  /** The menu as this screen draws it: ROWS with the first row worded for the week. */
  declare rows: string[];
  /** What following the repository link did, and how many frames that answer has left. */
  declare notice: string;
  declare noticeTimer: number;

  constructor(game: Game) { super(game, 'title'); this.crew = []; this.sel = 0; this.week = null; this.rows = ROWS.slice(); this.notice = ''; this.noticeTimer = 0; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    // Back at the front door: forget which pad claimed which couch seat, and let the couch fill again from
    // scratch - four seats, pads welcome (an online lobby we have just walked out of had claiming switched off).
    this.game.input.setPadClaims(true);
    this.game.input.resetClaims();
    this.sel = 0;
    this.notice = ''; this.noticeTimer = 0;
    // Both addresses are clickable for as long as this screen is on the stack. A click is a real user gesture, so
    // it opens the tab even where the SOURCE row's fixed-step call would be refused (engine/links.ts).
    const tell = (opened: boolean) => this.linkNotice(opened);
    links.setZones([{ ...REPO_ZONE, url: REPO_URL, onOpen: tell }, { ...KOFI_ZONE, url: KOFI_URL, onOpen: tell }]);
    // a week part-played turns the first row from PLAY into CONTINUE; there is never both
    this.week = readWeek();
    this.rows = ROWS.slice();
    this.rows[PLAY_ROW] = this.week ? CONTINUE_TEXT : PLAY_TEXT;
    // the parked truck wears what the garage has put on it
    TRUCK_OPTS.style = truckStyleFor(this.game);
    this.crew = CRITTERS.map((def, i) => {
      // nobody is seated on the title, so the crew wears the off-duty apron: the four player colours mean "this
      // seat is taken" everywhere else (constants.js OFF_DUTY_APRON, docs/ART_STYLE.md section 4)
      const act = CREW_ACT[i % CREW_ACT.length];
      const seat: TitleSeat = { rig: critterRig(def, -1), player: new AnimPlayer(def.anims), act, wait: 0 };
      seat.rig.weapon = act.item;
      seat.rig.basketFill = 0.5;
      seat.player.play(act.anim);
      // every seat starts a dozen-odd frames into its own beat: five loops of different lengths that never
      // line up, and nobody is caught on their anticipation key the moment the screen opens
      for (let k = 0; k < act.phase; k++) this.tickSeat(seat);
      return seat;
    });
  }

  override exit(): void { links.clearZones(); }

  /**
   * Report what following an address actually did - the row and a click on either come through here alike.
   *
   * Only a refusal makes a sound: the row's own `menu_confirm` has already played by the time this runs, and a
   * click that opens a tab has the tab to show for itself.
   */
  linkNotice(opened: boolean): void {
    this.notice = opened ? LINK_OPENED : LINK_BLOCKED;
    this.noticeTimer = NOTICE_FRAMES;
    if (!opened) this.game.audio.play('menu_back');
  }

  override update(): void {
    super.update();
    if (this.noticeTimer > 0) this.noticeTimer--;
    const inp = this.game.input;
    const dy = navY(inp);
    if (dy) { this.sel = (this.sel + dy + this.rows.length) % this.rows.length; this.game.audio.play('menu_move'); }
    if (confirmPressed(inp) >= 0) { this.game.audio.play('menu_confirm'); this.choose(); }
    for (const s of this.crew) this.tickSeat(s);
  }

  /** One seat, one step: a one-shot beat sits on its last key for `hold` frames and then goes again. */
  tickSeat(s: TitleSeat): void {
    s.player.tick();
    if (!s.player.done) return;
    if (s.wait < s.act.hold) { s.wait++; return; }
    s.wait = 0;
    s.player.play(s.act.anim, { restart: true });
  }

  /** Open the selected row. SOURCE leaves the game, so it is the one row guarded against a blocked popup. */
  choose(): void {
    const row = this.rows[this.sel];
    if (row === CONTINUE_TEXT) this.resume();
    else if (row === PLAY_TEXT) this.game.replace('select');
    else if (row === 'ONLINE') this.game.replace('lobby');
    else if (row === 'GARAGE') this.game.replace('garage', { from: 'title' });
    else if (row === 'BOOK') this.game.replace('book');
    else if (row === 'CONTROLS') this.game.replace('controls');
    else if (row === 'CREW') this.game.replace('gallery');
    // SOURCE leaves the game, and is the one row that can be refused: from the fixed step this is a rAF callback
    // rather than an event handler, so a browser that wants a real gesture blocks the tab. Say so and leave the
    // address on screen instead of looking broken.
    else if (row === 'SOURCE') this.linkNotice(links.open(REPO_URL));
  }

  /**
   * CONTINUE: pick the week up where it was left. The record (read in enter(), never here) holds the seed, the
   * day and who was sitting down, and `planWeek` rebuilds the rest - so this reseats the party and opens that
   * day's board directly, with no character select in between: the crew was chosen on Monday.
   */
  resume(): void {
    const w = this.week;
    if (!w) { this.game.replace('select'); return; }
    startRun(this.game, { seed: w.seed, critters: w.critters, day: w.day });
    const run = this.game.run;
    // the days already closed come back with the run, so the board's week strip is whole on a resumed Thursday
    run.weekStars = w.stars.slice();
    run.weekTakings = w.takings.slice();
    let takings = 0;
    for (const t of run.weekTakings) takings += t | 0;
    run.score = takings;
    this.game.replace('stage');
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    drawLane(ctx);
    // the parked truck, then the crew beside it: a y-sort of two rows, each on its own contact shadow
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 112, 0.28);
    drawTruck(ctx, TRUCK_X, TRUCK_Y, TRUCK_OPTS);
    // the crate it was loaded from, nearer the camera than the truck and clear of the crew's clean lane
    drawShadow(ctx, CRATE_X, CRATE_Y, 44, 0.3);
    drawCrate(ctx, CRATE_X, CRATE_Y);
    // the block the chef works over, UNDER the crew pass: drawn after them it swallowed the blade on the way down
    drawShadow(ctx, BLOCK_X, BLOCK_Y, 26, 0.3);
    drawBlock(ctx, BLOCK_X, BLOCK_Y);
    for (let i = 0; i < this.crew.length; i++) {
      const s = this.crew[i], x = CREW_X[i], y = CREW_Y + s.act.dy;
      drawShadow(ctx, x, y, 34, 0.4);
      drawRig(ctx, s.rig, s.player.pose, { x, y, facing: s.act.facing, scale: CREW_SCALE });
    }
    // the A-frame: two legs, each on its OWN contact shadow. One wide ellipse between the feet touched neither of
    // them and read as a smudge on the verge.
    drawShadow(ctx, SLATE.x + 30, SLATE.y + SLATE.h + 24, 22, 0.28);
    drawShadow(ctx, SLATE.x + SLATE.w - 30, SLATE.y + SLATE.h + 24, 22, 0.28);
    ctx.fillStyle = UI.ink; ctx.fillRect(SLATE.x + 25, SLATE.y + SLATE.h - 1, 10, 26); ctx.fillRect(SLATE.x + SLATE.w - 35, SLATE.y + SLATE.h - 1, 10, 26);
    ctx.fillStyle = UI.wood; ctx.fillRect(SLATE.x + 26, SLATE.y + SLATE.h, 8, 24); ctx.fillRect(SLATE.x + SLATE.w - 34, SLATE.y + SLATE.h, 8, 24);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(SLATE.x + 32, SLATE.y + SLATE.h, 2, 24); ctx.fillRect(SLATE.x + SLATE.w - 28, SLATE.y + SLATE.h, 2, 24);
    drawSlate(ctx, SLATE.x, SLATE.y, SLATE.w, SLATE.h, { title: 'TODAY' });
    drawMenuRows(ctx, this.rows, SLATE.x, SLATE.y + 38, SLATE.w, this.sel, this.frame);
    // the sign hangs over everything, swinging about its top centre
    drawLogoSign(ctx, VIEW_W / 2, 0, SWING * Math.sin(this.frame * SWING_RATE));
    if (this.frame % BLINK_PERIOD < BLINK_ON) {
      drawTextOutlined(ctx, this.game.input.touchOn() ? START_TEXT_TOUCH : START_TEXT, VIEW_W / 2, START_Y, { size: 2, color: UI.cream, outline: UI.ink, thickness: 1, align: 'center', shadow: false });
    }
    // The two addresses, each underlined so it reads as something to follow, and each lit on its own: the one
    // under the mouse, or the repository while the row that opens it is selected. What the last follow did sits
    // above them until it times out.
    const hot = links.hotUrl;
    drawHintSpans(ctx, [
      { text: REPO_LABEL, color: hot === REPO_URL || this.sel === SOURCE_ROW ? LINK_LIT : UI.ink, rule: true },
      { text: KOFI_LABEL, color: hot === KOFI_URL ? LINK_LIT : UI.ink, rule: true },
    ], LINK_Y);
    if (this.noticeTimer > 0) drawHint(ctx, this.notice, NOTICE_Y);
  }

  override summary() {
    const w = this.week;
    return {
      row: this.rows[this.sel], sel: this.sel, rows: this.rows.length, crew: this.crew.length,
      menu: this.rows.slice(),
      // the outward links, as a test sees them: each address, the rect a click must land in, and the last answer
      links: [
        { url: REPO_URL, label: REPO_LABEL, zone: REPO_ZONE },
        { url: KOFI_URL, label: KOFI_LABEL, zone: KOFI_ZONE },
      ],
      notice: this.noticeTimer > 0 ? this.notice : '',
      // the week in progress, as the row reads it: what CONTINUE would pick up
      week: w ? { seed: w.seed, day: w.day, days: DAYS_PER_WEEK, dayName: shapeOf(w.day).name, critters: w.critters.slice() } : null,
    };
  }
  /** The only thing on this screen that could differ between two machines. */
  override checksumFields(): number[] { return [this.sel]; }
}

export { ROWS as TITLE_ROWS };
