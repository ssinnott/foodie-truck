// Behaviour fingerprint for the shared art/engine layer.
//
// Records every canvas operation made while drawing every rig through every animation, plus the pure
// deterministic helpers, and hashes the stream. Its only job is to answer one question during the
// TypeScript migration and the library extraction: DID ANY DRAWN PIXEL OR COMPUTED NUMBER CHANGE?
//
// Pass/fail suites prove the rules still hold; this proves the OUTPUT is identical. Run it before a
// refactor, run it after, diff the two files. No browser, no canvas, no timing.
//   node tools/golden.js              print the current fingerprint as JSON
//   node tools/golden.js --check       compare against tools/golden-baseline.json, exit 1 on any drift
//   node tools/golden.js --write       refresh the baseline (only when a change is intended and reviewed)
import { buildRig, drawRig, computeJoints, DEFAULT_PROPORTIONS } from '../src/art/rig.js';
import { AnimPlayer } from '../src/game/animation.js';
import { makePose } from '../src/art/poses.js';
import { CRITTERS } from '../src/content/critters/index.js';
import { owl, otter, goat } from '../src/content/critters/customers.js';
import * as math from '../src/engine/math.js';
import * as trig from '../src/engine/trig.js';
import { makeRng } from '../src/engine/rng.js';
import * as pal from '../src/art/palettes.js';
import { makeTones } from '../src/art/shading.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden-baseline.json');

/** Round so float noise never shows, and normalise -0 (which would hash differently from 0). */
const num = (v) => {
  if (typeof v !== 'number') return typeof v === 'object' && v !== null ? '[obj]' : String(v);
  if (!isFinite(v)) return String(v);
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A canvas context that draws nothing and remembers everything. */
function recorder() {
  const ops = [];
  const grad = { addColorStop: (...a) => ops.push('grad.addColorStop(' + a.map(num).join(',') + ')') };
  const base = { canvas: { width: 640, height: 360 } };
  const ctx = new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        ops.push(String(k) + '(' + args.map(num).join(',') + ')');
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return grad;
        if (k === 'measureText') return { width: 0 };
        if (k === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
        return undefined;
      };
    },
    set(t, k, v) { ops.push(String(k) + '=' + num(v)); t[k] = v; return true; },
  });
  return { ctx, ops };
}

/** FNV-1a over the op stream. */
function hash(ops) {
  let h = 0x811c9dc5;
  const s = ops.join('\n');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Draw one subject through every animation it has, one op stream. */
function fingerprintSubject(def) {
  const { ctx, ops } = recorder();
  let rig;
  try { rig = buildRig(def.build); } catch (e) { return { error: 'build: ' + e.message }; }
  const anims = def.anims || {};
  const names = Object.keys(anims).sort();
  const player = new AnimPlayer(anims);
  for (const name of names) {
    if (!player.has(name)) continue;
    player.play(name, { restart: true });
    const len = Math.min(player.length || 1, 240);
    for (let f = 0; f < len; f++) {
      ops.push(`--- ${name} f${f}`);
      try { drawRig(ctx, rig, player.pose, { facing: f % 2 ? -1 : 1, scale: 1 }); }
      catch (e) { ops.push('DRAW_ERROR ' + e.message); break; }
      player.tick();
    }
  }
  return { anims: names.length, ops: ops.length, hash: hash(ops) };
}

/** The pure helpers, over fixed inputs. */
function fingerprintPure() {
  const ops = [];
  for (let i = -720; i <= 720; i += 7) ops.push(`dsin ${i} ${num(trig.dsin(i))} dcos ${num(trig.dcos(i))}`);
  for (let i = 0; i < 200; i++) {
    ops.push(`clamp ${num(math.clamp(i - 100, -10, 10))} lerp ${num(math.lerp(0, 100, i / 200))}`);
    ops.push(`approach ${num(math.approach(i, 0, 3))} smooth ${num(math.smoothstep(i / 200))} wrap ${num(math.wrap(i - 50, 37))}`);
  }
  for (const [k, f] of Object.entries(math.ease)) for (let i = 0; i <= 20; i++) ops.push(`ease.${k} ${num(f(i / 20))}`);
  const r = makeRng(12345);
  for (let i = 0; i < 500; i++) ops.push(`rng ${num(r.next())}`);
  const hexes = ['#B07A4A', '#6B4326', '#D9463B', '#F2C14E', '#E2DDEA', '#000000', '#ffffff'];
  for (const h of hexes) {
    ops.push(`shade ${pal.shade(h, 0.62)} mix ${pal.mix(h, '#808080', 0.33)} rgba ${pal.rgba(h, 0.4)}`);
    ops.push(`farShade ${pal.farShade(h, 0.62, 0.25)} ${pal.farShade(h, 0.5, 0.42)}`);
    const t = makeTones({ ramp: { hi: 1.22, sh: 0.66 } }, h);
    ops.push(`tones ${JSON.stringify(t)}`);
  }
  ops.push('props ' + JSON.stringify(DEFAULT_PROPORTIONS));
  return { ops: ops.length, hash: hash(ops) };
}

const out = { pure: fingerprintPure(), subjects: {} };
for (const c of CRITTERS) out.subjects['critter:' + c.id] = fingerprintSubject(c);
for (const g of [owl, otter, goat]) out.subjects['customer:' + g.id] = fingerprintSubject(g);
const all = Object.entries(out.subjects).sort(([a], [b]) => a < b ? -1 : 1);
out.total = hash([out.pure.hash, ...all.map(([k, v]) => k + ':' + (v.hash || v.error))]);

// ---- baseline comparison -------------------------------------------------
const compact = { pure: out.pure.hash, total: out.total, subjects: Object.fromEntries(all.map(([k, v]) => [k, v.hash || 'ERROR:' + v.error])) };
const mode = process.argv[2];
if (mode === '--write') {
  fs.writeFileSync(BASELINE, JSON.stringify(compact, null, 2) + '\n');
  console.log(`wrote ${BASELINE} (${all.length} subjects, total ${out.total})`);
} else if (mode === '--check') {
  if (!fs.existsSync(BASELINE)) { console.error('no baseline; run --write first'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const keys = [...new Set([...Object.keys(base.subjects), ...Object.keys(compact.subjects)])].sort();
  let bad = 0;
  for (const k of keys) {
    const a = base.subjects[k], b = compact.subjects[k];
    if (a === b) continue;
    bad++;
    console.log(`  DRIFT ${k}: baseline ${a || '(absent)'} -> now ${b || '(absent)'}`);
  }
  if (base.pure !== compact.pure) { bad++; console.log(`  DRIFT pure helpers: ${base.pure} -> ${compact.pure}`); }
  if (bad) {
    console.log(`\ngolden: ${bad} DRIFTED of ${keys.length} subjects. The refactor changed rendering or maths.`);
    process.exit(1);
  }
  console.log(`golden: ${keys.length} subjects identical, total ${out.total} - no behaviour change.`);
} else {
  console.log(JSON.stringify(out, null, 2));
}
