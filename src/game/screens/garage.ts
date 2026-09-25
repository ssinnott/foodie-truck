// THE GARAGE (docs/GDD.md section 13): where the night ends. The closed board drives the truck in here, the day's
// coins already in the tin (screens/stage.ts banks them), and the crew can spend them on the truck: a new paint,
// a new awning, something for the roof. Then OPEN TOMORROW rolls the run on to the next day's board, exactly as
// the closed board used to - or, on the last night of the week, goes back to the title. The title's GARAGE row
// opens it too, between weeks, and there the way out is back to the title.
//
// One screen, no tabs. Up and down pick a slot (PAINT, AWNING, ROOF) or the way out; left and right flip through
// that slot's options, and the truck in the middle of the room wears whichever one is showing AT ONCE, bought
// or not - seeing it on the truck is what sells it. An owned option is worn the moment it is flipped to. One that
// is not shows its price: confirm asks, confirm again buys it, the tin pays and the crew cheers. Too dear, and the
// price shakes.
//
// Local only: the stage never sends a match here, and nothing in this screen reaches the simulation. It buys into
// its own copy of the garage record and writes it back in exit() - never from update() (game/garage.ts).
import { VIEW_W, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { drawText, measureText } from '../../engine/text.ts';
import { drawTruck } from '../../art/truck.ts';
import type { TruckStyle } from '../../art/truck.ts';
import { drawGarage, GARAGE_TRUCK_Y } from '../../art/garage.ts';
import { drawShadow, burstSparkle } from '../../art/fx.ts';
import { particles } from '../../engine/particles.ts';
import { PROPS } from '../../art/kitchenProps.ts';
import { critterRig } from '../../content/critters/common.ts';
import { getCritter } from '../../content/critters/index.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import type { Pose } from '../../lib/art/poses.ts';
import { SLOTS, partsFor } from '../../content/garage.ts';
import type { TruckPart } from '../../content/garage.ts';
import { readGarage, saveGarage, buy, wear, owns } from '../garage.ts';
import type { GarageRecord } from '../garage.ts';
import { drawSlate, drawSign, drawTicket, drawStamp, drawHint } from '../ui.ts';
import { confirmPressed, cancelPressed, navX, navY } from '../menuinput.ts';
import { DRIVER } from './line.ts';
import type { LineHead } from './line.ts';
import type { CritterRig } from './kitchen.ts';

const R = Math.round;
/** The truck, parked under the bulb at three times its master size so a paint job reads. */
const TRUCK_X = 184, TRUCK_SCALE = 3;
/** The slate on the right: one block per slot, then the way out. */
const SLATE = { x: 372, y: 84, w: 252, h: 206 };
const BLOCK_Y = 40, BLOCK_H = 44, LABEL_DY = 0, NAME_DY = 13, STATUS_DY = 26;
/** The row that leaves, under the three slot blocks. */
const EXIT_ROW = SLOTS.length;
/** The tin: a paper ticket under the sign, left, with the coins in it. */
const TIN = { x: 16, y: 14, w: 132, h: 36 };
/** The price tag that hangs under the truck while it is trying something on. */
const TAG_Y = 312, TAG_H = 20;
/** The SOLD stamp slams over the truck for STAMP_FRAMES, and a too-dear price shakes for SHAKE_FRAMES. */
const STAMP_FRAMES = 24, SOLD_HOLD = 70, SHAKE_FRAMES = 18;
/** The SOLD stamp lands over the roof, clear of the crew's faces in the windows. */
const SOLD_DY = 150;
/** The truck hops on a sale: squashed this much, for this long. */
const HOP_FRAMES = 12, HOP_SQUASH = 1.1;
/** Each seat in the windows cheers this many frames after the one before it. */
const CHEER_LAG = 5;
/** Confirm is ignored for the first frames, so the press that closed the board cannot buy anything. */
const CONFIRM_AT = 12;
const BLINK_PERIOD = 60, BLINK_ON = 40;
const SIGN_TEXT = 'THE GARAGE';
const SIGN_W = measureText(SIGN_TEXT, 2) + 24;
const SOLD_TEXT = 'SOLD';
const TIN_TITLE = 'THE TIN';

/** One seat in the truck's windows: its rig and the player its head's pose comes from. */
export interface GarageSeat {
  rig: CritterRig;
  player: AnimPlayer;
}

export class GarageScreen extends Screen {
  // The fields, for the checker only, in constructor then enter() order. `declare` for the reason game.ts gives
  // over its own block: a plain field declaration would emit a class field per name, and this screen keeps the
  // same runtime shape as every other.

  /** The checksum scratch array, refilled by checksumFields(); never reallocated. */
  declare fields: number[];
  /** Each slot's options, stock first (content/garage.ts), in SLOTS order. */
  declare options: TruckPart[][];
  /** Which option each slot is SHOWING (an index into its `options`), which may be one not yet bought. */
  declare showing: number[];
  /** What the truck is drawn in: what is worn, with the selected slot's showing option over it. Rebuilt on change. */
  declare preview: TruckStyle;
  /** The crew in the windows (the night's party; nobody when the garage is opened from the title). */
  declare crew: GarageSeat[];
  /** The heads handed to drawTruck: the driver first, then the rest. */
  declare heads: LineHead[];
  /** The drawTruck options, reused every frame. */
  declare truckOpts: { scale: number; facing: number; squash: number; heads: LineHead[]; style: TruckStyle };
  /** This screen's copy of the garage: bought into here, written back in exit(). */
  declare rec: GarageRecord;
  /** Where it was opened from: 'night' (the closed board) or anywhere else (the title, a dev jump). */
  declare from: string;
  /** Which row is selected: a slot (0..2) or EXIT_ROW. */
  declare sel: number;
  /** True while a price has been asked about and one more confirm buys it. */
  declare asking: boolean;
  /** The frame the last sale was made on (-1 before one), which times the stamp, the hop and the cheers. */
  declare soldAt: number;
  /** The frame a too-dear price was last asked about (-1 before one): it shakes. */
  declare poorAt: number;
  /** True once the way out has been taken: the fade is running. */
  declare left: boolean;
  // the strings, built whenever what they say changes and never in draw():
  /** The tin's row. */
  declare tinText: string;
  /** Each slot block's option name and status line. */
  declare names: string[];
  declare statuses: string[];
  /** The way out's words: OPEN TOMORROW, SEE THE WEEK OUT, or BACK. */
  declare exitText: string;
  /** The price tag under the truck ('' while it wears only what it owns). */
  declare tagText: string;
  declare tagW: number;
  /** The hint line. */
  declare hint: string;

  constructor(game: Game) {
    super(game, 'garage');
    this.fields = []; this.options = SLOTS.map((s) => partsFor(s.id)); this.showing = [0, 0, 0];
    this.crew = []; this.heads = []; this.names = []; this.statuses = [];
  }

  override enter(params: ScreenParams): void {
    super.enter(params);
    const game = this.game, run = game.run;
    particles.clear();
    this.rec = readGarage();
    this.from = params.from || '';
    this.sel = 0; this.asking = false; this.soldAt = -1; this.poorAt = -1; this.left = false;
    for (let i = 0; i < SLOTS.length; i++) {
      const k = this.options[i].findIndex((p) => p.id === this.rec.wearing[SLOTS[i].id]);
      this.showing[i] = k < 0 ? 0 : k;
    }
    // the night's crew in the windows, as on the line; from the title the truck stands empty
    this.crew.length = 0; this.heads.length = 0;
    if (run && this.from === 'night') {
      for (let i = 0; i < run.party.length; i++) {
        const p = run.party[i], def = getCritter(p.critter), player = new AnimPlayer(def.anims);
        player.play('idle');
        for (let k = 0; k < i * 9; k++) player.tick();
        this.crew.push({ rig: critterRig(def, p.slot) as CritterRig, player });
      }
      const di = Math.max(0, run.party.findIndex((p) => p.critter === DRIVER));
      if (this.crew.length) {
        this.heads.push({ rig: this.crew[di].rig, pose: this.crew[di].player.pose as Pose });
        for (let i = 0; i < this.crew.length; i++) if (i !== di) this.heads.push({ rig: this.crew[i].rig, pose: this.crew[i].player.pose as Pose });
      }
    }
    this.preview = { ...this.rec.wearing };
    this.truckOpts = { scale: TRUCK_SCALE, facing: 1, squash: 1, heads: this.heads, style: this.preview };
    const weekDone = !!(run && this.from === 'night' && run.weekComplete());
    this.exitText = this.from !== 'night' ? 'BACK' : weekDone ? 'SEE THE WEEK OUT' : 'OPEN TOMORROW';
    const inp = game.input;
    this.hint = `ARROWS: CHOOSE    ${inp.keyText(0, 'action')}: BUY    ${inp.keyText(0, 'cancel')}: ${this.from === 'night' ? 'DONE' : 'BACK'}`;
    this.refresh();
  }

  /** The garage record back to storage, on the way out and never from update() (game/garage.ts). */
  override exit(): void { saveGarage(this.rec, !!(this.game.net && this.game.net.active)); }

  /** Rebuild every string and the preview after something changed: a move, a flip, a sale. */
  refresh(): void {
    const rec = this.rec;
    this.tinText = `${rec.coins} COINS`;
    let tag = '';
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i].id, part = this.options[i][this.showing[i]];
      this.names[i] = part.name;
      const worn = rec.wearing[slot] === part.id;
      let status: string;
      if (worn) status = 'WEARING';
      else if (owns(rec, slot, part.id)) status = 'OWNED';
      else if (i === this.sel && this.asking) status = `BUY FOR ${part.price}? PRESS AGAIN`;
      else if (rec.coins < part.price) status = `${part.price} COINS - NEED ${part.price - rec.coins} MORE`;
      else status = `${part.price} COINS`;
      this.statuses[i] = status;
      // the preview: what is worn, with only the SELECTED slot trying on what it shows
      this.preview[slot] = i === this.sel && !owns(rec, slot, part.id) ? part.id : rec.wearing[slot];
      if (i === this.sel && !owns(rec, slot, part.id)) tag = `TRYING ON - ${part.price} COINS`;
    }
    this.tagText = tag;
    this.tagW = tag ? measureText(tag, 1) + 16 : 0;
  }

  override update(): void {
    super.update();
    const game = this.game, inp = game.input, f = this.frame;
    particles.update();
    for (let i = 0; i < this.crew.length; i++) {
      const c = this.crew[i];
      if (this.soldAt >= 0 && f === this.soldAt + i * CHEER_LAG) c.player.play('cheer', { restart: true });
      c.player.tick();
      if (c.player.done) c.player.play('idle', { restart: true });
    }
    const t = this.soldAt >= 0 ? f - this.soldAt : HOP_FRAMES;
    this.truckOpts.squash = t < HOP_FRAMES ? 1 + (HOP_SQUASH - 1) * Math.sin((t / HOP_FRAMES) * Math.PI) : 1;
    if (this.left) return;
    // cancel takes back a price that has been asked about; otherwise it is the way out, as confirm on the last row is
    if (cancelPressed(inp) >= 0) {
      if (this.asking) { this.asking = false; game.audio.play('menu_back'); this.refresh(); }
      else this.leave();
      return;
    }
    if (f >= CONFIRM_AT && this.sel === EXIT_ROW && confirmPressed(inp) >= 0) { this.leave(); return; }
    const dy = navY(inp);
    if (dy) {
      this.sel = (this.sel + dy + EXIT_ROW + 1) % (EXIT_ROW + 1);
      this.asking = false;
      game.audio.play('menu_move');
      this.refresh();
      return;
    }
    if (this.sel === EXIT_ROW) return;
    const slot = SLOTS[this.sel].id, opts = this.options[this.sel];
    const dx = navX(inp);
    if (dx) {
      this.showing[this.sel] = (this.showing[this.sel] + dx + opts.length) % opts.length;
      this.asking = false;
      // flipping to something owned wears it: there is nothing to confirm
      wear(this.rec, slot, opts[this.showing[this.sel]].id);
      game.audio.play('menu_move');
      this.refresh();
      return;
    }
    if (f < CONFIRM_AT || confirmPressed(inp) < 0) return;
    const part = opts[this.showing[this.sel]];
    if (owns(this.rec, slot, part.id)) { game.audio.play('menu_confirm'); return; }
    if (this.rec.coins < part.price) { this.poorAt = f; this.asking = false; game.audio.play('rebind_refused'); this.refresh(); return; }
    if (!this.asking) { this.asking = true; game.audio.play('menu_confirm'); this.refresh(); return; }
    // SOLD: the tin pays, the truck wears it, the stamp slams and the crew cheers
    if (buy(this.rec, slot, part.id)) {
      this.asking = false;
      this.soldAt = f;
      game.audio.play('coin');
      game.audio.play('stamp', { delay: 0.05 });
      if (this.crew.length) game.audio.play('cheer', { delay: 0.2 });
      burstSparkle(TRUCK_X, GARAGE_TRUCK_Y - SOLD_DY, 8, UI.cream, true);
      this.refresh();
    }
  }

  /** Out of the garage: tomorrow's board, the title at the end of the week, or back where it was opened from. */
  leave(): void {
    const game = this.game;
    this.left = true;
    game.audio.play(this.from === 'night' ? 'truck_start' : 'menu_back');
    game.fadeTo(() => {
      const run = game.run;
      if (this.from === 'night' && run && run.dayComplete() && !run.weekComplete()) { run.nextDay(); game.replace('stage'); }
      else game.reset('title');
    });
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    drawGarage(ctx);
    drawSign(ctx, VIEW_W / 2, 0, SIGN_W, 24, SIGN_TEXT, { size: 2 });
    this.drawTin(ctx);
    drawShadow(ctx, TRUCK_X, GARAGE_TRUCK_Y, 130, 0.35);
    drawTruck(ctx, TRUCK_X, GARAGE_TRUCK_Y, this.truckOpts);
    if (this.tagText) {
      drawTicket(ctx, R(TRUCK_X - this.tagW / 2), TAG_Y, this.tagW, TAG_H, { rules: false, header: false });
      drawText(ctx, this.tagText, TRUCK_X, TAG_Y + 7, { size: 1, color: UI.ink, align: 'center', shadow: false });
    }
    (particles as unknown as { draw(ctx: CanvasRenderingContext2D, cam: null): void }).draw(ctx, null);
    if (this.soldAt >= 0 && f - this.soldAt < SOLD_HOLD) drawStamp(ctx, SOLD_TEXT, TRUCK_X, GARAGE_TRUCK_Y - SOLD_DY, Math.min(1, (f - this.soldAt) / STAMP_FRAMES));
    this.drawSlate(ctx, f);
    drawHint(ctx, this.hint);
  }

  /** The tin: a paper ticket with the coins in it and a brass disc beside the number. */
  drawTin(ctx: CanvasRenderingContext2D): void {
    const top = drawTicket(ctx, TIN.x, TIN.y, TIN.w, TIN.h, { title: TIN_TITLE, rules: false });
    const cx = TIN.x + 14, cy = top + 8;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = PROPS.brass; ctx.fill();
    ctx.fillStyle = PROPS.brassSh; ctx.fillRect(cx - 1, cy, 3, 3);
    drawText(ctx, this.tinText, TIN.x + 26, top + 4, { size: 1, color: UI.ink, shadow: false });
  }

  /** The slate: a block per slot (its label, the option showing between arrows, its status), then the way out. */
  drawSlate(ctx: CanvasRenderingContext2D, f: number): void {
    const x = SLATE.x, y = SLATE.y, w = SLATE.w, cx = x + w / 2;
    drawSlate(ctx, x, y, w, SLATE.h, { title: 'THE TRUCK' });
    for (let i = 0; i < SLOTS.length; i++) {
      const sel = i === this.sel, by = y + BLOCK_Y + i * BLOCK_H, ink = sel ? UI.chalk : UI.paperDark;
      drawText(ctx, SLOTS[i].label, x + 10, by + LABEL_DY, { size: 1, color: ink, shadow: false });
      const n = this.options[i].length;
      drawText(ctx, `${this.showing[i] + 1} OF ${n}`, x + w - 10, by + LABEL_DY, { size: 1, color: UI.paperDark, align: 'right', shadow: false });
      drawText(ctx, this.names[i], cx, by + NAME_DY, { size: 1, color: ink, align: 'center', shadow: false });
      if (sel) {
        const half = R(measureText(this.names[i], 1) / 2) + 10, bob = R(Math.sin(f * 0.15) * 2);
        drawText(ctx, '<', cx - half - 6 - bob, by + NAME_DY, { size: 1, color: UI.chalk, shadow: false });
        drawText(ctx, '>', cx + half + bob, by + NAME_DY, { size: 1, color: UI.chalk, shadow: false });
      }
      const st = this.statuses[i], worn = st === 'WEARING';
      const poor = sel && this.poorAt >= 0 && f - this.poorAt < SHAKE_FRAMES;
      const shake = poor ? R(Math.sin((f - this.poorAt) * 1.6) * 3) : 0;
      const blink = sel && this.asking && f % BLINK_PERIOD >= BLINK_ON;
      if (!blink) drawText(ctx, st, cx + shake, by + STATUS_DY, { size: 1, color: poor ? UI.red : worn ? UI.green : sel ? UI.yellow : UI.paperDark, align: 'center', shadow: false });
    }
    // the way out
    const ey = y + BLOCK_Y + SLOTS.length * BLOCK_H + 6, esel = this.sel === EXIT_ROW;
    drawText(ctx, this.exitText, cx, ey, { size: 1, color: esel ? UI.chalk : UI.paperDark, align: 'center', shadow: false });
    if (esel) drawText(ctx, '>', R(cx - measureText(this.exitText, 1) / 2 - 10 + Math.sin(f * 0.15) * 2), ey, { size: 1, color: UI.chalk, shadow: false });
  }

  override summary() {
    return {
      from: this.from, sel: this.sel, row: this.sel === EXIT_ROW ? this.exitText : SLOTS[this.sel].label,
      coins: this.rec.coins, owned: this.rec.owned.slice(), wearing: { ...this.rec.wearing }, preview: { ...this.preview },
      showing: this.options.map((o, i) => o[this.showing[i]].id), statuses: this.statuses.slice(), asking: this.asking,
      sold: this.soldAt >= 0, left: this.left, exit: this.exitText, tag: this.tagText, crew: this.crew.length,
    };
  }
  /** What could differ between two machines, were a garage ever shared: the cursor, the options showing, the ask. */
  override checksumFields(): number[] {
    const f = this.fields; f.length = 0;
    f.push(this.sel, this.asking ? 1 : 0, this.left ? 1 : 0);
    for (let i = 0; i < this.showing.length; i++) f.push(this.showing[i]);
    return f;
  }
}
