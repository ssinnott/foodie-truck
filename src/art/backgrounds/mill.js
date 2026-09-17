// Windle Mill, painted once (docs/ART_STYLE.md section 1, section 7 "interiors invert"; docs/GDD.md section 5).
//
// Inside the timber tower, one floor under the grindstone. An INTERIOR, so the rule flips: the room is dark warm
// oak and board, and the flour, the sacks and the cast are the lightest, warmest things in the frame. Three layers
// with seeds from the mill block 180..189, every one blitted at offset 0 (a one-screen scene has no parallax):
//   wall   rows 0..292   boarded tower wall, four oak posts and their braces, the bressummer beam under the
//                        grindstone floor with the sack-hoist trap cut through it, the high window and the shaft of
//                        light that falls from it, the mill's own sacks stacked at the left end, tools between chutes
//   floor  rows 292..360  the plank floor the crew walks on, back strip dark, walk band free of scatter
//   beam   rows 0..26     the top tie beam and the ceiling boards, blitted LAST so the gear's shafts run up into it
// Nothing here animates: the chutes, the pouring flour, the spur wheel, the sail in the window, the motes and the
// cast are the screen's per-frame marks (millProps.js).
//
// The value ladder this room is built on (ART_STYLE 0.1 / 7: the plane behind the critters' torsos must be at least
// 25 % off the lightest fur, Barley's wool #F1E4C8 at L .90). Measured: timber L .24 (73 % off), the lit shaft over
// it L .33 (63 % off), the stacked hessian L .46 (48 % off), the plank floor L .40 (56 % off, and comfortably over
// the L .30 floor ART_STYLE section 1 owes Barley's hooves and Chicory's dark paws). Nothing in here is a player
// colour, and the scene's one signal, SIGNAL.mill gold, appears NOWHERE in the backdrop: it belongs to the chute
// that is pouring NOW and to nothing else (ART_STYLE section 4).
import { makeLayer, boxOutlined, boxShaded, vGradient, INK, VIEW_W, VIEW_H } from '../layers.js';
import { mix } from '../palettes.js';
import { PLUM } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The mill's muted constants (ten: the eight the room is built from plus the two flour tones every prop in
 * millProps.js paints with, so the sack in a paw and the sack on the stack are the same material).
 */
export const MILL = Object.freeze({
  /** The boarded tower wall: the dark plane the whole cast is read against. */
  timber: '#4A3A2C',
  /** Board seams, the deep side of every post, the trap's opening: the wall's one darker step. */
  seam: '#33281E',
  /** The oak frame: posts, braces, the bressummer beam, the chutes' bodies. */
  beam: '#6B543A',
  /** The plank floor. L .40, so dark hooves keep their contact and the cool plum shadow still reads on it. */
  plank: '#7A6144',
  plankDark: '#5C4831',
  /** Stacked sacks and the chutes' canvas sleeves: hessian in shadow, a long way under lit flour. */
  hessian: '#8A7350',
  /** Hoops, hooks, the hoist chain, the gear rims. The room's only cool tone, and it is never a big block. */
  iron: '#6E6A66',
  /** Flour off the sack: the heap an uncaught pour builds, the burst cloud, the base the stream is shaded from. */
  dust: '#BFA87E',
  /**
   * Lit flour: the bands travelling down a pouring chute, the motes in the shaft, the dust on every beam. At L .90
   * this is Barley's wool to the pixel, which is exactly the point of an interior (ART_STYLE 7) and also its one
   * hazard - a cream column falling behind a cream sheep is a sheep-shaped hole - so nothing carries it in BULK.
   * The falling column's body is a step below `dust` (millProps.js POUR_CORE, L .62, 31 % under the wool) and this
   * appears in it only as 3 px bands; the sack in the paws and the sacks on the cart carry their own lighter
   * `PACKED` tone inside their own 1 px warm-ink line, which is what ART_STYLE 0.2 says a boundary is.
   */
  flour: '#EFE4CA',
  /** The only daylight in the room: the sky through the high window, the map's own dusk peach. */
  sky: '#F4C9A0',
});
/** Seed block 180..189 belongs to the mill (ART_STYLE section 7). */
const SEED = 180;

/**
 * Row bands (screen y). `joist`..`chuteTop` is the bressummer beam the chutes hang out of; `mouth` is the spout's
 * lip and the row the flour column starts at; `floor` is where the wall meets the planks; `pile` is the row an
 * uncaught pour lands on, just behind the back lane's feet; `feet` is the FRONT lane's feet line.
 *
 * The one measurement the whole layout is pinned to: the back lane's feet are at `feet` - 3 * LANE_GAP = 300 (the
 * screen's lanes are the orchard's 8 px apart), the tallest crown in the cast is Chicory's ears (+22 over a 56 px
 * body), so the back lane's name plate tops out around row 208. Four seats converged on one spout stack four plates
 * and four tags, and screens/mill.js holds that column to TAG_CEIL 190 - past it a tag steps sideways rather than
 * climbing. `mouth` at 170 (its ink to 172) therefore keeps 18 rows of clear air between the lowest thing a chute
 * draws and the highest thing a seat draws: nothing important is ever behind a spout, and no paper is ever in
 * front of one.
 */
export const ROWS = Object.freeze({
  joist: 96, chuteTop: 114, mouth: 170, floor: 292, pile: 296, feet: 324, bottom: VIEW_H,
});

/**
 * The four chutes' centre x. Spread on one pitch so a party of one, two, three or four can be laid out symmetrically
 * from the same table (screens/mill.js shifts a small party to the middle, the way the pond shifts its bank spots).
 *
 * The pitch is the scene's real difficulty dial. 140 px between two chutes, minus the 18 px catch half-width at each
 * end, is a 104 px walk; at the screen's 2.4 px/frame that is 44 frames, and a chute telegraphs for 24 before it
 * pours, so a solo player who leaves on the telegraph arrives 20 frames into a 110-frame pour with 90 frames left -
 * far more than the 54 a full sack costs. The full-width run (110 -> 530) is 175 frames and is NOT meant to be
 * made: that is what keeps a four-chute room worth having more than one player in.
 */
export const CHUTE_X = Object.freeze([110, 250, 390, 530]);
export const CHUTE_PITCH = 140;

/** The high window: sky, and the one thing in the room that moves on its own (a sail sweeps past it, millProps.js). */
export const WINDOW = Object.freeze({ x: 494, y: 32, w: 56, h: 46 });
/**
 * The shaft of light, as the quad the motes hang in: it leaves the SACK TRAP (the gap cut in the bressummer beam
 * under the window), not the window itself, because a beam is solid and light does not cross it. Top edge at
 * `chuteTop`, bottom edge on the floor, leaning down-left the way a high south window throws it.
 */
export const SHAFT = Object.freeze({ yTop: ROWS.chuteTop, yBot: ROWS.floor, x0t: 476, x1t: 556, x0b: 352, x1b: 472 });
/** The sack trap cut through the beam: the hoist chain drops through it and the light comes with it. */
const TRAP_X = 472, TRAP_W = 88;
/** The four oak posts, placed BETWEEN the chutes (CHUTE_X) so no chute ever hangs on a post. */
const POST_X = Object.freeze([30, 190, 450, 610]);
const POST_W = 14;
/**
 * Where the mill's own stock is piled: against the LEFT wall only. There were two piles framing the room, and the
 * right one had to go when the crew's cart was parked in the right corner (screens/mill.js BARROW_X) - a cart
 * standing in a pile of sacks was a jumble of hessian nobody could count. The two ends now say different things:
 * stock on the left, the party's own score on the right.
 */
const STACK_X = Object.freeze([10]);
/** Layer heights. */
const WALL_H = ROWS.floor, FLOOR_H = VIEW_H - ROWS.floor, BEAM_H = 26;

/**
 * One hessian sack lying on a stack: an inked rounded blob with one shadow band, a dusted lit edge and a KNOT (a
 * little inked ear pinched out of its top corner). Round 1 put a flat black rectangle on top of each one for the
 * neck and a pyramid of them read as brown eggs with dots; a knot pulled to one side is what says "tied sack".
 */
function stackSack(g, x, y, w, h, tone) {
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 + 1, h / 2 + 1, 0, 0, TAU); g.fill();
  g.fillStyle = tone;
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); g.clip();
  g.fillStyle = mix(tone, PLUM.deep, 0.35); g.fillRect(x, y + h * 0.55, w, h);
  g.fillStyle = mix(tone, MILL.flour, 0.3); g.fillRect(R(x + w * 0.2), y + 1, R(w * 0.4), 2);
  g.restore();
  const kx = R(x + w * 0.66), ky = R(y + 1);
  g.fillStyle = INK; g.beginPath(); g.moveTo(kx - 4, ky + 3); g.lineTo(kx + 1, ky - 5); g.lineTo(kx + 5, ky + 2); g.closePath(); g.fill();
  g.fillStyle = mix(tone, MILL.flour, 0.2); g.beginPath(); g.moveTo(kx - 2, ky + 2); g.lineTo(kx + 1, ky - 3); g.lineTo(kx + 3, ky + 2); g.closePath(); g.fill();
}

/**
 * The tower wall.
 *
 * Boards run VERTICALLY (a mill tower is weatherboarded up the frame, and vertical seams also stop the widest flat
 * plane in the game from reading as one 640x292 rectangle). Everything hung on it lives in rows 114..170 - the band
 * between the beam and the chutes' mouths - because rows 196..292 are where the cast's tags, plates, heads and
 * torsos are and ART_STYLE section 7 wants that plane quiet.
 */
function paintWall(g, w, h, rnd) {
  g.fillStyle = MILL.timber; g.fillRect(0, 0, w, h);
  g.fillStyle = MILL.seam;
  for (let x = 8; x < w; x += 16) g.fillRect(x, 0, 1, h);                                        // board seams
  for (let x = 0; x < w; x += 16) {                                                              // a darker board here and there
    if (rnd() < 0.28) { g.fillStyle = mix(MILL.timber, MILL.seam, 0.5); g.fillRect(x, 0, 8, h); g.fillStyle = MILL.seam; }
  }
  for (let i = 0; i < 70; i++) {                                                                 // grain: 1 px runs, dark only
    const gx = R(rnd() * w), gy = R(rnd() * h);
    g.fillStyle = mix(MILL.timber, MILL.seam, 0.6); g.fillRect(gx, gy, 1, 6 + R(rnd() * 14));
  }

  // the high window: a 2 px ink frame, a dusk sky, a wood sill, one ink mullion. The sail sweeping past it is a
  // per-frame mark, so nothing here may be drawn over the opening the screen clips that sweep to.
  // Round 1 was one pale rectangle with a single mullion and it read as a blank poster nailed to the wall. It is
  // now a four-pane opening in a timber reveal with a strip of the lane in the bottom pane, so the eye reads THROUGH
  // it: the two ink bars cross, the hills give it a horizon, and the sails sweeping past are then obviously outside.
  const W = WINDOW;
  boxShaded(g, W.x - 6, W.y - 6, W.w + 12, W.h + 14, MILL.beam, mix(MILL.beam, PLUM.deep, 0.45), INK, 2, 0.16);
  g.fillStyle = INK; g.fillRect(W.x - 2, W.y - 2, W.w + 4, W.h + 4);
  vGradient(g, W.x, W.y, W.w, W.h, [[0, mix(MILL.sky, '#FBE3C4', 0.75)], [1, MILL.sky]]);
  g.fillStyle = mix(MILL.sky, PLUM.shadow, 0.34);                                                // the lane's tree line
  for (let x = W.x - 4; x < W.x + W.w + 4; x += 9) { g.beginPath(); g.arc(x, W.y + W.h - 9, 5 + rnd() * 4, 0, TAU); g.fill(); }
  g.fillRect(W.x, W.y + W.h - 8, W.w, 8);
  g.fillStyle = mix(MILL.sky, '#8FA05A', 0.7); g.fillRect(W.x, W.y + W.h - 4, W.w, 4);            // and the meadow under it
  g.fillStyle = INK;
  g.fillRect(W.x + R(W.w / 2) - 1, W.y, 2, W.h); g.fillRect(W.x, W.y + R(W.h / 2) - 1, W.w, 2);
  boxShaded(g, W.x - 8, W.y + W.h + 4, W.w + 16, 5, MILL.beam, mix(MILL.beam, PLUM.deep, 0.45), INK, 1, 0.5);

  // the shaft of light: two flat steps, no gradient and no line, the way the coop's floor pools are painted. It
  // leaves the trap, not the window, so it never crosses the beam.
  const S = SHAFT;
  g.fillStyle = mix(MILL.timber, MILL.sky, 0.16);
  g.beginPath(); g.moveTo(S.x0t, S.yTop); g.lineTo(S.x1t, S.yTop); g.lineTo(S.x1b, S.yBot); g.lineTo(S.x0b, S.yBot); g.closePath(); g.fill();
  g.fillStyle = mix(MILL.timber, MILL.sky, 0.26);
  g.beginPath(); g.moveTo(S.x0t + 22, S.yTop); g.lineTo(S.x1t - 12, S.yTop); g.lineTo(S.x1b - 18, S.yBot); g.lineTo(S.x0b + 34, S.yBot); g.closePath(); g.fill();

  // the frame: four oak posts, each with its own ink and a shadow face, and a brace up to the beam
  const beamDark = mix(MILL.beam, PLUM.deep, 0.45);
  for (let i = 0; i < POST_X.length; i++) {
    const x = POST_X[i];
    boxOutlined(g, x, 0, POST_W, h, MILL.beam, INK, 1);
    g.fillStyle = beamDark; g.fillRect(x + POST_W - 5, 0, 5, h);
    g.fillStyle = mix(MILL.beam, MILL.flour, 0.18); g.fillRect(x + 1, 0, 3, h);                  // the lit face, top-left light
    const dir = i < 2 ? 1 : -1, bx = x + (dir > 0 ? POST_W : 0);
    g.fillStyle = INK;                                                                            // the knee brace up to the beam
    g.beginPath(); g.moveTo(bx, ROWS.joist + 4); g.lineTo(bx + dir * 42, ROWS.joist + 4); g.lineTo(bx, ROWS.joist + 46); g.closePath(); g.fill();
    g.fillStyle = MILL.beam;
    g.beginPath(); g.moveTo(bx, ROWS.joist + 6); g.lineTo(bx + dir * 36, ROWS.joist + 6); g.lineTo(bx, ROWS.joist + 42); g.closePath(); g.fill();
  }

  // the bressummer beam (the grindstone floor's edge) with the sack trap cut through it, and the hoist chain and
  // hook hanging down out of the opening. The trap is what lets the shaft exist; the hook is what put those sacks
  // against the wall.
  boxShaded(g, -2, ROWS.joist, TRAP_X + 2, ROWS.chuteTop - ROWS.joist, MILL.beam, beamDark, INK, 2, 0.45);
  boxShaded(g, TRAP_X + TRAP_W, ROWS.joist, w - TRAP_X - TRAP_W + 2, ROWS.chuteTop - ROWS.joist, MILL.beam, beamDark, INK, 2, 0.45);
  g.fillStyle = MILL.seam; g.fillRect(TRAP_X, ROWS.joist - 2, TRAP_W, ROWS.chuteTop - ROWS.joist + 2);
  g.fillStyle = INK; g.fillRect(TRAP_X + 40, ROWS.joist, 3, 26);                                  // the chain
  for (let y = ROWS.joist + 4; y < ROWS.joist + 26; y += 5) { g.fillStyle = MILL.iron; g.fillRect(TRAP_X + 41, y, 1, 3); }
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(TRAP_X + 41, ROWS.joist + 32, 6, 0.2, Math.PI * 1.1); g.stroke();
  g.strokeStyle = MILL.iron; g.lineWidth = 2; g.beginPath(); g.arc(TRAP_X + 41, ROWS.joist + 32, 6, 0.2, Math.PI * 1.1); g.stroke();
  g.fillStyle = mix(MILL.beam, MILL.flour, 0.4); g.fillRect(0, ROWS.joist + 1, w, 2);             // flour dusted along the beam's top

  // tools on the wall, hung BETWEEN the chutes in the one clear band (rows 118..168): a flour scoop, a beam
  // balance, a besom. All of them dark on dark - they give the wall structure without competing with the cast.
  const toolDark = mix(MILL.beam, PLUM.deep, 0.3);
  boxOutlined(g, 172, 122, 4, 30, toolDark, INK, 1);                                              // scoop handle
  boxShaded(g, 162, 150, 24, 16, MILL.hessian, mix(MILL.hessian, PLUM.deep, 0.4), INK, 1, 0.4);   // scoop pan
  g.fillStyle = mix(MILL.hessian, MILL.flour, 0.45); g.fillRect(164, 150, 20, 3);
  g.fillStyle = INK; g.fillRect(318, 120, 3, 14);                                                 // the balance's stem
  boxOutlined(g, 292, 132, 56, 4, MILL.iron, INK, 1);                                             // its beam
  for (const px of [296, 340]) {
    g.fillStyle = INK; g.fillRect(px + 3, 136, 2, 10);
    boxOutlined(g, px, 146, 10, 4, MILL.iron, INK, 1);
  }
  boxOutlined(g, 462, 120, 4, 34, toolDark, INK, 1);                                              // besom handle
  g.fillStyle = INK; g.beginPath(); g.moveTo(456, 152); g.lineTo(474, 152); g.lineTo(478, 172); g.lineTo(452, 172); g.closePath(); g.fill();
  g.fillStyle = MILL.hessian; g.beginPath(); g.moveTo(457, 153); g.lineTo(473, 153); g.lineTo(476, 170); g.lineTo(454, 170); g.closePath(); g.fill();
  g.fillStyle = mix(MILL.hessian, PLUM.deep, 0.4); for (let k = 0; k < 5; k++) g.fillRect(457 + k * 4, 156, 1, 14);

  // the mill's own stock, piled against the left wall: a contact shadow, then three courses leaning on it. The pile
  // stops at row 232 (a clear 40 rows under the lowest chute mouth) and at x 76, which is outside chute 1's catch
  // zone AND outside the widest heap an uncaught pour builds there, so nothing pale ever stands where a seat does.
  const floorSh = mix(MILL.timber, PLUM.deep, 0.4);
  for (let i = 0; i < STACK_X.length; i++) {
    const x0 = STACK_X[i];
    g.fillStyle = floorSh; g.beginPath(); g.ellipse(x0 + 32, ROWS.floor - 4, 42, 6, 0, 0, TAU); g.fill();
    for (let row = 0; row < 3; row++) {
      const n = 3 - row, y = ROWS.floor - 16 - row * 18;
      for (let k = 0; k < n; k++) {
        const sx = x0 + row * 11 + k * 22 + R(rnd() * 3);
        stackSack(g, sx, y, 22, 16, row === 2 ? mix(MILL.hessian, MILL.flour, 0.18) : MILL.hessian);
      }
    }
  }
}

/**
 * The plank floor.
 *
 * Boards run left to right with the seams across them, a dark strip where the wall meets the floor, and flour
 * ground into the grain. The WALK BAND - screen rows 292..330, the whole top half of the floor - carries no scatter
 * at all: the seats' feet run 300..324 and their contact shadows reach about 330, and ART_STYLE section 7 wants
 * that band bare, because a pale fleck under a boot is a dropped pinch of flour the player will try to pick up. The
 * scatter therefore only lands on the 30 rows of apron in front of the cast.
 */
function paintFloor(g, w, h, rnd) {
  g.fillStyle = MILL.plank; g.fillRect(0, 0, w, h);
  g.fillStyle = INK; g.fillRect(0, 0, w, 2);
  g.fillStyle = MILL.plankDark; g.fillRect(0, 2, w, 8);                                           // the wall's shadow on the boards
  for (let y = 14; y < h; y += 11) { g.fillStyle = mix(MILL.plank, MILL.plankDark, 0.8); g.fillRect(0, y, w, 1); }
  for (let y = 14; y < h; y += 11) {                                                              // plank ends, staggered
    for (let x = R(rnd() * 90); x < w; x += 110 + R(rnd() * 90)) { g.fillStyle = MILL.plankDark; g.fillRect(x, y - 10, 2, 10); }
  }
  const scuff = mix(MILL.plank, MILL.plankDark, 0.55), dusted = mix(MILL.plank, MILL.flour, 0.3);
  const WALK_TO = 38;                                                                             // layer rows 0..38 = screen 292..330
  for (let i = 0; i < 90; i++) {
    const x = R(rnd() * w), y = 3 + R(rnd() * (h - 6));
    if (y < WALK_TO) continue;
    g.fillStyle = scuff; g.fillRect(x, y, 6 + R(rnd() * 12), 1);
  }
  for (let i = 0; i < 60; i++) {
    const x = R(rnd() * w), y = 3 + R(rnd() * (h - 6));
    if (y < WALK_TO) continue;
    g.fillStyle = dusted; g.fillRect(x, y, 2 + R(rnd() * 3), 1);
  }
}

/** The top tie beam and the ceiling boards, blitted over everything so the spur wheel's shafts run up into them. */
function paintBeam(g, w, h) {
  g.fillStyle = MILL.seam; g.fillRect(0, 0, w, h - 10);
  for (let x = 0; x < w; x += 22) { g.fillStyle = mix(MILL.seam, INK, 0.5); g.fillRect(x, 0, 1, h - 10); }
  boxShaded(g, -2, h - 14, w + 4, 14, MILL.beam, mix(MILL.beam, PLUM.deep, 0.45), INK, 2, 0.4);
  g.fillStyle = mix(MILL.beam, MILL.flour, 0.4); g.fillRect(0, h - 13, w, 2);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { wall, floor, beam } with the screen y each is blitted at. */
export function millLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    wall: { L: makeLayer(VIEW_W, WALL_H, paintWall, SEED), y: 0 },
    floor: { L: makeLayer(VIEW_W, FLOOR_H, paintFloor, SEED + 1), y: ROWS.floor },
    beam: { L: makeLayer(VIEW_W, BEAM_H, paintBeam, SEED + 2), y: 0 },
  };
  return LAYERS;
}
