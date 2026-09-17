// Contact-sheet generator for critter rigs (dev tool). Open tools/sheet.html (served by tools/server.js) with:
//   ?critter=<id>              a cast member (content/critters), default the first
//   &mode=anims|strip|closeup|cast   (default anims)
//     anims    every keyframe of every animation (or &anims=a,b), one row per animation
//     strip    N evenly spaced samples of looping animations (&anims=walk,run &samples=8): the motion test
//     closeup  a few picks at high zoom (&anims=idle:0,chop:1 &zoom=6)
//     cast     every cast member in the same picks (idle, walk, carry, cheer): palette and silhouette comparison
//   &zoom=3 &cols=8 &cw=96 &ch=110 &bg=#hex &facing=-1 (mirror test) &item=basket|rod|spoon|knife|food
// Every cell is rendered at 1x through drawRig (chains, snapping and smears behave exactly as in game), then
// pixel-zoomed. window.__sheet = { ready, error, bench(n) } for headless capture (tools/sheet-capture.js).
import { CRITTERS } from '../src/content/critters/index.js';
import { ITEMS } from '../src/content/critters/items.js';
import { buildRig, drawRig } from '../src/lib/art/rig.ts';
import { AnimPlayer } from '../src/lib/art/animation.ts';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'anims';
const zoom = Number(q.get('zoom') || 3);
const FACING = Number(q.get('facing') || 1) < 0 ? -1 : 1;
const CELL_W = Number(q.get('cw') || 96), CELL_H = Number(q.get('ch') || 110), FEET = CELL_H - 14, LABEL_W = 56;
const BG = [q.get('bg') || '#8CC152', q.get('bg') || '#7FB548'];
const scratch = document.createElement('canvas'); scratch.width = CELL_W; scratch.height = CELL_H;
const sctx = scratch.getContext('2d');
const sheet = document.getElementById('sheet');
const out = sheet.getContext('2d');
const info = document.getElementById('info');
window.__sheet = { ready: false, error: null, bench: null };

function text(ctx, s, x, y, color = '#f7e9c9') { ctx.fillStyle = color; ctx.font = '10px ui-monospace, monospace'; ctx.textBaseline = 'top'; ctx.fillText(s, x, y); }

/** Render one pose cell at 1x into the scratch canvas, then blit it zoomed at (gx, gy). */
function cell(rig, anim, gx, gy, label, i, shade) {
  sctx.fillStyle = BG[shade ? 1 : 0]; sctx.fillRect(0, 0, CELL_W, CELL_H);
  sctx.fillStyle = 'rgba(0,0,0,0.25)'; sctx.beginPath(); sctx.ellipse(CELL_W / 2, FEET + 1, 14, 4, 0, 0, Math.PI * 2); sctx.fill();
  drawRig(sctx, rig, anim.pose, { x: CELL_W / 2, y: FEET, facing: FACING, still: true });
  out.imageSmoothingEnabled = false;
  out.drawImage(scratch, gx, gy, CELL_W * zoom, CELL_H * zoom);
  if (label) text(out, label, gx + 3, gy + 3, '#2a1f1a');
}

function main() {
  const id = q.get('critter') || CRITTERS[0].id;
  const def = CRITTERS.find((c) => c.id === id) || CRITTERS[0];
  const item = q.get('item');
  const makeRig = (d) => { const r = buildRig(d.build); if (item && ITEMS[item]) r.weapon = ITEMS[item]; if (item === 'basket') r.basketFill = 0.75; return r; };
  const cols = Number(q.get('cols') || 8);
  let rows = [];
  if (mode === 'cast') {
    const picks = (q.get('anims') || 'idle,walk,carry,cheer').split(',');
    const stage = [];
    for (const d of CRITTERS) {
      const rig = makeRig(d), anim = new AnimPlayer(d.anims);
      const cells = [];
      for (const p of picks) { anim.play(p, { restart: true }); anim.tick(); cells.push({ rig, pose: JSON.parse(JSON.stringify(anim.pose)), copy: true, label: p }); }
      stage.push({ label: d.name, cells: cells.map((c) => ({ ...c, pose: JSON.parse(JSON.stringify(c.pose)) })) });
    }
    rows = stage;
  } else {
    const rig = makeRig(def), anim = new AnimPlayer(def.anims);
    const names = (q.get('anims') || Object.keys(def.anims).join(',')).split(',').filter(Boolean);
    if (mode === 'anims') {
      for (const n of names) {
        const a = def.anims[n]; if (!a) continue;
        const cells = [];
        for (let i = 0; i < a.frames.length; i++) { anim.play(n, { restart: true }); anim.frameIndex = i; anim.frameTime = 0; anim._updatePose(); cells.push({ rig, pose: JSON.parse(JSON.stringify(anim.pose)), label: `${i} (${a.frames[i].dur}f)` }); }
        rows.push({ label: n, cells });
      }
    } else if (mode === 'strip') {
      const samples = Number(q.get('samples') || 8);
      for (const n of names) {
        const a = def.anims[n]; if (!a) continue;
        anim.play(n, { restart: true });
        const total = anim.length, cells = [];
        for (let s = 0; s < samples; s++) {
          anim.play(n, { restart: true });
          const target = Math.floor((s / samples) * total);
          for (let k = 0; k < target; k++) anim.tick();
          cells.push({ rig, pose: JSON.parse(JSON.stringify(anim.pose)), label: `t${target}` });
        }
        rows.push({ label: n, cells });
      }
    } else if (mode === 'closeup') {
      const picks = (q.get('anims') || 'idle:0,walk:0,chop:1,eat:1').split(',');
      const cells = [];
      for (const p of picks) {
        const [n, fi] = p.split(':'); const a = def.anims[n]; if (!a) continue;
        anim.play(n, { restart: true }); anim.frameIndex = Math.min(a.frames.length - 1, Number(fi || 0)); anim.frameTime = 0; anim._updatePose();
        cells.push({ rig, pose: JSON.parse(JSON.stringify(anim.pose)), label: p });
      }
      rows.push({ label: def.name, cells });
    }
  }
  const maxCells = Math.max(1, ...rows.map((r) => Math.min(cols, r.cells.length)));
  const rowH = CELL_H * zoom + 4;
  let totalRows = 0; for (const r of rows) totalRows += Math.ceil(r.cells.length / cols);
  sheet.width = LABEL_W + maxCells * (CELL_W * zoom + 2); sheet.height = Math.max(1, totalRows * rowH);
  out.fillStyle = '#3a3446'; out.fillRect(0, 0, sheet.width, sheet.height);
  let y = 0;
  rows.forEach((r, ri) => {
    for (let c = 0; c < r.cells.length; c++) {
      const col = c % cols, x = LABEL_W + col * (CELL_W * zoom + 2);
      if (col === 0) { text(out, r.label, 2, y + 4); }
      const cl = r.cells[c];
      cell(cl.rig, { pose: cl.pose }, x, y, cl.label, c, (ri + c) & 1);
      if (col === cols - 1 && c < r.cells.length - 1) y += rowH;
    }
    y += rowH;
  });
  info.textContent = `${def.name} - ${mode} - zoom ${zoom} - ${rows.length} rows`;
  window.__sheet.bench = (n = 300) => { const t0 = performance.now(); const rig = makeRig(def), anim = new AnimPlayer(def.anims); anim.play('walk'); for (let i = 0; i < n; i++) { anim.tick(); drawRig(sctx, rig, anim.pose, { x: 48, y: 90 }); } return (performance.now() - t0) / n; };
  window.__sheet.ready = true;
}
try { main(); } catch (e) { window.__sheet.error = String(e && e.stack || e); info.textContent = window.__sheet.error; window.__sheet.ready = true; }
