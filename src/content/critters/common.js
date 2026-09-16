// The chibi critter rig: species hooks and the base animation set every playable animal shares
// (docs/ART_STYLE.md sections 2-5). Built on art/rig.js, the sibling game's humanoid paper-doll, with every
// part it draws as a human replaced: an animal head with a muzzle in the contour and species ears behind it, a
// round belly with a lighter front and an apron over it, mitt paws, paw feet, and a tail on the back layer.
//
// A species file calls critterBuild(spec) and gets a complete `build`; it may override any hook in spec.parts
// and add accessories (hat, bandana, scarf). Every hook obeys the readability rules: one 1 px outline per
// OBJECT (an ear is an object, a muzzle patch is a colour change inside the head's own ink), two tones on
// narrow parts, colours through rig.col() so the hit flash still works, nothing under 2 px, no allocation.
import { celPath, celBall, celRect, celCapsule, celTaper, celPoly, tones, makeTones, pathRR, pathCap, band, wantSh } from '../../art/shading.js';
import { hexToRgb, rgbToHex } from '../../art/palettes.js';
import { pathTaperedCapsule } from '../../art/shapes.js';
import { getChain } from '../../art/secondary.js';
import { P, FACE } from '../../art/poses.js';
import { brow } from '../../art/rigParts.js';
import { rad } from '../../engine/math.js';
import { PLAYER_COLORS, OFF_DUTY_APRON } from '../../constants.js';
import { buildRig } from '../../art/rig.js';

const R = Math.round;
const TAU = Math.PI * 2;
/** Every critter's outline: warm near-black (docs/ART_STYLE.md section 3). */
export const INK = '#2A1F1A';

/**
 * Reference proportions: about 2.3 heads tall, 56 px standing at scale 1.
 *
 * `shoulderX` is 0.25 torsoW, not the humanoid rig's 2 px: the apron IS the player spot (docs/ART_STYLE.md
 * section 4) and an arm rooted near the centre line hangs straight down the middle of the bib whatever angle it is
 * given. Rooted out at the shoulder the same near-vertical arm falls down the torso's OUTER edge and the seat
 * colour keeps one unbroken block. Each cast member sets its own (0.33 torsoW) in its proportions.
 */
export const CHIBI = Object.freeze({
  headR: 12, neck: 1, torsoW: 24, torsoH: 18, hip: 20, upperArm: 8, lowerArm: 7, handR: 4.5,
  upperLeg: 6, lowerLeg: 6, footL: 9, footH: 5, armR: 3.5, legR: 4, bulge: 0.15, shoulderX: 6, hipX: 4, neckR: 4,
});

/**
 * Palette keys a critter uses (docs/ART_STYLE.md section 4):
 *   skin = fur, hair = dark fur / markings / brows, belly = light fur (muzzle, belly, inner ear, paw pads),
 *   primary = apron, secondary = legs, shorts = the hip block, accent = trim / hat / bell, dark = nose + boots,
 *   sleeve = fur (set for you). The defaults are a neutral warm-brown critter so a half-written species file still
 *   passes the ladder; every cast member overrides all of skin/hair/belly/secondary/shorts (art-check holds it).
 */
export const DEFAULT_PALETTE = Object.freeze({
  skin: '#B07A4A', hair: '#6B4326', belly: '#F3E5CF', primary: OFF_DUTY_APRON, secondary: '#5E3A1B', shorts: '#5E3A1B', accent: '#F2C14E', metal: '#C8C0B0', dark: '#2A1F1A', glow: '#FFE28A',
});

// ---------------------------------------------------------------- ears (head space, behind the skull)
const EAR_NEAR = { x: 0.42, y: -0.8 }, EAR_FAR = { x: -0.5, y: -0.72 };
/** Plum for straps and hat bands: the world's shadow colour, so a strap never reads as a fifth player colour. */
export const PLUM_STRAP = '#5A3A46';
function drawEar(ctx, rig, kind, x, y, r, fur, light, tip, isFar, ang, earR) {
  ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(rad(ang));
  const er = R(r * earR);
  if (kind === 'round') {
    celBall(ctx, rig, 0, 0, er, fur, false);
    if (!rig.override) { ctx.fillStyle = rig.col(light); ctx.beginPath(); ctx.arc(0, 1, R(er * 0.5), 0, TAU); ctx.fill(); }
  } else if (kind === 'point' || kind === 'small') {
    const w = kind === 'small' ? R(r * 0.34) : R(r * 0.42), h = kind === 'small' ? R(r * 0.6) : R(r * 0.95);
    celPoly(ctx, rig, [-w, R(r * 0.25), w, R(r * 0.25), 0, -h], fur, 0.3, 0);
    if (!rig.override) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(-w, R(r * 0.25)); ctx.lineTo(w, R(r * 0.25)); ctx.lineTo(0, -h); ctx.closePath(); ctx.clip();
      if (tip) { ctx.fillStyle = rig.col(tip); ctx.fillRect(-w, -h, w * 2, R(h * 0.4)); }             // dark tip: a marking, no line
      ctx.fillStyle = rig.col(light); ctx.beginPath(); ctx.moveTo(-R(w * 0.5), R(r * 0.2)); ctx.lineTo(R(w * 0.5), R(r * 0.2)); ctx.lineTo(0, -R(h * 0.45)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'long') {
    const w = R(r * 0.3), h = R(r * 1.5);
    celCapsule(ctx, rig, 0, 0, 0, -h, w, fur, 0);
    if (!rig.override) {
      ctx.save(); pathCap(ctx, 0, 0, 0, -h, w); ctx.clip();
      if (tip) { ctx.fillStyle = rig.col(tip); ctx.fillRect(-w - 1, -h - w - 1, w * 2 + 2, R(h * 0.3)); }   // dark tip inside the ear's own ink
      ctx.fillStyle = rig.col(light); ctx.beginPath(); ctx.ellipse(0, -R(h * 0.45), R(w * 0.45), R(h * 0.32), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  } else if (kind === 'droop') {
    // A sheep's ear: a flap hanging back and down from under the wool. At 0.62r from behind the skull only two
    // pixels of it cleared the head and the near ear read as a shadow; at 0.85r, hung beside the jaw, both flaps
    // clear the silhouette (ART_STYLE section 1 counts the drooping ears as one of Barley's four cues).
    const L = R(r * 0.85), w = R(r * 0.2);
    celCapsule(ctx, rig, 0, 0, -L, R(L * 0.9), w, fur, 0);
    if (!rig.override) { ctx.fillStyle = rig.col(light); ctx.fillRect(-L - 1, R(L * 0.9) - 1, 3, 3); }   // one inner-ear mark at the tip
  }
  ctx.restore();
}
/** Both ears; long ears lag on a two-segment chain, drooping ones on one, so they flop when the head moves. */
function drawEars(ctx, rig, r, kind, spec) {
  if (kind === 'none' || kind === 'dome') return;   // domes are eyes: drawn over the skull by makeHead
  const pal = rig.palette, far = rig.paletteFar;
  const tip = rig.build.earTip ? rig.col(pal.hair) : null;
  const slot = spec.earSlot || 'skin', earR = spec.earR || 0.4;
  const pos = spec.earPos || null, pn = pos ? pos.near : EAR_NEAR, pf = pos ? pos.far : EAR_FAR;
  let a0 = 0, a1 = 0;
  if (kind === 'long') {
    const ch = getChain(rig, 'ears', 2, { joint: 'head', rest: [0, -1], stiffness: 0.18, damping: 0.68, gain: 1.5, maxAng: 32 });
    a0 = ch.ang[0]; a1 = ch.ang[0] * 0.7 + ch.ang[1];
  } else if (kind === 'droop') {
    const ch = getChain(rig, 'ears', 1, { joint: 'head', rest: [-1, 0.9], stiffness: 0.16, damping: 0.7, gain: 2.2, maxAng: 28 });
    a0 = ch.ang[0]; a1 = ch.ang[0] * 0.8;
  }
  const splayF = kind === 'long' ? -18 : kind === 'droop' ? 14 : 0;
  const splayN = kind === 'long' ? 12 : kind === 'droop' ? -10 : 0;
  drawEar(ctx, rig, kind, R(r * pf.x), R(r * pf.y), r, far[slot], far.belly, tip, true, a1 + splayF, earR);
  drawEar(ctx, rig, kind, R(r * pn.x), R(r * pn.y), r, pal[slot], pal.belly, tip, false, a0 + splayN, earR);
}

// ---------------------------------------------------------------- head (head space, faces +x)
const MUZZLE = { mx: 0, my: 0, rx: 0, ry: 0 };
/** Muzzle ellipse in head space for a head of radius r (one shared object: hooks never retain it). */
export function muzzleGeom(r, size) { MUZZLE.mx = R(r * 0.5); MUZZLE.my = R(r * 0.4); MUZZLE.rx = R(r * 0.62 * size); MUZZLE.ry = R(r * 0.4 * size); return MUZZLE; }
/**
 * A frog's eye domes (ears: 'dome'): two light balls that sit ON the crown, drawn after the skull so they bulge
 * out of it; critterFace puts the pupils at their centres. Fractions of headR; the near one is drawn last.
 */
export const DOME = Object.freeze({ nearX: 0.44, farX: -0.34, y: -0.86, r: 0.4 });
/** Animal head: ears, then skull + muzzle as ONE inked contour, a lighter muzzle patch inside it, markings, nose. */
export function makeHead(spec) {
  const ears = spec.ears || 'round', size = spec.muzzle != null ? spec.muzzle : 1, nose = spec.nose !== false;
  // `muzzleHex` colours the patch on its own, for a species whose light fur is needed elsewhere at full brightness
  // (Cress: `belly` is the two eye domes, which must stay the whites, so the mouth patch takes a darker green).
  const muzzleHex = spec.muzzleHex || null;
  return function head(ctx, rig, pose, inf) {
    const r = inf.r, pal = rig.palette;
    drawEars(ctx, rig, r, ears, spec);
    const g = muzzleGeom(r, size);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.moveTo(g.mx + g.rx, g.my); ctx.ellipse(g.mx, g.my, g.rx, g.ry, 0, 0, TAU);
    celPath(ctx, rig, pal.skin, 0, 0, r, 0.32, 0.3);
    if (rig.override) return;
    // muzzle: a colour change inside the head's own ink, so no line of its own (ART_STYLE 0.2)
    ctx.save(); ctx.beginPath(); ctx.ellipse(g.mx, g.my, g.rx, g.ry, 0, 0, TAU); ctx.clip();
    const lt = tones(rig, muzzleHex || pal.belly);
    ctx.fillStyle = lt.base; ctx.fillRect(g.mx - g.rx, g.my - g.ry, g.rx * 2, g.ry * 2);
    ctx.fillStyle = lt.sh; ctx.fillRect(g.mx - g.rx, g.my + R(g.ry * 0.4), g.rx * 2, g.ry);
    ctx.restore();
    if (spec.markings) spec.markings(ctx, rig, pose, inf);
    // markings hooks call muzzleGeom themselves (barley's dark face, the customers' beaks) and it hands out ONE
    // shared object, so `g` may have been overwritten: read the geometry again before placing the nose on the tip.
    const g2 = muzzleGeom(r, size);
    // nose: one dark rounded mark at the muzzle tip, 5x4 (above the 2 px floor, below "a separate object")
    if (nose) { ctx.fillStyle = rig.col(pal.dark); pathRR(ctx, g2.mx + g2.rx - 5, g2.my - 4, 5, 4, 2); ctx.fill(); }
    if (ears === 'dome') {
      celBall(ctx, rig, R(r * DOME.farX), R(r * DOME.y), R(r * DOME.r), pal.belly, false);
      celBall(ctx, rig, R(r * DOME.nearX), R(r * DOME.y), R(r * DOME.r), pal.belly, false);
    }
  };
}
/**
 * The y a hat band's bottom edge sits at: one pixel above the brow row, whatever the head size. Chibi heads have
 * almost no forehead, so a hat placed at a fixed fraction of r lands on the brows of one critter and floats over
 * the skull of the next; a critter that wears a hat lowers its eyes a little (face.eyeY) to make room.
 */
export function hatY(rig) { const fo = rig.faceOpts || {}; return R(-rig.p.headR * 0.42) + (fo.eyeY || 0) - 5; }
/** Raccoon-style mask: a dark band across the eye row, drawn before the face so the eyes sit on it. */
export function maskMarking(ctx, rig, pose, inf) {
  const r = inf.r;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(rig.palette.hair);
  ctx.beginPath(); ctx.ellipse(R(r * 0.15), R(-r * 0.2), R(r * 0.95), R(r * 0.32), 0, 0, TAU); ctx.fill();
  ctx.restore();
}
/** Cheek patch: a lighter oval behind the eye (a fox's white cheek, a hamster's pouch). */
export function cheekMarking(ctx, rig, pose, inf) {
  const r = inf.r;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(rig.palette.belly);
  ctx.beginPath(); ctx.ellipse(R(-r * 0.35), R(r * 0.35), R(r * 0.45), R(r * 0.4), 0, 0, TAU); ctx.fill();
  ctx.restore();
}


// ---------------------------------------------------------------- face (head space)
/**
 * Critter face: two big whites with 3x3 pupils, 2 px brows, a mouth on the muzzle. Driven by pose.face (FACE):
 * neutral | happy (lifted brows, smile) | hurt (sad brows, frown) | shout (open mouth) | dazed (x eyes) | closed (blink)
 * | angry / grit (brows down). Pupils are 3 px so the 2 px floor never eats them; whites are 6x5 at headR 12.
 */
export function critterFace(ctx, rig, pose, inf) {
  const r = inf.r, pal = rig.palette, face = pose.face | 0, fo = rig.faceOpts || {};
  const ink = rig.col(rig.outline), white = rig.col('#FFF8EC'), pupil = rig.col('#1E1512');
  // dome eyes (ears: 'dome'): the whites are the domes on the crown, so the eye row moves up onto them
  const dome = !!fo.domeEyes;
  // dome eyes: the 3 px pupil (drawn at ex + 2, ey + 1) lands on each dome's centre
  const ew = R(r * 0.5), eh = R(r * 0.42), ey = dome ? R(r * DOME.y) - 2 : R(-r * 0.42) + (fo.eyeY || 0), ex = dome ? R(r * DOME.nearX) - 3 : R(r * 0.32), fx = dome ? R(r * DOME.farX) - 3 : R(-r * 0.36);
  const happy = face === FACE.happy, closed = face === FACE.closed, hurt = face === FACE.hurt, dazed = face === FACE.dazed;
  const angry = face === FACE.angry || face === FACE.grit, shout = face === FACE.shout;
  // whitesAlways (a dark face): an ink arc or blink on dark fur is invisible, so the whites stay under them
  if (fo.whitesAlways && !dome && (dazed || closed)) { ctx.fillStyle = white; ctx.fillRect(ex, ey, ew, eh); ctx.fillRect(fx, ey, ew, eh); }
  ctx.fillStyle = ink;
  if (dazed) {
    for (const x of [ex, fx]) for (let i = 0; i < 4; i++) { ctx.fillRect(x + i, ey + i, 2, 2); ctx.fillRect(x + 4 - i, ey + i, 2, 2); }
  } else if (closed) {
    for (const x of [ex, fx]) ctx.fillRect(x, ey + 3, ew, 2);   // a blink is a flat 2 px bar
  } else {
    // `happy` keeps the WHITES AND THE PUPILS and smiles with the mouth and the brows. It used to shut both eyes
    // into ink arcs, and happy is now the cast's RESTING face (makeCritterAnims idle / carry), so arcs would have
    // taken the gaze - the one feature §0 says a viewer must pick out at a squint - off the cast on every screen,
    // and left 3 px pupils only on the effort keys. The closed-eye beam belongs to the blink (`closed`).
    if (!dome) { ctx.fillStyle = white; ctx.fillRect(ex, ey, ew, eh); ctx.fillRect(fx, ey, ew, eh); }
    ctx.fillStyle = pupil;
    const py = ey + 1, px = 2;   // pupils sit forward (toward facing) in the white
    ctx.fillRect(ex + px, py, 3, 3); ctx.fillRect(fx + px, py, 3, 3);
    if (angry) { ctx.fillStyle = ink; ctx.fillRect(ex, ey, ew, 1); ctx.fillRect(fx, ey, ew, 1); }   // lids pressed down
    ctx.fillStyle = white; ctx.fillRect(ex + px, py, 1, 1); ctx.fillRect(fx + px, py, 1, 1);      // catchlight
  }
  // brows: one 2 px bar each, 2 px clear of the whites (dome eyes carry no brows: the dome IS the brow line)
  ctx.fillStyle = rig.col(pal.hair);
  const by = ey - 4;
  if (dome && !angry && !hurt) { drawCritterMouth(ctx, rig, r, face, ink); return; }
  if (angry) { brow(ctx, ex - 1, by - 2, ex + ew, by + 1, 2); brow(ctx, fx - 1, by, fx + ew, by - 2, 2); }
  else if (hurt) { brow(ctx, ex - 1, by + 1, ex + ew, by - 2, 2); brow(ctx, fx - 1, by - 2, fx + ew, by + 1, 2); }
  // happy lifts both brows one pixel clear of the whites: the smile reads from the top of the head as well as the mouth
  else { const hy = happy ? by - 1 : by; ctx.fillRect(ex - 1, hy, ew + 1, 2); ctx.fillRect(fx - 1, hy, ew + 1, 2); }
  drawCritterMouth(ctx, rig, r, face, ink);
}
/** The mouth, on the muzzle under the nose. */
function drawCritterMouth(ctx, rig, r, face, ink) {
  const shout = face === FACE.shout, hurt = face === FACE.hurt, happy = face === FACE.happy, angry = face === FACE.angry || face === FACE.grit;
  const g = muzzleGeom(r, rig.build.muzzle != null ? rig.build.muzzle : 1);
  const mx = g.mx + R(g.rx * 0.2), my = g.my + R(g.ry * 0.45);
  ctx.fillStyle = ink;
  // wideMouth (a frog): the calm mouths are one long 2 px line across the muzzle instead of the small curl
  if (rig.faceOpts && rig.faceOpts.wideMouth && !shout && !hurt) {
    const w = R(g.rx * 1.1), x0 = mx - R(w * 0.55);
    if (happy) { ctx.fillRect(x0 - 1, my - 2, 2, 2); ctx.fillRect(x0 + w - 1, my - 2, 2, 2); }
    ctx.fillRect(x0, my, w, 2);
    return;
  }
  if (shout) { ctx.fillRect(mx - 3, my - 2, 6, 5); ctx.fillStyle = rig.col('#A03030'); ctx.fillRect(mx - 2, my, 4, 2); }
  else if (hurt) { ctx.fillRect(mx - 3, my + 1, 2, 2); ctx.fillRect(mx - 1, my, 4, 2); ctx.fillRect(mx + 3, my + 1, 2, 2); }
  else if (happy || face === FACE.neutral && false) { ctx.fillRect(mx - 3, my - 1, 2, 2); ctx.fillRect(mx - 1, my, 4, 2); ctx.fillRect(mx + 3, my - 1, 2, 2); }
  else if (angry) { ctx.fillRect(mx - 2, my, 5, 2); }
  else { ctx.fillRect(mx - 2, my, 2, 2); ctx.fillRect(mx, my + 1, 3, 2); }
}

// ---------------------------------------------------------------- body (torso space: origin hip centre, y up)
function eggPath(ctx, hw, H) {
  ctx.beginPath();
  ctx.moveTo(-hw * 0.7, -H);
  ctx.quadraticCurveTo(-hw * 1.15, -H * 0.55, -hw, -H * 0.15); ctx.quadraticCurveTo(-hw * 0.9, 4, -hw * 0.5, 4);
  ctx.lineTo(hw * 0.5, 4); ctx.quadraticCurveTo(hw * 0.9, 4, hw, -H * 0.15); ctx.quadraticCurveTo(hw * 1.15, -H * 0.55, hw * 0.7, -H);
  ctx.closePath();
}
/** Round belly in fur with a lighter front, then the apron (a separate garment: its own ink) and its straps. */
export function makeTorso(spec) {
  const apron = spec.apron !== false;
  return function torso(ctx, rig, pose, inf) {
    const W = inf.w, H = inf.h, pal = rig.palette, hw = R(W / 2);
    eggPath(ctx, hw, H);
    celPath(ctx, rig, pal.skin, 0, R(-H * 0.45), R(Math.max(hw, H * 0.6)), 0.34, 0.28);
    if (!rig.override) {
      ctx.save(); eggPath(ctx, hw, H); ctx.clip();
      ctx.fillStyle = tones(rig, pal.belly).base;
      ctx.beginPath(); ctx.ellipse(R(hw * 0.3), R(-H * 0.32), R(hw * 0.6), R(H * 0.5), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (apron) {
      // THE APRON IS THE PLAYER SPOT (ART_STYLE section 4): it has to be the biggest single mark on the body at 1x,
      // so the bib is as wide as the silhouette can carry (0.80 W is the egg's own half-width at the bib's top row,
      // 0.8 H up) and runs from just under the collar to under the hip block. It is centred, not nudged aside: with
      // the shoulders out at 0.33 W (CHIBI.shoulderX) both arms now hang down the torso's outer edges instead of
      // across the bib, so the seat colour reads as ONE block rather than a sliver either side of a forearm.
      const aw = R(W * 0.8), ax = -R(aw / 2), ay = R(-H * 0.8), ah = 4 - ay;
      band(ctx, rig, ax + 2, -H + 1, 4, ay + H + 3, pal.primary);   // straps first (under the bib), 4 px inked bands
      band(ctx, rig, ax + aw - 6, -H + 1, 4, ay + H + 3, pal.primary);
      pathRR(ctx, ax, ay, aw, ah, 3);
      celPath(ctx, rig, pal.primary, ax + aw / 2, ay + ah / 2, R(Math.max(aw, ah) / 2), 0.36, 0.25);
      if (!rig.override) { ctx.fillStyle = tones(rig, pal.primary).sh; ctx.fillRect(ax + 3, R(-H * 0.42), aw - 6, 2); } // one pocket seam, 2 px
    }
    if (spec.chest) spec.chest(ctx, rig, pose, inf);
  };
}
/** Short trousers: a rounded block over the leg roots, so the near leg emerges from inside it rather than sitting on it. */
export function makeHips(spec) {
  return function hips(ctx, rig, pose, inf) {
    // the block scales with the torso (6..8 px) so a 16 px mouse torso is not half shorts — and every pixel the
    // shorts give back is a pixel of the apron above them, which is the player's own colour (ART_STYLE section 4)
    const hip = inf.w, hw = R(hip / 2), h = Math.max(6, Math.min(8, R(rig.p.torsoH * 0.45)));
    celRect(ctx, rig, -hw, -R(h / 2), hip, h, 4, rig.palette.shorts || rig.palette.secondary, 0.4, 0.2);
  };
}

// ---------------------------------------------------------------- paws
/** Mitt paw (hand space: +x along the forearm, origin at the wrist). */
export function pawHand(ctx, rig, pose, inf) {
  const r = inf.r, fur = inf.pal.skin;
  celBall(ctx, rig, R(r * 0.5), 0, r, fur, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.pal.belly); ctx.fillRect(R(r * 0.5) - 1, -1, 3, 3);   // one pad
}
/** Paw foot (ankle space: origin at the ankle, toe toward +x, y down). */
export function pawFoot(ctx, rig, pose, inf) {
  const L = inf.w, H = inf.h, fur = inf.pal.skin;
  pathRR(ctx, R(-L * 0.4), -H, R(L * 1.05), R(H * 1.5), R(H * 0.7));
  celPath(ctx, rig, fur, R(L * 0.12), R(-H * 0.25), R(L * 0.55), 0.35, 0);
  if (rig.override) return;
  // toes in `hair`, not the fur's own shadow tone: on Cress's #3F7D3B the shadow band was the same green and the
  // 11 px foot read as a plain disc. inf.pal so the far foot's toes come from the far palette.
  ctx.fillStyle = rig.col(inf.pal.hair); ctx.fillRect(R(L * 0.52), -2, 2, 3); ctx.fillRect(R(L * 0.22), -2, 2, 3);   // two toes
}
/** Clog / boot in `dark` with a light sole band, for the critter who wears shoes. */
export function makeBoot(hex) {
  return function boot(ctx, rig, pose, inf) {
    const L = inf.w, H = inf.h;
    pathRR(ctx, R(-L * 0.4), -H, R(L * 1.05), R(H * 1.5), 2);
    celPath(ctx, rig, hex, R(L * 0.12), R(-H * 0.25), R(L * 0.55), 0.35, 0);
    if (rig.override) return;
    ctx.fillStyle = tones(rig, hex).sh; ctx.fillRect(R(-L * 0.4) + 1, R(H * 0.5) - 1, R(L * 1.05) - 2, 2);
  };
}

// ---------------------------------------------------------------- tail (hip space, back layer, +x forward)
export function makeTail(kind, hex = null) {
  return { attach: 'hip', layer: 'back', draw(ctx, rig, pose) {
    if (kind === 'none') return;   // a frog
    const pal = rig.palette, fur = hex || pal.skin, hw = R(rig.p.hip / 2);
    const ch = getChain(rig, 'tail', 2, { joint: 'torso', rest: [-1, 0.2], stiffness: 0.12, damping: 0.72, gain: 1.8, maxAng: 35 });
    ctx.save(); ctx.translate(-hw + 2, -3); ctx.rotate(rad(ch.ang[0]));
    if (kind === 'stub') celBall(ctx, rig, -3, -1, 4, fur, false);
    else if (kind === 'puff') celBall(ctx, rig, -4, -1, 5, pal.belly, false);
    else if (kind === 'bushy') {
      celTaper(ctx, rig, 0, 0, -22, -9, 5, 6, fur, 0);
      if (!rig.override) { ctx.save(); ctx.beginPath(); ctx.arc(-22, -9, 6, 0, TAU); ctx.clip(); ctx.fillStyle = rig.col(pal.belly); ctx.fillRect(-30, -17, 9, 16); ctx.restore(); }
    } else if (kind === 'ring') {
      celCapsule(ctx, rig, 0, 0, -20, -7, 4.5, fur, 0);
      if (!rig.override) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-24, -14); ctx.lineTo(-24, 0); ctx.lineTo(0, 6); ctx.closePath(); ctx.clip();
        ctx.fillStyle = rig.col(pal.hair); ctx.translate(0, 0); ctx.rotate(Math.atan2(-7, -20));
        for (let x = -6; x > -21; x -= 6) ctx.fillRect(x - 3, -6, 3, 12);   // rings: 3 px markings inside the tail's ink
        ctx.restore();
      }
    } else if (kind === 'thin') {
      // A mouse's tail, not a plank: THREE tapered links appended into ONE path (stroked once, filled once, so the
      // curve carries a single outline and no seam is inked across it), 4 px at the root down to 2 px at the tip,
      // sweeping back and up. The flat 5 px capsule it replaces read as a baguette held at 45 degrees.
      ctx.beginPath();
      pathTaperedCapsule(ctx, 0, 0, -6, -2, 2.4, 1.9, true);
      pathTaperedCapsule(ctx, -6, -2, -11, -6, 1.9, 1.4, true);
      pathTaperedCapsule(ctx, -11, -6, -15, -13, 1.4, 1, true);
      celPath(ctx, rig, fur, -8, -5, 2.4, 0.36, 0);
    }
    ctx.restore();
  } };
}

// ---------------------------------------------------------------- accessories
const TOQUE = '#F4F0E6';
/**
 * Chef's toque: a 4 px inked band in `bandHex` (null = white) on the hairline and one puffed white mass above it,
 * drawn as ONE path (a rounded block with two balls on top) so the puff carries a single scalloped outline.
 */
export function toque(bandHex = null) {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = hatY(rig), w = R(r * 1.3), hw = R(w / 2), h = R(r * 0.8);
    const top = y - 4 - h;
    ctx.beginPath();
    pathRR(ctx, -hw, top, w, h + 2, 3);
    ctx.moveTo(-hw + R(w * 0.3) + R(r * 0.3), top); ctx.arc(-hw + R(w * 0.3), top, R(r * 0.3), 0, TAU);
    ctx.moveTo(-hw + R(w * 0.68) + R(r * 0.36), top - 1); ctx.arc(-hw + R(w * 0.68), top - 1, R(r * 0.36), 0, TAU);
    celPath(ctx, rig, TOQUE, 0, top + R(h * 0.4), R(w * 0.6), 0.34, 0.3);
    band(ctx, rig, -hw - 1, y - 4, w + 2, 4, bandHex || TOQUE);
  } };
}
/** Chef hat with a white band (the pre-toque export; kept so nothing built against it moves). */
export const chefHat = toque(null);
/** Bandana: a triangle of `hex` tied round the head, knot at the back (head space). */
export function bandana(hex) {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR;
    celPoly(ctx, rig, [-R(r * 0.95), -R(r * 0.35), R(r * 0.95), -R(r * 0.35), R(r * 0.8), -R(r * 0.72), -R(r * 0.8), -R(r * 0.72)], hex, 0.35, 0);
    celPoly(ctx, rig, [-R(r * 0.9), -R(r * 0.5), -R(r * 1.35), -R(r * 0.3), -R(r * 1.25), -R(r * 0.7)], hex, 0.35, 0);
  } };
}
/** The knot's three points, refilled per draw: a hook allocates nothing (ART_STYLE section 9). */
const KNOT = [0, 0, 0, 0, 0, 0];
/** Neckerchief: a knotted triangle at the collar (torso space). Pair with scarfTail for the streaming end. */
export function scarf(hex) {
  return { attach: 'torso', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
    // a small knot: at hw*1.2 wide it covered the top third of the apron, the player spot
    // the knot ties at the FAR shoulder: over the near one it sat on the top third of the apron, the player spot
    KNOT[0] = -R(hw * 0.6); KNOT[1] = -H + 2; KNOT[2] = R(hw * 0.25); KNOT[3] = -H + 2; KNOT[4] = -R(hw * 0.1); KNOT[5] = -H + 8;
    celPoly(ctx, rig, KNOT, hex, 0.35, 0);
  } };
}
/**
 * The scarf's loose end: two links streaming back from the nape on a chain (torso space, back layer), appended into
 * ONE tapered path. Two equal 5 px capsules at 45 degrees read as a bone lying against the fur — the cream stick the
 * art director called a far arm — so the end now tapers 6 px to 2 px, is a third shorter, and rests further back.
 */
export function scarfTail(hex) {
  return { attach: 'torso', layer: 'back', draw(ctx, rig) {
    const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2), L = R(hw * 0.45);
    const ch = getChain(rig, 'scarf', 2, { joint: 'torso', rest: [-1, 0.45], stiffness: 0.14, damping: 0.7, gain: 2.6, maxAng: 45 });
    ctx.save(); ctx.translate(-R(hw * 0.6), -H + 4);
    let px = 0, py = 0, a = 0, r = 3;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      a += rad(ch.ang[i]);
      const c = Math.cos(a), s = Math.sin(a), nr = r - 0.9;
      const nx = px + -L * c - L * s, ny = py + -L * s + L * c;
      pathTaperedCapsule(ctx, px, py, nx, ny, r, nr, true);
      px = nx; py = ny; r = nr;
    }
    celPath(ctx, rig, hex, R(-L * 0.6), R(L * 0.6), 3, 0.36, 0);
    ctx.restore();
  } };
}
/** Flat cap: a low dome on the hairline with a 4 px peak forward (head space). */
export function cap(hex) {
  return { attach: 'head', draw(ctx, rig) {
    const r = rig.p.headR, y = hatY(rig);
    ctx.beginPath(); ctx.ellipse(0, y, R(r * 0.98), R(r * 0.62), 0, Math.PI, 0); ctx.closePath();
    celPath(ctx, rig, hex, 0, y - R(r * 0.3), R(r * 0.8), 0.35, 0.25);
    band(ctx, rig, R(r * 0.45), y - 2, R(r * 0.8), 4, hex, 2);
  } };
}

/**
 * Assemble a critter build from a species spec:
 * { palette, ears: 'round'|'point'|'long'|'small'|'droop'|'dome'|'none', earTip, earR (round ear radius / headR, 0.4),
 *   earPos { near: {x,y}, far: {x,y} } (fractions of headR), earSlot ('skin' | 'hair': what colours the ear),
 *   muzzle (size 0.8..1.2), nose (false = none), markings (fn), tail: 'stub'|'puff'|'bushy'|'ring'|'thin'|'none', tailHex,
 *   apron (false = none), boots (hex), proportions, scale, accessories: [], parts: {} (overrides), face: {} }
 */
export function critterBuild(spec) {
  const palette = { ...DEFAULT_PALETTE, ...(spec.palette || {}) };
  palette.sleeve = palette.skin;
  if (!palette.shorts) palette.shorts = palette.secondary;
  return {
    scale: spec.scale || 1,
    proportions: { ...CHIBI, ...(spec.proportions || {}) },
    // storybook paint is matte: a softer ramp than the sibling's arcade 1.22 / 0.66 (docs/ART_STYLE.md section 3)
    ramp: { hi: 1.16, sh: 0.72, ...(spec.ramp || {}) },
    // Far limbs read as a limb BEHIND the body, never as a pale stick lying on it. The humanoid rig's 0.62 / 0.25
    // left the far arm of a pale fur a cream tube and of a dark fur a light stripe; 0.52 / 0.42 lands every far
    // limb BELOW its own near fur's shadow tone and pulls most of the chroma out, so it recedes instead of reading
    // as a bone (docs/ART_STYLE.md section 0.4). Never darkened twice: the hooks colour from info.pal.
    farShade: spec.farShade != null ? spec.farShade : 0.52,
    farDesat: spec.farDesat != null ? spec.farDesat : 0.42,
    palette, outline: INK, earTip: !!spec.earTip,
    face: { eyeY: -2, big: true, brow: palette.hair, mouthY: 0, ...(spec.face || {}) },
    muzzle: spec.muzzle != null ? spec.muzzle : 1,
    parts: { head: makeHead(spec), face: critterFace, torso: makeTorso(spec), hips: makeHips(spec), hand: pawHand, foot: spec.boots ? makeBoot(spec.boots) : pawFoot, ...(spec.parts || {}) },
    accessories: [makeTail(spec.tail || 'stub', spec.tailHex || null), ...(spec.accessories || [])],
    weapon: null,
  };
}

/**
 * The cel ramp's cool drift, made PROPORTIONAL to the colour's own chroma instead of absolute. The shared
 * `toneOf` (art/shading.js, not this owner's file) shades a shadow band as `b * (f + 0.12) + 8`: an absolute blue
 * lift that swamps the hue of anything whose blue channel is already high. Barley's wool #F1E4C8 came back
 * #AEABB0 (chroma 4) — a cream sheep in a grey helmet — and the same neutral landed on every cream scarf, muzzle
 * and paw pad in the cast. Drifting the blue by `0.12 * f * chroma` keeps the fur's own hue in its shadow
 * (#F1E4C8 -> #AEAB94, chroma 26) and leaves a saturated colour's band exactly where it was.
 */
function warmShade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const c = Math.max(r, g, b) - Math.min(r, g, b);
  return rgbToHex(r * f, g * (f + 0.03), b * f + 0.12 * f * c);
}
/**
 * A rig's tone cache (art/shading.js `tones` reads and fills it) with every shadow band re-warmed on the first
 * use of a colour: the highlight and rim tones are the shared ramp's, untouched. One ramp per colour per rig,
 * allocated on first use exactly as before, so a draw hook still allocates nothing.
 */
class CritterTones extends Map {
  /** @param {{hi:number,sh:number,rim:number}} ramp */
  constructor(ramp) { super(); this.ramp = ramp; }
  /** @param {string} hex */
  get(hex) {
    let t = super.get(hex);
    if (t || typeof hex !== 'string' || hex[0] !== '#') return t;
    t = makeTones(hex, this.ramp);
    t.sh = warmShade(hex, this.ramp.sh);
    t.deep = warmShade(hex, this.ramp.sh * 0.78);
    super.set(hex, t);
    return t;
  }
}
/**
 * A rig for a cast member in a given seat: the apron (and its straps) in that seat's player colour, or the
 * off-duty apron for slot -1 (gallery, customers, the title's idle crew). Tones are cached per rig per colour, so
 * build this ONCE when the seat is assigned (in enter()), never in draw().
 */
export function critterRig(def, slot = -1) {
  const apron = slot >= 0 && slot < PLAYER_COLORS.length ? PLAYER_COLORS[slot] : OFF_DUTY_APRON;
  const rig = buildRig({ ...def.build, palette: { ...def.build.palette, primary: apron } });
  rig.tones = new CritterTones(rig.ramp);
  // `farShade` (art/palettes.js, not this owner's file) ends on a flat `+ 6` of blue, which is most of what is
  // left of a far limb's chroma once it has been darkened and pulled toward grey: it turned Barley's far paw
  // (#7B7774) and Chicory's far paw pad (#77716C) into the same neutral ball. Taking the flat lift back off
  // keeps the documented "darker and greyer" far palette (0.52 / 0.42) while each critter's far side still
  // carries its own hue (docs/ART_STYLE.md section 0.4).
  for (const k of Object.keys(rig.paletteFar)) {
    const v = rig.paletteFar[k];
    if (typeof v === 'string' && v[0] === '#') { const [r, g, b] = hexToRgb(v); rig.paletteFar[k] = rgbToHex(r, g, b - 6); }
  }
  return rig;
}

// ---------------------------------------------------------------- the base animation set
/** Keyframe shorthand: F(dur, spec, extra) -> { dur, pose: P(spec), ...extra }. */
export const F = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });
// REST: both arms HANG, near vertical, with a soft elbow, down the outside of the torso. At [40, 8] the near arm
// lay across the belly as a horizontal bar and split the apron - the player's own colour - into two slivers; the
// arm root itself is now out at the shoulder (CHIBI.shoulderX), so 14 degrees of upper and 12 of elbow is all it
// takes to carry the whole limb past the bib's edge. The far arm hangs back behind the torso: only its paw shows,
// past the hip, which is where a far paw belongs (docs/ART_STYLE.md sections 0.4, 0.7).
const REST = { armR: [14, 12], armL: [-18, 8] };
// CARRY: the near paw holds the basket out BESIDE the hip, clear of the torso silhouette, and the off paw hangs at
// the far side. Both paws forward (the old [56, 54]) laid two forearms across the chest and the basket over the
// belly, and between them the seat colour had nowhere left to show. The near arm's angles are untouched: the
// orchard builds its catch box from exactly these numbers (game/screens/orchard.js CATCH_POSE / WALK_POSE).
const CARRY = { armR: [60, 50], armL: [-18, 8], weapon: 90 };
/**
 * Every critter's animation table (docs/ART_STYLE.md section 5). Screens play these by name:
 * idle walk run carry carryWalk reach catch cheer sad eat chop stir bump hop wave sit
 */
export function makeCritterAnims(over = {}) {
  const anims = {
    // RESTING IS WARM: both breath keys carry `happy`, so the default face of a cozy game is a soft smile and
    // `neutral` becomes the face of concentration (the effort, damage and blink keys set their own face and are
    // unchanged). `face` is STEPPED, not lerped (art/poses.js), so a smile on one key only would flip the mouth
    // every 26 frames; it goes on both.
    idle: { loop: true, frames: [
      F(26, { ...REST, torso: 2, root: [0, 0], face: 'happy' }),
      F(26, { armR: [17, 13], armL: [-15, 10], torso: 4, root: [0, 1], head: 2, face: 'happy' }),
    ] },
    // The arm swing is biased OUTWARD (near arm -8..26 about a +9 centre, far arm -26..10): a walk whose arms swing
    // through zero puts a limb straight down the middle of the apron on every pass key, which is the same bar
    // across the player's colour that REST used to draw.
    walk: { loop: true, frames: [
      F(7, { legR: [26, 6], legL: [-22, 18], armR: [-8, 10], armL: [10, 16], torso: 5, root: [0, 0] }),
      F(7, { legR: [4, 28], legL: [-2, 4], armR: [10, 12], armL: [-4, 12], torso: 5, root: [0, 1], squash: 1.03 }),
      F(7, { legR: [-22, 18], legL: [26, 6], armR: [26, 14], armL: [-26, 10], torso: 5, root: [0, 0] }),
      F(7, { legR: [-2, 4], legL: [4, 28], armR: [10, 12], armL: [-4, 12], torso: 5, root: [0, 1], squash: 1.03 }),
    ] },
    run: { loop: true, frames: [
      F(5, { legR: [50, 20], legL: [-40, 55], armR: [-40, 50], armL: [40, 55], torso: 16, root: [0, -2], head: -4 }),
      F(5, { legR: [10, 40], legL: [-10, 10], armR: [0, 40], armL: [0, 40], torso: 16, root: [0, 1], squash: 1.04 }),
      F(5, { legR: [-40, 55], legL: [50, 20], armR: [40, 55], armL: [-40, 50], torso: 16, root: [0, -2], head: -4 }),
      F(5, { legR: [-10, 10], legL: [10, 40], armR: [0, 40], armL: [0, 40], torso: 16, root: [0, 1], squash: 1.04 }),
    ] },
    carry: { loop: true, frames: [
      F(26, { ...CARRY, torso: 2, face: 'happy' }),
      F(26, { ...CARRY, torso: 4, root: [0, 1], head: 2, face: 'happy' }),
    ] },
    carryWalk: { loop: true, frames: [
      F(7, { ...CARRY, legR: [26, 6], legL: [-22, 18], torso: 6 }),
      F(7, { ...CARRY, legR: [4, 28], legL: [-2, 4], torso: 6, root: [0, 1], squash: 1.03 }),
      F(7, { ...CARRY, legR: [-22, 18], legL: [26, 6], torso: 6 }),
      F(7, { ...CARRY, legR: [-2, 4], legL: [4, 28], torso: 6, root: [0, 1], squash: 1.03 }),
    ] },
    // Short arms on a big head: the shoulder sits at chin height, so a near arm raised at 140 folds the paw back
    // ONTO the muzzle. Everything raised goes up forward with the elbow OPEN (upper 110-130, lower +10..+25), which
    // carries the paw past the muzzle tip and leaves the whole face - eyes, brows, mouth - showing. The far arm may
    // still go up backward: it draws behind the head. Measured on all four heads, worst case Barley's headR 15.
    reach: { loop: true, frames: [
      F(20, { armR: [112, 20], armL: [-150, -10], torso: -4, head: -8, root: [0, 0], stretch: 1.02 }),
      F(20, { armR: [118, 16], armL: [-156, -12], torso: -6, head: -10, root: [0, -1], stretch: 1.04 }),
    ] },
    // catch: the basket goes up and OUT to meet the apple; the off paw stays down at the far side so the apron is
    // never behind two forearms. Frame 0's near arm and torso are the orchard's CATCH_POSE and must not move.
    catch: { loop: true, frames: [
      F(20, { armR: [72, 48], armL: [-18, 8], weapon: 90, torso: -4, head: -10, root: [0, 0] }),
      F(20, { armR: [76, 50], armL: [-15, 10], weapon: 90, torso: -6, head: -12, root: [0, -1] }),
    ] },
    // the success beat of the whole game: the smile is the content, so the paw stays clear of the muzzle
    cheer: { loop: true, frames: [
      F(10, { armR: [110, 22], armL: [-140, -20], torso: -4, head: -6, root: [0, 2], squash: 1.06, face: 'happy' }),
      F(14, { armR: [118, 18], armL: [-155, -10], torso: -6, head: -10, root: [0, -10], legR: [20, -30], legL: [-10, -20], stretch: 1.06, face: 'happy' }),
      F(8, { armR: [112, 20], armL: [-145, -20], torso: -4, head: -6, root: [0, 1], squash: 1.08, face: 'happy' }),
    ] },
    sad: { loop: true, frames: [
      F(30, { armR: [8, 4], armL: [-6, 4], torso: 12, head: 22, root: [0, 2], face: 'hurt' }),
      F(30, { armR: [10, 4], armL: [-4, 4], torso: 14, head: 24, root: [0, 3], face: 'hurt' }),
    ] },
    // eat: the food comes to the mouth, the PAW stops at the muzzle tip. Folded back at [118, 118] the paw sat on
    // the muzzle and hid the open mouth the beat is about; held forward the item reads and the chew still lands.
    eat: { loop: false, frames: [
      F(8, { armR: [70, 60], armL: [-10, 14], torso: -2, head: 4, weapon: 60, face: 'shout' }, { ease: 'in' }),
      F(6, { armR: [92, 42], armL: [-10, 14], torso: -4, head: 8, weapon: 30, face: 'shout' }, { ease: 'overshoot' }),
      F(10, { armR: [86, 38], armL: [-8, 14], torso: -2, head: 4, weapon: 30, face: 'closed' }),
      F(10, { armR: [92, 42], armL: [-8, 14], torso: -4, head: 8, weapon: 30, face: 'closed' }),
      F(8, { armR: [60, 40], armL: [-10, 14], torso: 0, head: 0, weapon: 60, face: 'happy' }, { ease: 'out' }),
    ] },
    chop: { loop: false, frames: [
      // The wind-up goes up FORWARD, not back over the shoulder (ART_STYLE 0.7): at [-110, -40] the near paw swung
      // through the face and parked on the far eye, and the next key's smear sector swept the muzzle with it. From
      // [130, -40] the forearm is level, the paw is clear in front of the chin and the blade stands up on weapon rot.
      F(6, { armR: [130, -40], armL: [60, 70], torso: -6, head: -4, weapon: -30, face: 'grit' }, { ease: 'in' }),
      // the hit lands at [56, 24]: on a chibi the shoulder is at chin height, so a horizontal forearm would put the paw across the muzzle
      F(3, { armR: [56, 24], armL: [60, 70], torso: 14, head: 6, weapon: 20, root: [1, 1], face: 'grit' }, { ease: 'overshoot', smear: { from: -30, to: 55, a: 0.4 } }),
      F(4, { armR: [60, 28], armL: [60, 70], torso: 16, head: 8, weapon: 20, root: [1, 2], squash: 1.04, face: 'grit' }),
      F(8, { armR: [20, 20], armL: [60, 70], torso: 2, head: 0, weapon: 0 }, { ease: 'inout' }),
    ] },
    // stir: the circle is traced in front of the CHEST, over the pot. Up at [110, 30] the paw and the spoon
    // circled through the muzzle instead, on every head in the cast.
    stir: { loop: true, frames: [
      F(7, { armR: [66, 36], armL: [40, 60], torso: 6, weapon: 100, head: 6 }, { ease: 'inout' }),
      F(7, { armR: [84, 26], armL: [40, 60], torso: 8, weapon: 130, head: 6 }, { ease: 'inout' }),
      F(7, { armR: [64, 50], armL: [40, 60], torso: 6, weapon: 150, head: 6 }, { ease: 'inout' }),
      F(7, { armR: [52, 56], armL: [40, 60], torso: 4, weapon: 120, head: 6 }, { ease: 'inout' }),
    ] },
    bump: { loop: false, frames: [
      F(5, { armR: [-50, -30], armL: [-60, -20], torso: -22, head: -20, root: [-4, 1], legR: [16, 0], legL: [-10, 8], face: 'hurt', squash: 1.08 }, { ease: 'out' }),
      F(10, { armR: [-20, -10], armL: [-30, -10], torso: -10, head: -8, root: [-2, 1], face: 'hurt' }, { ease: 'inout' }),
      F(6, { ...REST, torso: 0, face: 'dazed' }),
    ] },
    hop: { loop: false, frames: [
      F(5, { ...REST, legR: [20, 30], legL: [-14, 30], torso: 10, root: [0, 4], squash: 1.1 }, { ease: 'in' }),
      F(14, { armR: [-40, -20], armL: [-50, -20], legR: [30, -50], legL: [10, -30], torso: 2, root: [0, -16], stretch: 1.06 }, { ease: 'out' }),
      F(5, { ...REST, legR: [20, 30], legL: [-14, 30], torso: 10, root: [0, 3], squash: 1.1 }, { ease: 'in' }),
      F(6, { ...REST, torso: 2 }, { ease: 'out' }),
    ] },
    wave: { loop: true, frames: [
      F(12, { armR: [104, 26], armL: [-10, 14], torso: -2, head: -4, face: 'happy' }, { ease: 'inout' }),
      F(12, { armR: [112, 20], armL: [-10, 14], torso: -2, head: -6, face: 'happy' }, { ease: 'inout' }),
    ] },
    sit: { loop: true, frames: [
      F(30, { armR: [40, 40], armL: [30, 40], legR: [80, 0], legL: [70, 4], torso: -4, root: [0, 8], face: 'closed' }),
      F(30, { armR: [42, 42], armL: [32, 40], legR: [80, 0], legL: [70, 4], torso: -2, root: [0, 9], face: 'closed' }),
    ] },
  };
  return { ...anims, ...over };
}
