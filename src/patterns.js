// Reusable building blocks shared by several bosses: movement scripts and a
// couple of generative sequences that drive bullet placement.

import { PLAY } from './config.js';

// ---------------------------------------------------------------------------
// Movement scripts
// ---------------------------------------------------------------------------

export function* moveStatic(A) {
  yield* A.moveTo(PLAY.cx, PLAY.y + 168, 60);
  while (true) yield 1;
}

export function* moveSway(A) {
  yield* A.moveTo(PLAY.cx, PLAY.y + 165, 60);
  while (true) yield* A.sway(600, 165, 0.019, PLAY.y + 165);
}

export function* moveWide(A) {
  while (true) {
    yield* A.moveTo(PLAY.cx - 190, PLAY.y + 150, 110);
    yield* A.hold(50);
    yield* A.moveTo(PLAY.cx + 190, PLAY.y + 210, 110);
    yield* A.hold(50);
  }
}

export function* moveWander(A) {
  while (true) {
    yield* A.wander(90, 340, 120, 260);
    yield* A.hold(70);
  }
}

/** Boss traces a Lissajous figure -- used by the finale. */
export function* moveLissajous(A, amp = 200, ampY = 70, sx = 0.011, sy = 0.017) {
  const b = A.boss;
  const cy = PLAY.y + 190;
  let t = 0;
  yield* A.moveTo(PLAY.cx, cy, 50);
  while (true) {
    t++;
    b.x = PLAY.cx + Math.sin(t * sx) * amp;
    b.y = cy + Math.sin(t * sy) * ampY;
    yield 1;
  }
}

/** Snap between the corners of a triangle, pausing at each vertex. */
export function* moveTriangle(A, hold = 80) {
  const pts = [
    { x: PLAY.cx, y: PLAY.y + 120 },
    { x: PLAY.cx + 200, y: PLAY.y + 250 },
    { x: PLAY.cx - 200, y: PLAY.y + 250 },
  ];
  let i = 0;
  while (true) {
    const p = pts[i % pts.length];
    yield* A.moveTo(p.x, p.y, 46);
    yield* A.hold(hold);
    i++;
  }
}

// ---------------------------------------------------------------------------
// Generative sequences
// ---------------------------------------------------------------------------

/**
 * One step of an elementary cellular automaton on a ring of cells.
 * Rule 30 gives chaotic-but-bounded volleys; rule 90 gives clean Sierpinski
 * triangles. Feeding the live cells into ring slot angles produces patterns
 * that are structured yet never repeat.
 */
export function caStep(cells, rule = 30) {
  const m = cells.length;
  const next = new Array(m);
  for (let i = 0; i < m; i++) {
    const l = cells[(i - 1 + m) % m];
    const c = cells[i];
    const r = cells[(i + 1) % m];
    const idx = (l << 2) | (c << 1) | r;
    next[i] = (rule >> idx) & 1;
  }
  return next;
}

export function caSeed(m, mode = 'center') {
  const cells = new Array(m).fill(0);
  if (mode === 'center') cells[m >> 1] = 1;
  else if (mode === 'edges') { cells[0] = 1; cells[m >> 1] = 1; }
  else cells[0] = 1;
  return cells;
}

/** Logistic map -- a one-liner route to bounded chaos. */
export function logistic(x, r = 3.94) { return r * x * (1 - x); }

/** Rose curve radius: r = cos(k*theta). Negative values flip the petal. */
export function rose(theta, petals) { return Math.cos(petals * theta); }
