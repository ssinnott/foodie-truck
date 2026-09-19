// Gallery: every critter in the cast, side by side, cycling through the shared animation table - the in-game
// contact sheet (docs/ART_PRINCIPLES.md 42). Left/right picks the animation, up/down the zoom, cancel leaves.
import { VIEW_W, VIEW_H, UI, PLUM } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { CritterDef, Game, ScreenParams } from '../game.ts';
import { drawText, drawTextOutlined } from '../../engine/text.ts';
import { drawRig } from '../../lib/art/rig.ts';
import type { Rig } from '../../lib/art/rig.ts';
import { critterRig } from '../../content/critters/common.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { ITEMS } from '../../content/critters/items.ts';
import { cancelPressed, navX, navY } from '../menuinput.ts';
import { drawSign, drawHint, drawNamePlate } from '../ui.ts';

const ANIMS = ['idle', 'walk', 'run', 'carry', 'carryWalk', 'reach', 'catch', 'cheer', 'sad', 'eat', 'chop', 'stir',
  'bump', 'hop', 'wave', 'sit', 'sneak', 'honk', 'cast', 'taste'];
/** The last four are signature keys only one cast member authors; everyone else falls back to idle (animation.js play). */
const SIGNATURE = 4;
/** Which held item a pose is authored around, so the gallery shows the pair. */
const ITEM_FOR = { carry: 'basket', carryWalk: 'basket', catch: 'basket', eat: 'food', chop: 'knife', stir: 'spoon', honk: 'horn', cast: 'rod', taste: 'spoon' };
const FLOOR_Y = 250;
/** Each critter hangs on its own card, so no fur ever sits on a plane of its own value. */
const CARD_TOP_PAD = 10;
/** Paper mount inside a dark critter's frame, in px. */
const MAT = 3;
/** Relative luminance of a #rrggbb, 0..1 (docs/ART_STYLE.md section 0 judges contrast by value). */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
/** Contact shadow: plum, never black (docs/ART_STYLE.md section 1). */
const SHADOW = 'rgba(20,12,16,0.35)';
const R = Math.round;

/**
 * One card of the contact sheet: the cast entry, the rig built for it and the player walking it through the
 * shared animation table. Built ONCE in enter(), one per cast member in cast order; `apply()` re-aims every one
 * of them at whichever animation the row is standing on.
 */
export interface GallerySlot {
  /** The cast entry (game.critters, in cast order). */
  def: CritterDef;
  /** The rig built for that entry: it carries the pose's prop and is drawn at the row's zoom. */
  rig: Rig;
  /** Playing the selected animation - or idle, where this critter authors no key for it. */
  player: AnimPlayer;
}

export class GalleryScreen extends Screen {
  // The fields, for the checker only, in the order enter() assigns them. `declare`, not plain declarations, for
  // the reason game/game.ts states over its own block: a plain field declaration emits a class field per name
  // (es2022 defines them before the constructor body runs, and a screen's own declaration would also define a
  // base field back to undefined), which would change the runtime this screen shipped with. `declare` erases
  // under tsc, under esbuild and under Node's type stripping alike, so the emitted class is the original.

  /** Index into ANIMS of the animation the whole row is playing; left/right walks it, wrapping. */
  declare anim: number;
  /** Rig scale, 1..4 (up/down steps it), and the contact shadow's ellipse with it. */
  declare zoom: number;
  /** 1 = the row faces right, -1 = left; X flips it. */
  declare facing: number;
  /** One card per cast member, in cast order. */
  declare slots: GallerySlot[];

  constructor(game: Game) { super(game, 'gallery'); this.touchAlt = true; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    this.anim = 0; this.zoom = 2; this.facing = 1;
    this.slots = (this.game.critters || []).map((c, i) => ({ def: c, rig: critterRig(c, i), player: new AnimPlayer(c.anims) }));
    for (const s of this.slots) s.player.play(ANIMS[this.anim]);
    this.apply();
  }
  apply(): void {
    const name = ANIMS[this.anim], item = ITEM_FOR[name] || null;
    for (const s of this.slots) {
      const owns = !!(s.def.anims && s.def.anims[name]);
      s.player.play(name, { restart: true });                       // falls back to idle where a critter has no key
      s.rig.weapon = item && owns ? ITEMS[item] : null;             // ...and then it should not be holding the prop
      s.rig.basketFill = 0.6;
    }
  }
  override update(): void {
    super.update();
    const inp = this.game.input;
    const dx = navX(inp), dy = navY(inp), audio = this.game.audio;
    if (dx) { this.anim = (this.anim + dx + ANIMS.length) % ANIMS.length; this.apply(); audio.play('menu_move'); }
    if (dy) { this.zoom = Math.max(1, Math.min(4, this.zoom - dy)); audio.play('menu_move'); }
    if (inp.anyPressed('alt') >= 0) { this.facing = -this.facing; audio.play('menu_move'); }
    for (const s of this.slots) { s.player.tick(); if (s.player.done) s.player.play(ANIMS[this.anim], { restart: true }); }
    if (cancelPressed(inp) >= 0) { audio.play('menu_back'); this.game.reset('title'); }
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    // A pinboard in the truck: paper wall, plum dado, wooden shelf floor (docs/ART_STYLE.md section 1).
    ctx.fillStyle = UI.paper; ctx.fillRect(0, 0, VIEW_W, FLOOR_Y + 1);
    ctx.fillStyle = UI.paperDark;
    for (let y = 12; y < FLOOR_Y; y += 24) ctx.fillRect(0, y, VIEW_W, 1);
    ctx.fillStyle = UI.wood; ctx.fillRect(0, FLOOR_Y + 2, VIEW_W, VIEW_H - FLOOR_Y - 2);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(0, FLOOR_Y + 2, VIEW_W, 4);      // the shelf falls into shadow at the wall
    ctx.fillStyle = UI.woodLight; ctx.fillRect(0, FLOOR_Y + 6, VIEW_W, 2);
    ctx.fillStyle = UI.woodDark;
    for (let x = 12; x < VIEW_W; x += 64) ctx.fillRect(x, FLOOR_Y + 8, 1, VIEW_H - FLOOR_Y - 8);
    ctx.fillStyle = UI.ink; ctx.fillRect(0, FLOOR_Y + 1, VIEW_W, 1);
    const n = Math.max(1, this.slots.length), pitch = Math.min(150, Math.floor((VIEW_W - 40) / n));
    // One card top for the whole row, measured off the tallest critter: a row of matched portraits, not a skyline.
    const tallest = this.slots.reduce((m, s) => Math.max(m, s.rig.height || 64), 64);
    const cardTop = Math.max(62, FLOOR_Y - Math.round(tallest * this.zoom) - CARD_TOP_PAD);
    const x0 = Math.round(VIEW_W / 2 - (n - 1) * pitch / 2);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], x = x0 + i * pitch;
      // The card: a plum panel tall enough to hold this critter's whole silhouette at this zoom, so the two
      // pale furs never sit on the pale paper (docs/ART_STYLE.md section 0: never pale on pale).
      const cw = pitch - 12, top = cardTop;
      // One card for the whole row: four matched frames, not two pairs. Plum carries every fur in the cast;
      // a dark fur gets a MAT px paper mount inside the frame so it is never dark on dark at the edges.
      const cx0 = R(x - cw / 2), ch = FLOOR_Y - top + 1, m = lum(s.rig.palette.skin) > 0.5 ? 0 : MAT;
      ctx.fillStyle = UI.ink; ctx.fillRect(cx0 - 1, top - 1, cw + 2, ch + 1);
      if (m) { ctx.fillStyle = UI.paperDark; ctx.fillRect(cx0, top, cw, ch); }
      ctx.fillStyle = PLUM.shadow; ctx.fillRect(cx0 + m, top + m, cw - m * 2, ch - m);
      ctx.fillStyle = PLUM.deep; ctx.fillRect(cx0 + m, top + m, cw - m * 2, 2);
      ctx.fillStyle = SHADOW; ctx.beginPath(); ctx.ellipse(x, FLOOR_Y + 2, 14 * this.zoom, 4 * this.zoom, 0, 0, Math.PI * 2); ctx.fill();
      drawRig(ctx, s.rig, s.player.pose, { x, y: FLOOR_Y, facing: this.facing, scale: this.zoom });
      drawNamePlate(ctx, i, s.def.name, x, FLOOR_Y + 12);
      if (s.def.role) drawTextOutlined(ctx, s.def.role, x, FLOOR_Y + 26, { size: 1, color: UI.cream, outline: UI.woodDark, align: 'center', shadow: false });
    }
    drawSign(ctx, VIEW_W / 2, 6, 120, 24, 'THE CREW', { size: 2 });
    const sig = this.anim >= ANIMS.length - SIGNATURE ? '  (ONE CRITTER ONLY)' : '';
    drawText(ctx, `< ${ANIMS[this.anim].toUpperCase()} >${sig}   ZOOM ${this.zoom}X   X: FLIP`, VIEW_W / 2, 46, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawHint(ctx, 'C: BACK');
  }
  override summary() { return { anim: ANIMS[this.anim], critters: this.slots.length }; }
}
