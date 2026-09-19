// The dairy's props (docs/ART_STYLE.md section 1 "Dairy", section 7; docs/GDD.md section 5): the cow, the milking
// stool, the tin pail, the milk jet, the churns that fill the rack, the two-step pump chevron, the kick splash and
// the one swallow. Drawn like every prop in the rig style - 1 px warm ink round each OBJECT, three tones on a body
// (base, one shadow band, a colour change clipped inside the object's own line), in the dairy's own palette -
// in screen space at integer coordinates, allocating nothing per call. The screen draws `drawShadow` under every
// one of them before its sorted pass.
//
// The cow is a PROP, not a rig: it has no paper-doll, no pose table and no secondary chains. Everything it does is
// four numbers the screen hands in (`ear`, `tail`, `chew`, `cock`) plus the warning colour, exactly the way
// art/hens.js takes the rooster's comb colour - so this file never decides WHEN the cow is about to kick, only
// what that looks like. That keeps the reserved SIGNAL.hot out of the art module and in the one place that owns it.
import { UI, PLAYER_COLORS, PLUM } from '../constants.ts';
import { mix } from './palettes.ts';
import { pathRoundedPoly, pathEllipse } from '../lib/art/shapes.ts';
import { DAIRY } from './backgrounds/dairy.ts';

const R = Math.round, TAU = Math.PI * 2, DEG = Math.PI / 180;
const INK = UI.ink;

/**
 * Prop colours. The milk is the brightest thing in the frame by a wide margin (L .97 against the byre floor's .45)
 * and it is the ONLY thing allowed to be: the cow's cream is a step down at .79 and never lands on the rump a
 * milker sits against (see PATCHES). The tin pail is the one cool object in a warm room - that is what makes a
 * white liquid read as milk rather than as one more warm highlight.
 */
export const COW = Object.freeze({
  hide: '#9C6440', patch: '#CBB086', horn: '#CFC0A0', muzzle: '#A88178', udder: '#C2988B',
  /** The cow's own ink-adjacent dark: hooves, nostril, eye. Plum, never black (ART_STYLE section 1). */
  hoof: '#4A3038',
});
const HIDE_SH = mix(COW.hide, PLUM.shadow, 0.42), HIDE_FAR = mix(COW.hide, PLUM.shadow, 0.34);
const PATCH_SH = mix(COW.patch, PLUM.shadow, 0.3), UDDER_SH = mix(COW.udder, PLUM.shadow, 0.32);
/** The hock band on a near and a far leg, and the far horn: every derived tone on this cow is mixed ONCE, here.
 *  `mix` runs hexToRgb twice and rgbToHex once per call - two array literals, a closure and three strings - so a
 *  mix() left inside drawCow costs that every cow every frame (ARCHITECTURE section 8, and art/hens.js's
 *  RUST_SH / GREY_SH / PLUME_SH are the shipped precedent). */
const HOCK_N = mix(COW.hide, PLUM.shadow, 0.35), HOCK_F = mix(HIDE_FAR, PLUM.shadow, 0.35);
const HORN_F_HEX = mix(COW.horn, PLUM.shadow, 0.3);
/** Milk, and the tin it goes into. */
export const MILK = '#FFF8EC', MILK_HI = '#FFFFFF';
const MILK_SH = mix(MILK, PLUM.shadow, 0.24);
/** The lit topline, one per hide: the same 0.22 of white on whichever of the two coats is this cow's base. */
const HIDE_LIT = mix(COW.hide, MILK_HI, 0.22), PATCH_LIT = mix(COW.patch, MILK_HI, 0.22);
export const TIN = '#93909C';
const TIN_SH = mix(TIN, PLUM.shadow, 0.34), TIN_HI = mix(TIN, MILK_HI, 0.45);
/** The churn's dark band. Up to eight churns stand on the rack, so this one is worth the same treatment. */
const CHURN_BAND = mix(TIN, PLUM.deep, 0.45);
/** The swallow under the eave: a plum-black dart with a rust throat. Not a fifth fur - nothing else wears either. */
const SWALLOW = '#31283A', SWALLOW_THROAT = '#A8623A';

// ---------------------------------------------------------------- the cow
/**
 * Cow geometry in its own local space: origin at the feet centre, y up negative, ALWAYS facing left (the milker
 * sits at the cow's right rear, so every cow in the row faces the same way and a `facing` parameter would only ever
 * be -1).
 *
 * ROUND 3, and the reason there were three. Round 1 was a 71 px cow on 30 px legs and read, at 1x, as a large brown
 * pig. Round 2 grew it to 90 px but kept the barrel as one big ELLIPSE, and an ellipse is the shape of a guinea pig:
 * a cow's read lives in its BACK LINE - straight from the withers, a bump at the hips, a squared rump - and in a
 * thick neck sloping down out of that back to a long rectangular head with a big muzzle. The barrel is now an
 * inked polygon carrying exactly that line, on four 48 px legs, and the horns, the ear and the muzzle finish the
 * job. Total 92 px tall over the 64 px Barley (1.45x), which is about what a byre actually shows.
 *
 * The udder is placed off the BELLY line, not off the barrel's centre, so the whole animal can be re-proportioned
 * without moving the one point the gameplay depends on: TEAT_DY, where the jet starts and where a seated chibi's
 * paws reach (screens/dairy.js works the cow's position back from each rig's own arm).
 */
const BODY = [-30, -86, -6, -90, 22, -92, 32, -80, 30, -56, 16, -46, -8, -44, -24, -50, -32, -66];
const LEG_TOP = -48, LEG_W = 8;
/**
 * Leg x: fore far, fore near, hind far, hind near - the near pair drawn after the body, the far pair before it.
 * Each pair is 14..16 px apart. 9 px, then 10, both failed the capture the same way: two 8 px posts inside their
 * own 2 px ink are 12 px wide each, so anything under 12 px of separation merges them into one fat pillar where a
 * cow's front legs should be. At 16 there are 4 px of daylight between the fore pair and the cow walks. The hind
 * pair sits under the hip bump, where the milker and the pail stand in front of it - which is where a milker sits;
 * the near one of that pair crosses the udder's outer edge on purpose, so the udder reads as hanging BETWEEN the
 * hind legs rather than balanced on top of them.
 */
const LEG_X = Int8Array.of(-14, -30, 12, 23);
/** The head contour: poll, forehead, face, muzzle, lip, jaw and throat as ONE path, so the ink runs round it once. */
const HEAD = [-44, -82, -58, -85, -73, -76, -85, -63, -87, -54, -79, -48, -62, -48, -46, -56];
/** The neck: a tapered quad from the withers into the back of the head, inked with it. */
const NECK = [-26, -88, -48, -80, -48, -52, -22, -50];
/** The ear, in ear space (+x points BACKWARD along the cow, because the head faces -x). */
const EAR = [0, -4, 17, -10, 22, -1, 13, 7, 0, 4];
/** Where the ear hangs, and the two angles it swings between: forward-and-up when calm, flat back when cross. */
const EAR_X = -58, EAR_Y = -76, EAR_CALM = -6, EAR_BACK = 46;
/** The two horns, near and far, as tapered wedges rooted under the head's own contour. */
const HORN_N = [-53, -82, -49, -95, -45, -94, -46, -82];
const HORN_F = [-65, -81, -62, -93, -58, -92, -58, -81];
/** The udder and its two teats. The teat tips are TEAT_DY above the cow's feet: the screen builds the jet from here. */
const UDDER_X = 14, UDDER_Y = -38, UDDER_RX = 10, UDDER_RY = 8;
export const TEAT_DX = 14, TEAT_DY = -22;
/**
 * Two cows, not one stamp twice. `kind` 0 is a brown cow with cream over its shoulder and withers; `kind` 1 is the
 * cream one, and its FIRST patch is always the rump - the milker's own body sits against that rump, and Barley's
 * wool (L .90) against a cream flank (L .70) is 0.22 apart, under what ART_STYLE 0.1 asks of two touching things.
 * The brown rump keeps that one contact at 0.51 whichever cow a pale critter draws.
 * Each entry is two ellipses: [cx, cy, rx, ry, cx, cy, rx, ry] clipped inside the body's own contour.
 */
const PATCHES = [
  [-18, -68, 12, 11, 4, -86, 9, 5],
  [18, -68, 14, 14, -24, -80, 10, 7],
];
/** The warning mark above the rump: an inked lozenge with a bar and a dot in the colour the screen hands in. */
const MARK_X = 26, MARK_Y = -104;

/** One stroked-then-filled path: the ink shows 1 px outside the fill (the same helper art/hens.js uses). */
function ink(ctx, fill) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); }

/** A leg: an inked post from LEG_TOP to `foot`, tapering into a dark hoof. `hex` is the near or far hide, `hock`
 *  that hide's own hock band (HOCK_N / HOCK_F) - passed in rather than mixed here, because this runs 4x a cow. */
function cowLeg(ctx, x, foot, hex, hock) {
  const t = LEG_W / 2 + 2, b = LEG_W / 2;
  ctx.beginPath();
  ctx.moveTo(x - t, LEG_TOP); ctx.lineTo(x + t, LEG_TOP);
  ctx.lineTo(x + b, foot - 5); ctx.lineTo(x + b + 1, foot); ctx.lineTo(x - b - 1, foot); ctx.lineTo(x - b, foot - 5);
  ctx.closePath();
  ink(ctx, hex);
  // the hock: one 3 px band where a cow's leg bends, which is what stops a leg reading as a fence post
  ctx.fillStyle = hock; ctx.fillRect(R(x - b), R(LEG_TOP + (foot - LEG_TOP) * 0.42), LEG_W, 3);
  ctx.fillStyle = COW.hoof; ctx.fillRect(R(x - b) - 1, R(foot) - 6, LEG_W + 2, 6);
}

/**
 * A cow with its feet at (x, y).
 * @param {number} kind 0 or 1: which patch layout, so four cows in a row are not one stamp four times
 * @param {number} ear 0 calm .. 1 flat back
 * @param {number} tail 0 hanging .. 1 lifted
 * @param {number} chew 0 or 1: the jaw beat (the head drops 1 px)
 * @param {number} cock 0 .. 1: the near hind leg drawn up, and the warning mark's plate filled solid. The mark is
 *   the half of this a player can actually read - see the note on the leg in drawCow
 * @param {string|null} mark the warning mark's colour above the rump, or null for none (the screen owns SIGNAL.hot)
 */
export function drawCow(ctx, x, y, kind, ear, tail, chew, cock, mark) {
  const k = kind & 1, base = k ? COW.patch : COW.hide, spot = k ? COW.hide : COW.patch;
  const baseSh = k ? PATCH_SH : HIDE_SH, baseLit = k ? PATCH_LIT : HIDE_LIT;
  ctx.save(); ctx.translate(R(x), R(y));
  drawTail(ctx, tail, base);
  cowLeg(ctx, LEG_X[0], 0, HIDE_FAR, HOCK_F); cowLeg(ctx, LEG_X[2], 0, HIDE_FAR, HOCK_F);
  // the barrel: one inked contour, then everything inside it clipped, so no patch carries a line (ART_STYLE 0.2)
  pathRoundedPoly(ctx, BODY, 9);
  ink(ctx, base);
  ctx.save(); pathRoundedPoly(ctx, BODY, 9); ctx.clip();
  ctx.fillStyle = baseSh; ctx.fillRect(-34, -60, 68, 20);                                    // the one shadow band
  const p = PATCHES[k];
  ctx.fillStyle = spot;
  ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(p[4], p[5], p[6], p[7], 0, 0, TAU); ctx.fill();
  ctx.fillStyle = k ? HIDE_SH : PATCH_SH; ctx.fillRect(p[0] - p[2], -60, p[2] * 2, 20);
  ctx.fillStyle = baseLit; ctx.fillRect(-26, -90, 42, 4);                                    // the lit topline
  ctx.restore();
  drawUdder(ctx);
  // the near hind leg draws up when the cow is cocked. It is the QUIETEST of the three kick tells and on a seated
  // stall it is nearly a private one: the milker sits at cow-local 24..52 and draws over the cow, so all that
  // clears its skull is the top of the leg post above the critter's ears (a calm/kick pixel diff over the leg box
  // moves 80..127 px of 1188, against 45 % of the mark's plate and a fifth of the tail's box). There is nowhere to
  // move it to - forward of the milker is the udder the paw and the jet need, and the far hind leg draws behind
  // the barrel - so the window's READABLE tells are the mark going solid and the tail, and the header comments say
  // so. Kept because the sliver is honest motion, not because it is a tell a player can be asked to read.
  cowLeg(ctx, LEG_X[3] + R(cock * 6), -R(cock * 16), COW.hide, HOCK_N);
  cowLeg(ctx, LEG_X[1], 0, COW.hide, HOCK_N);
  drawHead(ctx, ear, chew, base, spot);
  if (mark) drawMark(ctx, mark, cock);
  ctx.restore();
}

/** The head and neck as one inked contour, with the ear behind it and the horns on top. */
function drawHead(ctx, ear, chew, base, spot) {
  ctx.save(); ctx.translate(0, chew);
  // The horns are rooted INSIDE the poll and the head is drawn over their base, so they grow out of the skull.
  // Two plain rects at -95 were tried first and the capture read them as a pair of cream luggage tags stuck to the
  // withers: a horn has to TAPER and lean out, or at 1x it is a box. Each is a four-point wedge, 5 px at the skull
  // and 3 at the tip - over the 2 px floor (ART_STYLE 0.8) and no more than a 12 px mark.
  pathRoundedPoly(ctx, HORN_N, 1); ink(ctx, COW.horn);
  pathRoundedPoly(ctx, HORN_F, 1); ink(ctx, HORN_F_HEX);
  pathRoundedPoly(ctx, NECK, 4); ink(ctx, base);
  pathRoundedPoly(ctx, HEAD, 5); ink(ctx, base);
  ctx.save(); pathRoundedPoly(ctx, HEAD, 5); ctx.clip();
  ctx.fillStyle = spot; ctx.beginPath(); ctx.ellipse(-68, -70, 6, 14, 0, 0, TAU); ctx.fill();      // the blaze
  ctx.fillStyle = COW.muzzle; ctx.beginPath(); ctx.ellipse(-80, -56, 10, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HIDE_SH; ctx.fillRect(-90, -54, 48, 7);
  ctx.restore();
  ctx.fillStyle = COW.hoof; ctx.fillRect(-84, -60, 4, 4);                                     // nostril
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-66, -70, 3.6, 0, TAU); ctx.fill();           // eye
  ctx.fillStyle = MILK; ctx.fillRect(-67, -72, 2, 2);
  // The NEAR ear, drawn over the cheek rather than behind the skull. A critter's ears go behind the head
  // (ART_STYLE 0.3) because a critter's ears stand above it; a cow's stick out sideways from just behind the eye,
  // and drawn behind this head the whole ear disappeared under the jaw and the neck - which cost the telegraph
  // half its tell, because the ear going back is the first thing the cow does.
  ctx.save(); ctx.translate(EAR_X, EAR_Y); ctx.rotate((EAR_CALM + (EAR_BACK - EAR_CALM) * ear) * DEG);
  pathRoundedPoly(ctx, EAR, 3); ink(ctx, HIDE_SH);
  ctx.fillStyle = COW.muzzle; ctx.beginPath(); ctx.ellipse(12, -1, 6, 3, 0, 0, TAU); ctx.fill();   // inner ear, no line
  ctx.restore();
  ctx.restore();
}

/** The udder: one inked blob under the rear belly with two teats. The jet leaves the near teat's tip. */
function drawUdder(ctx) {
  // shifted 2 px toward the cow's head, away from the milker: at dead centre the milker's own skull crowded it and
  // the zoom read the pair as one pink lobe growing off a sheep's ear
  pathEllipse(ctx, UDDER_X - 2, UDDER_Y, UDDER_RX, UDDER_RY); ink(ctx, COW.udder);
  ctx.save(); pathEllipse(ctx, UDDER_X - 2, UDDER_Y, UDDER_RX, UDDER_RY); ctx.clip();
  ctx.fillStyle = UDDER_SH; ctx.fillRect(UDDER_X - 12, UDDER_Y + 2, 24, 11); ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(UDDER_X - 9, UDDER_Y + 5, 6, 12); ctx.fillRect(UDDER_X + 1, UDDER_Y + 5, 6, 12);
  ctx.fillStyle = COW.udder; ctx.fillRect(UDDER_X - 8, UDDER_Y + 5, 4, 11); ctx.fillRect(UDDER_X + 2, UDDER_Y + 5, 4, 11);
}

/** The tail: two inked segments off the rump with a tuft, hanging at rest and swung up over the back when cross. */
function drawTail(ctx, t, base) {
  const midX = 36 + t * 8, midY = -62 - t * 20, endX = 39 + t * 12, endY = -34 - t * 58;
  ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(30, -86); ctx.lineTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.strokeStyle = base; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(30, -86); ctx.lineTo(midX, midY); ctx.lineTo(endX, endY); ctx.stroke();
  pathEllipse(ctx, endX, endY + 2, 5, 7); ink(ctx, HIDE_SH);
}

/**
 * The warning above the rump. The rooster wears the reserved heat colour on its comb; a cow has nothing on it that
 * can change colour and still read at 1x, so the mark is a stamped lozenge floating over the rump instead - the one
 * place in the stall where nothing else ever draws. `cock` fills the whole plate on the kick window itself, so the
 * telegraph (a blinking bar and dot) and the window (a solid slab) are two different pictures, not two speeds.
 */
function drawMark(ctx, hex, cock) {
  ctx.save(); ctx.translate(MARK_X, MARK_Y);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 8, 11, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = cock > 0 ? hex : UI.paper; ctx.beginPath(); ctx.ellipse(0, 0, 6, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = cock > 0 ? INK : hex;
  ctx.fillRect(-2, -7, 4, 8); ctx.fillRect(-2, 3, 4, 4);
  ctx.restore();
}

// ---------------------------------------------------------------- the milker's kit
/**
 * The three-legged milking stool, seat top `h` px above the floor at (x, y).
 *
 * `h` comes from the seat's own rig (the chibi's hip is only 11..16 px off the ground) so every critter's hip lands
 * ON its stool instead of a mouse hovering over a sheep's bench; the stools therefore differ by a few px, the same
 * ragged-but-correct answer the name plate row gives. The whole stool is shifted STOOL_DX to the milker's REAR and
 * its legs splay wide, because a low stool under a seated chibi is otherwise entirely behind the critter: what a
 * player actually sees is the back edge of the seat and one leg going down behind the hip, and that is the shape
 * that says "sitting" rather than "kneeling".
 */
const STOOL_DX = 5;
export function drawStool(ctx, x, y, h) {
  x = R(x) + STOOL_DX; y = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x + 3, y - h + 3, 7, h - 2);                      // the back leg, behind the seat
  ctx.fillStyle = DAIRY.oakDark; ctx.fillRect(x + 4, y - h + 3, 5, h - 3);
  for (let i = 0; i < 2; i++) {
    const sx = x - 8 + i * 16, fx = x - 14 + i * 30;
    ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, y - h + 4); ctx.lineTo(fx, y); ctx.stroke();
    ctx.strokeStyle = DAIRY.oakDark; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx, y - h + 4); ctx.lineTo(fx, y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x - 14, y - h); ctx.lineTo(x + 14, y - h); ctx.lineTo(x + 12, y - h + 6); ctx.lineTo(x - 12, y - h + 6); ctx.closePath();
  ink(ctx, DAIRY.oak);
  ctx.fillStyle = DAIRY.oakDark; ctx.fillRect(x - 12, y - h + 4, 24, 2);
}

/**
 * The pail's body, as a path: a tin bucket 24 across the rim, 16 across the base, PAIL_H tall, base at (0, 0). The
 * taper started at 2.5 px a side and the zoom read the whole thing as a grey box; a bucket is a bucket because it
 * is narrower at the bottom than the top, and 4 px a side is the least that says so at 1x.
 */
export const PAIL_H = 22, PAIL_RX = 12;
function pailPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-PAIL_RX, -PAIL_H); ctx.lineTo(PAIL_RX, -PAIL_H); ctx.lineTo(PAIL_RX - 4, 0); ctx.lineTo(-PAIL_RX + 4, 0); ctx.closePath();
}
/**
 * The pail under the cow, base centred on (x, y). `fill` is 0..1 of the current pail and is drawn as a CUTAWAY -
 * the level shown through the tin - because it is the one number a first-time player has to read at a glance and a
 * side-on bucket shows nothing of what is in it. The surface carries a 2 px pure-white line, so a step of the fill
 * is a bright line jumping up the pail and not a slightly taller cream rectangle. `slot` puts the seat's own colour
 * on a 3 px band under the rim (the pond's bucket does the same), and `squash` above 1 is the landing beat for the
 * fresh pail sliding in.
 */
export function drawPail(ctx, x, y, fill, slot, squash = 1) {
  x = R(x); y = R(y);
  if (squash !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(squash, 1 / squash); ctx.translate(-x, -y); }
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';                          // the bail, behind the tin
  ctx.beginPath(); ctx.arc(0, -PAIL_H, 10, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  pailPath(ctx); ink(ctx, TIN);
  ctx.save(); pailPath(ctx); ctx.clip();
  ctx.fillStyle = TIN_SH; ctx.fillRect(2, -PAIL_H, PAIL_RX, PAIL_H);
  ctx.fillStyle = TIN_HI; ctx.fillRect(-PAIL_RX + 2, -PAIL_H + 2, 2, PAIL_H - 4);
  if (fill > 0) {
    const top = -R((PAIL_H - 4) * Math.min(1, fill)) - 1;
    ctx.fillStyle = MILK; ctx.fillRect(-PAIL_RX, top, PAIL_RX * 2, -top);
    ctx.fillStyle = MILK_SH; ctx.fillRect(2, top + 2, PAIL_RX, -top - 2);
    ctx.fillStyle = MILK_HI; ctx.fillRect(-PAIL_RX, top, PAIL_RX * 2, 2);
  }
  ctx.restore();
  ctx.fillStyle = PLAYER_COLORS[slot] || UI.paperDark; ctx.fillRect(-PAIL_RX + 1, -PAIL_H + 4, PAIL_RX * 2 - 2, 3);
  ctx.fillStyle = INK; ctx.fillRect(-PAIL_RX + 4, -3, PAIL_RX * 2 - 8, 2);                   // the base hoop
  ctx.fillStyle = INK; ctx.fillRect(-PAIL_RX - 1, -PAIL_H - 2, PAIL_RX * 2 + 2, 3);          // the rim
  ctx.fillStyle = fill > 0 ? MILK_HI : TIN_SH; ctx.fillRect(-PAIL_RX + 1, -PAIL_H - 1, PAIL_RX * 2 - 2, 1);
  ctx.restore();
  if (squash !== 1) ctx.restore();
}

/**
 * The squirt: a short mint stream from the teat at (x0, y0) to the pail's rim at (x1, y1), 3 px of colour inside
 * its own 1 px ink (so it clears the 2 px floor, ART_STYLE 0.8). `k` is 0..1 through the beat and slides a bright
 * white head down the stream - clamped to the rim, never past it - so a press reads as milk LEAVING rather than as
 * a line switching on. Mint and not cream, because this is SIGNAL.dairy doing its one job, "that press landed on
 * the beat"; the MILK is the white in the pail, in the churns and in the spill (docs/ART_STYLE.md section 4).
 */
const JET_HEAD = 0.45;
export function drawJet(ctx, x0, y0, x1, y1, hex, k) {
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = hex; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  const e = Math.min(1, k + JET_HEAD), dx = x1 - x0, dy = y1 - y0;
  ctx.strokeStyle = MILK_HI; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0 + dx * k, y0 + dy * k); ctx.lineTo(x0 + dx * e, y0 + dy * e); ctx.stroke();
}

/**
 * The two-step pump chevron: the one thing a first-time player has to read instantly. A plate in the seat's own
 * colour with two inked chevrons on it, left = ACTION and right = ALT in reading order; the step that is NEXT is
 * filled with SIGNAL.dairy and the other with ink.
 *
 * It is lit by VALUE, not by hue: mint (L .68) is only 0.06 off P3's lavender plate and would have vanished on it,
 * so the pair is always one bright chevron against one dark one and both carry their own 1 px line. `shake` is the
 * refusal beat - the plate drains to paper-dark and jitters a pixel, which says "not that one" without a word and
 * without spending the reserved danger colour on a mistake that costs nothing.
 */
const CHEV = [0, -4, 4, 0, 0, 4, -3, 4, 1, 0, -3, -4];
export function drawChevrons(ctx, x, y, next, colour, litHex, shake, spark) {
  x = R(x) + shake; y = R(y);
  ctx.fillStyle = INK; ctx.fillRect(x - 15, y - 1, 30, 16);
  ctx.fillStyle = colour; ctx.fillRect(x - 14, y, 28, 14);
  for (let i = 0; i < 2; i++) {
    const lit = i === next;
    ctx.save(); ctx.translate(x - 7 + i * 13, y + 7);
    pathRoundedPoly(ctx, CHEV, 1); ink(ctx, lit ? litHex : INK);
    if (lit && spark) { ctx.fillStyle = MILK_HI; ctx.fillRect(-2, -2, 2, 2); }
    ctx.restore();
  }
}

/**
 * A spilled pail: an inked white puddle on the straw that steps DOWN a size every few frames and is gone. Nothing
 * in this scene alpha-fades - ART_STYLE section 5 keeps soft marks for steam and smoke and 0.2 wants a line round
 * every object - so it is stepped, exactly like the orchard's splats. `step` is 0..3; past that it draws nothing.
 */
const SPLASH_RX = Int8Array.of(13, 10, 7, 4), SPLASH_RY = Int8Array.of(5, 4, 3, 2);
export function drawSplash(ctx, x, y, step) {
  if (step < 0 || step >= SPLASH_RX.length) return;
  const rx = SPLASH_RX[step], ry = SPLASH_RY[step];
  x = R(x); y = R(y);
  ctx.fillStyle = INK; pathEllipse(ctx, x, y, rx + 1, ry + 1); ctx.fill();
  ctx.fillStyle = MILK; pathEllipse(ctx, x, y, rx, ry); ctx.fill();
  ctx.fillStyle = MILK_SH; pathEllipse(ctx, x + 1, y + 1, rx - 2, ry - 1); ctx.fill();
  if (step < 2) { ctx.fillStyle = INK; ctx.fillRect(x - rx - 4, y - 2, 3, 3); ctx.fillRect(x + rx + 2, y - 3, 3, 3); }
}

// ---------------------------------------------------------------- the butter churn
/**
 * The BARREL CHURN a butter visit stands beside every stall: an upright oak barrel on a trestle with a crank on its
 * near face, whose handle the milker turns. It is a different object from the tin churns on the rack on purpose -
 * those are the milk's score and this is a machine the crew works - so it wears the byre's oak (the furniture tone,
 * two steps up from the floor like the stool) with the cool tin kept for its hoops and the crank, so the one thing
 * that moves on it is the one cool mark.
 *
 * `hubY` is where the crank's axle is, handed in by the screen because it is worked out from the milker's OWN arm
 * the way the cow's udder is (screens/dairy.js): the barrel is then cut to reach 12 px above that hub and stands on
 * the trestle at `y`, so a mouse's churn is a hand shorter than a sheep's and each paw lands on its own handle.
 * `angle` is the crank in degrees (draw-only: the screen derives it from the press count), and `handle` false
 * draws the barrel without its crank arm, so the screen can lay the arm back over the milker's paw afterwards.
 */
export const CHURN_W = 22, CHURN_ABOVE_HUB = 12, TRESTLE_H = 6, CRANK_R = 8;
const OAK_LIT = mix(DAIRY.oak, MILK_HI, 0.25), OAK_SH = mix(DAIRY.oak, PLUM.shadow, 0.38);
export function drawBarrelChurn(ctx, x, y, hubY, angle, handle) {
  x = R(x); y = R(y); hubY = R(hubY);
  const top = hubY - CHURN_ABOVE_HUB, bot = y - TRESTLE_H, hw = CHURN_W >> 1;
  // the trestle: two splayed legs under the barrel's chime, the same oak dark the stool's legs are
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - hw + 4, bot); ctx.lineTo(x - hw - 2, y); ctx.moveTo(x + hw - 4, bot); ctx.lineTo(x + hw + 2, y); ctx.stroke();
  ctx.strokeStyle = DAIRY.oakDark; ctx.lineWidth = 3; ctx.stroke();
  // the barrel: one inked body bellied 2 px at the waist, staves as dark seams, a lit stave on the light side
  ctx.beginPath();
  ctx.moveTo(x - hw, top); ctx.lineTo(x + hw, top); ctx.quadraticCurveTo(x + hw + 4, (top + bot) / 2, x + hw, bot);
  ctx.lineTo(x - hw, bot); ctx.quadraticCurveTo(x - hw - 4, (top + bot) / 2, x - hw, top); ctx.closePath();
  ink(ctx, DAIRY.oak);
  ctx.save(); ctx.clip();
  ctx.fillStyle = OAK_SH; ctx.fillRect(x + 2, top, hw + 4, bot - top);
  ctx.fillStyle = OAK_LIT; ctx.fillRect(x - hw + 2, top + 2, 3, bot - top - 4);
  ctx.fillStyle = DAIRY.oakDark; ctx.fillRect(x - 3, top, 1, bot - top); ctx.fillRect(x + 5, top, 1, bot - top);
  // two tin hoops, each inside its own ink line
  for (let k = 0; k < 2; k++) {
    const hy = top + 6 + k * (bot - top - 15);
    ctx.fillStyle = INK; ctx.fillRect(x - hw - 4, hy - 1, CHURN_W + 8, 5);
    ctx.fillStyle = TIN; ctx.fillRect(x - hw - 4, hy, CHURN_W + 8, 3);
    ctx.fillStyle = TIN_SH; ctx.fillRect(x + 2, hy, hw + 4, 3);
  }
  ctx.restore();
  // the lid, a shade of milk showing at its rim: what is in there
  ctx.fillStyle = INK; ctx.fillRect(x - hw - 2, top - 4, CHURN_W + 4, 5);
  ctx.fillStyle = DAIRY.oakDark; ctx.fillRect(x - hw - 1, top - 3, CHURN_W + 2, 3);
  ctx.fillStyle = MILK; ctx.fillRect(x - hw + 2, top - 1, CHURN_W - 4, 1);
  // the crank's hub on the near face, and the arm if asked for
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, hubY, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = TIN_SH; ctx.beginPath(); ctx.arc(x, hubY, 2.5, 0, TAU); ctx.fill();
  if (handle) drawCrankArm(ctx, x, hubY, angle);
}
/**
 * The crank arm alone: a tin bar from the hub at (x, hubY) to a round oak knob CRANK_R out at `angle` degrees.
 * Drawn AFTER the milker in the churn phase so the knob reads on top of the paw that is turning it - the thing a
 * tapping player is watching go round.
 */
export function drawCrankArm(ctx, x, hubY, angle) {
  x = R(x); hubY = R(hubY);
  const kx = R(x + Math.cos(angle * DEG) * CRANK_R), ky = R(hubY + Math.sin(angle * DEG) * CRANK_R);
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, hubY); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.strokeStyle = TIN; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(kx, ky, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = DAIRY.oak; ctx.beginPath(); ctx.arc(kx, ky, 2.5, 0, TAU); ctx.fill();
}

/** A churn standing on the rack with its base at (x, y): the party's score, one churn per milk banked. */
export function drawChurn(ctx, x, y) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-8, 0); ctx.lineTo(-9, -15); ctx.lineTo(-5, -22); ctx.lineTo(-5, -25);
  ctx.lineTo(5, -25); ctx.lineTo(5, -22); ctx.lineTo(9, -15); ctx.lineTo(8, 0);
  ctx.closePath();
  ink(ctx, TIN);
  ctx.save(); ctx.clip();
  ctx.fillStyle = TIN_SH; ctx.fillRect(1, -25, 9, 25);
  ctx.fillStyle = TIN_HI; ctx.fillRect(-6, -18, 2, 16);
  ctx.fillStyle = CHURN_BAND; ctx.fillRect(-10, -12, 20, 3);
  ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(-7, -29, 14, 4);
  ctx.fillStyle = MILK; ctx.fillRect(-6, -28, 12, 2);                                   // the lid: the milk's colour
  ctx.fillStyle = INK; ctx.fillRect(-11, -20, 3, 5); ctx.fillRect(8, -20, 3, 5);        // handles
  ctx.restore();
}

/**
 * The swallow that lives under the eave, flying its circuit. Draw-only: it reads the screen's frame counter, never
 * the simulation, and never drops below the rack, so it cannot be mistaken for anything a player must press.
 * `flap` 0 or 1 raises the wings.
 */
export function drawSwallow(ctx, x, y, flap) {
  x = R(x); y = R(y);
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-2, 2); ctx.lineTo(-9, 5); ctx.lineTo(-5, 0); ctx.lineTo(-9, -4); ctx.lineTo(-2, -1);
  ctx.closePath();
  ink(ctx, SWALLOW);
  const wy = flap ? -7 : 3;
  ctx.beginPath();
  ctx.moveTo(1, 0); ctx.lineTo(-4, wy); ctx.lineTo(3, wy - 1); ctx.closePath();
  ink(ctx, SWALLOW);
  ctx.fillStyle = SWALLOW_THROAT; ctx.fillRect(3, -1, 3, 2);
  ctx.restore();
}
