// Bullet artwork. Every bullet is a basic geometric shape drawn once into a
// cached offscreen canvas (glow included) and then blitted, which keeps a few
// thousand simultaneous bullets cheap.

import { TAU } from './mathx.js';

// Shapes whose silhouette points along the direction of travel.
export const DIRECTIONAL = new Set(['rice', 'kunai', 'bar', 'tri', 'wedge']);

const cache = new Map();
let dpr = 1;

export function setSpriteScale(scale) {
  const next = Math.max(1, Math.min(2, scale || 1));
  if (Math.abs(next - dpr) < 0.01) return;
  dpr = next;
  cache.clear();
}

function regular(g, sides, r, phase = 0) {
  for (let i = 0; i < sides; i++) {
    const a = phase + i * TAU / sides;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function starPath(g, points, outer, inner, phase = 0) {
  for (let i = 0; i < points * 2; i++) {
    const a = phase + i * Math.PI / points;
    const rr = i % 2 ? inner : outer;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

/** Trace `shape` at radius `r` centred on the origin of context `g`. */
export function shapePath(g, shape, r) {
  g.beginPath();
  switch (shape) {
    case 'ring':
      g.arc(0, 0, r, 0, TAU);
      g.arc(0, 0, r * 0.52, 0, TAU, true);
      break;
    case 'rice':
      g.ellipse(0, 0, r * 1.6, r * 0.62, 0, 0, TAU);
      break;
    case 'square':
      g.rect(-r * 0.84, -r * 0.84, r * 1.68, r * 1.68);
      break;
    case 'diamond':
      regular(g, 4, r, 0);
      break;
    case 'tri':
      regular(g, 3, r * 1.12, 0);
      break;
    case 'hex':
      regular(g, 6, r, 0);
      break;
    case 'penta':
      regular(g, 5, r, -Math.PI / 2);
      break;
    case 'star4':
      starPath(g, 4, r * 1.2, r * 0.42);
      break;
    case 'star5':
      starPath(g, 5, r * 1.15, r * 0.5, -Math.PI / 2);
      break;
    case 'kunai':
      g.moveTo(r * 1.75, 0);
      g.lineTo(-r * 0.75, r * 0.82);
      g.lineTo(-r * 0.28, 0);
      g.lineTo(-r * 0.75, -r * 0.82);
      g.closePath();
      break;
    case 'wedge':
      g.moveTo(r * 1.3, 0);
      g.lineTo(-r * 0.9, r * 1.0);
      g.lineTo(-r * 0.9, -r * 1.0);
      g.closePath();
      break;
    case 'bar':
      g.rect(-r * 2.1, -r * 0.44, r * 4.2, r * 0.88);
      break;
    case 'pellet':
    case 'circle':
    default:
      g.arc(0, 0, r, 0, TAU);
      break;
  }
}

/**
 * Cached sprite for a bullet: coloured body with a glow halo and a bright
 * white core, which is what makes dense curtains readable on black.
 */
export function bulletSprite(shape, color, r) {
  const key = shape + '|' + color + '|' + r.toFixed(1);
  let s = cache.get(key);
  if (s) return s;

  const glow = shape === 'pellet' ? r * 0.7 : r * 1.35;
  const half = Math.ceil(r * (shape === 'bar' ? 2.3 : shape === 'rice' ? 1.8 : 1.3) + glow + 2);
  const size = half * 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.max(2, Math.ceil(size * dpr));
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(half, half);

  // Outer glow pass.
  g.shadowColor = color;
  g.shadowBlur = glow;
  g.fillStyle = color;
  shapePath(g, shape, r);
  g.fill();
  g.fill();
  g.shadowBlur = 0;

  // Bright core (skipped for rings and tiny pellets, which read fine as-is).
  if (shape !== 'ring') {
    const coreR = shape === 'pellet' ? r * 0.34 : r * 0.44;
    g.globalAlpha = shape === 'pellet' ? 0.7 : 0.95;
    g.fillStyle = '#ffffff';
    shapePath(g, shape === 'bar' || shape === 'rice' ? shape : 'circle', coreR);
    g.fill();
    g.globalAlpha = 1;
  } else {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(0, 0, r * 0.76, 0, TAU);
    g.stroke();
  }

  s = { canvas: cv, size, half };
  cache.set(key, s);
  return s;
}

/** Immediate-mode shape draw, for entities that are not pooled (boss, player). */
export function drawShape(g, shape, r, fill, stroke, lineWidth = 2) {
  shapePath(g, shape, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lineWidth; g.stroke(); }
}
