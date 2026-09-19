// The finished dishes, one glyph per ORDERS entry (content/recipes.ts), drawn in the food glyph's own style
// (art/food.ts): a 2 px ink outline, a base and a shade band, a 2 px highlight on the big shapes, the ingredient's
// own hex wherever the dish shows it (the pie's apples are `INGREDIENTS.apple.hex`, so the plate matches the
// ticket). Every recipe gets its own picture so that what lands on the plate at the hatch is the thing the
// customer asked for - an APPLE PIE and not four apples and two eggs stacked up - and the customer on the results
// screen is seen eating that thing, a bite out of it per chew (`bites`).
//
// Origin is the dish's centre on the plate; `s` is its half-size in px (8 = a 16 px dish). Every glyph keeps its
// foot at cy + 0.6 s so a stack of cakes and a bowl of soup both sit on the plate line. Allocation-free.
import { foodTones } from './food.ts';
import { INGREDIENTS } from '../content/recipes.ts';

const INK = '#2A1F1A', TAU = Math.PI * 2;
const R = Math.round;
/** The pastry, bread and batter tones every baked thing shares, and the crockery a soup comes in. */
const CRUST = '#D9A25A', CRUST_DARK = '#B07A3A', TOAST = '#C98A4B', BATTER = '#EBCB8A', CREAM = '#FFF6E0';
const BOWL = '#9DB5B2', BOWL_DARK = '#76908C', SEAWEED = '#3F7A4E', GREEN = '#5FA652', CHEESE = '#F5D66B';
/** A leek soup's pale green and a brownie's dark chocolate: neither is any ingredient's own hex. */
const PALE_LEEK = '#C9D9A0', BROWNIE = '#5A3A2E';
const hexOf = (id: string) => INGREDIENTS[id].hex;

type DishDraw = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => void;

/** Stroke the current path in ink and fill it. */
function inkFill(ctx, fill) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); }
/** An outlined ellipse. */
function oval(ctx, cx, cy, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); inkFill(ctx, fill); }
/** An outlined box. */
function box(ctx, x, y, w, h, fill) { ctx.beginPath(); ctx.rect(x, y, w, h); inkFill(ctx, fill); }
/** A 2 px cream highlight, top-left. */
function shine(ctx, x, y) { ctx.fillStyle = CREAM; ctx.fillRect(R(x), R(y), 2, 2); }
/** A few 2 px flecks in a colour: seeds, salt, berries, herbs. Positions are fixed offsets, so the glyph is stable. */
function flecks(ctx, cx, cy, s, color, pts) { ctx.fillStyle = color; for (let i = 0; i < pts.length; i += 2) ctx.fillRect(R(cx + pts[i] * s), R(cy + pts[i + 1] * s), 2, 2); }

/** A pie or a crumble in its dish: a shallow enamel dish, a domed crust over it, and whatever `top` puts on the crust. */
function pieDish(ctx, cx, cy, s, crust, top: (ctx, cx, cy, s) => void) {
  const t = foodTones(crust);
  box(ctx, cx - s, cy - s * 0.1, s * 2, s * 0.7, BOWL);
  ctx.fillStyle = BOWL_DARK; ctx.fillRect(R(cx - s) + 1, R(cy + s * 0.3), R(s * 2) - 2, R(s * 0.3));
  ctx.beginPath(); ctx.moveTo(cx - s * 1.1, cy); ctx.quadraticCurveTo(cx, cy - s * 1.6, cx + s * 1.1, cy); ctx.closePath(); inkFill(ctx, t.base);
  ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 1.1), R(cy - s * 0.35), R(s * 2.2), R(s * 0.4)); top(ctx, cx, cy, s); ctx.restore();
}
/** A bowl of soup: enamel bowl, the liquid seen over the rim in `liquid`, `garnish` drawn on the liquid. */
function soupBowl(ctx, cx, cy, s, liquid, garnish: (ctx, cx, cy, s) => void) {
  const t = foodTones(liquid);
  ctx.beginPath(); ctx.moveTo(cx - s, cy - s * 0.4); ctx.lineTo(cx + s, cy - s * 0.4); ctx.quadraticCurveTo(cx + s * 0.9, cy + s * 0.6, cx + s * 0.5, cy + s * 0.6); ctx.lineTo(cx - s * 0.5, cy + s * 0.6); ctx.quadraticCurveTo(cx - s * 0.9, cy + s * 0.6, cx - s, cy - s * 0.4); ctx.closePath(); inkFill(ctx, BOWL);
  ctx.save(); ctx.clip(); ctx.fillStyle = BOWL_DARK; ctx.fillRect(R(cx - s), R(cy + s * 0.2), R(s * 2), R(s * 0.5)); ctx.restore();
  oval(ctx, cx, cy - s * 0.4, s, s * 0.35, t.base);
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.4, s, s * 0.35, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy - s * 0.3), R(s * 2), R(s * 0.3)); garnish(ctx, cx, cy, s); ctx.restore();
}
/** A stack of `n` cakes, the top one at cy - (n - 1) * pitch. */
function cakeStack(ctx, cx, cy, s, n, rx, ry, fill, top: (ctx, cx, cy, s) => void) {
  const t = foodTones(fill), pitch = ry * 1.6;
  for (let i = 0; i < n; i++) {
    const y = cy + s * 0.6 - ry - i * pitch;
    oval(ctx, cx, y, rx, ry, t.base);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - rx), R(y), R(rx * 2), R(ry)); ctx.restore();
  }
  top(ctx, cx, cy + s * 0.6 - ry - (n - 1) * pitch, s);
}
/** An open tart: a crust ring with `filling` inside it and `top` on the filling. */
function tart(ctx, cx, cy, s, filling, top: (ctx, cx, cy, s) => void) {
  const t = foodTones(filling);
  oval(ctx, cx, cy, s * 1.1, s * 0.65, CRUST);
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.1, s * 0.65, 0, 0, TAU); ctx.clip(); ctx.fillStyle = CRUST_DARK; ctx.fillRect(R(cx - s * 1.1), R(cy + s * 0.2), R(s * 2.2), R(s * 0.5)); ctx.restore();
  oval(ctx, cx, cy - s * 0.15, s * 0.8, s * 0.4, t.base);
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.15, s * 0.8, s * 0.4, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy), R(s * 2), R(s * 0.3)); top(ctx, cx, cy, s); ctx.restore();
}
/** `n` rolls side by side, `wrap` outside and `inside` showing at the cut end. */
function rolls(ctx, cx, cy, s, n, wrap, inside) {
  const t = foodTones(wrap), rx = s * 0.42, pitch = s * 0.85, x0 = cx - (n - 1) * pitch / 2;
  for (let i = 0; i < n; i++) {
    oval(ctx, x0 + i * pitch, cy, rx, s * 0.6, t.base);
    ctx.save(); ctx.beginPath(); ctx.ellipse(x0 + i * pitch, cy, rx, s * 0.6, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(x0 + i * pitch), R(cy - s), R(rx), R(s * 2)); ctx.restore();
    ctx.fillStyle = inside; ctx.fillRect(R(x0 + i * pitch - 1), R(cy - s * 0.25), 3, R(s * 0.5));
  }
}
const noTop = () => {};

/** The lattice on a pie: two diagonal strips of crust-dark. */
function lattice(ctx, cx, cy, s) { ctx.fillStyle = CRUST_DARK; ctx.fillRect(R(cx - s * 0.45), R(cy - s * 1.4), 2, R(s * 1.5)); ctx.fillRect(R(cx + s * 0.25), R(cy - s * 1.4), 2, R(s * 1.5)); ctx.fillRect(R(cx - s * 0.9), R(cy - s * 0.85), R(s * 1.8), 2); }

export const DISHES: Record<string, DishDraw> = {
  applePie(ctx, cx, cy, s) {
    pieDish(ctx, cx, cy, s, CRUST, lattice);
    // the apples, seen in the lattice's windows
    flecks(ctx, cx, cy, s, hexOf('apple'), [-0.7, -0.75, 0.05, -1.0, 0.6, -0.7]);
  },
  fishCakes(ctx, cx, cy, s) {
    cakeStack(ctx, cx, cy, s, 2, s * 0.85, s * 0.32, TOAST, (c, x, y) => { flecks(c, x, y, s, BATTER, [-0.4, -0.15, 0.2, -0.2]); });
    ctx.fillStyle = GREEN; ctx.fillRect(R(cx + s * 0.5), R(cy - s * 0.8), 3, 2);   // a sprig
  },
  omelette(ctx, cx, cy, s) {
    // folded: a half-moon of egg with the apple showing at the fold
    const t = foodTones(hexOf('egg'));
    ctx.beginPath(); ctx.moveTo(cx - s * 1.1, cy + s * 0.4); ctx.quadraticCurveTo(cx, cy - s * 1.2, cx + s * 1.1, cy + s * 0.4); ctx.closePath(); inkFill(ctx, CHEESE);
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 1.1), R(cy + s * 0.1), R(s * 2.2), R(s * 0.4)); ctx.restore();
    flecks(ctx, cx, cy, s, hexOf('apple'), [-0.5, 0.05, 0.1, -0.2, 0.55, 0.05]);
    shine(ctx, cx - s * 0.45, cy - s * 0.45);
  },
  honeyLoaf(ctx, cx, cy, s) {
    const t = foodTones(CRUST_DARK);
    ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.6); ctx.lineTo(cx - s, cy - s * 0.2); ctx.quadraticCurveTo(cx, cy - s * 1.3, cx + s, cy - s * 0.2); ctx.lineTo(cx + s, cy + s * 0.6); ctx.closePath(); inkFill(ctx, t.base);
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.2), R(s * 2), R(s * 0.5)); ctx.restore();
    ctx.fillStyle = hexOf('honey'); ctx.fillRect(R(cx - s * 0.6), R(cy - s * 0.75), R(s * 1.2), 2); ctx.fillRect(R(cx + s * 0.1), R(cy - s * 0.55), 2, R(s * 0.5));   // the drizzle
    shine(ctx, cx - s * 0.55, cy - s * 0.55);
  },
  custardTart(ctx, cx, cy, s) {
    tart(ctx, cx, cy, s, CHEESE, (c, x, y) => { flecks(c, x, y, s, CRUST_DARK, [-0.3, -0.35, 0.25, -0.15]); });   // nutmeg
  },
  carrotSoup(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, hexOf('carrot'), (c, x, y) => { c.fillStyle = CREAM; c.fillRect(R(x - s * 0.4), R(y - s * 0.5), R(s * 0.8), 2); });
  },
  griddleCakes(ctx, cx, cy, s) {
    cakeStack(ctx, cx, cy, s, 3, s * 0.9, s * 0.25, BATTER, (c, x, y) => {
      c.fillStyle = hexOf('butter'); c.fillRect(R(x - 2), R(y - 3), 5, 3);                              // the pat
      c.fillStyle = hexOf('honey'); c.fillRect(R(x - s * 0.7), R(y), R(s * 1.4), 2);                    // the syrup
    });
  },
  pearCrumble(ctx, cx, cy, s) {
    pieDish(ctx, cx, cy, s, BATTER, (c, x, y) => { flecks(c, x, y, s, CRUST_DARK, [-0.8, -0.6, -0.35, -1.0, 0.1, -0.7, 0.5, -1.0, 0.8, -0.55]); });
    flecks(ctx, cx, cy, s, hexOf('pear'), [-0.15, -0.35, 0.35, -0.3]);
  },
  peachCobbler(ctx, cx, cy, s) {
    pieDish(ctx, cx, cy, s, hexOf('peach'), (c, x, y) => {
      const t = foodTones(BATTER);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x - s * 0.6 + i * s * 0.6, y - s * 0.9, s * 0.32, 0, TAU); c.fillStyle = t.base; c.fill(); }   // the dough blobs
    });
  },
  avocadoToast(ctx, cx, cy, s) {
    const t = foodTones(TOAST);
    box(ctx, cx - s * 0.9, cy - s * 0.7, s * 1.8, s * 1.3, t.base);
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.9) + 1, R(cy + s * 0.25), R(s * 1.8) - 2, R(s * 0.3));
    const a = foodTones(hexOf('avocado'));
    ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.2, s * 0.65, s * 0.4, 0, 0, TAU); inkFill(ctx, a.base);
    ctx.fillStyle = a.hi; ctx.fillRect(R(cx - s * 0.3), R(cy - s * 0.4), R(s * 0.6), 2);   // the smash
  },
  crabCakes(ctx, cx, cy, s) {
    cakeStack(ctx, cx, cy, s, 2, s * 0.85, s * 0.32, TOAST, (c, x, y) => { flecks(c, x, y, s, hexOf('crab'), [-0.45, -0.15, 0.15, -0.25, 0.5, -0.1]); });
  },
  seaweedRolls(ctx, cx, cy, s) { rolls(ctx, cx, cy, s, 3, SEAWEED, hexOf('rice')); },
  pretzels(ctx, cx, cy, s) {
    // a twist: a wide ring with two small loops under it, all of one brown, salt on the top
    const t = foodTones(CRUST_DARK);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.1, s * 0.95, s * 0.6, 0, 0, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = t.base; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy + s * 0.3); ctx.quadraticCurveTo(cx, cy - s * 0.8, cx + s * 0.8, cy + s * 0.3); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = t.sh; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineCap = 'butt';
    flecks(ctx, cx, cy, s, hexOf('salt'), [-0.7, -0.55, -0.05, -0.85, 0.6, -0.5]);
  },
  strawberryTart(ctx, cx, cy, s) {
    tart(ctx, cx, cy, s, CHEESE, (c, x, y) => { flecks(c, x, y, s, hexOf('strawberry'), [-0.55, -0.35, -0.1, -0.5, 0.35, -0.3]); });
    ctx.fillStyle = GREEN; ctx.fillRect(R(cx - s * 0.1), R(cy - s * 0.65), 2, 2);
  },
  blueberryMuffins(ctx, cx, cy, s) {
    for (let i = 0; i < 2; i++) {
      const x = cx - s * 0.55 + i * s * 1.1, t = foodTones(BATTER);
      box(ctx, x - s * 0.4, cy, s * 0.8, s * 0.6, CREAM);                                                  // the paper case
      ctx.fillStyle = '#D8C093'; ctx.fillRect(R(x - s * 0.15), R(cy) + 1, 1, R(s * 0.6) - 2); ctx.fillRect(R(x + s * 0.15), R(cy) + 1, 1, R(s * 0.6) - 2);
      ctx.beginPath(); ctx.arc(x, cy, s * 0.5, Math.PI, 0); ctx.closePath(); inkFill(ctx, t.base);        // the dome
      flecks(ctx, x, cy, s, hexOf('blueberry'), [-0.3, -0.35, 0.1, -0.2]);
    }
  },
  ricePudding(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, hexOf('rice'), (c, x, y) => { flecks(c, x, y, s, CRUST_DARK, [-0.5, -0.45, 0.1, -0.55, 0.5, -0.4]); });   // the skin, nutmegged
  },
  jacketPotato(ctx, cx, cy, s) {
    const t = foodTones(hexOf('potato'));
    oval(ctx, cx, cy, s * 1.05, s * 0.65, t.base);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, s * 1.05, s * 0.65, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.2), R(s * 2.2), R(s * 0.5)); ctx.restore();
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.45), R(cy - s * 0.3), R(s * 0.9), 3);                   // the cut
    ctx.fillStyle = hexOf('butter'); ctx.fillRect(R(cx - s * 0.2), R(cy - s * 0.45), R(s * 0.4), 3);       // the butter in the middle
  },
  onionSoup(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, TOAST, (c, x, y) => { c.fillStyle = CHEESE; c.fillRect(R(x - s * 0.6), R(y - s * 0.6), R(s * 1.2), 3); });   // the cheese crust
  },
  leekPie(ctx, cx, cy, s) {
    pieDish(ctx, cx, cy, s, CRUST, (c, x, y) => { c.fillStyle = INK; c.fillRect(R(x - 1), R(y - s * 1.3), 3, 3); });   // the lid's steam hole
    flecks(ctx, cx, cy, s, hexOf('leek'), [-0.75, -0.55, 0.65, -0.5]);
  },
  beetrootSoup(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, hexOf('beetroot'), (c, x, y) => { c.fillStyle = CREAM; c.fillRect(R(x - s * 0.2), R(y - s * 0.55), R(s * 0.5), 2); c.fillRect(R(x + s * 0.1), R(y - s * 0.4), 2, 2); });   // the swirl of cream
  },
  pumpkinSoup(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, hexOf('pumpkin'), (c, x, y) => { flecks(c, x, y, s, CREAM, [-0.5, -0.5, 0.35, -0.45]); });   // the seeds
  },
  cabbageRolls(ctx, cx, cy, s) { rolls(ctx, cx, cy, s, 3, hexOf('cabbage'), hexOf('rice')); },
  // ---- the third menu (docs/CONTENT_ROADMAP.md section C) ----
  honeyCakes(ctx, cx, cy, s) {
    cakeStack(ctx, cx, cy, s, 2, s * 0.8, s * 0.3, BATTER, (c, x, y) => {
      c.fillStyle = hexOf('honey'); c.fillRect(R(x - s * 0.6), R(y - 1), R(s * 1.2), 2); c.fillRect(R(x + s * 0.3), R(y), 2, R(s * 0.45));   // the drizzle running off
    });
  },
  troutPie(ctx, cx, cy, s) {
    pieDish(ctx, cx, cy, s, CRUST, (c, x, y) => {
      // the pastry fish on the lid: a small oval and a notch of tail, one shade darker than the crust
      c.fillStyle = CRUST_DARK;
      c.beginPath(); c.ellipse(x - s * 0.1, y - s * 0.95, s * 0.4, s * 0.2, 0, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(x + s * 0.25, y - s * 0.95); c.lineTo(x + s * 0.5, y - s * 1.15); c.lineTo(x + s * 0.5, y - s * 0.75); c.closePath(); c.fill();
    });
    flecks(ctx, cx, cy, s, hexOf('fish'), [-0.85, -0.5, 0.75, -0.45]);
  },
  fishAndChips(ctx, cx, cy, s) {
    // the chips first (behind), a fan of potato-coloured sticks, then the battered fish lying across them
    const p = foodTones(hexOf('potato'));
    ctx.fillStyle = INK;
    for (let i = 0; i < 4; i++) ctx.fillRect(R(cx - s * 0.9 + i * s * 0.45), R(cy - s * 0.9 + (i & 1) * s * 0.2), 5, R(s * 1.2));
    ctx.fillStyle = p.hi;
    for (let i = 0; i < 4; i++) ctx.fillRect(R(cx - s * 0.9 + i * s * 0.45) + 1, R(cy - s * 0.9 + (i & 1) * s * 0.2) + 1, 3, R(s * 1.2) - 2);
    const t = foodTones(TOAST);
    oval(ctx, cx, cy + s * 0.15, s * 1.05, s * 0.45, t.base);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.15, s * 1.05, s * 0.45, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s), R(cy + s * 0.3), R(s * 2.2), R(s * 0.4)); ctx.restore();
    ctx.fillStyle = GREEN; ctx.fillRect(R(cx - s * 1.05), R(cy + s * 0.35), 3, 3); ctx.fillRect(R(cx - s * 0.85), R(cy + s * 0.45), 3, 3);   // the peas
  },
  carrotCake(ctx, cx, cy, s) {
    // a corner slice: a tall wedge of dark sponge under a cap of white icing, carrot showing in the crumb
    const t = foodTones(CRUST_DARK);
    box(ctx, cx - s * 0.75, cy - s * 0.5, s * 1.5, s * 1.1, t.base);
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.75) + 1, R(cy + s * 0.25), R(s * 1.5) - 2, R(s * 0.35));
    box(ctx, cx - s * 0.8, cy - s * 0.85, s * 1.6, s * 0.4, CREAM);
    flecks(ctx, cx, cy, s, hexOf('carrot'), [-0.45, -0.2, 0.15, 0.05, 0.45, -0.25]);
    ctx.fillStyle = hexOf('carrot'); ctx.fillRect(R(cx - 1), R(cy - s * 1.05), 3, 3);   // the marzipan carrot on the icing
    ctx.fillStyle = GREEN; ctx.fillRect(R(cx + 1), R(cy - s * 1.15), 2, 2);
  },
  strawberryMilkshake(ctx, cx, cy, s) {
    // a tall glass, pink to the brim, a cream cap and two straws. Glyph height stays 2.4 s so the bite clip reaches.
    const t = foodTones(hexOf('strawberry'));
    ctx.beginPath(); ctx.moveTo(cx - s * 0.65, cy - s * 1.1); ctx.lineTo(cx + s * 0.65, cy - s * 1.1); ctx.lineTo(cx + s * 0.5, cy + s * 0.6); ctx.lineTo(cx - s * 0.5, cy + s * 0.6); ctx.closePath(); inkFill(ctx, t.hi);
    ctx.save(); ctx.clip(); ctx.fillStyle = t.base; ctx.fillRect(R(cx - s * 0.7), R(cy - s * 0.2), R(s * 1.4), R(s)); ctx.restore();
    oval(ctx, cx, cy - s * 1.1, s * 0.55, s * 0.25, CREAM);
    ctx.fillStyle = INK; ctx.fillRect(R(cx - s * 0.35), R(cy - s * 1.7), 2, R(s * 0.7)); ctx.fillRect(R(cx + s * 0.15), R(cy - s * 1.75), 2, R(s * 0.75));   // the straws
    ctx.fillStyle = hexOf('strawberry'); ctx.fillRect(R(cx - s * 0.35), R(cy - s * 1.6), 2, 2); ctx.fillRect(R(cx + s * 0.15), R(cy - s * 1.5), 2, 2);   // their stripes
    shine(ctx, cx - s * 0.4, cy - s * 0.6);
  },
  coleslaw(ctx, cx, cy, s) {
    // a bowl heaped with shreds: the cabbage's own green in the bowl, carrot threads and a cream dressing over it
    soupBowl(ctx, cx, cy, s, hexOf('cabbage'), (c, x, y) => {
      c.fillStyle = hexOf('carrot'); c.fillRect(R(x - s * 0.6), R(y - s * 0.5), R(s * 0.35), 2); c.fillRect(R(x + s * 0.2), R(y - s * 0.4), R(s * 0.4), 2);
      c.fillStyle = CREAM; c.fillRect(R(x - s * 0.2), R(y - s * 0.6), R(s * 0.3), 2);
    });
  },
  bakedApples(ctx, cx, cy, s) {
    // two apples in an enamel dish, gone soft and wrinkled at the shoulder, honey pooled in the cored middle
    box(ctx, cx - s, cy - s * 0.1, s * 2, s * 0.7, BOWL);
    ctx.fillStyle = BOWL_DARK; ctx.fillRect(R(cx - s) + 1, R(cy + s * 0.3), R(s * 2) - 2, R(s * 0.3));
    const t = foodTones(hexOf('apple'));
    for (let i = 0; i < 2; i++) {
      const x = cx - s * 0.5 + i * s;
      oval(ctx, x, cy - s * 0.35, s * 0.48, s * 0.5, t.base);
      ctx.save(); ctx.beginPath(); ctx.ellipse(x, cy - s * 0.35, s * 0.48, s * 0.5, 0, 0, TAU); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(x - s * 0.5), R(cy - s * 0.15), R(s), R(s * 0.4)); ctx.restore();
      ctx.fillStyle = hexOf('honey'); ctx.fillRect(R(x - 2), R(cy - s * 0.85), 4, 3);   // the honey in the core
    }
  },
  pearsInHoney(ctx, cx, cy, s) {
    // two pear halves lying in a pool of honey: a small round over a bigger one, cut face up, the pool over the rim
    soupBowl(ctx, cx, cy, s, hexOf('honey'), (c, x, y) => {
      const t = foodTones(hexOf('pear'));
      for (let i = 0; i < 2; i++) {
        const px = x - s * 0.45 + i * s * 0.9;
        c.fillStyle = t.hi;
        c.beginPath(); c.ellipse(px, y - s * 0.4, s * 0.3, s * 0.2, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(px - s * 0.15, y - s * 0.55, s * 0.14, 0, TAU); c.fill();
        c.fillStyle = CRUST_DARK; c.fillRect(R(px), R(y - s * 0.45), 2, 2);   // the pip
      }
    });
  },
  crabChowder(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, CREAM, (c, x, y) => { flecks(c, x, y, s, hexOf('crab'), [-0.5, -0.5, 0.1, -0.6, 0.45, -0.4]); flecks(c, x, y, s, hexOf('potato'), [-0.15, -0.35, 0.3, -0.25]); });
  },
  pumpkinPie(ctx, cx, cy, s) {
    tart(ctx, cx, cy, s, hexOf('pumpkin'), (c, x, y) => { c.fillStyle = CREAM; c.beginPath(); c.arc(x + s * 0.35, y - s * 0.25, s * 0.18, 0, TAU); c.fill(); });   // the dollop
  },
  leekPotatoSoup(ctx, cx, cy, s) {
    soupBowl(ctx, cx, cy, s, PALE_LEEK, (c, x, y) => { flecks(c, x, y, s, hexOf('leek'), [-0.55, -0.45, 0.05, -0.55, 0.5, -0.4]); c.fillStyle = CREAM; c.fillRect(R(x - s * 0.15), R(y - s * 0.35), R(s * 0.4), 2); });
  },
  eggFriedRice(ctx, cx, cy, s) {
    // a mound on the plate: rice-white, with the egg's yellow and the leek's green through it
    const t = foodTones(hexOf('rice'));
    ctx.beginPath(); ctx.moveTo(cx - s * 1.1, cy + s * 0.6); ctx.quadraticCurveTo(cx, cy - s * 1.2, cx + s * 1.1, cy + s * 0.6); ctx.closePath(); inkFill(ctx, t.base);
    ctx.save(); ctx.clip(); ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 1.1), R(cy + s * 0.25), R(s * 2.2), R(s * 0.4)); ctx.restore();
    flecks(ctx, cx, cy, s, CHEESE, [-0.6, 0.05, -0.1, -0.5, 0.45, -0.1, 0.2, 0.25]);
    flecks(ctx, cx, cy, s, hexOf('leek'), [-0.35, -0.2, 0.25, -0.4, 0.65, 0.2]);
  },
  blueberryPancakes(ctx, cx, cy, s) {
    cakeStack(ctx, cx, cy, s, 3, s * 0.9, s * 0.25, BATTER, (c, x, y) => { c.fillStyle = hexOf('butter'); c.fillRect(R(x - 2), R(y - 3), 5, 3); });
    // the berries INSIDE, showing at the edges of every cake
    flecks(ctx, cx, cy, s, hexOf('blueberry'), [-0.7, 0.35, 0.5, 0.3, -0.5, -0.05, 0.7, -0.1, -0.2, -0.45]);
  },
  avocadoCrabSalad(ctx, cx, cy, s) {
    // a bed of leaves with avocado slices fanned over it, the crab in pink flecks, salt on top
    const g = foodTones(GREEN);
    oval(ctx, cx, cy + s * 0.1, s * 1.1, s * 0.5, g.base);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.1, s * 1.1, s * 0.5, 0, 0, TAU); ctx.clip(); ctx.fillStyle = g.sh; ctx.fillRect(R(cx - s * 1.1), R(cy + s * 0.3), R(s * 2.2), R(s * 0.4)); ctx.restore();
    const a = foodTones(hexOf('avocado'));
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx - s * 0.5 + i * s * 0.5, cy - s * 0.15, s * 0.22, s * 0.4, 0, 0, TAU); inkFill(ctx, a.hi); }
    flecks(ctx, cx, cy, s, hexOf('crab'), [-0.8, 0.1, 0.75, 0.15, 0.05, 0.35]);
    flecks(ctx, cx, cy, s, hexOf('salt'), [-0.25, -0.5, 0.3, -0.55]);
  },
  seaweedCrisps(ctx, cx, cy, s) {
    // a heap of dark flakes, each an outlined leaf lying at its own angle, salt sparkling on them
    const t = foodTones(SEAWEED);
    const leaves = [[-0.6, 0.2, 0.5, 0.3], [0.5, 0.15, 0.45, 0.32], [-0.1, -0.3, 0.55, 0.3], [0.15, 0.3, 0.4, 0.25]];
    for (const l of leaves) { ctx.beginPath(); ctx.ellipse(cx + l[0] * s, cy + l[1] * s, l[2] * s, l[3] * s, 0, 0, TAU); inkFill(ctx, t.base); ctx.fillStyle = t.sh; ctx.fillRect(R(cx + l[0] * s - l[2] * s * 0.5), R(cy + l[1] * s), R(l[2] * s), 2); }
    flecks(ctx, cx, cy, s, hexOf('salt'), [-0.55, 0.05, -0.05, -0.45, 0.45, 0.0, 0.2, 0.25]);
  },
  onionTart(ctx, cx, cy, s) {
    tart(ctx, cx, cy, s, hexOf('onion'), (c, x, y) => {
      // the onion rings on the custard: two small ink circles, open in the middle
      c.strokeStyle = CRUST_DARK; c.lineWidth = 2;
      c.beginPath(); c.arc(x - s * 0.3, y - s * 0.2, s * 0.16, 0, TAU); c.stroke();
      c.beginPath(); c.arc(x + s * 0.3, y - s * 0.1, s * 0.16, 0, TAU); c.stroke();
    });
  },
  beetrootBrownies(ctx, cx, cy, s) {
    // two dark squares, one leaning on the other, the beetroot showing as a crimson fleck in the crumb
    const t = foodTones(BROWNIE);
    box(ctx, cx - s * 0.95, cy - s * 0.2, s * 0.95, s * 0.8, t.base);
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.95) + 1, R(cy + s * 0.3), R(s * 0.95) - 2, R(s * 0.3));
    box(ctx, cx - s * 0.1, cy - s * 0.55, s * 0.95, s * 0.8, t.base);
    ctx.fillStyle = t.sh; ctx.fillRect(R(cx - s * 0.1) + 1, R(cy - s * 0.05), R(s * 0.95) - 2, R(s * 0.3));
    flecks(ctx, cx, cy, s, hexOf('beetroot'), [-0.65, 0.05, 0.2, -0.35, 0.55, -0.2]);
    shine(ctx, cx + s * 0.05, cy - s * 0.4);
  },
  honeyToffee(ctx, cx, cy, s) {
    // three toffees in a row on a square of paper, each with a shine, salt on the middle one
    box(ctx, cx - s * 1.1, cy - s * 0.3, s * 2.2, s * 0.9, CREAM);
    const t = foodTones(hexOf('honey'));
    for (let i = 0; i < 3; i++) {
      const x = cx - s * 0.7 + i * s * 0.7;
      box(ctx, x - s * 0.28, cy - s * 0.55, s * 0.56, s * 0.56, t.base);
      ctx.fillStyle = t.sh; ctx.fillRect(R(x - s * 0.28) + 1, R(cy - s * 0.2), R(s * 0.56) - 2, R(s * 0.2));
      shine(ctx, x - s * 0.2, cy - s * 0.48);
    }
    flecks(ctx, cx, cy, s, hexOf('salt'), [-0.1, -0.5, 0.1, -0.35]);
  },
};

/**
 * Draw the dish for ORDERS entry `id` (an unknown id gets the pie). `bites` 0..3 is how much of it has been eaten:
 * the right side is clipped away a third at a time behind a scalloped bite edge, and at 3 nothing is left.
 */
export function drawDish(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, s: number, bites = 0): void {
  if (bites >= 3) return;
  const f = DISHES[id] || DISHES.applePie;
  if (bites <= 0) { f(ctx, cx, cy, s); return; }
  // the widest glyph spans 2.4 s, so a bite takes a third of THAT, and the last third left is a real wedge
  const left = cx - s * 1.2, top = cy - s * 1.8, h = s * 3, edge = left + s * 2.4 * (1 - bites / 3), r = s * 0.45;
  ctx.save(); ctx.beginPath();
  ctx.moveTo(left, top); ctx.lineTo(edge, top);
  ctx.arc(edge, cy - s * 0.55, r, -Math.PI / 2, Math.PI / 2, true);   // two bites out of the edge, bulging inward
  ctx.arc(edge, cy + s * 0.4, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(edge, top + h); ctx.lineTo(left, top + h); ctx.closePath(); ctx.clip();
  f(ctx, cx, cy, s);
  ctx.restore();
}
