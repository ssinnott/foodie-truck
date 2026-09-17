// Pooled particle system (docs/ARCHITECTURE.md section 3). Ported from the sibling game; the world->screen
// projection is now a plain camera offset because this game's scenes are screen space (side views, the kitchen) or
// a 2D world plane (the map). Visual only: its randomness is an independent stream and it never touches the sim.
import { drawText } from './text.js';
import { makeRng } from '../lib/engine/rng.ts';

const MAX = 600;
const prng = makeRng(0xbeef); // visual only: independent of gameplay rng
const pool = [];
for (let i = 0; i < MAX; i++) {
  pool.push({ active: false, kind: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 30, size: 2, size1: 0, color: '#fff', color2: '',
    gravity: 0, drag: 1, text: '', alpha: 1, rot: 0, vrot: 0, screen: false, width: 2, bounce: 0, flat: false, floor: 0 });
}
let cursor = 0;
let liveCount = 0;

/** Kinds. `gravity` is px/frame^2 DOWN the screen (positive = falls). */
const DEFAULTS = {
  sparkle: { max: 14, size: 2, color: '#FFF6E0', color2: '#F2C14E', gravity: -0.02, drag: 0.92 },
  dust: { max: 26, size: 3, color: '#C9B58E', gravity: -0.01, drag: 0.94 },
  smoke: { max: 50, size: 4, color: '#5A5560', gravity: -0.05, drag: 0.97 },
  steam: { max: 40, size: 4, color: '#EBD9B4', gravity: -0.08, drag: 0.96 },
  ember: { max: 40, size: 2, color: '#FFD27A', color2: '#E23A2E', gravity: -0.04, drag: 0.98 },
  crumb: { max: 45, size: 3, color: '#C48A52', gravity: 0.35, drag: 0.99, bounce: 0.4 },
  leaf: { max: 90, size: 3, color: '#7FC35A', color2: '#A65A48', gravity: 0.04, drag: 0.985 },
  drop: { max: 20, size: 2, color: '#A9D8EE', gravity: 0.3, drag: 0.99 },
  text: { max: 45, size: 1, color: '#FFF6E0', gravity: 0, drag: 0.9 },
  ring: { max: 18, size: 4, size1: 40, color: '#FFFFFF', gravity: 0, drag: 1, width: 3 },
};

function alloc() {
  for (let i = 0; i < MAX; i++) {
    cursor = (cursor + 1) % MAX;
    if (!pool[cursor].active) return pool[cursor];
  }
  return pool[(cursor = (cursor + 1) % MAX)]; // steal the oldest slot
}

/** Particle singleton. */
export const particles = {
  /**
   * Spawn one particle at (x, y). World coords unless `opts.screen`; draw() subtracts the camera from world ones.
   * @param {'sparkle'|'dust'|'smoke'|'steam'|'ember'|'crumb'|'leaf'|'drop'|'text'|'ring'} kind
   * @param {object} [opts] vx, vy, life, size, size1 (ring end radius), color, color2, gravity, drag, text, rot, vrot, screen, width, bounce, flat, alpha, floor (y a bouncing kind lands on)
   */
  spawn(kind, x, y, opts = {}) {
    const d = DEFAULTS[kind] || DEFAULTS.sparkle;
    const p = alloc();
    p.active = true; p.kind = kind; p.x = x; p.y = y; p.life = 0;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.max = opts.life || d.max; p.size = opts.size != null ? opts.size : d.size; p.size1 = opts.size1 != null ? opts.size1 : (d.size1 || 0);
    p.color = opts.color || d.color; p.color2 = opts.color2 || d.color2 || p.color;
    p.gravity = opts.gravity != null ? opts.gravity : d.gravity; p.drag = opts.drag != null ? opts.drag : d.drag;
    p.text = opts.text || ''; p.alpha = opts.alpha != null ? opts.alpha : 1; p.rot = opts.rot || 0;
    p.vrot = opts.vrot != null ? opts.vrot : (kind === 'crumb' || kind === 'leaf' ? prng.range(-0.2, 0.2) : 0);
    p.screen = !!opts.screen; p.width = opts.width || d.width || 2; p.bounce = opts.bounce != null ? opts.bounce : (d.bounce || 0); p.flat = !!opts.flat;
    p.floor = opts.floor != null ? opts.floor : Infinity;
    return p;
  },
  /** Spawn `count` particles with randomised velocities. `opts.speed` (max), `opts.up` (upward bias, px/frame), other opts as spawn(). */
  burst(kind, x, y, count, opts = {}) {
    const speed = opts.speed != null ? opts.speed : 3;
    const up = opts.up != null ? opts.up : 1.5;
    for (let i = 0; i < count; i++) {
      const a = prng.range(0, Math.PI * 2);
      const s = prng.range(speed * 0.3, speed);
      const p = particles.spawn(kind, x, y, opts);
      p.vx = Math.cos(a) * s + (opts.vx || 0);
      p.vy = -(Math.abs(Math.sin(a)) * s * 0.7 + up) + (opts.vy || 0);
      if (opts.sizeJitter) p.size += prng.range(-opts.sizeJitter, opts.sizeJitter);
      p.max = Math.round(p.max * prng.range(0.7, 1.2));
    }
  },
  /** Advance all particles one fixed step. */
  update() {
    liveCount = 0;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      if (++p.life >= p.max) { p.active = false; continue; }
      liveCount++;
      p.vy += p.gravity;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
      if (p.kind === 'leaf') p.x += Math.sin(p.life * 0.15 + p.rot) * 0.4;
      if (p.y > p.floor && p.gravity > 0) {
        p.y = p.floor;
        if (p.bounce > 0 && p.vy > 0.5) { p.vy = -p.vy * p.bounce; p.vx *= 0.7; p.vrot *= 0.6; } else p.vy = 0;
      }
    }
  },
  /**
   * Draw particles. `layer`: undefined = all, 'back' = only dust (draw before entities), 'front' = all but dust.
   * @param {{x:number, y:number}|null} cam camera top-left in world px (null = screen space only)
   */
  draw(ctx, cam, layer) {
    const camX = cam ? cam.x : 0, camY = cam ? cam.y : 0;
    const baseAlpha = ctx.globalAlpha;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      if (layer === 'back' && p.kind !== 'dust') continue;
      if (layer === 'front' && p.kind === 'dust') continue;
      const t = p.life / p.max;
      const sx = Math.round(p.screen ? p.x : p.x - camX), sy = Math.round(p.screen ? p.y : p.y - camY);
      drawOne(ctx, p, sx, sy, t, baseAlpha);
    }
    ctx.globalAlpha = baseAlpha;
  },
  /** Remove all particles. */
  clear() { for (const p of pool) p.active = false; liveCount = 0; },
  /** Number of live particles (debug). */
  get count() { return liveCount; },
};

function drawOne(ctx, p, sx, sy, t, baseAlpha) {
  const fade = 1 - t;
  const A = baseAlpha;
  switch (p.kind) {
    case 'sparkle': {
      ctx.globalAlpha = A * p.alpha * Math.min(1, fade * 1.6);
      ctx.fillStyle = t < 0.4 ? p.color : p.color2;
      const s = p.size + ((p.life >> 2) & 1);
      ctx.fillRect(sx - 1, sy - s, 2, s * 2 + 1); ctx.fillRect(sx - s, sy - 1, s * 2 + 1, 2);
      break;
    }
    case 'dust': case 'smoke': case 'steam': {
      const grow = p.kind === 'dust' ? 0.6 + t * 1.2 : 0.5 + t * 1.8;
      ctx.globalAlpha = A * p.alpha * fade * (p.kind === 'steam' ? 0.7 : 0.55);
      ctx.fillStyle = p.color;
      const r = Math.max(1, p.size * grow);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ember': {
      ctx.globalAlpha = A * p.alpha * (0.6 + 0.4 * Math.sin(p.life * 0.9)) * fade;
      ctx.fillStyle = t < 0.5 ? p.color : p.color2;
      const s = t < 0.3 ? p.size + 1 : p.size;
      ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      break;
    }
    case 'crumb': case 'leaf': case 'drop': {
      ctx.globalAlpha = A * p.alpha * Math.min(1, fade * 3);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
      ctx.fillStyle = p.kind === 'leaf' && (p.life & 16) ? p.color2 : p.color;
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      if (p.kind !== 'drop') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-p.size / 2, 0, p.size, Math.max(1, p.size * 0.3)); }
      ctx.restore();
      break;
    }
    case 'text': {
      ctx.globalAlpha = A * p.alpha * (t > 0.7 ? (1 - t) / 0.3 : 1);
      drawText(ctx, p.text, sx, sy, { size: p.size, color: p.color, align: 'center', shadow: true });
      break;
    }
    case 'ring': {
      const e = 1 - (1 - t) * (1 - t);
      const r = p.size + (p.size1 - p.size) * e;
      ctx.globalAlpha = A * p.alpha * fade;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.width * fade);
      ctx.beginPath();
      if (p.flat) ctx.ellipse(sx, sy, r, r * 0.45, 0, 0, Math.PI * 2); else ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default: {
      ctx.globalAlpha = A * p.alpha * fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }
}
