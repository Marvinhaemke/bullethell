// Small math helpers shared by every subsystem.

export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const HALF_PI = Math.PI / 2;
// Golden angle -- the phyllotaxis constant used by the sunflower patterns.
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rad(deg) { return deg * Math.PI / 180; }

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

export function wrapAngle(a) {
  a %= TAU;
  if (a > PI) a -= TAU;
  if (a < -PI) a += TAU;
  return a;
}

export function angleDelta(from, to) { return wrapAngle(to - from); }

export function easeIn(t) { return t * t; }
export function easeOut(t) { return 1 - (1 - t) * (1 - t); }
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
export function smoothstep(t) { return t * t * (3 - 2 * t); }

export function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

// Squared distance from point p to the segment a->b. Used for laser hit tests.
export function segDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}
