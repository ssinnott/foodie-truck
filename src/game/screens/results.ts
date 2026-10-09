// RESULTS (docs/GDD.md section 7): THE WHOLE LINE SERVED AT ONCE. The kitchen has cooked the giant order - every
// dish for everyone in the line - so this is the lane the line screen stood on, the truck parked with its hatch on
// the queue and the crew's heads in its windows, and every diner is handed their plate together, where they stood:
// one plate after another arcs out of the hatch into the paws that ordered it (the recipe's own picture,
// art/dishes.ts), out along the front row and up the lane to the rows behind it, everyone chews three times on a
// stagger of their own, and each diner's stars pop up over their head. Then ONE paper receipt for the whole order -
// a row per dish with how many of it and the stars it earned, the tip in coins and - slammed across its foot - the
// red DELICIOUS / TASTY / EDIBLE stamp for the line as a whole, with the tip's coins stacked beside it - and PRESS Z
// blinking. Confirm (or 600 frames) banks the line with run.serveAll(stars) and, the line served, hands the day to
// the board, which closes the truck for the night.
//
// The crew in the windows throw `cheer` when the stars land, each seat a few frames behind the last so four critters
// never move as one body, and each diner cheers once their plate is empty. Params: { stars: number[] } (one per
// dish, front of the line first; a bare number is one dish); a bare ?skipTo=results gives every diner two stars.
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { particles } from '../../engine/particles.ts';
import { drawShadow, burstCrumbs, burstSparkle } from '../../art/fx.ts';
import type { RigWeapon } from '../../lib/art/rig.ts';
import type { Pose } from '../../lib/art/poses.ts';
import { drawTruck } from '../../art/truck.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { getCustomer } from '../../content/critters/customers.ts';
import { placeName } from '../../content/places.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawTicket, drawStamp, drawStars, drawHint, drawSign, ROW } from '../ui.ts';
import type { TicketOpts, StampOpts } from '../ui.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawText, measureText } from '../../engine/text.ts';
import type { DrawTextOptions } from '../../engine/text.ts';
import { drawLane, TRUCK_Y } from '../../art/logo.ts';
import { drawPlate, PROPS } from '../../art/kitchenProps.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { INGREDIENTS } from '../../content/recipes.ts';
import { TIP_COINS, dishGroups } from '../run.ts';
import { truckStyleFor } from '../garage.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { TRUCK_X, QUEUE_SCALE, ROW_SLOTS, DRIVER, queueSpot, drawWaiters } from './line.ts';
import type { LineHead, Waiter } from './line.ts';
// The diners hold their dishes, so their rigs are the kitchen's own rig-plus-held-food type rather than a bare Rig.
// Imported, not redeclared: `import type` erases, so this adds no runtime edge between the two screens.
import type { CritterRig } from './kitchen.ts';

const R = Math.round;
/** The plates: the first leaves the hatch on PASS_AT, each after it PASS_LAG frames later, PASS_FRAMES in the air. */
const PASS_AT = 8, PASS_LAG = 6, PASS_FRAMES = 16;
/** Where the plates leave from: the sill of the truck's hatch. They land in the diner's paw, PASS_DY over the feet
 *  (and PAW_DX in front of them) at QUEUE_SCALE, both scaled down with a diner further up the lane. */
const HATCH_X = 212, HATCH_Y = 236, PASS_DY = 64, PAW_DX = 10, PASS_ARC = 34;
/** A diner starts chewing EAT_DELAY frames after their plate lands, and chews CHEWS times EAT_LEN apart. */
const EAT_DELAY = 6, EAT_LEN = 42, CHEWS = 3;
/** The paper prints, then the stars pop over each head a diner at a time, then the stamp - no sooner than STAMP_AT,
 *  and STAMP_LAG after the last diner's stars on a long line - then the prompt PROMPT_LAG after it. */
const RECEIPT_AT = 40, STARS_AT = 56, STAR_LAG = 6, STAMP_AT = 84, STAMP_LAG = 16, PROMPT_LAG = 20, AUTO_AT = 600;
/** The crew's cheer: seat 0 goes on the frame the first stars land, each seat after it CHEER_LAG frames later. */
const CHEER_LAG = 5;
/** Confirm is ignored for the first frames so the bell press that served the dish cannot skip the whole screen. */
const CONFIRM_AT = 20;
/** Index by stars (1..3); index 0 is unreachable (stars are clamped to 1) but keeps the lookup flat. */
const STAMPS = ['EDIBLE', 'EDIBLE', 'TASTY', 'DELICIOUS'];
/** Each diner's stars over their head, by the row of the line they stand in: the front row's at HEAD_STARS_Y, and
 *  each row further up the lane STARS_LIFT higher and smaller (HEAD_STAR_R), so they sit clear above the front
 *  row's rather than tangled among them. */
const HEAD_STARS_Y = 176, STARS_LIFT = 11, HEAD_STAR_R = [6, 3, 3];
/** The tip's coins stand in stacks of COIN_STACK beside the receipt, level with its foot: the first stack COIN_GAP
 *  left of the paper and each after it COIN_PITCH further left, every coin COIN_STEP above the one under it. The
 *  picture counts what the paper printed (a full stack is ten), and a whole line's tip is a short row of stacks
 *  that stays clear of the stars over the line. */
const COIN_STACK = 10, COIN_PITCH = 12, COIN_STEP = 3, COIN_HALF = 5, COIN_GAP = 8;
/**
 * The score is ONE piece of paper for the whole line, up in the sky right of the queue: one row per dish with how
 * many of it went out and the stars they earned, a rule, the tip and the total, then the verdict stamped across a
 * blank foot.
 */
const RECEIPT_W = 212, RECEIPT_X = VIEW_W - 8 - RECEIPT_W, RECEIPT_Y = 34, RECEIPT_FOOT = 40, ROW_STAR_R = 4;
const SIGN_Y = 2;
/** The stamp across the receipt's foot leans a little less than the kit's stamps do, so the widest word on it
 *  (DELICIOUS) clears the total above it at its raised end on a foot short enough to leave the stars over the line
 *  clear underneath. */
const STAMP_OPTS: StampOpts = { angle: -0.08 };
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

/** One diner in the line, front first, where they stood in it: their plate, their chews, their stars. */
export interface Served extends Waiter {
  /** Built once in enter(): the off-duty apron, the dish in its paw once the plate has landed. */
  rig: CritterRig;
  /** Where the plate lands (their paw) and where their stars pop up, by the row of the line they stand in. */
  pawX: number;
  pawY: number;
  starY: number;
  starR: number;
  /** The ORDERS id of what they ordered: the dish on the plate and in the paw. */
  dishId: string;
  /** The dish's name, for its receipt row. */
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
  /** The diners being served: the whole line, front first, where the line screen left them. */
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
  /** The red stamp's word: STAMPS for the line's average stars; the frame it slams, and the frame PRESS Z blinks from. */
  declare stampText: string;
  declare stampAt: number;
  declare promptAt: number;
  /** The receipt's rows: one per dish of the order ('3 X MUSHROOM SOUP'), and the stars that dish earned. */
  declare rowText: string[];
  declare rowStars: number[];
  /** The tip in coins, TIP_COINS summed over every dish: the receipt's row and the discs under it count the same number. */
  declare tip: number;
  /** Its TIP row. */
  declare tipText: string;
  /** Its TOTAL row: the week's coins with this line's tip banked. */
  declare totalText: string;
  /** The receipt's height: one row per dish, then the tip and the total and the stamp's blank foot. */
  declare receiptH: number;
  /** The first stack of coins: its centre, and its bottom coin's centre line (level with the receipt's foot). */
  declare coinX: number;
  declare coinY: number;
  /** The blinking PRESS <key> line. */
  declare prompt: string;

  constructor(game: Game) { super(game, 'results'); this.fields = []; this.crew = []; this.heads = []; this.diners = []; this.rowText = []; this.rowStars = []; }

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
    // the line: everyone still waiting, front first, where they stood, each with the stars the kitchen earned on
    // their dish
    const ln = run.lines[run.line];
    const given = Array.isArray(params.stars) ? params.stars : params.stars != null ? [params.stars] : null;
    this.diners.length = 0; this.stars = [];
    const first = ln ? Math.min(run.customer, ln.customers.length - 1) : 0;
    const count = ln ? Math.max(1, ln.customers.length - first) : 1;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const c = ln ? ln.customers[first + i] : null;
      const order = c ? run.orderFor(first + i) : run.order;
      const def = getCustomer(c ? c.customer : order.customer), player = new AnimPlayer(def.anims), sp = queueSpot(i), k = sp.s / QUEUE_SCALE, row = Math.floor(i / ROW_SLOTS);
      player.play('idle');
      for (let t = 0; t < i * 11; t++) player.tick();
      const stars = Math.max(1, Math.min(3, R(given && given[i] != null ? given[i] : 2)));
      this.stars.push(stars);
      ids.push(order.id);
      const ing = order.needs.length ? INGREDIENTS[order.needs[0].id] : null;
      this.diners.push({
        rig: critterRig(def, -1), player, x: sp.x, y: sp.y, s: sp.s, pawX: R(sp.x - PAW_DX * k), pawY: R(sp.y - PASS_DY * k),
        starY: HEAD_STARS_Y - STARS_LIFT * row, starR: HEAD_STAR_R[Math.min(HEAD_STAR_R.length - 1, row)],
        dishId: order.id, dishText: order.dish, hex: ing ? ing.hex : UI.cream, stars,
        passAt: PASS_AT + i * PASS_LAG, starsAt: STARS_AT + i * STAR_LAG, chews: 0, holding: false, cheered: false,
      });
    }
    let sum = 0; for (const s of this.stars) sum += s;
    this.score = params.score != null ? params.score : sum * 2;
    this.left = false;
    // the stamp waits for the last diner's stars, however long the line
    this.stampAt = Math.max(STAMP_AT, this.diners[this.diners.length - 1].starsAt + STAMP_LAG);
    this.promptAt = this.stampAt + PROMPT_LAG;
    // every string the screen draws is built here: draw() allocates nothing (docs/ARCHITECTURE.md section 8)
    const where = ln ? placeName(ln.place) : '';
    this.signText = run.lines.length > 1 ? `LINE ${run.line + 1} OF ${run.lines.length} SERVED  -  ${where}` : `THE WHOLE LINE SERVED  -  ${where}`;
    this.signW = measureText(this.signText, 1) + 24;
    this.stampText = STAMPS[Math.max(1, Math.min(3, R(sum / this.stars.length)))];
    this.tip = 0; for (const s of this.stars) this.tip += TIP_COINS[s];
    this.tipText = `${this.tip} COINS`;
    this.totalText = `${run.score + this.tip} COINS`;
    // the receipt reads the order by dish, as the ticket in the kitchen did: how many of each went out, and its stars
    this.rowText.length = 0; this.rowStars.length = 0;
    for (const g of dishGroups(ids)) {
      let t = 0; for (const i of g.members) t += this.stars[i];
      this.rowText.push(`${g.members.length} X ${this.diners[g.members[0]].dishText}`);
      this.rowStars.push(Math.max(1, Math.min(3, R(t / g.members.length))));
    }
    this.receiptH = 16 + 6 + ROW * this.rowText.length + 8 + ROW * 2 + RECEIPT_FOOT;
    this.coinX = RECEIPT_X - COIN_GAP - COIN_HALF; this.coinY = RECEIPT_Y + this.receiptH - 3;
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
        burstSparkle(d.pawX, d.pawY, 4, UI.cream, true);
        game.audio.play('done');
      }
      // the chews: three eats, one after the other
      const eatAt = d.passAt + PASS_FRAMES + EAT_DELAY;
      if (d.holding && d.chews < CHEWS && f >= eatAt && (f - eatAt) % EAT_LEN === 0) {
        d.chews++;
        d.player.play('eat', { restart: true });
        if (i === 0) game.audio.play('chew');
        burstCrumbs(d.pawX, d.pawY - 6, R(d.y - 30 * d.s / QUEUE_SCALE), d.hex, 5, true);
      }
      // `cheer` raises the near arm: the paw must be empty before it, or the plate crosses the face
      if (d.chews >= CHEWS && !d.cheered && d.player.done) { d.cheered = true; this.dropFood(d); d.player.play('cheer', { restart: true }); }
      else if (d.player.done) d.player.play('idle', { restart: true });
      if (f === d.starsAt) { burstSparkle(d.x, d.starY, 5, UI.cream, true); game.audio.play('coin'); }
    }
    if (f === this.stampAt) { burstSparkle(RECEIPT_X + RECEIPT_W / 2, RECEIPT_Y + this.receiptH - 22, 6, UI.cream, true); game.audio.play('stamp'); }
    if (this.left) return;
    if ((f >= CONFIRM_AT && confirmPressed(game.input) >= 0) || f >= AUTO_AT) {
      this.left = true;
      game.audio.play('menu_confirm');
      const run = game.run;
      run.serveAll(this.stars);
      // the whole line is served: the last line closes the day (a day of several lines drives on to the next)
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
    // the whole line where it stood, back to front: the rows up the lane first, the diner at the hatch last and in front
    drawWaiters(ctx, this.diners);
    // the plates in the air, out of the hatch and into the paws that ordered them
    for (let i = 0; i < this.diners.length; i++) {
      const d = this.diners[i], t = f - d.passAt;
      if (t < 0 || t >= PASS_FRAMES) continue;
      const k = t / PASS_FRAMES, x1 = d.pawX, y1 = d.pawY;
      const x = R(HATCH_X + (x1 - HATCH_X) * k), y = R(HATCH_Y + (y1 - HATCH_Y) * k - PASS_ARC * 4 * k * (1 - k));
      drawPlate(ctx, x, y, NO_ICONS, NO_ICONS, 0, 1, d.dishId);
    }
    (particles as ParticlesDraw).draw(ctx, null);   // every kind in one pass: see ParticlesDraw
    for (let i = 0; i < this.diners.length; i++) { const d = this.diners[i]; if (f >= d.starsAt) drawStars(ctx, d.x, d.starY, d.stars, 3, d.starR); }
    drawSign(ctx, VIEW_W / 2, SIGN_Y, this.signW, 22, this.signText, { size: 1 });
    if (f >= RECEIPT_AT) this.drawReceipt(ctx, f);
    if (f >= this.promptAt && ((f >> 4) & 1)) drawHint(ctx, this.prompt);
  }

  /** The whole line's score on one piece of paper: a row per dish with how many of it and its stars, the tip and
   *  the total under a rule, and the verdict stamped across the blank foot; the tip's coins stacked beside it. */
  drawReceipt(ctx: CanvasRenderingContext2D, f: number): void {
    const x = RECEIPT_X, y = RECEIPT_Y, right = x + RECEIPT_W - 6, n = this.rowText.length;
    drawTicket(ctx, x, y, RECEIPT_W, this.receiptH, RECEIPT_OPTS);
    const rows = y + 20;
    for (let i = 0; i < n; i++) {
      const ry = rows + ROW * i;
      drawText(ctx, this.rowText[i], x + 6, ry, ROW_TEXT);
      drawStars(ctx, right - 16, ry + 4, this.rowStars[i], 3, ROW_STAR_R);
    }
    const rule = rows + ROW * n + 2;
    ctx.fillStyle = UI.paperLine; ctx.fillRect(x + 4, rule, RECEIPT_W - 8, 1);
    drawText(ctx, TIP_LABEL, x + 6, rule + 4, ROW_TEXT); drawText(ctx, this.tipText, right, rule + 4, ROW_RIGHT);
    drawText(ctx, TOTAL_LABEL, x + 6, rule + 4 + ROW, ROW_TEXT); drawText(ctx, this.totalText, right, rule + 4 + ROW, ROW_RIGHT);
    if (f >= this.stampAt) drawStamp(ctx, this.stampText, x + RECEIPT_W / 2, y + this.receiptH - 22, (f - this.stampAt) / 24, STAMP_OPTS);
    // the tip's coins: one brass coin per coin the receipt promised, in stacks of ten standing level with the paper's
    // foot - each stack inked round once, and inside it every coin's edge, brass over a darker rim, from the bottom up
    for (let k = 0; k * COIN_STACK < this.tip; k++) {
      const n = Math.min(COIN_STACK, this.tip - k * COIN_STACK), cx = this.coinX - k * COIN_PITCH, top = this.coinY - (n - 1) * COIN_STEP;
      ctx.fillStyle = UI.ink; ctx.fillRect(cx - COIN_HALF, top - 2, COIN_HALF * 2, this.coinY - top + 4);
      for (let j = 0; j < n; j++) {
        const cy = this.coinY - j * COIN_STEP;
        ctx.fillStyle = PROPS.brass; ctx.fillRect(cx - COIN_HALF + 1, cy - 1, COIN_HALF * 2 - 2, 2);
        ctx.fillStyle = PROPS.brassSh; ctx.fillRect(cx - COIN_HALF + 1, cy + 1, COIN_HALF * 2 - 2, 1);
      }
      ctx.fillStyle = UI.cream; ctx.fillRect(cx - 3, top - 1, 2, 1);   // the top coin catches the light
    }
  }

  override summary() {
    let total = 0; for (const s of this.stars) total += s;
    return {
      stars: this.stars.slice(), total, score: this.score, diners: this.diners.length,
      chews: this.diners.map((d) => d.chews), holding: this.diners.map((d) => d.holding), dishes: this.diners.map((d) => d.dishId),
      stamp: this.frame >= this.stampAt ? this.stampText : '', left: this.left, receipt: this.rowText.slice(), coins: this.tip,
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
