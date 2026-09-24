// RESULTS (docs/GDD.md section 7): THE WHOLE LINE SERVED AT ONCE. The kitchen has cooked every order in the queue,
// so this is the lane the line screen stood on - the truck parked with its hatch on the queue, the crew's heads in
// its windows - and every diner still in the line is handed their plate together: one plate after another arcs out
// of the hatch into the paws that ordered it (the recipe's own picture, art/dishes.ts), everyone chews three times
// on a stagger of their own, and each diner's stars pop up over their head. Then ONE paper receipt carrying every
// dish and the stars it earned, the tip in coins and - slammed across its foot - the red DELICIOUS / TASTY / EDIBLE
// stamp for the line as a whole, and PRESS Z blinking. Confirm (or 600 frames) banks the whole line with
// run.serveAll(stars) and sends the truck back to the map for the next line - or, when that was the day's last
// line, to the board, which closes the truck for the night.
//
// The crew in the windows throw `cheer` when the stars land, each seat a few frames behind the last so four critters
// never move as one body, and each diner cheers once their plate is empty. Params: { stars: number[] } (one per
// dish, front of the line first; a bare number is one dish); a bare ?skipTo=results gives every diner two stars.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { particles } from '../../engine/particles.ts';
import { drawShadow, burstCrumbs, burstSparkle } from '../../art/fx.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { RigWeapon } from '../../lib/art/rig.ts';
import type { Pose } from '../../lib/art/poses.ts';
import { drawTruck } from '../../art/truck.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { PLACES } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawStamp, drawStars, drawHint, drawSign, ROW } from '../ui.ts';
import type { TicketOpts } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawText, measureText } from '../../engine/text.ts';
import type { DrawTextOptions } from '../../engine/text.ts';
import { drawLane, TRUCK_Y, CREW_Y } from '../../art/logo.ts';
import { drawPlate, PROPS } from '../../art/kitchenProps.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { TIP_COINS } from '../run.ts';
import { truckStyleFor } from '../garage.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { TRUCK_X, QUEUE_X0, QUEUE_PITCH, QUEUE_SCALE, DRIVER } from './line.ts';
import type { LineHead } from './line.ts';
// The diners hold their dishes, so their rigs are the kitchen's own rig-plus-held-food type rather than a bare Rig.
// Imported, not redeclared: `import type` erases, so this adds no runtime edge between the two screens.
import type { CritterRig } from './kitchen.ts';

const R = Math.round;
/** The plates: the first leaves the hatch on PASS_AT, each after it PASS_LAG frames later, PASS_FRAMES in the air. */
const PASS_AT = 8, PASS_LAG = 10, PASS_FRAMES = 16;
/** Where the plates leave from: the sill of the truck's hatch. They land in the diner's paw, PASS_DY over the feet. */
const HATCH_X = 212, HATCH_Y = 236, PASS_DY = 64, PASS_ARC = 34;
/** A diner starts chewing EAT_DELAY frames after their plate lands, and chews CHEWS times EAT_LEN apart. */
const EAT_DELAY = 6, EAT_LEN = 42, CHEWS = 3;
/** The paper prints, then the stars pop over each head a diner at a time, then the stamp, then the prompt. */
const RECEIPT_AT = 40, STARS_AT = 56, STAR_LAG = 8, STAMP_AT = 84, PROMPT_AT = 104, AUTO_AT = 600;
/** The crew's cheer: seat 0 goes on the frame the first stars land, each seat after it CHEER_LAG frames later. */
const CHEER_LAG = 5;
/** Confirm is ignored for the first frames so the bell press that served the dish cannot skip the whole screen. */
const CONFIRM_AT = 20;
/** Index by stars (1..3); index 0 is unreachable (stars are clamped to 1) but keeps the lookup flat. */
const STAMPS = ['EDIBLE', 'EDIBLE', 'TASTY', 'DELICIOUS'];
/** Each diner's stars over their head. */
const HEAD_STARS_Y = 176, HEAD_STAR_R = 6;
/** The tip's coins lie in rows under the receipt: the picture counts what the paper printed. */
const COIN_COLS = 16, COIN_PITCH = 10, COIN_R = 4;
/**
 * The score is ONE piece of paper for the whole line, up in the sky right of the queue: one row per dish with the
 * stars it earned, a rule, the tip and the total, then the verdict stamped across a blank foot.
 */
const RECEIPT_W = 212, RECEIPT_X = VIEW_W - 8 - RECEIPT_W, RECEIPT_Y = 34, ROW_STAR_R = 4;
const SIGN_Y = 2;
const RECEIPT_OPTS: TicketOpts = { title: 'RECEIPT', rules: false }, ROW_TEXT: DrawTextOptions = { size: 1, color: UI.ink, shadow: false }, ROW_RIGHT: DrawTextOptions = { size: 1, color: UI.ink, shadow: false, align: 'right' };
const TIP_LABEL = 'TIP', TOTAL_LABEL = 'THIS WEEK';

/** One crew member in the truck: the rig in its seat's apron and the player whose pose the head in the window shares. */
export interface Watcher {
  rig: CritterRig;
  player: AnimPlayer;
  /** The frame this seat throws its cheer: STARS_AT, CHEER_LAG frames later for each seat along the row. */
  cheerAt: number;
  /** True once it has thrown it (the cheer plays once, not every frame after `cheerAt`). */
  cheered: boolean;
}

/** One diner in the line, front first: their plate, their chews, their stars. */
export interface Served {
  /** Built once in enter(): the off-duty apron, the dish in its paw once the plate has landed. */
  rig: CritterRig;
  player: AnimPlayer;
  /** Feet centre. */
  x: number;
  /** The ORDERS id of what they ordered: the dish on the plate and in the paw. */
  dishId: string;
  /** The dish's name, for the receipt row. */
  dishText: string;
  /** Its first ingredient's hex: the crumbs. */
  hex: string;
  /** 1..3, what the kitchen earned on their dish. */
  stars: number;
  /** The frame their plate leaves the hatch; it lands PASS_FRAMES later. */
  passAt: number;
  /** The frame their stars pop up over their head. */
  starsAt: number;
  /** Chews taken so far, 0..CHEWS. */
  chews: number;
  /** True once the plate is in their paw, and once it is empty again. */
  holding: boolean;
  /** True once they have cheered at the empty plate. */
  cheered: boolean;
}

/**
 * What `particles.draw`'s third parameter is. engine/particles.ts is not typed yet, so its `draw(ctx, cam, layer)`
 * reads as three REQUIRED parameters although its own doc comment calls the third one optional ("undefined = all")
 * - which is exactly how this screen calls it: one pass, every kind. The assertion at the call site says what
 * particles.ts cannot yet; the singleton stays the receiver, so nothing about the call moves.
 */
interface ParticlesDraw {
  draw(ctx: CanvasRenderingContext2D, cam: { x: number; y: number } | null, layer?: 'back' | 'front'): void;
}

export class ResultsScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name (es2022 defines them before
  // the constructor body runs, and a screen's own declaration would also define a base field back to undefined),
  // and this screen has to keep the runtime it shipped with. `declare` erases under tsc, under esbuild and under
  // Node's type stripping alike, so the emitted class is the original.

  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** The crew in the truck, in party order (not slot order). */
  declare crew: Watcher[];
  /** The heads in the truck's windows: the driver first, then the rest. */
  declare heads: LineHead[];
  /** The truck's draw options, reused every frame. */
  declare truckOpts: { scale: number; wheel: number; facing: number; heads: LineHead[]; style: TruckStyle };
  /** The diners being served, front of the line first. */
  declare diners: Served[];
  /** The stars per dish, in line order, clamped to 1..3: what `serveAll` banks. */
  declare stars: number[];
  /** What the kitchen banked for the batch: `params.score`, or twice each dish's stars for a bare ?skipTo=results. */
  declare score: number;
  /** True once confirm (or AUTO_AT) has banked the line: the screen is on its way out. */
  declare left: boolean;
  // the strings, all of them built in enter() so draw() allocates nothing:
  /** The sign over the scene: which line this is and where. */
  declare signText: string;
  declare signW: number;
  /** The red stamp's word: STAMPS for the line's average stars. */
  declare stampText: string;
  /** The tip in coins, TIP_COINS summed over every dish: the receipt's row and the discs under it count the same number. */
  declare tip: number;
  /** Its TIP row. */
  declare tipText: string;
  /** Its TOTAL row: the week's coins with this line's tip banked. */
  declare totalText: string;
  /** The receipt's height: one row per dish, then the tip and the total and the stamp's blank foot. */
  declare receiptH: number;
  /** The blinking PRESS <key> line. */
  declare prompt: string;

  constructor(game: Game) { super(game, 'results'); this.fields = []; this.crew = []; this.heads = []; this.diners = []; }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    particles.clear();
    // the crew: one rig per seat in its own apron; the driver's head in the cab, the rest at the hatch (as on the line)
    this.crew.length = 0; this.heads.length = 0;
    for (let i = 0; i < run.party.length; i++) {
      const p = run.party[i], def = getCritter(p.critter), player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let k = 0; k < i * 9; k++) player.tick();
      this.crew.push({ rig: critterRig(def, p.slot), player, cheerAt: STARS_AT + i * CHEER_LAG, cheered: false });
    }
    const di = Math.max(0, run.party.findIndex((p) => p.critter === DRIVER));
    if (this.crew.length) {
      this.heads.push({ rig: this.crew[di].rig, pose: this.crew[di].player.pose as Pose });
      for (let i = 0; i < this.crew.length; i++) if (i !== di) this.heads.push({ rig: this.crew[i].rig, pose: this.crew[i].player.pose as Pose });
    }
    this.truckOpts = { scale: 2, wheel: 0, facing: -1, heads: this.heads, style: truckStyleFor(game) };
    // the line: everyone still waiting, front first, each with the stars the kitchen earned on their dish
    const ln = run.lines[run.line];
    const given = Array.isArray(params.stars) ? params.stars : params.stars != null ? [params.stars] : null;
    this.diners.length = 0; this.stars = [];
    const first = ln ? Math.min(run.customer, ln.customers.length - 1) : 0;
    const count = ln ? Math.max(1, ln.customers.length - run.customer) : 1;
    for (let i = 0; i < count; i++) {
      const c = ln ? ln.customers[first + i] : null;
      const order = c ? run.orderFor(first + i) : run.order;
      const def = getCustomer(c ? c.customer : order.customer), player = new AnimPlayer(def.anims);
      player.play('idle');
      for (let t = 0; t < i * 11; t++) player.tick();
      const stars = Math.max(1, Math.min(3, R(given && given[i] != null ? given[i] : 2)));
      this.stars.push(stars);
      const ing = order.needs.length ? INGREDIENTS[order.needs[0].id] : null;
      this.diners.push({
        rig: critterRig(def, -1), player, x: QUEUE_X0 + i * QUEUE_PITCH, dishId: order.id, dishText: order.dish,
        hex: ing ? ing.hex : UI.cream, stars,
        passAt: PASS_AT + i * PASS_LAG, starsAt: STARS_AT + i * STAR_LAG, chews: 0, holding: false, cheered: false,
      });
    }
    let sum = 0; for (const s of this.stars) sum += s;
    this.score = params.score != null ? params.score : sum * 2;
    this.left = false;
    // every string the screen draws is built here: draw() allocates nothing (docs/ARCHITECTURE.md section 8)
    const place = ln ? PLACES.find((p) => p.id === ln.place) : null;
    this.signText = `LINE ${run.line + 1} OF ${run.lines.length} SERVED  -  ${place ? place.name : ln ? ln.place.toUpperCase() : ''}`;
    this.signW = measureText(this.signText, 1) + 24;
    this.stampText = STAMPS[Math.max(1, Math.min(3, R(sum / this.stars.length)))];
    this.tip = 0; for (const s of this.stars) this.tip += TIP_COINS[s];
    this.tipText = `${this.tip} COINS`;
    this.totalText = `${run.score + this.tip} COINS`;
    this.receiptH = 16 + 6 + ROW * this.diners.length + 8 + ROW * 2 + 46;
    this.prompt = `PRESS ${game.input.keyText(0, 'action')}`;
    this.fields.length = 0;
  }

  override update(): void {
    super.update();
    const game = this.game, f = this.frame;
    particles.update();
    if (f === 1) game.audio.play('bell');
    for (let i = 0; i < this.crew.length; i++) {
      const c = this.crew[i];
      if (!c.cheered && f >= c.cheerAt) { c.cheered = true; c.player.play('cheer', { restart: true }); if (i === 0) game.audio.play('cheer'); }
      c.player.tick();
      if (c.player.done) c.player.play('idle', { restart: true });
    }
    for (let i = 0; i < this.diners.length; i++) {
      const d = this.diners[i];
      d.player.tick();
      // the plate lands in their paw
      if (f === d.passAt + PASS_FRAMES) {
        d.holding = true;
        d.rig.weapon = ITEMS.dish as RigWeapon; d.rig.heldIcon = d.dishId; d.rig.heldHex = d.hex;
        burstSparkle(d.x - 10, CREW_Y - PASS_DY, 4, UI.cream, true);
        game.audio.play('done');
      }
      // the chews: three eats, one after the other
      const eatAt = d.passAt + PASS_FRAMES + EAT_DELAY;
      if (d.holding && d.chews < CHEWS && f >= eatAt && (f - eatAt) % EAT_LEN === 0) {
        d.chews++;
        d.player.play('eat', { restart: true });
        if (i === 0) game.audio.play('chew');
        burstCrumbs(d.x - 10, CREW_Y - PASS_DY - 6, CREW_Y - 30, d.hex, 5, true);
      }
      // `cheer` raises the near arm: the paw must be empty before it, or the plate crosses the face
      if (d.chews >= CHEWS && !d.cheered && d.player.done) { d.cheered = true; this.dropFood(d); d.player.play('cheer', { restart: true }); }
      else if (d.player.done) d.player.play('idle', { restart: true });
      if (f === d.starsAt) { burstSparkle(d.x, HEAD_STARS_Y, 5, UI.cream, true); game.audio.play('coin'); }
    }
    if (f === STAMP_AT) { burstSparkle(RECEIPT_X + RECEIPT_W / 2, RECEIPT_Y + this.receiptH - 22, 6, UI.cream, true); game.audio.play('stamp'); }
    if (this.left) return;
    if ((f >= CONFIRM_AT && confirmPressed(game.input) >= 0) || f >= AUTO_AT) {
      this.left = true;
      game.audio.play('menu_confirm');
      const run = game.run;
      run.serveAll(this.stars);
      // the whole line is served: the truck drives on to the next one, and the last line closes the day
      game.replace(!run.lineDone() ? 'line' : run.dayComplete() ? 'stage' : 'map');
    }
  }

  /** The dish is gone: empty the diner's paw so the raised arm carries nothing across their face. */
  dropFood(d: Served): void { d.holding = false; d.rig.weapon = null; d.rig.heldIcon = null; d.rig.heldHex = null; }

  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    drawLane(ctx);
    drawShadow(ctx, TRUCK_X, TRUCK_Y, 112, 0.28);
    drawTruck(ctx, TRUCK_X, TRUCK_Y, this.truckOpts);
    // the line, back to front so the diner at the hatch is drawn last and in front
    for (let i = this.diners.length - 1; i >= 0; i--) {
      const d = this.diners[i];
      drawShadow(ctx, d.x, CREW_Y, 34, 0.4);
      drawRig(ctx, d.rig, d.player.pose, { x: d.x, y: CREW_Y, facing: -1, scale: QUEUE_SCALE });
    }
    // the plates in the air, out of the hatch and into the paws that ordered them
    for (let i = 0; i < this.diners.length; i++) {
      const d = this.diners[i], t = f - d.passAt;
      if (t < 0 || t >= PASS_FRAMES) continue;
      const k = t / PASS_FRAMES, x1 = d.x - 10, y1 = CREW_Y - PASS_DY;
      const x = R(HATCH_X + (x1 - HATCH_X) * k), y = R(HATCH_Y + (y1 - HATCH_Y) * k - PASS_ARC * 4 * k * (1 - k));
      drawPlate(ctx, x, y, NO_ICONS, NO_ICONS, 0, 1, d.dishId);
    }
    (particles as ParticlesDraw).draw(ctx, null);   // every kind in one pass: see ParticlesDraw
    for (let i = 0; i < this.diners.length; i++) { const d = this.diners[i]; if (f >= d.starsAt) drawStars(ctx, d.x, HEAD_STARS_Y, d.stars, 3, HEAD_STAR_R); }
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (f >= RECEIPT_AT) this.drawReceipt(ctx, f);
    if (f >= PROMPT_AT && ((f >> 4) & 1)) drawHint(ctx, this.prompt);
  }

  /** The whole line's score on one piece of paper: a row per dish with its stars, the tip and the total under a
   *  rule, and the verdict stamped across the blank foot, with the tip's coins in rows underneath. */
  drawReceipt(ctx: CanvasRenderingContext2D, f: number): void {
    const x = RECEIPT_X, y = RECEIPT_Y, right = x + RECEIPT_W - 6, n = this.diners.length;
    drawTicket(ctx, x, y, RECEIPT_W, this.receiptH, RECEIPT_OPTS);
    const rows = y + 20;
    for (let i = 0; i < n; i++) {
      const d = this.diners[i], ry = rows + ROW * i;
      drawText(ctx, d.dishText, x + 6, ry, ROW_TEXT);
      drawStars(ctx, right - 16, ry + 4, d.stars, 3, ROW_STAR_R);
    }
    const rule = rows + ROW * n + 2;
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 4, rule, RECEIPT_W - 8, 1);
    drawText(ctx, TIP_LABEL, x + 6, rule + 4, ROW_TEXT); drawText(ctx, this.tipText, right, rule + 4, ROW_RIGHT);
    drawText(ctx, TOTAL_LABEL, x + 6, rule + 4 + ROW, ROW_TEXT); drawText(ctx, this.totalText, right, rule + 4 + ROW, ROW_RIGHT);
    if (f >= STAMP_AT) drawStamp(ctx, this.stampText, x + RECEIPT_W / 2, y + this.receiptH - 22, (f - STAMP_AT) / 24);
    // the tip's coins: one brass disc per coin the receipt promised, in rows at the paper's foot
    const cy0 = y + this.receiptH + 8;
    for (let i = 0; i < this.tip; i++) {
      const cx = x + 14 + (i % COIN_COLS) * COIN_PITCH + ((((i / COIN_COLS) | 0) & 1) ? COIN_PITCH / 2 : 0), cy = cy0 + ((i / COIN_COLS) | 0) * (COIN_PITCH - 2);
      ctx.beginPath(); ctx.arc(cx, cy, COIN_R, 0, Math.PI * 2);
      ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
      ctx.fillStyle = PROPS.brassSh; ctx.fillRect(cx - 1, cy, 3, 3);
    }
  }

  override summary() {
    let total = 0; for (const s of this.stars) total += s;
    return {
      stars: this.stars.slice(), total, score: this.score, diners: this.diners.length,
      chews: this.diners.map((d) => d.chews), holding: this.diners.map((d) => d.holding), dishes: this.diners.map((d) => d.dishId),
      stamp: this.frame >= STAMP_AT ? this.stampText : '', left: this.left,
    };
  }
  /** Every field that could diverge between peers (net/checksum.js). */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0; f.push(this.frame, this.left ? 1 : 0);
    for (let i = 0; i < this.diners.length; i++) { const d = this.diners[i]; f.push(d.stars, d.chews, d.holding ? 1 : 0); }
    return f;
  }
}

/** The empty ingredient table a finished dish's plate is drawn with: the dish is the picture, not a stack. */
const NO_ICONS: string[] = [];
