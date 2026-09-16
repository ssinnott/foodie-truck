// Generic humanoid paper-doll rig (ARCHITECTURE.md section 4), rendered as a chunky cel-shaded pixel sprite.
// Local space: authored facing right, origin at the feet centre, y negative = up. Angles in degrees:
// limb 0 = hanging down, positive = swings forward (toward facing). torso/head positive = lean forward.
//
// Rendering rules (see art/shading.js): 1px near-black outline, 3-tone cel bands with a top-left light, joints
// snapped to the DEVICE pixel grid at any rig scale, optional per-rig secondary-motion chains (art/secondary.js)
// and weapon smear arcs.
// Public API (backward compatible): buildRig, drawRig, jointScreen, computeJoints, markFull, DEFAULT_PROPORTIONS.
// New build fields (all optional): outlineWidth (default 1), shading (false = flat fills), ramp {hi, sh, rim},
// snap (false = no device-grid snapping), smearColor, hairStyle ('short'|'bald'), jaw, face { noMouth, eyeY, pupil, brow }.
// New proportions: bulge (0..1 limb taper, default 0.5), neckR. New weapon fields: twoHanded + grip (px along the
// weapon where the far hand goes, negative = behind the near hand toward the pommel; the far arm is solved with 2-bone
// IK when pose.grip > 0 and its fist is drawn on the handle at the joint it actually reached), headAt (px from the near
// hand to the weapon-head centre, used by the tools/sheet.js pose audit).
// New part hooks: parts.beard (after the face, in head space), parts.hair (replaces the default hair cap), parts.neck,
// parts.shoulder (at the shoulder joint, torso space, over the upper arm), parts.smear.
// LIMB SPACE (parts.armUpper / armLower / legUpper / legLower): origin at the segment's own joint (shoulder, elbow,
// hip, knee) and +Y ALONG THE BONE toward the next joint — a segment is drawn from (0, 0) to (0, info.len), and a
// band across it is w = 2r wide on x by a few px tall on y. It is NOT +x: this space is entered at -limbAngle, and
// only hand space (entered at -handAngle + 90) and foot space put +x along the part. A hook that draws its segment
// along +x lays the bone across the joint instead of down it, and the limb comes apart in every pose but a horizontal
// one — see the git history of pip.js, where all four limbs were authored that way.
// Readability knobs (all optional, defaults tuned for the 2x display): farShade (0.62) + farDesat (0.25) build
// rig.paletteFar (far limbs ~40 % darker and greyer); contactShadow (true = alpha 0.3, or a number, or false) draws a
// 1 px translucent dark capsule under every limb (near limbs over the torso, far limbs over the back layer) so a limb
// separates from what it crosses; thinR (4) is the radius below which cel parts get two tones instead of three,
// hiMin (6) the smallest clipped shape that still gets a highlight cap, flatR (2.5) the flat-tone floor, tones: 2
// drops highlight caps altogether (rimRect / rimTop then carry the light); palette.sleeve colours the upper arms + cuffs
// separately from palette.primary (torso) so arms read against the body. Pose key `weaponBack` (stepped 0/1) draws the
// weapon in the back layer (rested on the shoulder, slung) — the near arm then draws no weapon in front.
// rig.tick counts drawRig calls (procedural effects: chimney puffs, lens flicker); rig.chainFrame is an alias.
import { rad } from '../engine/math.js';
import { PALETTES, farPalette } from './palettes.js';
import { SCRATCH_POSE, copyPose } from './poses.js';
import { LIGHT_X, LIGHT_Y, RAMP, tones, celTaper, contactCapsule } from './shading.js';
import { drawLimbSegs, limbRadii, drawFist, drawBoot, drawTorsoShape, drawBelt, drawNeck, drawSkull, drawFace, drawStick } from './rigParts.js';
import { stepChain, resetChain } from './secondary.js';

/** Reference proportions at scale 1 (~72-76 px tall). */
export const DEFAULT_PROPORTIONS = Object.freeze({
  headR: 9, neck: 3, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, handR: 4, upperLeg: 15, lowerLeg: 15, footL: 10,
  armR: 4.5, legR: 5.5, footH: 5, shoulderX: 2, hipX: 4, bulge: 0.5, neckR: 3.5,
});

/** Far-limb darkening (brightness factor) and desaturation; build.farShade / build.farDesat override. */
const FAR_SHADE = 0.62, FAR_DESAT = 0.25;
/**
 * Default contact-shadow alpha (build.contactShadow: true | false | number). OFF by default: the translucent dark
 * capsule under every limb segment was eight extra marks per keyframe whose whole job was to separate a limb from
 * what it crosses — which a 1 px outline that actually lands on the pixel grid now does on its own, without the
 * soft grey haze. A rig that genuinely needs it can still set build.contactShadow: true (or a number).
 */
const CONTACT_ALPHA = 0;
// Flash / tint offscreen: must contain every rig pose (Regent Engine at scale 2.4 spans x -205..165, y -267..162 around the feet;
// dodge rolls rotate the body below the feet line), otherwise hit flashes render as clipped silhouettes.
const OFF_W = 480, OFF_H = 480, OFF_OX = 240, OFF_OY = 300;
let offCanvas = null, offCtx = null;
function getOffscreen() {
  if (!offCanvas) { offCanvas = document.createElement('canvas'); offCanvas.width = OFF_W; offCanvas.height = OFF_H; offCtx = offCanvas.getContext('2d'); }
  return offCtx;
}

/**
 * A limb root pushed `d` px along the limb, so the wide end of the tube ends up INSIDE the body instead of butting
 * against its edge. A limb whose root sits exactly on the silhouette reads as bolted on; one that starts a little
 * way inside reads as attached, because the torso overlaps it the way a shoulder overlaps an arm.
 * Two scratch objects, alternating, because both limbs of a pair are live at once and this file allocates nothing.
 */
const SUNK = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
let sunkFlip = 0;
function sunk(a, b, d) {
  if (!d) return a;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const o = SUNK[(sunkFlip = 1 - sunkFlip)];
  o.x = a.x + dx / len * d; o.y = a.y + dy / len * d;
  return o;
}

const pt = () => ({ x: 0, y: 0 });
function makeJoints() {
  return {
    hipN: pt(), hipF: pt(), kneeN: pt(), kneeF: pt(), ankleN: pt(), ankleF: pt(), legN: { upper: 0, lower: 0, foot: 0 }, legF: { upper: 0, lower: 0, foot: 0 },
    torso: pt(), torsoAngle: 0, shoulderN: pt(), shoulderF: pt(), elbowN: pt(), elbowF: pt(), wristN: pt(), wristF: pt(),
    handN: pt(), handF: pt(), armN: { upper: 0, lower: 0, hand: 0 }, armF: { upper: 0, lower: 0, hand: 0 },
    neck: pt(), head: pt(), headAngle: 0, weaponTip: pt(), weaponAngle: 0, grip: pt(), top: 0,
  };
}

/**
 * Precompute a rig from a build description (see ARCHITECTURE.md section 4 for the build shape).
 * @returns {object} rig with { build, scale, p (proportions), palette, paletteFar, outline, ow, joints, height, width, col(hex), tones, chains, light }
 */
export function buildRig(build = {}) {
  const p = { ...DEFAULT_PROPORTIONS, ...(build.proportions || {}) };
  const palette = { ...PALETTES.hero, ...(build.palette || {}) };
  const hipY = -(p.upperLeg + p.lowerLeg + p.footH - 2);
  if (!palette.sleeve) palette.sleeve = palette.primary;
  const cs = build.contactShadow;
  const rig = {
    build, scale: build.scale || 1, p, palette,
    paletteFar: farPalette(palette, build.farShade != null ? build.farShade : FAR_SHADE, build.farDesat != null ? build.farDesat : FAR_DESAT),
    /** Contact-shadow alpha under near limbs (0 = off). */
    contactAlpha: cs === false ? 0 : cs === true ? 0.3 : typeof cs === 'number' ? cs : CONTACT_ALPHA,
    /** Shading budget (see shading.js): thinR = radius below which cel parts get 2 tones; hiMin = smallest half-extent
     *  of a clipped shape that gets a highlight cap; flatR = radius below which a part is one flat tone; tonesN = 2
     *  (build.tones: 2) drops every highlight cap so the only light marks are explicit rimRect / rimTop rims. */
    thinR: build.thinR != null ? build.thinR : null, hiMin: build.hiMin != null ? build.hiMin : null, flatR: build.flatR != null ? build.flatR : null,
    tonesN: build.tones === 2 ? 2 : 3,
    outline: build.outline || '#1a1018', ow: build.outlineWidth != null ? build.outlineWidth : 1,
    parts: build.parts || {}, accessories: build.accessories || [], weapon: build.weapon || null,
    hipY, height: (-(hipY) + p.torsoH - 2 + p.neck + p.headR * 2), width: p.torsoW,
    joints: makeJoints(), override: null, facing: 1,
    tf: { x: 0, y: 0, fs: 1, ss: 1, rx: 0, ry: 0, c: 1, s: 0 },
    /** Reusable info object passed to part hooks ({ name, far, pal, len, r, color, w, h }); do not retain it. */
    partInfo: { name: '', far: false, pal: null, len: 0, r: 0, color: '', w: 0, h: 0, length: 0 },
    /** Colour helper for hooks: returns the flash override when active, else the colour. */
    col(hex) { return rig.override || hex; },
    // ---- shading / pixel-sprite state ----
    shading: build.shading !== false, ramp: { ...RAMP, ...(build.ramp || {}) }, tones: new Map(), snap: build.snap !== false,
    /**
     * Device-pixel scale of the last drawRig ((o.scale || 1) * rig.scale). Joints snap on THIS grid, not the rig's
     * local one — the game renders 1:1 into the 640x360 internal canvas and blits it at a whole-number scale, so
     * one internal pixel IS one sprite pixel and `sc` is the only scale between rig space and that grid.
     * Defaults to the rig's own scale so the six places that call computeJoints() outside a draw (portraits, the
     * heroes' import-time floor solve, the contact sheets, the invariant suite) snap on a sane grid rather than
     * on whatever the previous draw happened to leave behind.
     */
    pxScale: build.scale || 1,
    /** Unit vector toward the light in the CURRENT part space (updated by enter/leave). */
    light: { x: LIGHT_X, y: LIGHT_Y },
    smearColor: build.smearColor || null, hairStyle: build.hairStyle || 'short', jaw: build.jaw, faceOpts: build.face || null,
    /** Secondary-motion chains by name (art/secondary.js getChain). */
    chains: {}, tick: 0, chainFrame: 0, lastPose: null,
  };
  return rig;
}

const SIDES = ['N', 'F'];
const NOOP = (v) => v;
// Snap to the DEVICE pixel grid: round(v * sc) / sc, where sc is rig.pxScale. Module scope (and so a mutable
// module-level grid) because computeJoints runs per rig per frame and is never re-entrant, and rig.js allocates
// nothing per draw.
let SNAP_G = 1;
const SNAP = (v) => Math.round(v * SNAP_G) / SNAP_G;
function angLerp(a, b, t) { let d = (b - a) % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return a + d * t; }

/** Compute joint positions (root space, before root offset/rotation) for a resolved pose into rig.joints. */
export function computeJoints(rig, pose) {
  const p = rig.p, J = rig.joints, hipY = rig.hipY;
  SNAP_G = rig.pxScale || 1;
  const S = rig.snap ? SNAP : NOOP;
  const ta = pose.torso.rot;
  // legs (attached to the hips, unaffected by torso lean)
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const leg = side === 'N' ? pose.legR : pose.legL, foot = side === 'N' ? pose.footR : pose.footL;
    const hip = J['hip' + side], knee = J['knee' + side], ankle = J['ankle' + side], ang = J['leg' + side];
    // The hips were the one pair never put through S: they are authored as whole numbers, which looked snapped
    // while the grid was rig-local and is not on the device grid (hipX 4 at scale 0.85 lands on device x 3.4).
    hip.x = S(side === 'N' ? p.hipX : -p.hipX); hip.y = S(hipY);
    ang.upper = leg.upper; ang.lower = leg.upper + leg.lower; ang.foot = ang.lower * 0.35 + foot.rot;
    knee.x = S(hip.x + Math.sin(rad(ang.upper)) * p.upperLeg); knee.y = S(hip.y + Math.cos(rad(ang.upper)) * p.upperLeg);
    ankle.x = S(knee.x + Math.sin(rad(ang.lower)) * p.lowerLeg); ankle.y = S(knee.y + Math.cos(rad(ang.lower)) * p.lowerLeg);
  }
  // torso pivot at hip centre
  J.torso.x = S(pose.torso.x); J.torso.y = S(hipY + pose.torso.y); J.torsoAngle = ta;
  const c = Math.cos(rad(ta)), s = Math.sin(rad(ta));
  const tx = J.torso.x, ty = J.torso.y;
  const shY = -(p.torsoH - 5);
  J.shoulderN.x = S(tx + p.shoulderX * c - shY * s); J.shoulderN.y = S(ty + p.shoulderX * s + shY * c);
  J.shoulderF.x = S(tx + (-p.shoulderX - 2) * c - (shY + 1) * s); J.shoulderF.y = S(ty + (-p.shoulderX - 2) * s + (shY + 1) * c);
  const nY = -p.torsoH + 2;
  J.neck.x = S(tx - nY * s); J.neck.y = S(ty + nY * c);
  J.headAngle = ta + pose.head.rot;
  const hc = Math.cos(rad(J.headAngle)), hs = Math.sin(rad(J.headAngle));
  const hy = -(p.neck + p.headR) + pose.head.y, hx = pose.head.x;
  J.head.x = S(J.neck.x + hx * hc - hy * hs); J.head.y = S(J.neck.y + hx * hs + hy * hc);
  J.top = J.head.y - p.headR;
  // arms (relative to torso lean)
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const arm = side === 'N' ? pose.armR : pose.armL, hand = side === 'N' ? pose.handR : pose.handL;
    const sh = J['shoulder' + side], el = J['elbow' + side], wr = J['wrist' + side], hd = J['hand' + side], ang = J['arm' + side];
    ang.upper = ta + arm.upper; ang.lower = ang.upper + arm.lower; ang.hand = ang.lower + hand.rot;
    el.x = S(sh.x + Math.sin(rad(ang.upper)) * p.upperArm); el.y = S(sh.y + Math.cos(rad(ang.upper)) * p.upperArm);
    wr.x = S(el.x + Math.sin(rad(ang.lower)) * p.lowerArm); wr.y = S(el.y + Math.cos(rad(ang.lower)) * p.lowerArm);
    hd.x = S(wr.x + Math.sin(rad(ang.lower)) * p.handR * 0.6); hd.y = S(wr.y + Math.cos(rad(ang.lower)) * p.handR * 0.6);
  }
  // weapon tip. Hand space +x runs along the forearm and weapon.rot turns clockwise on screen, so the weapon's limb
  // angle (0 = down, 90 = forward, 180 = up) is the hand angle MINUS weapon.rot.
  if (rig.weapon) {
    const near = rig.weapon.attach !== 'handL';
    const hd = near ? J.handN : J.handF, a = (near ? J.armN.hand : J.armF.hand) - pose.weapon.rot;
    const len = rig.weapon.length || 30;
    J.weaponAngle = a;
    J.weaponTip.x = hd.x + Math.sin(rad(a)) * len; J.weaponTip.y = hd.y + Math.cos(rad(a)) * len;
    // two-handed grip: the far hand reaches for a point along the weapon (2-bone IK blended by pose.grip)
    const g = pose.grip;
    if (rig.weapon.twoHanded && g > 0) {
      const gd = rig.weapon.grip != null ? rig.weapon.grip : 12;
      const G = J.grip; G.x = hd.x + Math.sin(rad(a)) * gd; G.y = hd.y + Math.cos(rad(a)) * gd;
      const far = near ? 'F' : 'N';
      const sh = J['shoulder' + far], el = J['elbow' + far], wr = J['wrist' + far], hf = J['hand' + far], ang = J['arm' + far];
      const L1 = p.upperArm, L2 = p.lowerArm;
      const dx = G.x - sh.x, dy = G.y - sh.y;
      const d = Math.min(L1 + L2 - 0.5, Math.max(Math.abs(L1 - L2) + 0.5, Math.hypot(dx, dy)));
      const th = Math.atan2(dx, dy) * 180 / Math.PI;
      const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))) * 180 / Math.PI;
      // pick the elbow that hangs lower (natural bend), then blend from the FK angles
      const u1 = th + A, u2 = th - A;
      const u = Math.cos(rad(u1)) >= Math.cos(rad(u2)) ? u1 : u2;
      const ex = sh.x + Math.sin(rad(u)) * L1, ey = sh.y + Math.cos(rad(u)) * L1;
      const lo = Math.atan2(G.x - ex, G.y - ey) * 180 / Math.PI;
      ang.upper = angLerp(ang.upper, u, g); ang.lower = angLerp(ang.lower, lo, g);
      el.x = S(sh.x + Math.sin(rad(ang.upper)) * L1); el.y = S(sh.y + Math.cos(rad(ang.upper)) * L1);
      wr.x = S(el.x + Math.sin(rad(ang.lower)) * L2); wr.y = S(el.y + Math.cos(rad(ang.lower)) * L2);
      // the hand stays attached to the wrist: it reaches toward the grip but never further than a hand length, so an
      // out-of-reach grip (authoring error, or a mid-swing lerp) shows a stretched arm instead of a floating fist
      let gx = G.x - wr.x, gy = G.y - wr.y;
      const gl = Math.hypot(gx, gy), gmax = p.handR * 0.6 + 1.5;
      if (gl > gmax) { gx *= gmax / gl; gy *= gmax / gl; }
      const fx = wr.x + Math.sin(rad(ang.lower)) * p.handR * 0.6, fy = wr.y + Math.cos(rad(ang.lower)) * p.handR * 0.6;
      hf.x = S(fx + (wr.x + gx - fx) * g); hf.y = S(fy + (wr.y + gy - fy) * g);
      ang.hand = ang.lower + (far === 'F' ? pose.handL.rot : pose.handR.rot);
    }
  }
  return J;
}

// ---------- local-space helpers (exported for content hooks that nest their own spaces) ----------
/** Push a local space (translate + rotate) and point rig.light at the light in that space. Pair with leave(). */
export function enter(ctx, rig, x, y, angDeg) {
  ctx.save(); ctx.translate(x, y);
  if (angDeg) { ctx.rotate(rad(angDeg)); setLight(rig, angDeg); }
}
/** Pop a local space and restore the root-space light. */
export function leave(ctx, rig) { ctx.restore(); rig.light.x = LIGHT_X; rig.light.y = LIGHT_Y; }
/** Point rig.light at the light for a space rotated by `angDeg` from root (nested spaces: pass the total angle). */
export function setLight(rig, angDeg) {
  const c = Math.cos(rad(angDeg)), s = Math.sin(rad(angDeg));
  rig.light.x = LIGHT_X * c + LIGHT_Y * s; rig.light.y = -LIGHT_X * s + LIGHT_Y * c;
}
/** Fill the rig's reusable part-info object handed to custom part hooks (never retained by hooks). */
function info(rig, name, far, pal, len, r, color, w, h) {
  const o = rig.partInfo;
  o.name = name; o.far = far; o.pal = pal; o.len = len; o.r = r; o.color = color; o.w = w; o.h = h; o.length = len;
  return o;
}

function drawLeg(ctx, rig, pose, side) {
  const J = rig.joints, p = rig.p, pal = side === 'N' ? rig.palette : rig.paletteFar, far = side === 'F';
  const hip = J['hip' + side], knee = J['knee' + side], ankle = J['ankle' + side], ang = J['leg' + side];
  const hooks = rig.parts;
  contactCapsule(ctx, rig, hip.x, hip.y, knee.x, knee.y, p.legR); contactCapsule(ctx, rig, knee.x, knee.y, ankle.x, ankle.y, p.legR - 0.5);
  if (hooks.legUpper || hooks.legLower) {
    // A rig may hook one half of a limb and leave the other generic. The generic half is built from the SAME radius
    // profile the one-path limb uses, so the two halves meet at the knee without a step.
    const [rA, rB, rC] = limbRadii(p.legR, p.legR - 0.5, p.bulge);
    if (hooks.legUpper) { enter(ctx, rig, hip.x, hip.y, -ang.upper); hooks.legUpper(ctx, rig, pose, info(rig, 'legUpper', far, pal, p.upperLeg, p.legR, pal.secondary)); leave(ctx, rig); }
    else { const s0 = sunk(hip, knee, p.legR * 0.35); celTaper(ctx, rig, s0.x, s0.y, knee.x, knee.y, rA, rB, pal.secondary); }
    if (hooks.legLower) { enter(ctx, rig, knee.x, knee.y, -ang.lower); hooks.legLower(ctx, rig, pose, info(rig, 'legLower', far, pal, p.lowerLeg, p.legR - 1, pal.secondary)); leave(ctx, rig); }
    else celTaper(ctx, rig, knee.x, knee.y, ankle.x, ankle.y, rB, rC, pal.secondary);
  } else {
    // root sunk into the pelvis: the thigh starts under the hip block rather than on its edge
    drawLimbSegs(ctx, rig, sunk(hip, knee, p.legR * 0.35), knee, ankle, p.legR, p.legR - 0.5, pal.secondary, pal.secondary, false, p.bulge);
  }
  // foot / boot
  enter(ctx, rig, ankle.x, ankle.y, -ang.foot);
  if (hooks.foot) hooks.foot(ctx, rig, pose, info(rig, 'foot', far, pal, p.footL, 0, pal.dark, p.footL, p.footH));
  else drawBoot(ctx, rig, p.footL, p.footH, pal.dark, pal.accent);
  leave(ctx, rig);
}

/**
 * The fist (or the rig's `hand` hook) in hand space. Module scope, not a closure inside drawArm: this file
 * allocates nothing per draw. `skip` is the far hand of a two-handed grip, which the weapon arm draws on the
 * handle instead.
 */
function drawHandPart(ctx, rig, pose, hooks, pal, p, far, skip) {
  if (skip) return;
  if (hooks.hand) hooks.hand(ctx, rig, pose, info(rig, 'hand', far, pal, 0, p.handR, pal.skin));
  else drawFist(ctx, rig, p.handR, pal.skin);
}

function drawArm(ctx, rig, pose, side, withWeapon) {
  const J = rig.joints, p = rig.p, pal = side === 'N' ? rig.palette : rig.paletteFar, far = side === 'F';
  const sh = J['shoulder' + side], el = J['elbow' + side], wr = J['wrist' + side], hd = J['hand' + side], ang = J['arm' + side];
  const hooks = rig.parts, sleeve = pal.sleeve || pal.primary;
  contactCapsule(ctx, rig, sh.x, sh.y, el.x, el.y, p.armR); contactCapsule(ctx, rig, el.x, el.y, hd.x, hd.y, p.armR + 0.5);
  if (hooks.armUpper || hooks.armLower) {
    const [rA, rB, rC] = limbRadii(p.armR, p.armR + 0.5, p.bulge);
    if (hooks.armUpper) { enter(ctx, rig, sh.x, sh.y, -ang.upper); hooks.armUpper(ctx, rig, pose, info(rig, 'armUpper', far, pal, p.upperArm, p.armR, sleeve)); leave(ctx, rig); }
    else { const s0 = sunk(sh, el, p.armR * 0.45); celTaper(ctx, rig, s0.x, s0.y, el.x, el.y, rA, rB, sleeve); }
    if (hooks.armLower) { enter(ctx, rig, el.x, el.y, -ang.lower); hooks.armLower(ctx, rig, pose, info(rig, 'armLower', far, pal, p.lowerArm, p.armR - 0.5, pal.skin)); leave(ctx, rig); }
    else celTaper(ctx, rig, el.x, el.y, wr.x, wr.y, rB, rC, pal.skin);
  } else {
    // root sunk into the torso. Only the TUBE moves: the shoulder hook below still enters at the true joint, so a
    // rig's epaulette or pauldron stays where its author put it.
    drawLimbSegs(ctx, rig, sunk(sh, el, p.armR * 0.45), el, wr, p.armR, p.armR + 0.5, sleeve, pal.skin, true, p.bulge);
  }
  if (hooks.shoulder) { enter(ctx, rig, sh.x, sh.y, J.torsoAngle); hooks.shoulder(ctx, rig, pose, info(rig, 'shoulder', far, pal, 0, p.armR + 1, pal.accent)); leave(ctx, rig); }
  // hand space: +x along the forearm direction (plus hand.rot); weapons draw along +x.
  // pose.weaponBack: the weapon was already drawn in the back layer (drawWeaponBack), so the hand draws bare.
  const weaponHere = withWeapon && rig.weapon && !(pose.weaponBack > 0.5) && ((rig.weapon.attach !== 'handL') === (side === 'N'));
  // the far hand of a two-handed weapon is drawn on the handle (over the weapon) by the weapon arm instead
  const twoHanded = rig.weapon && rig.weapon.twoHanded && pose.grip > 0.5 && !(pose.weaponBack > 0.5);
  const handAng = -ang.hand + 90;
  enter(ctx, rig, hd.x, hd.y, handAng);
  if (weaponHere && twoHanded) {
    // the other hand, drawn under this fist and the weapon at its real joint position projected into weapon space
    // (exactly on the grip when the IK reached it; still attached to its arm when it did not)
    const other = side === 'N' ? J.handF : J.handN, palO = side === 'N' ? rig.paletteFar : rig.palette;
    const a = rad(J.weaponAngle), ca = Math.sin(a), sa = Math.cos(a); // cos/sin of the weapon-space rotation (90 - weaponAngle)
    const dx = other.x - hd.x, dy = other.y - hd.y;
    ctx.save(); ctx.rotate(rad(pose.weapon.rot)); setLight(rig, handAng + pose.weapon.rot);
    ctx.translate(dx * ca + dy * sa - p.handR * 0.5, -dx * sa + dy * ca);
    if (hooks.hand) hooks.hand(ctx, rig, pose, info(rig, 'hand', side === 'N', palO, 0, p.handR, palO.skin));
    else drawFist(ctx, rig, p.handR, palO.skin);
    ctx.restore(); setLight(rig, handAng);
  }
  if (weaponHere) {
    ctx.save(); ctx.rotate(rad(pose.weapon.rot)); setLight(rig, handAng + pose.weapon.rot);
    if (rig.weapon.draw) rig.weapon.draw(ctx, rig, pose);
    else if (hooks.weapon) hooks.weapon(ctx, rig, pose, info(rig, 'weapon', far, pal, rig.weapon.length || 30, 0, pal.metal));
    else drawStick(ctx, rig, rig.weapon.length || 30, pal.metal, pal.dark);
    ctx.restore(); setLight(rig, handAng);
  }
  // The hand draws AFTER the weapon, so it closes around the grip instead of hiding behind it. A fist under its
  // own weapon is the single most common "why does that look wrong" in the cast: 692 px of hand disappeared.
  drawHandPart(ctx, rig, pose, hooks, pal, p, far, twoHanded && !weaponHere && withWeapon);
  leave(ctx, rig);
}

function drawTorso(ctx, rig, pose) {
  const J = rig.joints, p = rig.p, pal = rig.palette, hooks = rig.parts;
  enter(ctx, rig, J.torso.x, J.torso.y, J.torsoAngle);
  if (hooks.torso) hooks.torso(ctx, rig, pose, info(rig, 'torso', false, pal, 0, 0, pal.primary, p.torsoW, p.torsoH));
  else drawTorsoShape(ctx, rig, p.torsoW, p.torsoH, p.hip, pal.primary);
  leave(ctx, rig);
  // neck (drawn before the head)
  if (hooks.neck) { enter(ctx, rig, J.neck.x, J.neck.y, J.headAngle); hooks.neck(ctx, rig, pose, info(rig, 'neck', false, pal, p.neck, p.neckR, pal.skin)); leave(ctx, rig); }
  else drawNeck(ctx, rig, J.neck, J.head, pal.skin, p.neckR);
}

function drawHips(ctx, rig, pose) {
  const p = rig.p, pal = rig.palette, hooks = rig.parts;
  // same device grid as the hip joints, so the belt's edges land where the thigh roots do
  enter(ctx, rig, 0, rig.joints.hipN.y, 0);
  if (hooks.hips) hooks.hips(ctx, rig, pose, info(rig, 'hips', false, pal, 0, 0, pal.secondary, p.hip, 11));
  else drawBelt(ctx, rig, p.hip, pal.secondary, pal.dark, pal.accent);
  leave(ctx, rig);
}

function drawHead(ctx, rig, pose) {
  const J = rig.joints, p = rig.p, pal = rig.palette, hooks = rig.parts, r = p.headR;
  enter(ctx, rig, J.head.x, J.head.y, J.headAngle);
  if (hooks.head) hooks.head(ctx, rig, pose, info(rig, 'head', false, pal, 0, r, pal.skin));
  else drawSkull(ctx, rig, r, pal.skin, hooks.hair ? null : pal.hair, rig.build);
  if (hooks.hair) hooks.hair(ctx, rig, pose, info(rig, 'hair', false, pal, 0, r, pal.hair));
  if (hooks.face) hooks.face(ctx, rig, pose, info(rig, 'face', false, pal, 0, r, pal.dark));
  else drawFace(ctx, rig, r, pose.face | 0, rig.faceOpts);
  if (hooks.beard) hooks.beard(ctx, rig, pose, info(rig, 'beard', false, pal, 0, r, pal.hair));
  if (hooks.hat) hooks.hat(ctx, rig, pose, info(rig, 'hat', false, pal, 0, r, pal.dark));
  const acc = rig.accessories;
  for (let i = 0; i < acc.length; i++) if (acc[i].attach === 'head') acc[i].draw(ctx, rig, pose);
  leave(ctx, rig);
}

function drawAccessories(ctx, rig, pose, layer) {
  const J = rig.joints, list = rig.accessories;
  for (let i = 0; i < list.length; i++) {
    const acc = list[i];
    const at = acc.attach || 'torso';
    const isBack = at === 'back' || acc.layer === 'back';
    if (at === 'head') continue; // drawn with the head
    if (layer === 'back' ? !isBack : isBack) continue;
    if (at === 'back' || at === 'torso') enter(ctx, rig, J.torso.x, J.torso.y, J.torsoAngle);
    else if (at === 'hip') enter(ctx, rig, 0, rig.hipY, 0);
    else if (at === 'handR') enter(ctx, rig, J.handN.x, J.handN.y, -J.armN.hand + 90);
    else if (at === 'handL') enter(ctx, rig, J.handF.x, J.handF.y, -J.armF.hand + 90);
    else ctx.save(); // 'root'
    acc.draw(ctx, rig, pose);
    leave(ctx, rig);
  }
  if (layer === 'back' && rig.parts.back) { enter(ctx, rig, J.torso.x, J.torso.y, J.torsoAngle); rig.parts.back(ctx, rig, pose, info(rig, 'back', false, rig.palette, 0, 0, rig.palette.primary)); leave(ctx, rig); }
}

/** Weapon smear: translucent arc sector around the weapon shoulder between two root-space angles (pose.smear). */
function drawSmear(ctx, rig, pose) {
  const sm = pose.smear;
  if (!sm || sm.a <= 0.01) return;
  const J = rig.joints, p = rig.p, near = !rig.weapon || rig.weapon.attach !== 'handL';
  const sh = near ? J.shoulderN : J.shoulderF;
  const r = sm.r || (p.upperArm + p.lowerArm + (rig.weapon ? (rig.weapon.length || 30) * 0.9 : p.handR * 2));
  if (rig.parts.smear) { rig.parts.smear(ctx, rig, pose, info(rig, 'smear', false, rig.palette, r, r, rig.smearColor || rig.palette.metal)); return; }
  let a0 = rad(sm.from), a1 = rad(sm.to);
  if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
  if (a1 - a0 > Math.PI * 1.95) a1 = a0 + Math.PI * 1.95;
  const col = rig.smearColor || rig.palette.metal, t = tones(rig, col);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, sm.a);
  ctx.beginPath(); ctx.arc(sh.x, sh.y, r, a0, a1); ctx.arc(sh.x, sh.y, r * 0.45, a1, a0, true); ctx.closePath();
  ctx.fillStyle = rig.col(t.base); ctx.fill();
  ctx.globalAlpha = prev * Math.min(1, sm.a * 1.4);
  ctx.strokeStyle = rig.col(t.hi); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(sh.x, sh.y, r * 0.92, a0 + (a1 - a0) * 0.08, a1 - (a1 - a0) * 0.05); ctx.stroke();
  ctx.beginPath(); ctx.arc(sh.x, sh.y, r * 0.66, a0 + (a1 - a0) * 0.2, a1 - (a1 - a0) * 0.15); ctx.stroke();
  ctx.globalAlpha = prev;
}

/** Weapon drawn behind the body (pose.weaponBack): same hand space as the near-arm draw, before every body part. */
function drawWeaponBack(ctx, rig, pose) {
  if (!rig.weapon || !(pose.weaponBack > 0.5)) return;
  const J = rig.joints, near = rig.weapon.attach !== 'handL';
  const hd = near ? J.handN : J.handF, handAng = -(near ? J.armN.hand : J.armF.hand) + 90;
  enter(ctx, rig, hd.x, hd.y, handAng + pose.weapon.rot);
  if (rig.weapon.draw) rig.weapon.draw(ctx, rig, pose);
  else if (rig.parts.weapon) rig.parts.weapon(ctx, rig, pose, info(rig, 'weapon', false, rig.palette, rig.weapon.length || 30, 0, rig.palette.metal));
  else drawStick(ctx, rig, rig.weapon.length || 30, rig.palette.metal, rig.palette.dark);
  leave(ctx, rig);
}

function drawBody(ctx, rig, pose) {
  drawAccessories(ctx, rig, pose, 'back');
  drawWeaponBack(ctx, rig, pose);
  drawLeg(ctx, rig, pose, 'F');
  drawArm(ctx, rig, pose, 'F', true);
  drawTorso(ctx, rig, pose);
  // The near leg goes UNDER the hip block, not over it. A thigh painted on top of the belt reads as a leg stuck to
  // the front of the body; with the hips over it, the leg emerges from inside the pelvis the way a leg does.
  drawLeg(ctx, rig, pose, 'N');
  drawHips(ctx, rig, pose);
  drawHead(ctx, rig, pose);
  drawSmear(ctx, rig, pose);
  drawArm(ctx, rig, pose, 'N', true);
  drawAccessories(ctx, rig, pose, 'front');
}

/** Advance every secondary-motion chain from the anchor joints' screen motion since the last animated draw. */
function stepChains(rig, pose) {
  const ch = rig.chains;
  for (const k in ch) {
    const c = ch[k];
    const ang = c.joint === 'torso' ? rig.joints.torsoAngle : rig.joints.headAngle;
    jointScreen(rig, c.joint, c.pt);
    const inv = 1 / (Math.abs(rig.tf.fs) || 1);
    if (c.init) {
      const dx = (c.pt.x - c.lastX) * rig.facing * inv, dy = (c.pt.y - c.lastY) * inv;
      if (Math.abs(dx) > c.teleport || Math.abs(dy) > c.teleport) resetChain(c);
      else stepChain(c, dx, dy, ang - c.lastAng + pose.root.rot - c.lastRoot);
    }
    c.init = true; c.lastX = c.pt.x; c.lastY = c.pt.y; c.lastAng = ang; c.lastRoot = pose.root.rot;
  }
}

/**
 * Draw a rig at screen coords (feet position). The pose may be partial; it is resolved against DEFAULT_POSE.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} rig from buildRig
 * @param {object} pose partial or full pose
 * Squash/stretch pivot at the feet; a pose that sets only `squash` gets a volume-preserving stretch for free.
 * @param {{ x:number, y:number, facing?:number, tint?:string|null, tintAlpha?:number, flash?:boolean, alpha?:number, scale?:number, secondary?:boolean, still?:boolean }} o
 *   secondary: false / still: true skip the secondary-motion step (chains are only stepped for AnimPlayer poses anyway)
 */
export function drawRig(ctx, rig, pose, o) {
  const P = pose && pose.__full ? pose : copyPose(pose, SCRATCH_POSE, true);
  const facing = o.facing || 1, sc = (o.scale || 1) * rig.scale;
  // The draw scale has to be known BEFORE the joints are computed: they snap on the device grid it defines, and
  // the outline is authored in device pixels, so its stroke width is divided by the scale ctx.scale() will apply.
  rig.pxScale = sc;
  rig.ow = (rig.build.outlineWidth != null ? rig.build.outlineWidth : 1) / sc;
  computeJoints(rig, P);
  const squash = P.squash, stretch = P.stretch === 1 && squash !== 1 ? 1 / squash : P.stretch;
  const fs = facing * sc * squash, ss = sc * stretch;
  const t = rig.tf; t.x = Math.round(o.x); t.y = Math.round(o.y); t.fs = fs; t.ss = ss;
  t.rx = rig.snap ? Math.round(P.root.x * sc) / sc : P.root.x; t.ry = rig.snap ? Math.round(P.root.y * sc) / sc : P.root.y;
  t.c = Math.cos(rad(P.root.rot)); t.s = Math.sin(rad(P.root.rot));
  rig.facing = facing;
  rig.light.x = LIGHT_X; rig.light.y = LIGHT_Y;
  rig.tick++; rig.chainFrame = rig.tick;
  if (pose && pose.__full && o.secondary !== false && !o.still) stepChains(rig, P);
  const useOff = o.flash || o.tint;
  ctx.save();
  if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= o.alpha;
  if (useOff) {
    const g = getOffscreen();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, OFF_W, OFF_H);
    g.translate(OFF_OX, OFF_OY); g.scale(fs, ss); g.translate(t.rx, t.ry); g.rotate(rad(P.root.rot));
    rig.override = o.flash ? '#ffffff' : null;
    drawBody(g, rig, P);
    rig.override = null;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = o.flash ? 1 : (o.tintAlpha != null ? o.tintAlpha : 0.5);
    g.fillStyle = o.flash ? '#ffffff' : o.tint;
    g.fillRect(0, 0, OFF_W, OFF_H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    ctx.drawImage(offCanvas, t.x - OFF_OX, t.y - OFF_OY);
  } else {
    ctx.translate(t.x, t.y); ctx.scale(fs, ss); ctx.translate(t.rx, t.ry); ctx.rotate(rad(P.root.rot));
    drawBody(ctx, rig, P);
  }
  ctx.restore();
}

/**
 * Screen position of a joint after the last drawRig call (e.g. 'handN', 'weaponTip', 'head', 'torso').
 * @returns {{x:number, y:number}} out
 */
export function jointScreen(rig, name, out = { x: 0, y: 0 }) {
  const j = rig.joints[name] || rig.joints.torso, t = rig.tf;
  const lx = j.x * t.c - j.y * t.s + t.rx, ly = j.x * t.s + j.y * t.c + t.ry;
  out.x = t.x + lx * t.fs; out.y = t.y + ly * t.ss;
  return out;
}

/** Mark a fully populated pose so drawRig can skip resolution (AnimPlayer does this for its pose). */
export function markFull(pose) { Object.defineProperty(pose, '__full', { value: true, enumerable: false }); return pose; }
