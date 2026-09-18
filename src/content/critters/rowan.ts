// ROWAN the head chef: the one human in the cast, who owns the truck and runs the crew (TASTE / ORDER). The same
// chibi rig as the animals, with every part that says "animal" swapped for the human one: a round skull with an
// ear bump and a nose bump in its own contour and no muzzle, silver hair showing under the tallest toque on the
// truck, a face whose mouth sits on the face, a chef's white jacket with the apron over it, mitten hands with a
// thumb, clogs, no tail. Deep warm-brown skin: the head is the darkest thing on the body, the whites the lightest,
// and the apron - the player's own colour - sits between them on the jacket, so the value ladder (ART_STYLE 0.1)
// reads at a squint as dark head / white hat and coat / mid apron / dark trousers with no muzzle, ear or tail to
// confuse it with any of the four furs. The neckerchief is the truck's own beetroot: the owner wears the livery.
import { celPath, tones, band } from '../../lib/art/shading.ts';
import { drawFist, brow } from '../../lib/art/rigParts.ts';
import { FACE } from '../../lib/art/poses.ts';
import { critterBuild, makeCritterAnims, eggPath, drawApron, hatY, F, TOQUE } from './common.ts';
import type { CritterRig } from './common.ts';
import type { Info } from '../../lib/art/rigParts.ts';
import type { Pose } from '../../lib/art/poses.ts';
import type { RigAccessory } from '../../lib/art/rig.ts';

const R = Math.round;
const TAU = Math.PI * 2;
/**
 * Skin at L .26: the one value a human head can take in this cast. The apron never touches the head, but the
 * HANDS hang beside it, and every mid skin tone lands within a few percent of P2's marmalade or P3's lavender by
 * value (the player colours are L .54-.64); pale skin collides with Barley's wool by hue AND value (cast/fur).
 * Deep brown clears all four aprons by .5+ and Chicory's peat (#6B5241, the nearest fur) by .23.
 */
const SKIN = '#603A28';
/** Silver hair: the seasoned one. It is also the brows, which is why it is light - dark brows vanish on dark skin. */
const HAIR = '#BFB7AA';
/** Chef's whites, the toque's own hex: the plane the apron sits on, and what art-check measures the player spot against. */
const JACKET = TOQUE;
/** Charcoal trousers, L .35: clear of every apron by value and of the clogs below them. */
const TROUSERS = '#515A68';
/** The truck's beetroot body (art/truck.ts TRUCK.body), on the neckerchief of the one who owns it. */
const BEETROOT = '#7E3A56';
const CLOG = '#3A2C2A';

/**
 * Human head (head space, faces +x): the skull, a small ear bump at the back and a nose bump at the front appended
 * into ONE inked contour - the library's drawSkull recipe, ART_STYLE 0.2 - then the hair as a colour change
 * clipped inside that ink: a silver crescent down the back of the head from under the hat band to the nape, so a
 * hat that covers the crown still leaves hair showing where a hat leaves hair showing. No muzzle patch: the
 * mouth (humanFace) goes on the face itself.
 */
function humanHead(ctx: CanvasRenderingContext2D, rig: CritterRig, pose: Pose, inf: Info): void {
  const r = inf.r, pal = rig.palette, er = R(r * 0.26), nr = R(r * 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.moveTo(R(-r * 0.88) + er, R(r * 0.1)); ctx.arc(R(-r * 0.88), R(r * 0.1), er, 0, TAU);   // the ear
  ctx.moveTo(R(r * 0.95) + nr, R(r * 0.2)); ctx.arc(R(r * 0.95), R(r * 0.2), nr, 0, TAU);     // the nose
  celPath(ctx, rig, pal.skin, 0, 0, r, 0.32, 0.3);
  if (rig.override) return;
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, TAU); ctx.clip();
  ctx.fillStyle = rig.col(pal.hair);
  ctx.beginPath(); ctx.ellipse(-r, R(-r * 0.15), R(r * 0.5), R(r * 0.9), 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * Human face (head space): the critter face's rows to the pixel - whites 6x5 at -0.42r, 3 px pupils with a
 * catchlight, 2 px brows 2 px clear of the whites (content/critters/common.ts critterFace, ART_STYLE 0.6) - so
 * every expression lands where it lands on the rest of the cast, with two differences a human head needs:
 *   * the whites stay on under a blink and a dazed cross, as on Barley's dark face: an ink arc on L .26 is invisible;
 *   * the mouth sits on the face under the nose, forward of centre for the three-quarter view, not out on a muzzle.
 */
function humanFace(ctx: CanvasRenderingContext2D, rig: CritterRig, pose: Pose, inf: Info): void {
  const r = inf.r, pal = rig.palette, face = pose.face | 0, fo = rig.faceOpts || {};
  const ink = rig.col(rig.outline), white = rig.col('#FFF8EC'), pupil = rig.col('#1E1512');
  const ew = R(r * 0.5), eh = R(r * 0.42), ey = R(-r * 0.42) + (fo.eyeY || 0), ex = R(r * 0.32), fx = R(-r * 0.36);
  const happy = face === FACE.happy, closed = face === FACE.closed, hurt = face === FACE.hurt, dazed = face === FACE.dazed;
  const angry = face === FACE.angry || face === FACE.grit, shout = face === FACE.shout;
  ctx.fillStyle = white; ctx.fillRect(ex, ey, ew, eh); ctx.fillRect(fx, ey, ew, eh);
  ctx.fillStyle = ink;
  if (dazed) {
    for (const x of [ex, fx]) for (let i = 0; i < 4; i++) { ctx.fillRect(x + i, ey + i, 2, 2); ctx.fillRect(x + 4 - i, ey + i, 2, 2); }
  } else if (closed) {
    for (const x of [ex, fx]) ctx.fillRect(x, ey + 3, ew, 2);   // a blink is a flat 2 px bar
  } else {
    ctx.fillStyle = pupil;
    const py = ey + 1, px = 2;   // pupils sit forward (toward facing) in the white
    ctx.fillRect(ex + px, py, 3, 3); ctx.fillRect(fx + px, py, 3, 3);
    if (angry) { ctx.fillStyle = ink; ctx.fillRect(ex, ey, ew, 1); ctx.fillRect(fx, ey, ew, 1); }   // lids pressed down
    ctx.fillStyle = white; ctx.fillRect(ex + px, py, 1, 1); ctx.fillRect(fx + px, py, 1, 1);      // catchlight
  }
  // brows: one 2 px bar each in the hair's silver, 2 px clear of the whites
  ctx.fillStyle = rig.col(pal.hair);
  const by = ey - 4;
  if (angry) { brow(ctx, ex - 1, by - 2, ex + ew, by + 1, 2); brow(ctx, fx - 1, by, fx + ew, by - 2, 2); }
  else if (hurt) { brow(ctx, ex - 1, by + 1, ex + ew, by - 2, 2); brow(ctx, fx - 1, by - 2, fx + ew, by + 1, 2); }
  else { const hy = happy ? by - 1 : by; ctx.fillRect(ex - 1, hy, ew + 1, 2); ctx.fillRect(fx - 1, hy, ew + 1, 2); }
  // the mouth, under the nose: the same six shapes the muzzle mouth uses, on the face
  const mx = R(r * 0.25), my = R(r * 0.55);
  ctx.fillStyle = ink;
  if (shout) { ctx.fillRect(mx - 3, my - 2, 6, 5); ctx.fillStyle = rig.col('#A03030'); ctx.fillRect(mx - 2, my, 4, 2); }
  else if (hurt) { ctx.fillRect(mx - 3, my + 1, 2, 2); ctx.fillRect(mx - 1, my, 4, 2); ctx.fillRect(mx + 3, my + 1, 2, 2); }
  else if (happy) { ctx.fillRect(mx - 3, my - 1, 2, 2); ctx.fillRect(mx - 1, my, 4, 2); ctx.fillRect(mx + 3, my - 1, 2, 2); }
  else if (angry) { ctx.fillRect(mx - 2, my, 5, 2); }
  else { ctx.fillRect(mx - 2, my, 4, 2); }
}

/**
 * The chef's jacket (torso space): the same egg every belly is cut from, in the whites, with the apron over it -
 * the shared apron, so the player spot on the head chef is the player spot on everyone else. No belly patch: a
 * jacket is one material. Under the collar, where the bib does not reach, a 2 px row of the jacket's shadow tone
 * is the double-breasted seam, the one mark that says "jacket" rather than "white fur".
 */
function jacket(ctx: CanvasRenderingContext2D, rig: CritterRig, pose: Pose, inf: Info): void {
  const W = inf.w, H = inf.h, pal = rig.palette, hw = R(W / 2);
  eggPath(ctx, hw, H);
  celPath(ctx, rig, pal.belly, 0, R(-H * 0.45), R(Math.max(hw, H * 0.6)), 0.34, 0.28);
  if (!rig.override) {
    ctx.save(); eggPath(ctx, hw, H); ctx.clip();
    ctx.fillStyle = tones(rig, pal.belly).sh; ctx.fillRect(-R(hw * 0.4), -H + 2, R(hw * 0.8), 2);
    ctx.restore();
  }
  drawApron(ctx, rig, W, H);
}

/** A human hand: the library's mitten fist with its thumb, in the skin of whichever side it is on. */
function hand(ctx: CanvasRenderingContext2D, rig: CritterRig, pose: Pose, inf: Info): void { drawFist(ctx, rig, inf.r, inf.pal.skin); }

/**
 * The head chef's toque (head space): the tallest hat in the cast, a straight-sided pleated crown a head radius
 * and a bit high with three puffs along its top, drawn as ONE path so the outline scallops round the puffs, two
 * pleats as 2 px shadow lines inside it, and a 4 px beetroot band on the hairline. Taller and straighter than
 * Sorrel's puffed toque on purpose: two chefs in the same hat would be the same silhouette at the 0.5x squint.
 */
const grandToque: RigAccessory = { attach: 'head', draw(ctx, rig) {
  const r = rig.p.headR, y = hatY(rig), w = R(r * 1.35), hw = R(w / 2), h = R(r * 1.15), pr = R(w * 0.2);
  const top = y - 4 - h;
  ctx.beginPath();
  ctx.moveTo(-hw, y - 2); ctx.lineTo(-hw - 2, top + pr); ctx.lineTo(hw + 2, top + pr); ctx.lineTo(hw, y - 2); ctx.closePath();
  ctx.moveTo(-R(w * 0.3) + pr, top + pr); ctx.arc(-R(w * 0.3), top + pr, pr, 0, TAU);
  ctx.moveTo(pr, top + pr - 1); ctx.arc(0, top + pr - 1, pr, 0, TAU);
  ctx.moveTo(R(w * 0.3) + pr, top + pr); ctx.arc(R(w * 0.3), top + pr, pr, 0, TAU);
  celPath(ctx, rig, TOQUE, 0, top + R(h * 0.4), R(w * 0.6), 0.34, 0.3);
  if (!rig.override) {
    ctx.fillStyle = tones(rig, TOQUE).sh;
    ctx.fillRect(-R(w * 0.2) - 1, top + pr + 4, 2, h - pr - 6); ctx.fillRect(R(w * 0.2) - 1, top + pr + 4, 2, h - pr - 6);
  }
  band(ctx, rig, -hw - 1, y - 4, w + 2, 4, BEETROOT);
} };

/** The neckerchief: a knotted triangle at the far shoulder (the shared scarf knot, in the truck's beetroot). */
const kerchief: RigAccessory = { attach: 'torso', draw(ctx, rig) {
  const H = rig.p.torsoH, hw = R(rig.p.torsoW / 2);
  ctx.beginPath();
  ctx.moveTo(-R(hw * 0.6), -H + 2); ctx.lineTo(R(hw * 0.25), -H + 2); ctx.lineTo(-R(hw * 0.1), -H + 8); ctx.closePath();
  celPath(ctx, rig, BEETROOT, -R(hw * 0.15), -H + 4, 4, 0.35, 0);
} };

export const build = critterBuild({
  palette: { skin: SKIN, hair: HAIR, belly: JACKET, secondary: TROUSERS, shorts: TROUSERS, accent: BEETROOT, dark: CLOG },
  sleeveHex: JACKET,
  // 76 px standing, a quarter taller than the tallest critter (Barley, 64): an adult among the animals, on legs
  // and a torso a third longer than the chibi reference and arms to match, under a 14 px head so the body still
  // sits in the cast's 1.9..2.8 heads band (2.71). tools/art-check.js carries the height exception by name. The
  // torso stays 24 wide, narrower than Barley's 28: tall and lean, not big. A neck of 4 so a line of skin shows
  // between the collar and the chin.
  proportions: { headR: 14, neck: 3, torsoW: 24, torsoH: 22, hip: 20, upperArm: 10, lowerArm: 9, handR: 4.8, upperLeg: 11, lowerLeg: 11, footL: 10, shoulderX: 8 },
  ears: 'none', nose: false, tail: 'none', boots: CLOG,
  // eyes on the critter row (eyeY 0, not the default -2) so the hat band clears the brows by a pixel (hatY)
  face: { eyeY: 0, whitesAlways: true },
  // far limbs a shade lighter than the cast's 0.52: a far hand in skin this deep at 0.52 is all outline
  farShade: 0.6,
  parts: { head: humanHead, face: humanFace, torso: jacket, hand },
  accessories: [kerchief, grandToque],
});

/** The far arm's rest while the near one is busy at the mouth: down at the far side, clear of the apron. */
const OFF = { armL: [-10, 14] };
export const anims = makeCritterAnims({
  // The signature: a taste from the spoon. The hand comes up level with the mouth and a hand's width in front of
  // it (armR [100, 60] on this rig's 10 + 9 arm puts the fist ~15 px forward of the lips at chin height), and the
  // spoon is turned BACK along the hand (weapon -114: the spoon's limb angle is the hand's ~156 minus that, ~270,
  // pointing at the mouth) so its bowl lands on the lips instead of poking forward the way the shared `eat` holds
  // an apple. Eyes shut to savour it, then two nods with a smile: the verdict every plate on this truck waits for.
  taste: { loop: false, frames: [
    F(8, { armR: [66, 44], ...OFF, torso: -2, head: 2, weapon: -40, face: 'neutral' }, { ease: 'in' }),
    F(6, { armR: [102, 60], ...OFF, torso: -4, head: 6, weapon: -114, face: 'closed' }, { ease: 'overshoot' }),
    F(14, { armR: [100, 60], ...OFF, torso: -4, head: 8, weapon: -114, face: 'closed' }),
    // the nod: the spoon turns a shade further back (-134) so its bowl drops to the chin as the head comes down,
    // instead of riding up across the nose - nothing crosses the face (ART_STYLE 0.7)
    F(6, { armR: [96, 56], ...OFF, torso: -2, head: 14, weapon: -134, face: 'happy' }, { ease: 'inout' }),
    F(6, { armR: [96, 56], ...OFF, torso: -2, head: 4, weapon: -134, face: 'happy' }, { ease: 'inout' }),
    F(8, { armR: [52, 40], ...OFF, torso: 0, head: 0, weapon: -30, face: 'happy' }, { ease: 'out' }),
  ] },
});

export const id = 'rowan', name = 'ROWAN', fullName = 'Rowan Ashby', role = 'THE HEAD CHEF', species = 'human', colour = SKIN;
export const bio = 'Owns the truck. Runs the crew. Tastes everything.';
export default { id, name, fullName, role, species, colour, bio, build, anims };
