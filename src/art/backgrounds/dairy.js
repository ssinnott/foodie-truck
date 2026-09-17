// Buttercup Dairy, painted once (docs/ART_STYLE.md section 1, section 7; docs/GDD.md section 5). The milking byre of
// a countryside farm on a warm afternoon, side view. Three layers with seeds from the dairy block 170..179, each
// blitted at offset 0 by the screen (there is no camera in here, so no parallax factors are wired):
//   wall   rows 0..232    the slate eave, the HAYLOFT with the hatch the afternoon comes in through and the
//                         swallows' nest under it, the oak bressummer, the rubble-stone byre wall, its hung tack
//                         and the CHURN RACK the full pails go onto
//   floor  rows 232..344  warm packed byre floor: a dark strip at the wall's foot, the strawed standing the cows
//                         occupy, then the SWEPT band the stools, the pails, the chevron tags and the spills live on
//   near   rows 344..360  trodden straw at the byre door, in front of everything and below every foot
// Nothing here animates: the cows, the crew, the pails, the jets, the churns and the one swallow are the screen's
// per-frame marks (src/art/dairyProps.js).
//
// WHY WARM. The coop already owns the cool interior - grey-green boards over a blue-grey earth floor (L .32) with a
// gold sparkle on it - and a second dark-and-cool room would have read as the same building twice. This one is built
// the other way up: warm rubble stone, oak, straw and a packed brown floor, lit by a hay hatch instead of a window,
// so the two interiors share only their ink. The one cool object in the whole scene is the tin pail, and that is on
// purpose: the milk in it has to be the brightest thing in the frame (docs/ART_STYLE.md section 7, interiors).
import { makeLayer, vGradient, boxShaded, boxOutlined, INK, VIEW_W, VIEW_H } from '../layers.js';
import { mix } from '../palettes.js';
import { PLUM, UI } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;

/**
 * The dairy's muted constants (nine scene tones plus the two shared plum shadows). The ONE saturated colour in the
 * scene is SIGNAL.dairy (the pump chevron, the jet and the full pail's ring) and the ONE danger colour is
 * SIGNAL.hot (the cow about to kick); neither appears anywhere in this file, because ART_STYLE section 4 bans a
 * signal colour as decor - a mint fleck painted into this wall would be a chevron that never lights.
 *
 * VALUES, round 2. Luminance here is the guide's own (0.299r + 0.587g + 0.114b) / 255, the measure the cast table
 * quotes. The first pass painted the byre as a bright room - a limewash at L .79 over honey stone at .62 - and the
 * capture came back washed out and, worse, wrong by the book: ART_STYLE section 7 says interiors invert, the room
 * dark and the cast and the food the lightest warmest things in it. The whole building came down a ladder:
 *   slate .26  <  floorDark .29  <  floor .31  <  stone .43  <  straw .51  <  lime .54  <  strawLight .65
 * against the cast's .34...90 and the milk's .97, which is now by a clear margin the brightest thing in the frame.
 * The plane behind the crew's torsos (rows 292..320) is `floor` at .31, clearing Barley's wool by 0.66; the plane
 * behind their HEADS is the straw bedding at .51, clearing it by 0.44. Both are well past the 25 % section 7 asks.
 */
export const DAIRY = Object.freeze({
  /** The slate eave and the roof void under it: the one cool-plum note, and the darkest thing in the room. */
  slate: '#453F4C', slateLit: '#655C70',
  /** The stone wall, and the paler pool the hatch light lays across it and the boards of the loft. */
  stone: '#806A4B', lime: '#A08862', stoneDark: '#645237',
  /** Oak. `beam` is the structure - far, dark, part of the room; `oak` is furniture a player looks AT (the
   *  stool), and it is two steps up so it clears the byre floor (L .43 against .31) instead of sinking into it. */
  beam: '#5C3E22', beamDark: '#382614', oak: '#9A6234', oakDark: '#6B4220',
  /** The byre floor and the straw bedded over it (the coop's straw, a byre's worth of shade darker). */
  floor: '#5E4C33', floorDark: '#493A27', straw: '#A07C42', strawLight: '#C9A360',
  /** What the hay hatch shows: afternoon sky over a strip of meadow - the one bright hole in a dim room. */
  sky: '#FBE3C4', meadow: '#8FA05A',
});
/** Seed block 170..179 belongs to the dairy (ART_STYLE section 7). */
const SEED = 170;

/**
 * Row bands (screen y). `feet` is the crew's floor line; each cow stands a few rows behind it, worked out from its
 * own milker's arm (screens/dairy.js). `loft` is the underside of the hayloft, `rack` the top of the plank the
 * churns stand on, `floor` where the wall meets the byre floor and `standing` the front edge of the bedded straw.
 */
export const ROWS = Object.freeze({
  eave: 22, loft: 92, beamY: 92, rack: 180, floor: 232, back: 250, standing: 292, feet: 320, lip: 344, bottom: VIEW_H,
});
/**
 * The stall pitch and where the four stalls sit (the x of a milker's feet). A party of fewer than four keeps this
 * pitch and slides to the middle of the byre, exactly as the pond's SEAT_X does: the crew is a row of stalls, not a
 * row that stretches. 131 + 3 * 126 = 509, so the four are centred on 320 (and so is every smaller party, which is
 * what the pitch buys) and the outermost cow is inside the frame at both ends.
 *
 * WHERE 131 COMES FROM. A cow stands its own milker's arm behind the crew's line, so its head's reach is measured
 * off the RIG, not off the stall: screens/dairy.js puts the cow at `cowX = s.x - (shoulderX + reach * PAW_FWD +
 * TEAT_DX)` and the head contour (dairyProps.js HEAD) runs to cow-local -87 inside a 2 px ink, so the muzzle lands
 * at `s.x - 126` for Barley, the widest of the four (Sorrel, the smallest, reaches 122). Round 1 put the row at
 * 110 + 3 * 140 and claimed 96 px of head reach: the four-seat capture cut Barley's muzzle, lip and half its jaw
 * off at x 0, because the true reach is 30 px longer than the comment said. At 131 the muzzle has 5 px of paper
 * under it whichever critter takes seat 0. The pitch came down with it (140 -> 126) rather than the row sliding
 * right, because the row centring on 320 for one, two, three AND four seats is the property worth keeping. The
 * stalls still clear each other at 126: a cow is drawn from -88 (the muzzle) to +57 (a lifted tail's tuft) about
 * its own feet, so the closest approach in the row is a raised tail against the NEXT cow's far horn tip, which
 * meet at a pixel or two - and the nearer stall draws second, so the tail passes in front of the horn.
 */
export const SEAT_PITCH = 126;
export const SEAT_X = Object.freeze([131, 257, 383, 509]);
/**
 * The churn rack: eight slots on the plank at ROWS.rack. A round ends the moment the party's total reaches the
 * order's remainder (at most 4 in the shipped orders) and at most four seats can bank on the same frame, so eight
 * slots is more than the total can ever reach; the screen still clamps to the last slot rather than trust that.
 */
export const CHURN_X = Object.freeze([56, 130, 204, 278, 352, 426, 500, 574]);
/** The hay hatch in the upper wall: the scene's light source and its one hole to the outside. */
const HATCH = Object.freeze({ x: 46, y: 32, w: 96, h: 52 });
/** Where the swallows nest: a mud cup tucked under the eave, far enough right to miss the clock ticket (x 254..386). */
const NEST_X = 452;

/** One course of stonework: a mortar line and the staggered vertical joints under it. */
function course(g, w, y, stagger, line) {
  g.fillStyle = line;
  g.fillRect(0, y, w, 1);
  for (let x = stagger; x < w; x += 46) g.fillRect(x, y - 13, 1, 13);
}

/**
 * The wall, top to bottom: the slate eave, the HAYLOFT the afternoon comes in through, the oak bressummer that
 * carries the loft, then the rubble-stone byre wall with the churn rack on it and a dark skirting at its foot.
 *
 * Round 1 painted 210 rows of limewashed stone with two planks across it and the capture came back as a shelf unit:
 * a big pale empty wall with nothing to look at above the cows. The loft is what fills it - a low building with its
 * hay overhead is what a byre IS, it is a band of real texture where there was none, and it gives the light shaft
 * somewhere honest to come from. The stone below it keeps one value (L .43) all the way down, because that plane
 * carries the name plates and the cows' backs and did not need a second step to read.
 */
function paintWall(g, w, h, rnd) {
  g.fillStyle = DAIRY.stone; g.fillRect(0, 0, w, h);
  const mortar = mix(DAIRY.stone, PLUM.shadow, 0.3);
  for (let y = ROWS.loft + 16, i = 0; y < h - 8; y += 14, i++) course(g, w, y, (i & 1) ? 0 : 23, mortar);
  // block-to-block variation: a flat tan behind a ruled grid read as brickwork rather than the rubble stone a byre
  // is built of, so about a third of the blocks in each course take a step either way
  const warm = mix(DAIRY.stone, DAIRY.beam, 0.22), cool = mix(DAIRY.stone, PLUM.shadow, 0.14);
  for (let y = ROWS.loft + 16, i = 0; y < h - 8; y += 14, i++) {
    for (let x = (i & 1) ? 0 : 23; x < w; x += 46) {
      const r = rnd();
      if (r > 0.6) { g.fillStyle = r > 0.8 ? warm : cool; g.fillRect(x + 1, y - 12, 44, 11); }
    }
  }
  // the afternoon coming through the hatch: ONE flat paler quad down and to the right, no gradient and no line, the
  // same device the coop's window uses - it is the light in a room, not an object in it
  g.fillStyle = DAIRY.lime;
  g.beginPath();
  g.moveTo(HATCH.x + 6, ROWS.loft); g.lineTo(HATCH.x + HATCH.w + 34, ROWS.loft);
  g.lineTo(HATCH.x + HATCH.w + 168, h); g.lineTo(HATCH.x + 44, h); g.closePath(); g.fill();
  paintLoft(g, w, rnd);
  // the oak bressummer the loft sits on, with a brace at each end: the wall's one strong horizontal
  const braceY = ROWS.beamY + 12;
  for (let x = 40; x < w; x += 190) { g.fillStyle = INK; g.beginPath(); g.moveTo(x, braceY); g.lineTo(x + 26, braceY); g.lineTo(x, braceY + 26); g.closePath(); g.fill(); }
  boxShaded(g, -2, ROWS.beamY, w + 4, 12, DAIRY.beam, DAIRY.beamDark, INK, 2, 0.42);
  paintRack(g, w, rnd);
  paintTack(g, w);
  // the skirting: the wall's foot in shadow, so the floor does not simply start
  g.fillStyle = mix(DAIRY.stoneDark, PLUM.shadow, 0.4); g.fillRect(0, h - 12, w, 12);
  g.fillStyle = INK; g.fillRect(0, h - 13, w, 2);
  paintEave(g, w, rnd);
}

/**
 * The hayloft: five oak boards with the crop pushing through every gap, the hatch open on the meadow, and the
 * swallows' nest tucked under the eave. It is the darkest plane in the room after the slate, which is what lets
 * one bright rectangle of sky at x 46..142 read as the whole scene's light source.
 */
function paintLoft(g, w, rnd) {
  const top = ROWS.eave, bot = ROWS.loft, board = mix(DAIRY.beam, PLUM.deep, 0.4), gap = mix(PLUM.deep, DAIRY.beamDark, 0.25);
  g.fillStyle = gap; g.fillRect(0, top, w, bot - top);
  for (let y = top + 2; y < bot - 2; y += 14) {
    g.fillStyle = board; g.fillRect(0, y, w, 11);
    g.fillStyle = mix(board, DAIRY.lime, 0.22); g.fillRect(0, y, w, 2);                       // the board's lit edge
    g.fillStyle = mix(board, PLUM.deep, 0.4);
    for (let i = 0; i < 7; i++) g.fillRect(R(rnd() * w), y + 3 + R(rnd() * 6), 8 + R(rnd() * 16), 1);
    // hay pushing out of the gap under each board
    for (let x = R(rnd() * 40); x < w; x += 16 + R(rnd() * 40)) {
      g.fillStyle = DAIRY.straw;
      for (let k = 0; k < 4; k++) g.fillRect(x + k * 2, y + 11 + R(rnd() * 3), 4 + R(rnd() * 4), 1);
    }
  }
  paintHatch(g, rnd);
  paintNest(g);
}

/** The hay hatch: an inked oak frame round a hole to the afternoon, with the loft's hay spilling over its sill. */
function paintHatch(g, rnd) {
  const H = HATCH;
  g.fillStyle = INK; g.fillRect(H.x - 3, H.y - 3, H.w + 6, H.h + 6);
  vGradient(g, H.x, H.y, H.w, H.h, [[0, DAIRY.sky], [1, '#F4C9A0']]);
  g.fillStyle = DAIRY.meadow; g.fillRect(H.x, H.y + H.h - 13, H.w, 13);
  g.fillStyle = mix(DAIRY.meadow, PLUM.shadow, 0.35); g.fillRect(H.x, H.y + H.h - 13, H.w, 3);
  // a hedge line and a far barn in the meadow, flat plum silhouettes at this depth (no ink on a 20 px building)
  g.fillStyle = mix(PLUM.shadow, DAIRY.meadow, 0.35);
  for (let x = H.x; x < H.x + H.w; x += 9) { g.beginPath(); g.arc(x, H.y + H.h - 12, 4 + rnd() * 3, 0, TAU); g.fill(); }
  g.fillRect(H.x + 58, H.y + H.h - 23, 22, 10);
  g.beginPath(); g.moveTo(H.x + 55, H.y + H.h - 22); g.lineTo(H.x + 69, H.y + H.h - 30); g.lineTo(H.x + 83, H.y + H.h - 22); g.closePath(); g.fill();
  boxShaded(g, H.x - 5, H.y + H.h + 3, H.w + 10, 6, DAIRY.beam, DAIRY.beamDark, INK, 2, 0.5);   // the sill
  // hay over the sill: inked clumps first, then the straw, then pale wisps (the 2 px floor, ART_STYLE 0.8)
  g.fillStyle = INK;
  for (let x = H.x + 2; x < H.x + H.w - 2; x += 11) { g.beginPath(); g.arc(x, H.y + H.h + 4, 6 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = DAIRY.straw;
  for (let x = H.x + 2; x < H.x + H.w - 2; x += 11) { g.beginPath(); g.arc(x, H.y + H.h + 3, 5 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = DAIRY.strawLight;
  for (let i = 0; i < 20; i++) g.fillRect(H.x + R(rnd() * H.w), H.y + H.h - 2 + R(rnd() * 8), 3, 1);
}

/** The swallows: a mud nest under the eave with two chicks in it. Painted, not animated - the flier is a prop. */
function paintNest(g) {
  const x = NEST_X, y = ROWS.eave + 12, mud = mix(DAIRY.floorDark, PLUM.shadow, 0.2);
  g.fillStyle = INK; g.beginPath(); g.moveTo(x - 15, y - 2); g.lineTo(x + 15, y - 2); g.lineTo(x + 9, y + 13); g.lineTo(x - 9, y + 13); g.closePath(); g.fill();
  g.fillStyle = mud; g.beginPath(); g.moveTo(x - 13, y); g.lineTo(x + 13, y); g.lineTo(x + 8, y + 11); g.lineTo(x - 8, y + 11); g.closePath(); g.fill();
  g.fillStyle = mix(mud, PLUM.deep, 0.35); g.fillRect(x - 11, y + 6, 22, 5);
  for (let i = 0; i < 2; i++) {                                                     // two chick heads over the rim
    const cx = x - 5 + i * 10;
    g.fillStyle = INK; g.beginPath(); g.arc(cx, y - 3, 4, 0, TAU); g.fill();
    g.fillStyle = '#31283A'; g.beginPath(); g.arc(cx, y - 3, 3, 0, TAU); g.fill();
    g.fillStyle = DAIRY.straw; g.fillRect(cx - 1, y - 3, 3, 2);                     // the gape
  }
}

/**
 * The churn rack: the plank the full pails go onto, on four brackets. Round 1 also carried a back rail 22 rows
 * above it, and with the eave, the bressummer and the plank itself that made four full-width horizontals on one
 * wall: the capture read as a row of shelves with a byre painted under it. The slots themselves are empty here -
 * the screen draws one churn per milk the PARTY has banked (src/art/dairyProps.js drawChurn), so the rack is the
 * party's score board and filling it is the round.
 */
function paintRack(g, w, rnd) {
  const y = ROWS.rack, dark = DAIRY.beamDark;
  for (let x = 44; x < w; x += 150) { g.fillStyle = INK; g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + 18, y + 8); g.lineTo(x, y + 26); g.closePath(); g.fill(); }
  boxShaded(g, -2, y, w + 4, 8, DAIRY.beam, dark, INK, 2, 0.45);
  g.fillStyle = dark;
  for (let i = 0; i < 24; i++) g.fillRect(R(rnd() * w), y + 2, 6 + R(rnd() * 10), 1);  // grain along the plank
}

/**
 * The byre's kit, hung on the stone between the bressummer and the rack and kept to the two ends: the middle of
 * this band is where the end sign drops (rows 96..148) and where the churns stand, so nothing competes there.
 */
function paintTack(g, w) {
  const y = ROWS.beamY + 16, dark = DAIRY.beamDark;
  g.fillStyle = INK; g.fillRect(24, y, 3, 10); g.fillRect(w - 38, y, 3, 10);
  boxShaded(g, 12, y + 10, 30, 7, DAIRY.beam, dark, INK, 1, 0.45);                    // the yoke
  boxOutlined(g, 20, y + 17, 6, 9, dark, INK, 1);
  g.strokeStyle = INK; g.lineWidth = 3;                                               // the rope coil
  g.beginPath(); g.arc(w - 40, y + 20, 9, 0, TAU); g.stroke();
  g.strokeStyle = DAIRY.straw; g.lineWidth = 2; g.beginPath(); g.arc(w - 40, y + 20, 9, 0, TAU); g.stroke();
  // a long-handled hay fork leaning in the corner, tines up, on the shadow side away from the light
  g.fillStyle = INK; g.fillRect(w - 20, y + 4, 4, 120);
  g.fillStyle = DAIRY.beam; g.fillRect(w - 19, y + 5, 2, 118);
  g.fillStyle = INK;
  for (let i = 0; i < 3; i++) g.fillRect(w - 26 + i * 6, y - 8, 3, 14);
}

/** The slate eave pinned to the top edge: a lit top course, the tiles' scalloped bottom, and the rafter ends. */
function paintEave(g, w, rnd) {
  const h = ROWS.eave;
  g.fillStyle = DAIRY.slate; g.fillRect(0, 0, w, h);
  g.fillStyle = DAIRY.slateLit; g.fillRect(0, 0, w, 4);
  g.fillStyle = mix(DAIRY.slate, PLUM.deep, 0.3);
  for (let x = 0; x < w; x += 16) { g.fillRect(x, 6, 1, h - 6); g.fillRect(x + 8, 4, 1, 6); }
  for (let x = -4; x < w + 8; x += 16) { g.beginPath(); g.arc(x, h - 3, 6, 0, TAU); g.fill(); }
  g.fillStyle = INK; g.fillRect(0, h, w, 2);
  for (let x = 30; x < w; x += 76) boxShaded(g, x, h + 2, 10, 7 + R(rnd() * 3), DAIRY.beam, DAIRY.beamDark, INK, 1, 0.5);
}

/** One flat step of the hatch light on the floor: a quad, top edge x0t..x1t, bottom edge x0b..x1b. */
function pool(g, fill, yTop, yBot, x0t, x1t, x0b, x1b) {
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(x0t, yTop); g.lineTo(x1t, yTop); g.lineTo(x1b, yBot); g.lineTo(x0b, yBot); g.closePath(); g.fill();
}

/**
 * The floor. Three bands, and the middle one is the contract the screen stands everything on:
 *   0..18    (232..250) the wall's foot in shadow, with the byre's loose straw - the only litter above the feet
 *   18..64   (250..296) the cobbled standing the cows occupy; 1 px dark cobble marks only
 *   64..112  (296..344) the SWEPT band: the stools, the pails, the chevron tags and the kick splashes live here and
 *                       nothing is painted into it but the hatch light, because a cream straw fleck on this band is
 *                       a spilled splash that never goes away (the orchard's clean lane, ART_STYLE section 7)
 * The pale `strawLight` wisp is 0.12 off Barley's wool by value and so is banned from every row a torso or a head
 * can stand in front of: it appears only in the near lip, which is below every foot.
 */
function paintFloor(g, w, h, rnd) {
  const back = ROWS.back - ROWS.floor, stand = ROWS.standing - ROWS.floor;
  g.fillStyle = DAIRY.floor; g.fillRect(0, 0, w, h);
  g.fillStyle = DAIRY.floorDark; g.fillRect(0, 0, w, back);
  g.fillStyle = mix(DAIRY.floor, DAIRY.floorDark, 0.32); g.fillRect(0, back, w, stand - back);
  for (let x = 0; x < w; x += 7) g.fillRect(x, stand, 7, R(rnd() * 5));              // the standing's ragged front edge
  pool(g, mix(DAIRY.floor, '#FFD9A0', 0.24), back, h, 196, 330, 150, 372);
  pool(g, mix(DAIRY.floor, '#FFD9A0', 0.42), back, h, 226, 302, 194, 336);
  // cobbles on the standing: 1 px dark arcs, well below the eggs-and-milk end of the value ladder
  g.fillStyle = mix(DAIRY.floorDark, PLUM.shadow, 0.3);
  for (let y = back + 5; y < stand - 2; y += 7) for (let x = ((y & 7) * 3); x < w; x += 15) g.fillRect(x, y, 9, 1);
  // scuffs across the standing, warm and dark: texture that can never be mistaken for milk. Capped at `stand` like
  // the bedding below - this loop ran to `h` and dropped about 44 of its 80 marks into the swept band, which the
  // band above declares clean; a 1 px dark scuff under a pail is not a spill, but it is litter in the one lane the
  // chevron tags and the kick splashes have to read against, and it is what the bedding loops were capped to avoid
  g.fillStyle = mix(DAIRY.floor, DAIRY.beam, 0.4);
  for (let i = 0; i < 80; i++) g.fillRect(R(rnd() * w), 2 + R(rnd() * (stand - 4)), 5 + R(rnd() * 11), 1);
  // THE BEDDING. Round 1 left the standing as one brown slab and the capture came back a single muddy value from
  // the wall to the lip - brown cow on brown floor under a tan wall. It is strawed now, right up to the front edge
  // of the standing: `straw` sits at L .64, which clears Barley's wool by 0.28 (the orchard's trodden band clears
  // it by the same margin), so gold is safe behind a pale critter's head here where `strawLight` at 0.12 would not
  // have been. Not one row of it reaches below ROWS.standing: the swept band the pails, the chevron tags and the
  // spills live on stays bare, because a cream fleck down there is a spill that never dries.
  const bedDark = mix(DAIRY.straw, DAIRY.floorDark, 0.42);
  for (let i = 0; i < 560; i++) {
    const x = R(rnd() * w), y = 2 + R(rnd() * (stand - 4));
    g.fillStyle = rnd() < 0.5 ? bedDark : DAIRY.straw;
    g.fillRect(x, y, 4 + R(rnd() * 7), 1);
  }
  // a few thicker wisps where the bedding has been kicked into ridges; inked ovals were tried here and read as
  // coins lying on the floor, so a clump is three strands that happen to cross and nothing else
  for (let i = 0; i < 26; i++) {
    const x = R(rnd() * w), y = 4 + R(rnd() * (stand - 10));
    g.fillStyle = DAIRY.straw;
    g.fillRect(x, y, 11, 1); g.fillRect(x + 2, y - 1, 8, 1); g.fillRect(x + 1, y + 1, 9, 1);
  }
  paintBales(g, rnd);
}

/**
 * Two bound bales stacked at the right-hand end, parked on the standing band above the swept floor. With four
 * stalls the row of cows fills the left three quarters of the byre and the last milker's right shoulder had 100 px
 * of bare floor beside it; with one seat the crew centres and the bales are what keeps the right-hand third from
 * being a brown slab. Rows 254..296 in screen space, so they stand behind the cows and under the plates.
 */
function paintBales(g, rnd) {
  const dark = DAIRY.beamDark, face = mix(DAIRY.straw, DAIRY.beam, 0.2), lit = mix(DAIRY.straw, DAIRY.strawLight, 0.5);
  const sh = mix(DAIRY.floor, PLUM.deep, 0.3);
  g.fillStyle = sh; g.beginPath(); g.ellipse(586, ROWS.standing - ROWS.floor - 1, 44, 4, 0, 0, TAU); g.fill();
  for (let k = 0; k < 2; k++) {
    const x = 548 + k * 10, y = ROWS.standing - ROWS.floor - 24 - k * 22, bw = 74 - k * 12;
    boxOutlined(g, x, y, bw, 22, face, INK, 1);
    g.fillStyle = lit; g.fillRect(x + 1, y + 1, bw - 2, 4);
    g.fillStyle = mix(face, PLUM.shadow, 0.35); g.fillRect(x, y + 16, bw, 6);
    g.fillStyle = mix(face, PLUM.shadow, 0.26);
    for (let i = 0; i < 7; i++) g.fillRect(x + 2 + R(rnd() * (bw - 20)), y + 6 + R(rnd() * 11), 8 + R(rnd() * 10), 1);
    g.fillStyle = dark; g.fillRect(x + 14, y, 3, 22); g.fillRect(x + bw - 20, y, 3, 22);   // the twine
  }
}

/** The near lip: trodden straw at the byre door, in front of everything and below every foot. */
function paintNear(g, w, h, rnd) {
  g.fillStyle = INK;
  for (let x = -4; x < w + 8; x += 11) { g.beginPath(); g.arc(x, 7, 6 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = DAIRY.straw;
  for (let x = -4; x < w + 8; x += 11) { g.beginPath(); g.arc(x, 6, 5 + R(rnd() * 3), 0, TAU); g.fill(); }
  g.fillStyle = mix(DAIRY.straw, PLUM.shadow, 0.3); g.fillRect(0, 11, w, h - 11);
  g.fillStyle = DAIRY.strawLight;
  for (let i = 0; i < 80; i++) g.fillRect(R(rnd() * w), 1 + R(rnd() * (h - 3)), 3, 1);
  g.fillStyle = UI.ink; g.fillRect(0, h - 2, w, 2);
}

/** The backdrop is a pure function of its seeds: painted on the first visit, kept for every visit after. */
let LAYERS = null;
/** Pre-render every layer once. Returns { wall, floor, near }, each with the y the screen blits it at. */
export function dairyLayers() {
  if (LAYERS) return LAYERS;
  LAYERS = {
    wall: { L: makeLayer(VIEW_W, ROWS.floor, paintWall, SEED), y: 0 },
    floor: { L: makeLayer(VIEW_W, ROWS.lip - ROWS.floor, paintFloor, SEED + 1), y: ROWS.floor },
    near: { L: makeLayer(VIEW_W, VIEW_H - ROWS.lip, paintNear, SEED + 2), y: ROWS.lip },
  };
  return LAYERS;
}
