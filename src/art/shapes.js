// Primitive drawing helpers shared by rigs, props and backdrops. All draw at the current transform.
// Convention: (ctx, geometry..., fill, stroke, lineWidth). Pass a falsy fill/stroke to skip it.

/** Trace a rounded rectangle path (no fill/stroke). */
export function pathRrect(ctx, x, y, w, h, r = 3) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y); ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr); ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h); ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr); ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}
/** Trace an ellipse path. */
export function pathEllipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}
/** Trace a capsule (thick line with round caps) from (x0,y0) to (x1,y1) with radius r. */
export function pathCapsule(ctx, x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const a = len > 0.0001 ? Math.atan2(dy, dx) : 0;
  ctx.beginPath();
  ctx.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}
/** Trace a polygon path from a flat [x0,y0,x1,y1,...] or [[x,y],...] array. */
export function pathPoly(ctx, pts, close = true) {
  ctx.beginPath();
  if (pts.length && Array.isArray(pts[0])) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  } else {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  }
  if (close) ctx.closePath();
}
/** Trace a gear outline. */
export function pathGear(ctx, cx, cy, r, teeth = 8, rot = 0, toothDepth = r * 0.28) {
  ctx.beginPath();
  const n = Math.max(3, teeth | 0), inner = r - toothDepth;
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = a0 + Math.PI * 2 / n;
    const t1 = a0 + (a1 - a0) * 0.2, t2 = a0 + (a1 - a0) * 0.3, t3 = a0 + (a1 - a0) * 0.7, t4 = a0 + (a1 - a0) * 0.8;
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner);
    ctx.lineTo(cx + Math.cos(t1) * inner, cy + Math.sin(t1) * inner);
    ctx.lineTo(cx + Math.cos(t2) * r, cy + Math.sin(t2) * r);
    ctx.lineTo(cx + Math.cos(t3) * r, cy + Math.sin(t3) * r);
    ctx.lineTo(cx + Math.cos(t4) * inner, cy + Math.sin(t4) * inner);
    ctx.lineTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
  }
  ctx.closePath();
}

/** Fill and/or stroke the current path. Stroke is drawn first so the fill sits on top (outline look). */
export function paint(ctx, fill, stroke, lineWidth = 2) {
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth * 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

/** Rounded rectangle. */
export function rrect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 1) { pathRrect(ctx, x, y, w, h, r); paint(ctx, fill, stroke, lineWidth); }
/** Ellipse. */
export function ellipse(ctx, cx, cy, rx, ry, fill, stroke, lineWidth = 1) { pathEllipse(ctx, cx, cy, rx, ry); paint(ctx, fill, stroke, lineWidth); }
/** Circle. */
export function circle(ctx, cx, cy, r, fill, stroke, lineWidth = 1) { pathEllipse(ctx, cx, cy, r, r); paint(ctx, fill, stroke, lineWidth); }
/** Capsule. */
export function capsule(ctx, x0, y0, x1, y1, r, fill, stroke, lineWidth = 1) { pathCapsule(ctx, x0, y0, x1, y1, r); paint(ctx, fill, stroke, lineWidth); }
/** Polygon. */
export function poly(ctx, pts, fill, stroke, lineWidth = 1, close = true) { pathPoly(ctx, pts, close); paint(ctx, fill, stroke, lineWidth); }
/** Plain line. */
export function line(ctx, x0, y0, x1, y1, color, lineWidth = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
/**
 * Gear with optional hub hole.
 * @param {number} rot rotation in radians
 * @param {number} [holeR] radius of the centre hole (drawn with `holeColor` or skipped)
 */
export function gear(ctx, cx, cy, r, teeth, fill, stroke, lineWidth = 1, rot = 0, holeR = 0, holeColor = null) {
  pathGear(ctx, cx, cy, r, teeth, rot);
  paint(ctx, fill, stroke, lineWidth);
  if (holeR > 0) {
    pathEllipse(ctx, cx, cy, holeR, holeR);
    paint(ctx, holeColor || 'rgba(0,0,0,0.35)', stroke, lineWidth);
    if (stroke) { ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.arc(cx, cy, holeR, 0, Math.PI * 2); ctx.stroke(); }
  }
}
/** A row of `count` rivets (small shaded circles) between two points. */
export function rivetLine(ctx, x0, y0, x1, y1, count, r = 1.5, color = '#c8a050', dark = 'rgba(0,0,0,0.4)') {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}
/** A pipe (capsule with dark rim + highlight) and optional flanges at both ends. */
export function pipe(ctx, x0, y0, x1, y1, w, color, dark = 'rgba(0,0,0,0.45)', light = 'rgba(255,255,255,0.25)', flanges = true) {
  const r = w / 2;
  capsule(ctx, x0, y0, x1, y1, r, color, dark, 1);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  line(ctx, x0 + nx * r * 0.45, y0 + ny * r * 0.45, x1 + nx * r * 0.45, y1 + ny * r * 0.45, light, Math.max(1, r * 0.35));
  if (flanges) {
    const fw = r * 1.35;
    for (const [px, py] of [[x0 + dx / len * r, y0 + dy / len * r], [x1 - dx / len * r, y1 - dy / len * r]]) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
      rrect(ctx, -2, -fw, 4, fw * 2, 1, color, dark, 1);
      ctx.restore();
    }
  }
}
/**
 * Outlined fill helper: `pathFn(ctx)` traces a path; it is stroked with `outline` (width*2, so `width` px shows outside)
 * and then filled. Use for any custom part that needs the rig-style outline.
 */
export function outlined(ctx, pathFn, fill, outline, width = 2) {
  pathFn(ctx);
  paint(ctx, fill, outline, width);
}
/** Star / burst polygon (spikes alternating outer/inner radius). */
export function pathStar(ctx, cx, cy, rOuter, rInner, points = 5, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner, a = rot + (i / (points * 2)) * Math.PI * 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

/**
 * Trace a tapered capsule (a limb segment): circle radius r0 at (x0,y0), r1 at (x1,y1), joined by the external tangents.
 * Degenerates to a plain capsule when r0 == r1 and to a circle when one end swallows the other.
 */
export function pathTaperedCapsule(ctx, x0, y0, x1, y1, r0, r1, append = false) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (!append) ctx.beginPath();
  if (len < 0.0001 || Math.abs(r0 - r1) >= len) {
    const big = r0 >= r1, cx = big ? x0 : x1, cy = big ? y0 : y1, r = Math.max(r0, r1);
    ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    return;
  }
  const a = Math.atan2(dy, dx), t = Math.asin((r0 - r1) / len);
  const s0 = a + Math.PI / 2 + t;
  ctx.moveTo(x0 + Math.cos(s0) * r0, y0 + Math.sin(s0) * r0);
  ctx.arc(x0, y0, r0, s0, a - Math.PI / 2 - t);
  ctx.arc(x1, y1, r1, a - Math.PI / 2 - t, a + Math.PI / 2 + t);
  ctx.closePath();
}
/** Trace a polygon with every corner rounded by radius r (flat [x0,y0,x1,y1,...] list). */
export function pathRoundedPoly(ctx, pts, r = 2) {
  const n = pts.length >> 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const pi = ((i + n - 1) % n) * 2, ni = ((i + 1) % n) * 2;
    const px = pts[pi], py = pts[pi + 1], cx = pts[i * 2], cy = pts[i * 2 + 1], nx = pts[ni], ny = pts[ni + 1];
    const d0 = Math.hypot(cx - px, cy - py) || 1, d1 = Math.hypot(nx - cx, ny - cy) || 1;
    const rr = Math.min(r, d0 / 2, d1 / 2);
    const sx = cx + (px - cx) / d0 * rr, sy = cy + (py - cy) / d0 * rr;
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    ctx.arcTo(cx, cy, nx, ny, rr);
  }
  ctx.closePath();
}
/** Trace an annular arc band (a weapon "smear" / sweep) around (cx,cy) from angle a0 to a1 (radians), radii rIn..rOut. */
export function pathArcBand(ctx, cx, cy, rIn, rOut, a0, a1) {
  const ccw = a1 < a0;
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, a0, a1, ccw);
  ctx.arc(cx, cy, rIn, a1, a0, !ccw);
  ctx.closePath();
}
