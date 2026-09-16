// Procedural 5x7 pixel font (ARCHITECTURE.md section 3). Never rely on system fonts for game text.

const GLYPH_W = 5;
const GLYPH_H = 7;
// Rows separated by '|', '#' = pixel.
const RAW = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.####|#....|#....|#....|#....|#....|.####', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.####|#....|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '#####|..#..|..#..|..#..|..#..|..#..|#####', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '#####|...#.|..#..|...#.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '.': '.....|.....|.....|.....|.....|.##..|.##..', ',': '.....|.....|.....|.....|.##..|..#..|.#...',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....', ';': '.....|.##..|.##..|.....|.##..|..#..|.#...',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  "'": '..#..|..#..|.#...|.....|.....|.....|.....', '"': '.#.#.|.#.#.|.#.#.|.....|.....|.....|.....',
  '-': '.....|.....|.....|#####|.....|.....|.....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....', '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...', '%': '##..#|##.#.|...#.|..#..|.#...|#.##.|#..##',
  '>': '#....|.#...|..#..|...#.|..#..|.#...|#....', '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
  '&': '.##..|#..#.|#..#.|.##..|#.#.#|#..#.|.##.#', _: '.....|.....|.....|.....|.....|.....|#####',
  '=': '.....|.....|#####|.....|#####|.....|.....', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '[': '.###.|.#...|.#...|.#...|.#...|.#...|.###.', ']': '.###.|...#.|...#.|...#.|...#.|...#.|.###.',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.####',
  '▶': '#....|##...|###..|####.|###..|##...|#....', '♥': '.#.#.|#####|#####|.###.|..#..|.....|.....',
  '←': '..#..|.#...|#####|.#...|..#..|.....|.....', '→': '..#..|...#.|#####|...#.|..#..|.....|.....',
  '↑': '..#..|.###.|#.#.#|..#..|..#..|..#..|..#..', '↓': '..#..|..#..|..#..|..#..|#.#.#|.###.|..#..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const GLYPHS = {};
for (const k of Object.keys(RAW)) GLYPHS[k] = RAW[k].split('|');

const cache = new Map();
const CACHE_LIMIT = 1500;

function glyphCanvas(ch, size, color) {
  const key = ch + '|' + size + '|' + color;
  let c = cache.get(key);
  if (c) return c;
  const rows = GLYPHS[ch];
  if (!rows) return null;
  c = document.createElement('canvas');
  c.width = GLYPH_W * size;
  c.height = GLYPH_H * size;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let r = 0; r < GLYPH_H; r++) {
    const row = rows[r];
    for (let col = 0; col < GLYPH_W; col++) if (row[col] === '#') g.fillRect(col * size, r * size, size, size);
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, c);
  return c;
}

function normalize(text) { return String(text).toUpperCase(); }

/**
 * Measure a single line of text in px.
 * @returns {number}
 */
export function measureText(text, size = 1, spacing = 1) {
  const s = normalize(text);
  let w = 0, maxW = 0;
  for (const ch of s) {
    if (ch === '\n') { maxW = Math.max(maxW, w); w = 0; continue; }
    w += (GLYPH_W + spacing) * size;
  }
  return Math.max(maxW, w) - (w > 0 ? spacing * size : 0);
}

/** Line height for a given size. */
export function lineHeight(size = 1) { return (GLYPH_H + 2) * size; }

/**
 * Draw pixel-font text. `y` is the top of the glyphs. Returns the drawn width of the first line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|number} text upper-cased automatically; '\n' starts a new line
 * @param {number} x
 * @param {number} y
 * @param {{ size?: number, color?: string, align?: 'left'|'center'|'right', shadow?: boolean, shadowColor?: string,
 *   spacing?: number, alpha?: number, font?: string, baseline?: 'top'|'middle' }} [opts]
 */
export function drawText(ctx, text, x, y, opts = {}) {
  const size = Math.max(1, Math.round(opts.size || 1));
  const color = opts.color || '#ffffff';
  const align = opts.align || 'left';
  const shadow = opts.shadow !== false;
  const shadowColor = opts.shadowColor || '#120c14';
  const spacing = opts.spacing == null ? 1 : opts.spacing;
  const lines = normalize(text).split('\n');
  const lh = lineHeight(size);
  if (opts.baseline === 'middle') y -= Math.floor((GLYPH_H * size) / 2);
  if (opts.alpha != null && opts.alpha < 1) { ctx.save(); ctx.globalAlpha *= opts.alpha; }
  let firstWidth = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const w = measureText(line, size, spacing);
    if (li === 0) firstWidth = w;
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    const cy = Math.round(y + li * lh);
    for (const ch of line) {
      if (shadow) { const sc = glyphCanvas(ch, size, shadowColor); if (sc) ctx.drawImage(sc, cx + size, cy + size); }
      const gc = glyphCanvas(ch, size, color);
      if (gc) ctx.drawImage(gc, cx, cy);
      cx += (GLYPH_W + spacing) * size;
    }
  }
  if (opts.alpha != null && opts.alpha < 1) ctx.restore();
  return firstWidth;
}

/**
 * Chunky outlined title text: outline in 8 directions, optional drop shadow, then fill.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|number} text
 * @param {number} x
 * @param {number} y
 * @param {{ size?: number, color?: string, outline?: string, thickness?: number,
 *   align?: 'left'|'center'|'right', shadow?: boolean, shadowColor?: string, shadowOffset?: number,
 *   spacing?: number, alpha?: number, font?: string, baseline?: 'top'|'middle' }} [opts]
 */
export function drawTextOutlined(ctx, text, x, y, opts = {}) {
  const size = Math.max(1, Math.round(opts.size || 2));
  const th = Math.max(1, Math.round(opts.thickness || 1));
  const outline = opts.outline || '#120c14';
  const base = { size, align: opts.align, spacing: opts.spacing, shadow: false };
  if (opts.shadow !== false) {
    const off = opts.shadowOffset == null ? th + size : opts.shadowOffset;
    drawText(ctx, text, x + off, y + off, { ...base, color: opts.shadowColor || 'rgba(0,0,0,0.5)' });
  }
  for (let dy = -th; dy <= th; dy += th) for (let dx = -th; dx <= th; dx += th) {
    if (dx === 0 && dy === 0) continue;
    drawText(ctx, text, x + dx, y + dy, { ...base, color: outline });
  }
  return drawText(ctx, text, x, y, { ...base, color: opts.color || '#ffffff' });
}

/** Characters supported by the font. */
export const FONT_CHARS = Object.keys(GLYPHS).join('');
