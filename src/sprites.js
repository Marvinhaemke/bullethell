// Crystal artwork. Every bullet is a cut gem -- a girdle outline, a bright
// table in the middle, and facets between the two shaded against one fixed
// light -- drawn once into a cached offscreen canvas and blitted from there.
// The caching is the whole reason a few thousand faceted gems cost the same per
// frame as a few thousand flat dots did: a gem is thirty-odd path fills to BUILD
// and one drawImage to DRAW.
//
// READABILITY OUTRANKS BEAUTY, and three things carry over from the flat
// sprites on purpose:
//
//   - The glow halo in the bullet's own colour. It is what separates a bullet
//     from the dark, and a dense curtain is unreadable without it.
//   - A bright centre. The table of every cut is filled close to white, so the
//     eye still finds the middle of a bullet first -- the old white core, as a
//     facet instead of a dot.
//   - The silhouette. Every cut is traced inside the old outline, and the
//     hitbox (`hr`, 0.76 of the radius) is untouched, so a bullet looks exactly
//     as large as it always did and hurts exactly where it always did.
//
// The dark facets are the risk: shade one too far and that side of a bullet
// vanishes into the background and the thing looks smaller than it is. They
// bottom out at a bit over half the base brightness, and the glow sits behind
// them, so the silhouette still reads at full size.

import { TAU } from './mathx.js';

// Shapes whose silhouette points along the direction of travel.
export const DIRECTIONAL = new Set(['rice', 'kunai', 'bar', 'tri', 'wedge']);

const cache = new Map();
let dpr = 1;

/**
 * Bumped whenever the cache is thrown away, so anything holding on to a
 * sprite it looked up earlier -- the bullet pool memoises one per bullet --
 * can tell it is stale.
 */
export let spriteGen = 0;

export function setSpriteScale(scale) {
  const next = Math.max(1, Math.min(2, scale || 1));
  if (Math.abs(next - dpr) < 0.01) return;
  dpr = next;
  cache.clear();
  spriteGen++;
}

// ---- colour ----------------------------------------------------------------

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (v) return v;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  rgbCache.set(hex, v);
  return v;
}

const WHITE = [255, 255, 255];
// Not black: a violet-black, so the shadowed side of a gem still has a hue in
// it and reads as the far side of a coloured stone rather than as a hole.
const INK = [10, 6, 26];

/**
 * `hex` pushed toward white (t > 0) or toward ink (t < 0), as a CSS colour.
 * The one colour operation the whole crystal look is built from.
 */
export function tint(hex, t, alpha = 1) {
  const a = rgb(hex);
  const to = t >= 0 ? WHITE : INK;
  const k = Math.abs(t);
  const r = Math.round(a[0] + (to[0] - a[0]) * k);
  const g = Math.round(a[1] + (to[1] - a[1]) * k);
  const b = Math.round(a[2] + (to[2] - a[2]) * k);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

// ---- light -----------------------------------------------------------------

// One light, from the upper left, in sprite space. A facet's brightness is how
// squarely its outward tilt faces it. Directional shards rotate with their
// heading, so their lit face turns as they do -- which reads as a spinning
// shard catching the light, and is cheaper than being right about it.
const LX = -0.6, LY = -0.8;

function facing(cx, cy) {
  const d = Math.hypot(cx, cy);
  return d < 1e-6 ? 0 : (cx * LX + cy * LY) / d;
}

// Two shading registers. Bullets are shaded BRIGHT: lit facets run most of the
// way to white, because a bullet's job is to be seen. Showpiece stones -- the
// boss's heart, its shards, the title -- are shaded RICH: lit facets keep their
// colour and the dark side goes deeper, because their job is to look like a
// stone, and a stone lit to near-white just looks pastel.
let rich = false;

/** Facet fill for a facet whose centroid sits at (cx, cy) from the gem's centre. */
function facetFill(color, cx, cy, flip = 1) {
  const f = facing(cx, cy) * flip;
  if (rich) return f >= 0 ? tint(color, 0.04 + 0.36 * f) : tint(color, 0.58 * f);
  // Lit facets toward white, shadowed ones toward ink, and never so far toward
  // ink that the silhouette goes missing: -0.42 is still over half brightness.
  return f >= 0 ? tint(color, 0.14 + 0.46 * f) : tint(color, 0.42 * f);
}

// ---- geometry --------------------------------------------------------------

function ngon(n, r, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + i * TAU / n;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function poly(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

function scalePts(pts, sx, sy = sx) {
  return pts.map((p) => [p[0] * sx, p[1] * sy]);
}

function starPts(points, outer, inner, phase = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = phase + i * Math.PI / points;
    const rr = i % 2 ? inner : outer;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

// The marquise, rice's cut: a lens with pointed ends. Eight points trace it
// closely enough at bullet sizes, and a real lens would need arcs the facet
// shader cannot split.
const MARQUISE = [[1.6, 0], [0.92, 0.46], [0, 0.62], [-0.92, 0.46],
  [-1.6, 0], [-0.92, -0.46], [0, -0.62], [0.92, -0.46]];
const KUNAI = [[1.75, 0], [-0.75, 0.82], [-0.28, 0], [-0.75, -0.82]];
const WEDGE = [[1.3, 0], [-0.9, 1.0], [-0.9, -1.0]];

/** The outline of `shape` at radius `r`, as a point list (circles excepted). */
function outline(shape, r) {
  switch (shape) {
    case 'square': return [[-0.84, -0.84], [0.84, -0.84], [0.84, 0.84], [-0.84, 0.84]].map((p) => [p[0] * r, p[1] * r]);
    case 'diamond': return ngon(4, r, 0);
    case 'tri': return ngon(3, r * 1.12, 0);
    case 'hex': return ngon(6, r, 0);
    case 'penta': return ngon(5, r, -Math.PI / 2);
    case 'rice': return scalePts(MARQUISE, r);
    case 'kunai': return scalePts(KUNAI, r);
    case 'wedge': return scalePts(WEDGE, r);
    case 'bar': return [[-2.1, -0.44], [2.1, -0.44], [2.1, 0.44], [-2.1, 0.44]].map((p) => [p[0] * r, p[1] * r]);
    case 'star4': return starPts(4, r * 1.2, r * 0.42);
    case 'star5': return starPts(5, r * 1.15, r * 0.5, -Math.PI / 2);
    default: return null;
  }
}

/** Trace `shape` at radius `r` centred on the origin of context `g`. */
export function shapePath(g, shape, r) {
  g.beginPath();
  if (shape === 'ring') {
    g.arc(0, 0, r, 0, TAU);
    g.arc(0, 0, r * 0.52, 0, TAU, true);
    return;
  }
  const pts = outline(shape, r);
  if (pts) poly(g, pts);
  else g.arc(0, 0, r, 0, TAU);
}

// ---- cuts ------------------------------------------------------------------
//
// Each cut returns the facets to paint, back to front: { pts, fill } polygons,
// plus which of them is the table. Everything is built from one idea -- a
// girdle, an inner table, and the bevels between them -- except the three
// shapes that are not stones but crystals: the shard, the star cluster and the
// ring.

/** Step cut: every girdle edge bevels straight in to the matching table edge. */
function stepCut(color, girdle, sx, sy = sx) {
  const table = scalePts(girdle, sx, sy);
  const out = [];
  const n = girdle.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = [girdle[i], girdle[j], table[j], table[i]];
    const c = centroid(q);
    out.push({ pts: q, fill: facetFill(color, c[0], c[1]) });
  }
  out.push({ pts: table, fill: tint(color, 0.6), table: true });
  return out;
}

/**
 * Brilliant cut, for everything round: a ring of star and bezel triangles
 * between a round girdle and a table turned half a step. `n` is the facet
 * count, and drops for small stones -- ten facets on a 3px pellet are noise.
 */
function brilliantCut(color, r, n) {
  const girdle = ngon(n, r, 0);
  const table = ngon(n, r * 0.52, Math.PI / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const upper = [girdle[i], girdle[j], table[i]];
    const star = [table[i], girdle[j], table[j]];
    const c1 = centroid(upper), c2 = centroid(star);
    out.push({ pts: upper, fill: facetFill(color, c1[0], c1[1]) });
    out.push({ pts: star, fill: facetFill(color, c2[0] * 1.3, c2[1] * 1.3) });
  }
  out.push({ pts: table, fill: tint(color, 0.62), table: true });
  return out;
}

/** A shard: two long facets meeting on a ridge that runs tip to notch. */
function shardCut(color, pts, ridgeA, ridgeB) {
  const out = [];
  // Split the outline along the ridge into the half above and the half below.
  const above = [], below = [];
  for (const p of pts) {
    if (p[1] <= 0) above.push(p);
    if (p[1] >= 0) below.push(p);
  }
  const a = [ridgeA, ...above.filter((p) => p !== ridgeA && p !== ridgeB), ridgeB];
  const b = [ridgeA, ridgeB, ...below.filter((p) => p !== ridgeA && p !== ridgeB)];
  const ca = centroid(a), cb = centroid(b);
  out.push({ pts: a, fill: facetFill(color, ca[0] * 0.3, ca[1]) });
  out.push({ pts: b, fill: facetFill(color, cb[0] * 0.3, cb[1]) });
  // A thin bright sliver along the ridge stands in for the table: it keeps a
  // light line down the middle of every shard, which is the bright-centre cue.
  const w = 0.16 * Math.abs(ridgeA[0] - ridgeB[0]) / 2.5;
  out.push({
    pts: [ridgeA, [ridgeA[0] * 0.3 + ridgeB[0] * 0.7, -w], ridgeB, [ridgeA[0] * 0.3 + ridgeB[0] * 0.7, w]],
    fill: tint(color, 0.66), table: true,
  });
  return out;
}

/** A star cluster: every point is a kite split down its ridge, lit and dark. */
function starCut(color, points, outer, inner, phase) {
  const pts = starPts(points, outer, inner, phase);
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 2) {
    const tip = pts[i];
    const l = pts[(i - 1 + n) % n], r = pts[(i + 1) % n];
    const t1 = [[0, 0], l, tip], t2 = [[0, 0], tip, r];
    const c1 = centroid(t1), c2 = centroid(t2);
    // Offsetting the sample sideways makes each point's two halves differ,
    // which is what reads as a ridge.
    out.push({ pts: t1, fill: facetFill(color, c1[0] + (l[0] - r[0]) * 0.4, c1[1] + (l[1] - r[1]) * 0.4) });
    out.push({ pts: t2, fill: facetFill(color, c2[0] + (r[0] - l[0]) * 0.4, c2[1] + (r[1] - l[1]) * 0.4) });
  }
  out.push({ pts: ngon(points * 2, inner * 0.62, phase + Math.PI / points), fill: tint(color, 0.66), table: true });
  return out;
}

/** A faceted ring: bevels running round the band, inner ones facing inward. */
function ringCut(color, r) {
  const n = 12;
  const outer = ngon(n, r, 0), mid = ngon(n, r * 0.76, 0), inner = ngon(n, r * 0.52, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const o = [outer[i], outer[j], mid[j], mid[i]];
    const k = [mid[i], mid[j], inner[j], inner[i]];
    const co = centroid(o), ck = centroid(k);
    out.push({ pts: o, fill: facetFill(color, co[0], co[1]) });
    // The inner bevel leans the other way, toward the hole.
    out.push({ pts: k, fill: facetFill(color, ck[0], ck[1], -1) });
  }
  return out;
}

function cut(shape, color, r) {
  switch (shape) {
    case 'square': return stepCut(color, outline('square', r), 0.5);
    case 'diamond': return stepCut(color, outline('diamond', r), 0.42);
    case 'tri': return stepCut(color, outline('tri', r), 0.45);
    case 'hex': return stepCut(color, outline('hex', r), 0.52);
    case 'penta': return stepCut(color, outline('penta', r), 0.5);
    case 'wedge': return stepCut(color, outline('wedge', r), 0.42);
    case 'bar': return stepCut(color, outline('bar', r), 0.78, 0.3);
    case 'rice': return stepCut(color, outline('rice', r), 0.52, 0.36);
    case 'kunai': {
      const pts = outline('kunai', r);
      return shardCut(color, pts, pts[0], pts[2]);
    }
    case 'star4': return starCut(color, 4, r * 1.2, r * 0.42, 0);
    case 'star5': return starCut(color, 5, r * 1.15, r * 0.5, -Math.PI / 2);
    case 'ring': return ringCut(color, r);
    case 'pellet':
    case 'circle':
    default:
      return brilliantCut(color, r, r * dpr < 4.5 ? 6 : r * dpr < 8 ? 8 : 10);
  }
}

/**
 * Paint a gem at the origin of `g`: silhouette in the base colour, then the
 * facets, then the cut lines, then a specular glint on the lit side.
 *
 * `edge` is the alpha of the white cut lines; `glass` renders the same cut as
 * clear crystal -- dark translucent facets, bright edges -- which is how the
 * player's ship stays unmistakably not-a-bullet in a screen full of gems.
 */
export function paintGem(g, shape, color, r, o = {}) {
  const edge = o.edge === undefined ? 0.4 : o.edge;
  rich = !!o.rich;
  const facets = cut(shape, color, r);
  rich = false;

  g.save();
  if (o.glass) {
    shapePath(g, shape, r);
    g.fillStyle = tint(color, -0.78, 0.82);
    g.fill('evenodd');
    for (const f of facets) {
      g.beginPath();
      poly(g, f.pts);
      g.fillStyle = f.table ? tint(color, -0.35, 0.55) : tint(color, -0.6, 0.28);
      g.fill();
    }
  } else {
    // Silhouette first, so the round stones' slivers outside their facet ring
    // and the ring's hole come out right.
    shapePath(g, shape, r);
    g.fillStyle = tint(color, -0.1);
    g.fill('evenodd');
    for (const f of facets) {
      g.beginPath();
      poly(g, f.pts);
      if (f.table && o.rich) {
        // A rich table is lit across its face, not flat: bright where the
        // light strikes, sliding back to the stone's own colour opposite.
        const gr = g.createLinearGradient(-r * 0.5, -r * 0.55, r * 0.45, r * 0.5);
        gr.addColorStop(0, tint(color, 0.62));
        gr.addColorStop(0.55, tint(color, 0.18));
        gr.addColorStop(1, tint(color, -0.18));
        g.fillStyle = gr;
      } else {
        g.fillStyle = f.fill;
      }
      g.fill();
    }
  }

  // Cut lines. Thin enough to read as edges rather than as an outline.
  if (edge > 0) {
    g.lineJoin = 'round';
    g.strokeStyle = o.glass ? tint(color, 0.35, edge) : `rgba(255,255,255,${edge})`;
    g.lineWidth = o.lineWidth || Math.max(0.5, r * 0.09);
    for (const f of facets) {
      g.beginPath();
      poly(g, f.pts);
      g.stroke();
    }
  }
  // Girdle: a crisp rim in a lighter tint so the stone has an edge against its
  // own glow.
  shapePath(g, shape, r);
  g.strokeStyle = o.glass ? tint(color, 0.2, 0.95) : tint(color, 0.3, 0.9);
  g.lineWidth = o.rim || Math.max(0.6, r * 0.1);
  g.stroke();

  // Specular glint. On a bullet a soft dab is right -- at eight pixels across
  // anything sharper is a stray pixel. On a large stone the same dab reads as
  // plastic, so there it is a hard little four-point star instead: the flare
  // a real facet throws.
  if (o.specular !== false && shape !== 'ring') {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const hx = -r * 0.26, hy = -r * 0.32;
    if (o.rich && r >= 10) {
      const a = r * 0.34, w = r * 0.05;
      g.beginPath();
      g.moveTo(hx - a, hy); g.lineTo(hx - w, hy - w); g.lineTo(hx, hy - a);
      g.lineTo(hx + w, hy - w); g.lineTo(hx + a, hy); g.lineTo(hx + w, hy + w);
      g.lineTo(hx, hy + a); g.lineTo(hx - w, hy + w);
      g.closePath();
      g.fill();
    } else {
      const sz = r * (shape === 'bar' ? 0.3 : 0.26);
      g.beginPath();
      g.ellipse(hx + r * 0.02, hy + r * 0.02, sz, sz * 0.55, -0.6, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

// ---- cached sprites --------------------------------------------------------

function makeCanvas(half) {
  const size = half * 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.max(2, Math.ceil(size * dpr));
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(half, half);
  return { cv, g, size };
}

function extent(shape, r) {
  return r * (shape === 'bar' ? 2.3 : shape === 'rice' ? 1.8 : shape === 'kunai' ? 1.85 : 1.3);
}

/**
 * Cached sprite for a bullet: glow halo in its own colour behind a cut gem.
 * The halo is what makes a dense curtain readable on black; the gem is what
 * makes it pretty.
 */
export function bulletSprite(shape, color, r) {
  const key = shape + '|' + color + '|' + r.toFixed(1);
  let s = cache.get(key);
  if (s) return s;

  const glow = shape === 'pellet' ? r * 0.8 : r * 1.3;
  const half = Math.ceil(extent(shape, r) + glow + 2);
  const { cv, g, size } = makeCanvas(half);

  // Glow pass: the silhouette, blurred, twice for density.
  g.shadowColor = color;
  g.shadowBlur = glow;
  g.fillStyle = color;
  shapePath(g, shape, r);
  g.fill('evenodd');
  g.fill('evenodd');
  g.shadowBlur = 0;

  paintGem(g, shape, color, r, { edge: r < 4 ? 0.28 : 0.42 });

  s = { canvas: cv, size, half };
  cache.set(key, s);
  return s;
}

/**
 * A larger gem for things that are not pooled -- the boss's heart and shards,
 * the ship, roster icons. `glow` adds a halo; `glass` gives the clear-crystal
 * treatment the ship uses.
 */
export function gemSprite(shape, color, r, o = {}) {
  const key = 'G|' + shape + '|' + color + '|' + r.toFixed(1) + '|' + (o.glass ? 1 : 0) + '|' + (o.glow || 0);
  let s = cache.get(key);
  if (s) return s;
  const glow = o.glow || 0;
  const half = Math.ceil(extent(shape, r) + glow + 3);
  const { cv, g, size } = makeCanvas(half);
  if (glow > 0) {
    g.shadowColor = color;
    g.shadowBlur = glow;
    g.fillStyle = o.glass ? tint(color, -0.4, 0.6) : color;
    shapePath(g, shape, r);
    g.fill('evenodd');
    g.shadowBlur = 0;
  }
  paintGem(g, shape, color, r, {
    glass: o.glass, rich: !o.glass, edge: o.glass ? 0.85 : 0.34, lineWidth: o.lineWidth, rim: o.rim,
  });
  s = { canvas: cv, size, half };
  cache.set(key, s);
  return s;
}

/** Blit a cached sprite centred at (x, y), optionally rotated and scaled. */
export function blit(g, s, x, y, rot = 0, scale = 1) {
  if (rot === 0 && scale === 1) {
    g.drawImage(s.canvas, x - s.half, y - s.half, s.size, s.size);
    return;
  }
  g.save();
  g.translate(x, y);
  if (rot !== 0) g.rotate(rot);
  if (scale !== 1) g.scale(scale, scale);
  g.drawImage(s.canvas, -s.half, -s.half, s.size, s.size);
  g.restore();
}

/**
 * The twinkle: a four-point star of light, laid over a few gems at a time so
 * a field of bullets glitters without every one of them flashing at once.
 * Shape-independent, so it is one sprite for the whole game.
 */
export function glintSprite() {
  let s = cache.get('glint');
  if (s) return s;
  const half = 12;
  const { cv, g, size } = makeCanvas(half);
  g.shadowColor = '#ffffff';
  g.shadowBlur = 5;
  g.fillStyle = '#ffffff';
  g.beginPath();
  const arm = 10, waist = 1.3;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const rr = i % 2 ? waist : (i % 4 === 0 ? arm : arm * 0.62);
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.beginPath();
  g.arc(0, 0, 1.6, 0, TAU);
  g.fill();
  s = { canvas: cv, size, half };
  cache.set('glint', s);
  return s;
}

/** Immediate-mode shape draw, for the few flat things left (UI glyphs). */
export function drawShape(g, shape, r, fill, stroke, lineWidth = 2) {
  shapePath(g, shape, r);
  if (fill) { g.fillStyle = fill; g.fill('evenodd'); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lineWidth; g.stroke(); }
}
