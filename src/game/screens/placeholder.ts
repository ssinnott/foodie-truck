// A stand-in screen that names itself and runs a trivial DETERMINISTIC simulation - one dot per party seat that
// the seat's stick moves - so the whole flow, the input plumbing and the lockstep netcode can be exercised before
// the real art lands. Every screen file starts as a one-line subclass of this and is replaced in place.
import { VIEW_W, VIEW_H, UI, PLAYER_COLORS } from '../../constants.ts';
import { Screen } from '../game.ts';
import type { Game, ScreenParams } from '../game.ts';
import { drawText, drawTextOutlined } from '../../engine/text.ts';

/** One dot of the stand-in simulation: a party seat's marker, moved by that seat's stick. */
export interface PlaceholderDot {
  /** The seat's player slot (0..3): the colour it is drawn in and the stick that moves it. */
  slot: number;
  x: number;
  y: number;
}

export class PlaceholderScreen extends Screen {
  // The fields, for the checker only. `declare` for the reason game.ts gives over its own block: a plain field
  // declaration would emit a class field per name (es2022 defines them before the constructor body runs, and a
  // screen's own declaration would also define a base field back to undefined), and this screen has to keep the
  // runtime it shipped with. `declare` erases under tsc, under esbuild and under Node's type stripping alike, so
  // the emitted class is the original.

  /** The screen `action` / `start` moves on to; '' when this stand-in is a dead end. */
  declare next: string;
  /** One dot per party seat, in party order. */
  declare dots: PlaceholderDot[];

  constructor(game: Game, id: string, next: string = '') { super(game, id); this.next = next; this.dots = []; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    const party: { slot: number }[] = this.game.run ? this.game.run.party : [{ slot: 0 }];
    this.dots = party.map((p, i) => ({ slot: p.slot, x: 200 + i * 60, y: 250 }));
  }
  override update(): void {
    super.update();
    const inp = this.game.input;
    for (const d of this.dots) { d.x += inp.axisX(d.slot) * 2; d.y += inp.axisY(d.slot) * 2; }
    if (this.next && (inp.anyPressed('action') >= 0 || inp.anyPressed('start') >= 0)) this.game.replace(this.next);
    if (inp.anyPressed('cancel') >= 0 && this.id !== 'title') this.game.reset('title');
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = UI.board; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextOutlined(ctx, this.id.toUpperCase(), VIEW_W / 2, 120, { size: 3, color: UI.chalk, outline: UI.ink, align: 'center' });
    drawText(ctx, 'PLACEHOLDER SCREEN', VIEW_W / 2, 160, { size: 1, color: UI.paperDark, align: 'center' });
    if (this.next) drawText(ctx, `Z: ${this.next.toUpperCase()}    C: TITLE`, VIEW_W / 2, 180, { size: 1, color: UI.chalk, align: 'center' });
    for (const d of this.dots) { ctx.fillStyle = PLAYER_COLORS[d.slot]; ctx.fillRect(Math.round(d.x) - 6, Math.round(d.y) - 6, 12, 12); }
  }
  /** Sim state a test (or the desync canary) can read. */
  override summary() { return { dots: this.dots.map((d) => [d.slot, Math.round(d.x), Math.round(d.y)]) }; }
  /** Numbers the netplay checksum hashes (net/checksum.js): every field that can diverge. */
  override checksumFields(): number[] { const out: number[] = []; for (const d of this.dots) out.push(d.x, d.y); return out; }
}
