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
/** Where the paper wall gives way to the plum dado behind the crew. */
const DADO_Y = 150;
/** Contact shadow: plum, never black (docs/ART_STYLE.md section 1). */
const SHADOW = 'rgba(47,35,56,0.35)';

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
    ctx.fillStyle = UI.paper; ctx.fillRect(0, 0, VIEW_W, DADO_Y);
    ctx.fillStyle = UI.paperDark;
    for (let y = 12; y < DADO_Y; y += 24) ctx.fillRect(0, y, VIEW_W, 1);
    ctx.fillStyle = PLUM.shadow; ctx.fillRect(0, DADO_Y, VIEW_W, FLOOR_Y + 1 - DADO_Y);
    ctx.fillStyle = PLUM.deep; ctx.fillRect(0, DADO_Y, VIEW_W, 2);
    ctx.fillStyle = UI.wood; ctx.fillRect(0, FLOOR_Y + 2, VIEW_W, VIEW_H - FLOOR_Y - 2);
    ctx.fillStyle = UI.woodDark; ctx.fillRect(0, FLOOR_Y + 2, VIEW_W, 4);      // the shelf falls into shadow at the wall
    ctx.fillStyle = UI.woodLight; ctx.fillRect(0, FLOOR_Y + 6, VIEW_W, 2);
    ctx.fillStyle = UI.woodDark;
    for (let x = 12; x < VIEW_W; x += 64) ctx.fillRect(x, FLOOR_Y + 8, 1, VIEW_H - FLOOR_Y - 8);
    ctx.fillStyle = UI.ink; ctx.fillRect(0, FLOOR_Y + 1, VIEW_W, 1);
    const n = Math.max(1, this.slots.length), pitch = Math.min(150, Math.floor((VIEW_W - 40) / n));
    const x0 = Math.round(VIEW_W / 2 - (n - 1) * pitch / 2);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], x = x0 + i * pitch;
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
