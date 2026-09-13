// BOSS 2 -- WEAVER
// Lattices and interference. Patterns come from grids, orbiting satellite
// emitters, a cellular automaton, and reflections off the playfield walls.

import { TAU, PI, HALF_PI } from '../mathx.js';
import { C, PLAY } from '../config.js';
import { moveSway, moveWide, moveStatic, caStep, caSeed } from '../patterns.js';

// --- Phase 1: Loom ----------------------------------------------------------
// Ranks of bullets sweep in from alternating edges, each with a gap. Two
// crossing weaves at once means the safe cells move diagonally.
function* loom(A) {
  A.st({ shape: 'square', color: C.magenta, r: 5.5 });
  let k = 0;
  while (true) {
    const cols = A.n(16, 11);
    // The gap is a fraction of the wall, not a fixed number of slots -- a
    // fixed count would swallow a sparse Novice wall whole.
    const gapW = cols * (A.L(3) ? 0.09 : A.L(1) ? 0.13 : 0.19);
    const gapIdx = A.rnd.ri(1, cols - 2);

    if (k % 2 === 0) {
      A.wall({
        n: cols, gapIdx, gapW, angle: HALF_PI,
        x: PLAY.cx, y: PLAY.y - 14, span: PLAY.w,
        speed: A.spd(2.35),
      });
    } else {
      const fromLeft = A.rnd.r() < 0.5;
      const rows = A.n(14, 10);
      A.wall({
        n: rows, gapIdx: A.rnd.ri(1, rows - 2), gapW: rows * (A.L(3) ? 0.09 : A.L(1) ? 0.13 : 0.19),
        angle: fromLeft ? 0 : PI,
        x: fromLeft ? PLAY.x - 14 : PLAY.right + 14,
        y: PLAY.cy, span: PLAY.h,
        speed: A.spd(2.2), color: C.rose,
      });
    }

    if (A.L(2)) {
      // A second, slower weave offset by half a beat keeps the lattice moving.
      A.wall({
        n: cols, gapIdx: (gapIdx + (cols >> 1)) % cols, gapW: gapW * 0.9,
        angle: HALF_PI, x: PLAY.cx, y: PLAY.y - 40, span: PLAY.w,
        speed: A.spd(1.5), color: C.violet, shape: 'diamond', r: 5,
      });
    }
    if (A.L(4)) {
      A.fan({
        n: A.n(4, 2), spread: 0.5, speed: A.spd(3.8),
        angle: A.aimLead(undefined, undefined, 3.8),
        shape: 'kunai', color: C.white, r: 4.4,
      });
    }

    A.sfx('shot', 80);
    k++;
    yield A.w(34);
  }
}

// --- Phase 2: Moire ---------------------------------------------------------
// Two satellites orbit the boss at different radii and angular rates, each
// spraying slow radial pellets. Where the two sprays cross you get a live
// moire interference field that drifts continuously.
function* moire(A) {
  A.st({ shape: 'pellet', r: 4.2, color: C.rose });
  let th = 0;
  const sats = 2;
  while (true) {
    th += 0.05;
    for (let s = 0; s < sats; s++) {
      const dir = s ? -1 : 1;
      const R = 76 + s * 38;
      const rate = 1 + s * 0.55;
      const sx = A.bx + Math.cos(th * dir * rate) * R;
      const sy = A.by + Math.sin(th * dir * rate) * R;
      A.mark(sx, sy, s ? C.violet : C.rose, 6);
      A.ring({
        x: sx, y: sy,
        n: A.n(4, 3), speed: A.spd(1.4 + s * 0.3),
        angle: th * 2.3 * dir,
        color: s ? C.violet : C.rose,
        life: 330,
      });
    }
    if (A.L(2)) {
      // A third, counter-phase emitter thickens the interference.
      const R = 128;
      const sx = A.bx + Math.cos(-th * 0.7 + PI) * R;
      const sy = A.by + Math.sin(-th * 0.7 + PI) * R * 0.6;
      A.mark(sx, sy, C.magenta, 6);
      A.ring({ x: sx, y: sy, n: A.n(3, 2), speed: A.spd(1.25), angle: -th * 3, color: C.magenta, life: 330 });
    }
    if (A.L(4) && (A.t % 90 | 0) === 0) {
      A.ring({ n: A.n(20, 12), speed: A.spd(2.6), angle: th, shape: 'ring', color: C.ice, r: 5.5 });
    }
    A.sfx('shot', 150);
    yield A.w(10);
  }
}

// --- Phase 3: Rule Thirty ---------------------------------------------------
// A ring of cells running elementary CA rule 30. Live cells become bullets, so
// the volley is deterministic yet never repeats -- the field fills with the
// automaton's own chaotic triangles. Rule 90 rides underneath on higher
// difficulties, adding clean Sierpinski structure over the noise.
function* ruleThirty(A) {
  const M = Math.max(19, Math.round(34 * A.D.density));
  const S = Math.max(13, Math.round(24 * A.D.density));
  let cells = caSeed(M, 'center');
  let sier = caSeed(S, 'center');
  let rot = 0;
  let step = 0;

  while (true) {
    for (let i = 0; i < M; i++) {
      if (!cells[i]) continue;
      A.one({
        angle: rot + i * TAU / M,
        speed: A.spd(2.1),
        shape: 'diamond', color: C.magenta, r: 5,
        radius: 22,
      });
    }
    cells = caStep(cells, 30);

    if (A.L(2)) {
      for (let i = 0; i < sier.length; i++) {
        if (!sier[i]) continue;
        A.one({
          angle: -rot * 1.4 + i * TAU / sier.length,
          speed: A.spd(1.35),
          shape: 'pellet', color: C.violet, r: 4.2,
          radius: 16,
        });
      }
      sier = caStep(sier, 90);
      // Reseed when the Sierpinski ring saturates or dies out.
      const live = sier.reduce((a, b) => a + b, 0);
      if (live === 0 || live > sier.length * 0.75) sier = caSeed(S, 'center');
    }

    if (A.L(3) && step % 4 === 3) {
      A.fan({
        n: A.n(3, 2), spread: 0.3, speed: A.spd(4.4),
        angle: A.aimLead(undefined, undefined, 4.4),
        shape: 'kunai', color: C.white, r: 4.3,
      });
    }

    rot += 0.21;
    step++;
    A.sfx('shot', 90);
    yield A.w(12);
  }
}

// --- Phase 4: Reflection ----------------------------------------------------
// Bouncing bullets. Rings ricochet off the walls, so the field slowly fills
// with a standing lattice of crossing trajectories.
function* reflection(A) {
  A.st({ shape: 'ring', color: C.violet, r: 6 });
  let k = 0;
  while (true) {
    const bounces = 1 + (A.D.layers >> 1);
    A.ring({
      n: A.n(9, 5), speed: A.spd(2.25), angle: k * 0.91,
      bounce: bounces, life: 480,
    });
    if (A.L(1)) {
      A.ring({
        n: A.n(7, 4), speed: A.spd(1.7), angle: -k * 1.3 + 0.4,
        bounce: bounces, life: 480, color: C.magenta, shape: 'hex', r: 5.2,
      });
    }
    if (k % 2 === 0) {
      A.fan({
        n: A.n(4, 2), spread: 0.36, speed: A.spd(4.7),
        angle: A.aim(), shape: 'kunai', color: C.white, r: 4.2,
      });
    }
    if (A.L(4) && k % 4 === 3) {
      // Bank shots: aimed at the wall so they arrive from behind.
      const wallX = A.px < PLAY.cx ? PLAY.right : PLAY.x;
      A.one({
        angle: Math.atan2(A.py - A.by, wallX - A.bx),
        speed: A.spd(3.4), bounce: 2, life: 700,
        shape: 'star4', color: C.rose, r: 6, spin: 0.1,
      });
    }
    A.sfx('shot', 80);
    k++;
    yield A.w(30);
  }
}

export const BOSS_WEAVER = {
  id: 'weaver',
  name: 'WEAVER',
  title: 'Lattice Interference',
  color: C.magenta,
  accent: C.violet,
  shape: 'square',
  rings: ['square', 'diamond'],
  hitR: 30,
  phases: [
    { name: 'Loom',         hp: 8200, time: 48 * 60, script: loom,       move: moveSway },
    { name: 'Moire',        hp: 9600, time: 52 * 60, script: moire,      move: moveStatic },
    { name: 'Rule Thirty',  hp: 10500, time: 55 * 60, script: ruleThirty, move: moveWide },
    { name: 'Reflection',   hp: 11200, time: 58 * 60, script: reflection, move: moveSway },
  ],
};
