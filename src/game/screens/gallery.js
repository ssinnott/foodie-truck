// Gallery: every critter in the cast, side by side, cycling through the shared animation table - the in-game
// contact sheet (docs/ART_PRINCIPLES.md 42). Left/right picks the animation, up/down the zoom, cancel leaves.
import { VIEW_W, VIEW_H, UI, PLUM } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { drawRig } from '../../art/rig.js';
import { critterRig } from '../../content/critters/common.js';
import { AnimPlayer } from '../animation.js';
import { ITEMS } from '../../content/critters/items.js';
import { cancelPressed, navX, navY } from '../menuinput.js';
import { drawSign, drawHint, drawNamePlate } from '../ui.js';

const ANIMS = ['idle', 'walk', 'run', 'carry', 'carryWalk', 'reach', 'catch', 'cheer', 'sad', 'eat', 'chop', 'stir', 'bump', 'hop', 'wave', 'sit'];
/** Which held item a pose is authored around, so the gallery shows the pair. */
const ITEM_FOR = { carry: 'basket', carryWalk: 'basket', catch: 'basket', eat: 'food', chop: 'knife', stir: 'spoon' };
const FLOOR_Y = 250;
/** Each critter hangs on its own card, so no fur ever sits on a plane of its own value. */
const CARD_TOP_PAD = 10;
/** Relative luminance of a #rrggbb, 0..1 (docs/ART_STYLE.md section 0 judges contrast by value). */
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
/** Contact shadow: plum, never black (docs/ART_STYLE.md section 1). */
const SHADOW = 'rgba(20,12,16,0.35)';
const R = Math.round;

export class GalleryScreen extends Screen {
  constructor(game) { super(game, 'gallery'); }
  enter(params) {
    super.enter(params);
    this.anim = 0; this.zoom = 2; this.facing = 1;
    this.slots = (this.game.critters || []).map((c, i) => ({ def: c, rig: critterRig(c, i), player: new AnimPlayer(c.anims) }));
    for (const s of this.slots) s.player.play(ANIMS[this.anim]);
    this.apply();
  }
  apply() {
    const name = ANIMS[this.anim], item = ITEM_FOR[name] || null;
    for (const s of this.slots) { s.player.play(name, { restart: true }); s.rig.weapon = item ? ITEMS[item] : null; s.rig.basketFill = 0.6; }
  }
  update() {
    super.update();
    const inp = this.game.input;
    const dx = navX(inp), dy = navY(inp);
    if (dx) { this.anim = (this.anim + dx + ANIMS.length) % ANIMS.length; this.apply(); }
    if (dy) this.zoom = Math.max(1, Math.min(4, this.zoom - dy));
    if (inp.anyPressed('alt') >= 0) this.facing = -this.facing;
    for (const s of this.slots) { s.player.tick(); if (s.player.done) s.player.play(ANIMS[this.anim], { restart: true }); }
    if (cancelPressed(inp) >= 0) this.game.reset('title');
  }
  draw(ctx) {
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
      const pale = lum(s.rig.palette.skin) > 0.5;                      // pale furs on plum, dark furs on paper
      ctx.fillStyle = UI.ink; ctx.fillRect(R(x - cw / 2) - 1, top - 1, cw + 2, FLOOR_Y - top + 2);
      ctx.fillStyle = pale ? PLUM.shadow : UI.paperDark; ctx.fillRect(R(x - cw / 2), top, cw, FLOOR_Y - top + 1);
      ctx.fillStyle = pale ? PLUM.deep : UI.paperLine; ctx.fillRect(R(x - cw / 2), top, cw, 2);
      ctx.fillStyle = SHADOW; ctx.beginPath(); ctx.ellipse(x, FLOOR_Y + 2, 14 * this.zoom, 4 * this.zoom, 0, 0, Math.PI * 2); ctx.fill();
      drawRig(ctx, s.rig, s.player.pose, { x, y: FLOOR_Y, facing: this.facing, scale: this.zoom });
      drawNamePlate(ctx, i, s.def.name, x, FLOOR_Y + 12);
      if (s.def.role) drawTextOutlined(ctx, s.def.role, x, FLOOR_Y + 26, { size: 1, color: UI.cream, outline: UI.woodDark, align: 'center', shadow: false });
    }
    drawSign(ctx, VIEW_W / 2, 6, 120, 24, 'THE CREW', { size: 2 });
    drawText(ctx, `< ${ANIMS[this.anim].toUpperCase()} >   ZOOM ${this.zoom}X   X: FLIP`, VIEW_W / 2, 46, { size: 1, color: UI.ink, align: 'center', shadow: false });
    drawHint(ctx, 'C: BACK');
  }
  summary() { return { anim: ANIMS[this.anim], critters: this.slots.length }; }
}
