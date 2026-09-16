// The executable half of docs/ART_STYLE.md for the cast (docs/ART_PRINCIPLES.md 43): pure node, no browser.
//   node tools/art-check.js            every critter, exit 1 on any error
//   node tools/art-check.js --notes    also print the measured tables
// Checks the data tier only: registry shape, palette ladder, animation table shape and cast distinctness. Every
// threshold states what it measured; loosen one only with a reason written next to it. Geometry / pixel rules
// (outline contract, far-palette leaks, silhouette IoU) are future work once three finished rigs exist to calibrate on.
import { CRITTERS } from '../src/content/critters/index.js';
import { INK, CHIBI } from '../src/content/critters/common.js';
import { hexToRgb } from '../src/art/palettes.js';

const notes = process.argv.includes('--notes');
const findings = [];
const err = (subject, rule, msg) => findings.push({ sev: 'error', subject, rule, msg });
const warn = (subject, rule, msg) => findings.push({ sev: 'warn', subject, rule, msg });

// ---- colour maths (rec-601 luminance, HSV hue) ----
function lum(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function relDiff(a, b) { const la = lum(a), lb = lum(b); return Math.abs(la - lb) / Math.max(la, lb, 1e-6); }
function hsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function hueDelta(a, b) { const d = Math.abs(hsv(a).h - hsv(b).h); return Math.min(d, 360 - d); }
/** ART_STYLE 0.1: adjacent parts differ by >= 25 % luminance OR a hue-family change (>= 40 deg, both s >= 0.15). */
function separated(a, b, minRel = 0.25) { return relDiff(a, b) >= minRel || (hueDelta(a, b) >= 40 && hsv(a).s >= 0.15 && hsv(b).s >= 0.15); }

const REQUIRED_ANIMS = ['idle', 'walk', 'run', 'carry', 'carryWalk', 'reach', 'catch', 'cheer', 'sad', 'eat', 'chop', 'stir', 'bump', 'hop', 'wave', 'sit'];
const LOOPS = { idle: [40, 64], walk: [24, 36], run: [16, 28], carry: [40, 64], carryWalk: [24, 36] };
function animLen(a) { let n = 0; for (const f of a.frames) n += f.dur || 1; return n; }
function amp(frames, get) { let lo = Infinity, hi = -Infinity; for (const f of frames) { const v = get(f.pose) || 0; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; }

const ids = new Set();
for (const c of CRITTERS) {
  const S = c.id || '?';
  if (!c.id || ids.has(c.id)) err(S, 'registry/id', 'missing or duplicate id'); ids.add(c.id);
  for (const k of ['name', 'role', 'species', 'build', 'anims']) if (!c[k]) err(S, 'registry/shape', `missing ${k}`);
  if (!c.build) continue;
  const b = c.build, pal = b.palette || {};
  if (b.outline !== INK) err(S, 'palette/outline', `outline ${b.outline} is not the game ink ${INK}`);
  for (const k of ['skin', 'hair', 'belly', 'primary', 'secondary', 'accent', 'dark']) if (!pal[k]) err(S, 'palette/slots', `palette.${k} missing`);
  if (pal.sleeve && pal.sleeve !== pal.skin) warn(S, 'palette/sleeve', 'sleeve should equal skin: a critter\'s arms are fur (critterBuild sets it)');
  if (pal.skin && pal.primary && !separated(pal.skin, pal.primary, 0.18)) err(S, 'palette/apron-vs-fur', `apron ${pal.primary} vs fur ${pal.skin}: relDiff ${relDiff(pal.skin, pal.primary).toFixed(2)} < 0.18 and no hue-family change`);
  if (pal.skin && pal.belly && relDiff(pal.skin, pal.belly) < 0.12) err(S, 'palette/belly-vs-fur', `belly ${pal.belly} vs fur ${pal.skin}: relDiff ${relDiff(pal.skin, pal.belly).toFixed(2)} < 0.12 (the muzzle must read)`);
  if (pal.primary && pal.secondary && !separated(pal.primary, pal.secondary, 0.18)) err(S, 'palette/apron-vs-shorts', `apron ${pal.primary} vs shorts ${pal.secondary} too close`);
  if (pal.skin && pal.hair && relDiff(pal.skin, pal.hair) < 0.2) warn(S, 'palette/markings-vs-fur', `hair/markings ${pal.hair} vs fur ${pal.skin}: relDiff ${relDiff(pal.skin, pal.hair).toFixed(2)} < 0.20; brows and ear tips will not read`);
  if (pal.dark && lum(pal.dark) > 0.25) warn(S, 'palette/dark', `dark ${pal.dark} is not dark (lum ${lum(pal.dark).toFixed(2)}): the nose needs it`);
  const p = { ...CHIBI, ...(b.proportions || {}) };
  const h = p.upperLeg + p.lowerLeg + p.footH - 2 + p.torsoH - 2 + p.neck + p.headR * 2;
  const heads = h / (p.headR * 2);
  if (h < 46 || h > 68) err(S, 'proportions/height', `standing height ${h} px outside 46..68 (measured reference 56)`);
  if (heads < 1.9 || heads > 2.8) warn(S, 'proportions/heads-tall', `${heads.toFixed(2)} heads tall outside the chibi band 1.9..2.8`);
  if (p.handR < p.headR * 0.33) warn(S, 'proportions/paws', `handR ${p.handR} < 0.33 headR: paws must read from across the screen`);
  // animation table
  const A = c.anims || {};
  for (const n of REQUIRED_ANIMS) {
    const a = A[n];
    if (!a || !a.frames || !a.frames.length) { err(S, 'anim/table', `missing animation ${n}`); continue; }
    a.frames.forEach((f, i) => { if (!f.pose || typeof f.pose !== 'object') err(S, 'anim/frame', `${n} #${i} has no pose`); if (!(f.dur >= 1)) err(S, 'anim/frame', `${n} #${i} dur ${f.dur}`); });
    if (LOOPS[n]) { const L = animLen(a); if (!a.loop) err(S, 'anim/loop', `${n} must loop`); if (L < LOOPS[n][0] || L > LOOPS[n][1]) warn(S, 'anim/cycle', `${n} is ${L} frames, expected ${LOOPS[n][0]}..${LOOPS[n][1]}`); }
  }
  if (A.idle && A.idle.frames) {
    const fr = A.idle.frames;
    if (fr.length < 2) err(S, 'anim/idle-breathes', 'idle needs at least 2 keys');
    const t = amp(fr, (q) => q.torso && q.torso.rot), r = amp(fr, (q) => q.root && q.root.y), hd = amp(fr, (q) => q.head && q.head.rot);
    if (t < 1 && r < 1) err(S, 'anim/idle-breathes', `idle torso amp ${t} and root.y amp ${r}: a held pose reads as a prop`);
    if (hd < 1) warn(S, 'anim/idle-breathes', 'idle head does not move');
  }
  if (A.walk && A.walk.frames) { const r = amp(A.walk.frames, (q) => q.root && q.root.y); if (r < 1) warn(S, 'anim/walk-bob', 'walk has no root.y bob; on 6 px legs the bob IS the walk'); }
  if (notes) console.log(`  ${S}: height ${h} (${heads.toFixed(2)} heads), fur ${pal.skin} apron ${pal.primary} belly ${pal.belly} ears ${c.build.earTip ? 'tipped' : 'plain'}`);
}
// ---- cast distinctness: species, fur hue/value, apron colour ----
for (let i = 0; i < CRITTERS.length; i++) for (let j = i + 1; j < CRITTERS.length; j++) {
  const a = CRITTERS[i], b = CRITTERS[j], pa = a.build && a.build.palette, pb = b.build && b.build.palette;
  if (!pa || !pb) continue;
  const S = `${a.id}+${b.id}`;
  if (a.species && a.species === b.species) err(S, 'cast/species', 'two cast members share a species');
  if (hueDelta(pa.skin, pb.skin) < 25 && relDiff(pa.skin, pb.skin) < 0.2) err(S, 'cast/fur', `fur ${pa.skin} vs ${pb.skin}: hue gap ${hueDelta(pa.skin, pb.skin).toFixed(0)} < 25 and relDiff ${relDiff(pa.skin, pb.skin).toFixed(2)} < 0.20`);
  if (hueDelta(pa.primary, pb.primary) < 30 && relDiff(pa.primary, pb.primary) < 0.2) warn(S, 'cast/apron', `aprons ${pa.primary} vs ${pb.primary} too alike: the apron is the player-colour spot`);
}

const errors = findings.filter((f) => f.sev === 'error'), warns = findings.filter((f) => f.sev === 'warn');
for (const f of findings) console.log(`${f.sev.toUpperCase().padEnd(5)} ${f.rule.padEnd(26)} ${f.subject}: ${f.msg}`);
console.log(`art-check: ${CRITTERS.length} critters, ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
