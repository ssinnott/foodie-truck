// Things a critter holds: baskets, rods, spoons, knives and food (docs/ART_STYLE.md section 5). Each is a `weapon`
// slot object for art/rig.js ({ attach, length, draw }) drawn in HAND space, +x along the forearm, origin at the
// wrist; the paw is drawn over the handle afterwards so it closes round the grip. `upright()` counter-rotates the
// hand space so a hanging basket hangs down whatever the arm is doing. Screens set `rig.weapon = ITEMS.basket`.
import { celRect, celCapsule, celPoly, tones, pathRR, band } from '../../art/shading.js';
import { LIGHT_X, LIGHT_Y } from '../../art/shading.js';
import { drawFood } from '../../art/food.js';

const R = Math.round;
const WOOD = '#C48A52', WOOD_DARK = '#8B5A2B', STEEL = '#D8DCE0', ROD = '#9A6234';

/** Rotate the context so +y points down in root space (the item hangs from the paw), then draw. */
function upright(ctx, rig, fn) {
  const a = Math.atan2(rig.light.y, rig.light.x) - Math.atan2(LIGHT_Y, LIGHT_X);
  ctx.save(); ctx.rotate(-a); fn(); ctx.restore();
}

export const ITEMS = {
  /** Wicker basket hanging from the paw; `rig.basketFill` (0..1) draws apples piling up inside it. */
  basket: { attach: 'handR', length: 14, draw(ctx, rig) {
    upright(ctx, rig, () => {
      const t = tones(rig, WOOD);
      ctx.beginPath(); ctx.arc(0, 8, 8, Math.PI, 0);
      ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = rig.col(WOOD_DARK); ctx.lineWidth = 2; ctx.stroke();
      celPoly(ctx, rig, [-11, 8, 11, 8, 9, 22, -9, 22], WOOD, 0.36, 0.2);
      if (rig.override) return;
      ctx.fillStyle = t.sh; ctx.fillRect(-9, 12, 18, 2); ctx.fillRect(-8, 17, 16, 2);   // two weave lines (2 px)
      const fill = rig.basketFill || 0;
      if (fill > 0) { const n = Math.min(4, Math.ceil(fill * 4)); for (let i = 0; i < n; i++) drawFood(ctx, rig.basketIcon || 'apple', -6 + (i % 3) * 6 + (i > 2 ? 3 : 0), 10 - (i > 2 ? 3 : 0), 3.5, rig.basketHex); }
    });
  } },
  /** Fishing rod along the forearm, with the line hanging from its tip (drawn by the pond screen). */
  rod: { attach: 'handR', length: 34, draw(ctx, rig) {
    celCapsule(ctx, rig, 2, 0, 34, 0, 2, ROD, 0);
    if (rig.override) return;
    ctx.fillStyle = rig.col(WOOD_DARK); ctx.fillRect(-2, -2, 6, 4);   // grip
    ctx.fillStyle = rig.col('#C8C0B0'); ctx.fillRect(30, -3, 3, 2);   // tip eye
  } },
  /** Wooden spoon. */
  spoon: { attach: 'handR', length: 16, draw(ctx, rig) {
    celCapsule(ctx, rig, 1, 0, 12, 0, 1.5, WOOD, 0);
    ctx.beginPath(); ctx.ellipse(15, 0, 4, 3, 0, 0, Math.PI * 2);
    celPoly(ctx, rig, [11, -3, 19, -3, 19, 3, 11, 3], WOOD, 0.4, 0);
  } },
  /** Kitchen knife: light blade, dark handle. */
  knife: { attach: 'handR', length: 18, draw(ctx, rig) {
    celPoly(ctx, rig, [4, -3, 18, -3, 20, 0, 18, 2, 4, 2], STEEL, 0.4, 0.3);
    band(ctx, rig, -3, -2, 8, 4, WOOD_DARK, 1);
  } },
  /** A held apple / egg / fish: `rig.heldIcon` and `rig.heldHex` pick which. */
  food: { attach: 'handR', length: 8, draw(ctx, rig) {
    upright(ctx, rig, () => drawFood(ctx, rig.heldIcon || 'apple', 2, 2, 5, rig.heldHex));
  } },
  /** A tray / plate held flat in front. */
  plate: { attach: 'handR', length: 14, draw(ctx, rig) {
    upright(ctx, rig, () => { celRect(ctx, rig, -12, 2, 24, 4, 2, '#F4F0E6', 0.4, 0.2); });
  } },
};
