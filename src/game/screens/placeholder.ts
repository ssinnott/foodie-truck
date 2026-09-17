// A stand-in screen that names itself and runs a trivial DETERMINISTIC simulation - one dot per party seat that
// the seat's stick moves - so the whole flow, the input plumbing and the lockstep netcode can be exercised before
// the real art lands. Every screen file starts as a one-line subclass of this and is replaced in place.
import { VIEW_W, VIEW_H, UI, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import { drawText, drawTextOutlined } from '../../engine/text.ts';

export class PlaceholderScreen extends Screen {
  constructor(game, id, next = '') { super(game, id); this.next = next; this.dots = []; }
  enter(params) {
    super.enter(params);
    const party = this.game.run ? this.game.run.party : [{ slot: 0 }];
    this.dots = party.map((p, i) => ({ slot: p.slot, x: 200 + i * 60, y: 250 }));
  }
  update() {
    super.update();
    const inp = this.game.input;
    for (const d of this.dots) { d.x += inp.axisX(d.slot) * 2; d.y += inp.axisY(d.slot) * 2; }
    if (this.next && (inp.anyPressed('action') >= 0 || inp.anyPressed('start') >= 0)) this.game.replace(this.next);
    if (inp.anyPressed('cancel') >= 0 && this.id !== 'title') this.game.reset('title');
  }
  draw(ctx) {
    ctx.fillStyle = UI.board; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextOutlined(ctx, this.id.toUpperCase(), VIEW_W / 2, 120, { size: 3, color: UI.chalk, outline: UI.ink, align: 'center' });
    drawText(ctx, 'PLACEHOLDER SCREEN', VIEW_W / 2, 160, { size: 1, color: UI.paperDark, align: 'center' });
    if (this.next) drawText(ctx, `Z: ${this.next.toUpperCase()}    C: TITLE`, VIEW_W / 2, 180, { size: 1, color: UI.chalk, align: 'center' });
    for (const d of this.dots) { ctx.fillStyle = PLAYER_COLORS[d.slot]; ctx.fillRect(Math.round(d.x) - 6, Math.round(d.y) - 6, 12, 12); }
  }
  /** Sim state a test (or the desync canary) can read. */
  summary() { return { dots: this.dots.map((d) => [d.slot, Math.round(d.x), Math.round(d.y)]) }; }
  /** Numbers the netplay checksum hashes (net/checksum.js): every field that can diverge. */
  checksumFields() { const out = []; for (const d of this.dots) out.push(d.x, d.y); return out; }
}
