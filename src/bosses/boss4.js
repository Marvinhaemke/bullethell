// BOSS 4 -- FRACTAL
// Recursion and parametric curves: bullets that split into generations,
// phyllotaxis curtains, rose-curve emitters, and volleys
// that freeze into a star polygon before snapping at you.

import { TAU, PI, HALF_PI, GOLDEN_ANGLE } from '../mathx.js';
import { C } from '../config.js';
import { moveSway, moveStatic, moveWide, rose } from '../patterns.js';

// --- Phase 1: Mitosis -------------------------------------------------------
// Each shell splits after a fixed delay, and its children split again. Two
// generations on Normal, three on Hard+ -- a branching tree drawn in bullets.
function* mitosis(A) {
  A.st({ shape: 'hex', color: C.violet, r: 7 });
  let k = 0;
  while (true) {
    // Total bullets grow as seeds * kids^gens, so the seed count comes down as
    // the tree gets deeper -- otherwise Lunatic buries the screen.
    const gens = A.L(3) ? 3 : 2;
    const kids = gens === 3 ? 2 : 3;
    const seeds = A.L(4) ? 10 : A.L(3) ? 8 : A.n(6, 4);

    A.ring({
      n: seeds, speed: A.spd(3.1), angle: k * 0.51,
      split: {
        t: A.w(34), n: kids, gen: gens,
        spread: 0.78, speed: A.spd(2.3), speedMul: 0.92,
        shape: 'hex', shrink: 0.8, life: 300,
        colors: [C.magenta, C.rose, C.red],
      },
    });

    if (A.L(2) && k % 2 === 1) {
      // A single aimed seed that fractures into a wide cone.
      A.one({
        angle: A.aim(), speed: A.spd(4.2),
        shape: 'star5', color: C.white, r: 7, spin: 0.09,
        split: {
          t: A.w(26), n: A.n(5, 3), gen: 1, spread: 1.15, life: 300,
          speed: A.spd(2.5), shape: 'diamond', colors: [C.ice, C.violet],
        },
      });
    }
    if (A.L(4)) {
      A.ring({
        n: 4, speed: A.spd(1.6), angle: -k * 0.9,
        shape: 'ring', color: C.blue, r: 6,
        split: { t: A.w(60), n: 4, gen: 1, spread: TAU * 0.75, speed: A.spd(2.1), shape: 'pellet', color: C.teal, life: 300 },
      });
    }

    A.sfx('shot', 80);
    k++;
    yield A.w(gens === 3 ? 46 : 34);
  }
}

// --- Phase 2: Phyllotaxis ---------------------------------------------------
// Two emitters that are mathematical opposites, layered.
//
// The base stream steps by the golden angle. Because the golden angle is the
// "most irrational" rotation, successive shots never line up into arms -- they
// spread into the most even curtain a single emitter can produce, with no
// exploitable gap at any bearing. (Sunflower seed heads only show their
// Fibonacci spirals because seeds sit at r proportional to sqrt(n); bullets
// leaving at constant speed sit at r proportional to n, which aliases the
// arms away entirely. The evenness is the point here, not the spiral.)
//
// Over the top rides the opposite case: a ring of eight, precessing by a hair
// each volley. Eight is about as rational as a rotation gets, so this layer
// does draw arms, and they sweep slowly across the even field beneath.
const ARMS = 8;

function* phyllotaxis(A) {
  let i = 0;
  let lastArm = -999;
  // Arm count is fixed (it is the whole point of the layer), so the lower
  // difficulties thin the spiral by firing it half as often instead.
  const armBeat = A.L(2) ? A.w(8) : A.w(13);
  while (true) {
    const breathe = Math.sin(i * 0.005);
    A.one({
      angle: i * GOLDEN_ANGLE,
      speed: A.spd(1.62 + 0.22 * breathe),
      shape: 'pellet', r: 4.2,
      color: i % 2 ? C.violet : C.magenta,
      life: 620,
    });

    // The arms have to go out a whole ring at a time -- one bullet per beat
    // is far too sparse to draw eight spirals.
    if (A.t - lastArm >= armBeat) {
      lastArm = A.t;
      A.ring({
        n: ARMS, angle: A.t * 0.0115,
        speed: A.spd(2.5), shape: 'circle', r: 5, color: C.ice, life: 450,
      });
      if (A.L(1)) {
        A.ring({
          n: ARMS, angle: -A.t * 0.0082,
          speed: A.spd(1.8), shape: 'diamond', r: 4.6, color: C.blue, life: 450,
        });
      }
    }

    if (A.L(2) && i % 3 === 0) {
      A.one({
        angle: -i * GOLDEN_ANGLE,
        speed: A.spd(1.2), shape: 'pellet', r: 4, color: C.rose, life: 620,
      });
    }
    if (A.L(3) && i % 23 === 0) {
      A.fan({
        n: A.n(3, 2), spread: 0.32, speed: A.spd(4.5),
        angle: A.aimLead(undefined, undefined, 4.5),
        shape: 'kunai', color: C.white, r: 4.4,
      });
    }
    if (A.L(4) && i % 61 === 0) {
      A.gapRing({ n: A.n(26, 16), speed: A.spd(2.2), gap: 0.45, shape: 'ring', color: C.ice, r: 5.4 });
    }
    A.sfx('shot', 200);
    i++;
    yield Math.max(1, A.w(2));
  }
}

// --- Phase 3: Rose Curve ----------------------------------------------------
// The emitter itself walks the polar curve r = cos(k*theta) around the boss and
// fires outward along the local radius, so the bullets literally draw the rose
// and then unfold it outward. The petal count changes every cycle.
function* roseCurve(A) {
  const petalCycle = [3, 5, 4, 7, 6, 8];
  let cyc = 0;
  while (true) {
    const petals = petalCycle[cyc % petalCycle.length];
    const steps = Math.min(132, A.n(112, 56));
    const amp = 128;
    const dir = cyc % 2 ? -1 : 1;

    for (let s = 0; s < steps; s++) {
      const th = dir * (s / steps) * TAU;
      const rr = amp * rose(th, petals);
      const ex = A.bx + Math.cos(th) * rr;
      const ey = A.by + Math.sin(th) * rr;
      const out = th + (rr < 0 ? PI : 0);

      A.one({ x: ex, y: ey, angle: out, speed: A.spd(1.95), shape: 'diamond', r: 5, color: C.violet, life: 460 });
      if (A.L(2)) {
        A.one({ x: ex, y: ey, angle: out + HALF_PI, speed: A.spd(1.25), shape: 'pellet', r: 4, color: C.magenta, life: 430 });
      }
      if (A.L(4)) {
        A.one({ x: ex, y: ey, angle: out - HALF_PI, speed: A.spd(1.25), shape: 'pellet', r: 4, color: C.rose, life: 430 });
      }
      A.mark(ex, ey, C.ice, 4);
      yield 1;
    }

    A.sfx('burst', 120);
    if (A.L(1)) {
      A.fan({
        n: A.n(5, 3), spread: 0.6, speed: A.spd(3.8),
        angle: A.aim(), shape: 'kunai', color: C.white, r: 4.4,
      });
    }
    cyc++;
    yield A.w(38);
  }
}

// --- Phase 4: Delayed Theorem -----------------------------------------------
// A dense ring races out, freezes in place while it shimmers, then relaunches
// straight at wherever you happen to be standing. Between snaps, star-polygon
// {n/k} spears rake the field.
function* delayedTheorem(A) {
  let k = 0;
  while (true) {
    const n = A.n(34, 14);
    const stopAt = A.w(30);
    const goAt = stopAt + A.w(42);

    for (let i = 0; i < n; i++) {
      A.one({
        angle: i * TAU / n + k * 0.21,
        speed: A.spd(4.6),
        stopT: stopAt, goT: goAt, goMode: 'aim', goSpeed: A.spd(3.3),
        shape: 'star4', color: C.rose, r: 5.6, spin: 0.06,
      });
    }
    A.sfx('charge', 150);
    yield A.w(30);

    if (A.L(2)) {
      // Star polygon {m/step}: spears along chords of a regular m-gon.
      const m = 13, step = 5;
      for (let i = 0; i < m; i++) {
        A.line({
          angle: i * step * TAU / m + k * 0.4,
          n: A.n(5, 3), speed: A.spd(2.0), speedStep: 0.44,
          shape: 'diamond', color: C.violet, r: 4.6, radius: 18,
        });
      }
      yield A.w(26);
    }
    if (A.L(4)) {
      A.ring({
        n: A.n(18, 10), speed: A.spd(2.8), angle: -k * 0.7,
        shape: 'pellet', color: C.teal, r: 4.2,
        turn: 0.014, turnDecay: 0.995,
      });
      yield A.w(18);
    }

    A.shake(3);
    k++;
    yield A.w(24);
  }
}

export const BOSS_FRACTAL = {
  id: 'fractal',
  name: 'FRACTAL',
  title: 'Recursive Bloom',
  color: C.violet,
  accent: C.magenta,
  shape: 'hex',
  rings: ['hex', 'penta'],
  hitR: 31,
  phases: [
    { name: 'Mitosis',         hp: 9800, time: 50 * 60, script: mitosis,        move: moveWide },
    { name: 'Phyllotaxis',     hp: 10800, time: 55 * 60, script: phyllotaxis,    move: moveStatic },
    { name: 'Rose Curve',      hp: 11600, time: 58 * 60, script: roseCurve,      move: moveStatic },
    { name: 'Delayed Theorem', hp: 12800, time: 60 * 60, script: delayedTheorem, move: moveSway },
  ],
};
