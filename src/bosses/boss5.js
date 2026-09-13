// BOSS 5 -- CHAOS ENGINE
// The finale. Deterministic chaos from a logistic map, rotating beam sweeps,
// a choir of Lissajous emitters, border convergence, and a survival phase that
// runs four generators at once.

import { TAU, PI, HALF_PI, GOLDEN_ANGLE } from '../mathx.js';
import { C, PLAY } from '../config.js';
import {
  moveSway, moveStatic, moveLissajous, moveWide,
  caStep, caSeed, logistic,
} from '../patterns.js';

// --- Phase 1: Strange Attractor ---------------------------------------------
// Firing angles are iterates of the logistic map at r = 3.94: fully
// deterministic, never periodic. A structured ring underneath keeps the chaos
// legible instead of just noisy.
function* strangeAttractor(A) {
  let x = 0.4213;
  let base = 0;
  let k = 0;
  while (true) {
    const n = A.n(5, 3);
    for (let i = 0; i < n; i++) {
      x = logistic(x, 3.94);
      A.one({
        angle: base + x * TAU,
        speed: A.spd(1.7 + x * 2.5),
        shape: 'circle', r: 5,
        color: x > 0.5 ? C.red : C.orange,
        life: 430,
      });
    }
    if (A.L(2) && k % 2 === 0) {
      A.ring({
        n: A.n(12, 8), speed: A.spd(1.95), angle: -base * 1.7,
        shape: 'ring', color: C.rose, r: 5.4,
      });
    }
    if (A.L(3) && k % 6 === 5) {
      A.fan({
        n: A.n(4, 2), spread: 0.4, speed: A.spd(4.6),
        angle: A.aimLead(undefined, undefined, 4.6),
        shape: 'kunai', color: C.white, r: 4.4,
      });
    }
    if (A.L(4) && k % 11 === 10) {
      // Chaotic seeds that split -- noise with recursive structure.
      A.ring({
        n: A.n(6, 4), speed: A.spd(2.4), angle: x * TAU,
        shape: 'star5', color: C.amber, r: 6, spin: 0.1,
        split: { t: 40, n: 3, gen: 1, spread: 1.0, speed: A.spd(2.2), shape: 'pellet', color: C.red },
      });
    }
    base += 0.09;
    k++;
    A.sfx('shot', 90);
    yield A.w(8);
  }
}

// --- Phase 2: Sweep Lasers --------------------------------------------------
// Telegraphed beams rotate around the boss while slow pellet rings fill the
// gaps, so you have to read the beam and the curtain at the same time.
function* sweepLasers(A) {
  let k = 0;
  while (true) {
    const beams = 2 + (A.L(2) ? 1 : 0) + (A.L(4) ? 1 : 0);
    const dir = k % 2 ? 1 : -1;
    const fire = A.w(160);
    const start = A.aim();

    for (let i = 0; i < beams; i++) {
      A.laser({
        angle: start + i * TAU / beams,
        spin: dir * 0.0105 * A.D.speed,
        warn: A.w(58), fire, width: 15,
        color: C.red, follow: true,
      });
    }

    const total = A.w(58) + fire;
    const gap = A.w(21);
    for (let f = 0; f < total; f += gap) {
      A.ring({
        n: A.n(10, 6), speed: A.spd(1.55), angle: f * 0.13 * dir,
        shape: 'pellet', color: C.amber, r: 4.2, life: 620,
      });
      if (A.L(3)) {
        A.one({ angle: A.aim(), speed: A.spd(3.4), shape: 'rice', color: C.white, r: 4.2 });
      }
      yield gap;
    }

    k++;
    yield A.gap(40);
  }
}

// --- Phase 3: Lissajous Choir -----------------------------------------------
// Three independent emitters ride Lissajous curves across the playfield, each
// spraying rotating rings. There is no single safe corner -- the emitters come
// to you.
function* lissajousChoir(A) {
  const cols = [C.red, C.orange, C.amber];
  let t = 0;
  while (true) {
    const voices = 2 + (A.L(1) ? 1 : 0);
    for (let e = 0; e < voices; e++) {
      const ph = e * TAU / 3;
      const ex = PLAY.cx + Math.sin(t * 0.0135 * (1 + e * 0.28) + ph) * PLAY.w * 0.35;
      const ey = PLAY.y + 210 + Math.sin(t * 0.0178 * (1 + e * 0.42) + ph * 1.7) * 150;
      A.mark(ex, ey, cols[e], 7);
      A.ring({
        x: ex, y: ey,
        n: A.n(4, 3), speed: A.spd(1.5),
        angle: t * 0.05 * (e % 2 ? -1 : 1),
        shape: 'pellet', color: cols[e], r: 4.2, life: 340,
      });
      if (A.L(3)) {
        A.one({ x: ex, y: ey, angle: A.aim(ex, ey), speed: A.spd(2.9), shape: 'rice', color: C.white, r: 4.2 });
      }
    }
    if (A.L(4) && (t % 120) < 9) {
      A.gapRing({ n: A.n(28, 18), speed: A.spd(2.3), gap: 0.4, shape: 'ring', color: C.rose, r: 5.4 });
    }
    A.sfx('shot', 130);
    t += A.w(11);
    yield A.w(11);
  }
}

// --- Phase 4: Convergence ---------------------------------------------------
// Bullets arrive from the border, all pointed at you, while an accelerating
// ring pushes out from the centre. Inward and outward pressure at once.
function* convergence(A) {
  let k = 0;

  // What makes this phase hard is how many waves are converging at once, and
  // that number used to be the same at every difficulty -- 7.1 overlapping
  // waves on Novice against 8.3 on Lunatic -- so the easier tiers got thinner
  // waves and slower bullets but no relief at all on the squeeze itself, which
  // is the thing you actually die to. A.gap() is A.w() corrected for that.
  const wave = A.gap(52);

  while (true) {
    const n = A.n(8, 4);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n + k * 0.071;
      const p = A.borderPoint(u);
      // Below Hard, only half the ring tracks you; the rest converges on the
      // centre. At 92% aimed this was the most aggressively targeted pattern
      // in the game, and because every wave re-aims, no spot stays safe for
      // long -- which is what makes it read as random rather than as a shape
      // to solve. The unaimed half gives the wave a structure that holds still
      // long enough to be read.
      const tracks = A.L(3) || i % 2 === 0;
      A.one({
        x: p.x, y: p.y,
        angle: tracks ? A.aim(p.x, p.y) : Math.atan2(PLAY.cy - p.y, PLAY.cx - p.x),
        speed: A.spd(2.7),
        shape: 'kunai', color: tracks ? C.rose : C.magenta, r: 4.7,
      });
    }
    A.ring({
      n: A.n(10, 6), speed: A.spd(1.15), angle: k * 0.41,
      accel: 0.014, maxSpeed: A.spd(4.2),
      shape: 'circle', color: C.red, r: 5,
    });
    if (A.L(2)) {
      A.ring({
        n: A.n(10, 6), speed: A.spd(2.4), angle: -k * 0.83,
        shape: 'diamond', color: C.orange, r: 5,
        turn: 0.018, turnDecay: 0.994,
      });
    }
    if (A.L(4) && k % 3 === 2) {
      // A wall of frozen bullets that unfreezes aimed at you.
      for (let i = 0; i < A.n(12, 8); i++) {
        const u = i / A.n(12, 8);
        const p = A.borderPoint(u * 0.5);
        A.one({
          x: p.x, y: p.y, angle: HALF_PI, speed: A.spd(2.0),
          stopT: 40, goT: 74, goMode: 'aim', goSpeed: A.spd(3.6),
          shape: 'star4', color: C.amber, r: 5.2,
        });
      }
    }
    A.sfx('shot', 80);
    k++;
    yield wave;
  }
}

// --- Phase 5: Final Theorem (survival) --------------------------------------
// Invulnerable. Four independent generators layered on one clock: a golden
// spiral stream, a rule-30 ring, curving aimed fans, and periodic beams.
function* finalTheorem(A) {
  let i = 0;
  let cells = caSeed(37, 'center');
  let x = 0.6137;
  const ringEvery = A.w(15);
  const fanEvery = A.w(52);
  // A.gap() rather than A.w(): rule 30 fires a fixed 37-cell automaton, so the
  // bullets per event never scaled with difficulty either, and the population
  // on screen came out almost flat from Novice to Lunatic.
  const caEvery = A.gap(22);
  // A.gap so the easier tiers face fewer sweeps, not just slower ones. The
  // beam is the single hardest thing in this phase to read while a 400-bullet
  // curtain is also on screen, and A.w alone left Novice and Easy meeting it
  // nearly as often as Lunatic.
  const laserEvery = A.gap(300);

  // The stream used to emit one bullet per frame at every difficulty, which
  // made this phase as dense on Novice as on Lunatic -- measured at 777 vs 777
  // bullets, where every other phase runs Novice at about a sixth of Lunatic.
  // The count never scaled, and slower bullets simply stayed on screen longer,
  // cancelling the little the easier tiers did gain.
  //
  // What matters is the population on screen, which is rate x time-to-cross,
  // and time-to-cross is itself proportional to 1/speed. So emitting at a rate
  // proportional to density x speed leaves a population proportional to
  // density alone -- the same way every other layer here already behaves,
  // because their counts go through A.n().
  //
  // Thinning this on the lower tiers was tried and reverted. Easy reads as the
  // tightest cell in its column and the obvious lever is the stream, but a
  // quarter off it made Easy TIGHTER, reproducibly and at six starts: what is
  // left when the stream thins is the automaton rings and the curving fans,
  // which are the fast layers, so the field gets sparser and more urgent at
  // once. Easy stays as tuned. Being the hardest thing on an Easy run is the
  // job of the final boss's survival phase.
  const streamRate = A.D.density * A.D.speed * 0.37;
  let streamAcc = 0;
  let s = 0;                  // stream index: advances per bullet, not per frame

  while (true) {
    // Continuous phyllotaxis stream, plus the chaotic scatter woven through
    // it. Both step with `s`, so the spiral is identical at every difficulty
    // and only how fast it is drawn changes.
    streamAcc += streamRate;
    while (streamAcc >= 1) {
      streamAcc -= 1;
      A.one({
        angle: s * GOLDEN_ANGLE,
        speed: A.spd(2.0 + 0.6 * Math.sin(s * 0.02)),
        shape: 'pellet', r: 4.2,
        color: s % 3 === 0 ? C.amber : C.orange,
        life: 620,
      });
      if (s % 3 === 0) {
        x = logistic(x, 3.94);
        A.one({ angle: x * TAU, speed: A.spd(1.6 + x * 2.2), shape: 'circle', r: 4.6, color: C.red, life: 620 });
      }
      s++;
    }

    // Cellular-automaton ring.
    if (i % caEvery === 0) {
      const m = cells.length;
      for (let c = 0; c < m; c++) {
        if (!cells[c]) continue;
        A.one({
          angle: i * 0.02 + c * TAU / m, speed: A.spd(1.9),
          shape: 'diamond', color: C.rose, r: 4.8, radius: 20,
        });
      }
      cells = caStep(cells, 30);
    }

    // Rotating ring pressure.
    if (i % ringEvery === 0) {
      A.ring({
        n: A.n(9, 6), speed: A.spd(2.4), angle: i * 0.041,
        shape: 'ring', color: C.ice, r: 5,
        turn: (i % (ringEvery * 2) === 0 ? 1 : -1) * 0.012, turnDecay: 0.996,
      });
    }

    // Aimed curving fans.
    if (i % fanEvery === 0) {
      const sgn = (i / fanEvery) % 2 ? 1 : -1;
      A.fan({
        n: A.n(5, 3), spread: 0.8,
        angle: A.aimLead(undefined, undefined, 3.0), speed: A.spd(3.0),
        turn: sgn * 0.018, turnDecay: 0.992,
        shape: 'rice', color: C.white, r: 4.4,
      });
    }

    // Periodic beam pair.
    if (A.L(1) && i % laserEvery === laserEvery - 1) {
      const a0 = A.aim();
      // Static, not rotating. A sweep here is a different proposition from the
      // one in Sweep Lasers, because it turns over a curtain several hundred
      // bullets deep: being caught on the wrong side of it does not mean
      // running, it means crossing that curtain, and there is often no route.
      // Held still it asks one fair question -- get off this line -- and the
      // curtain stays the thing you are actually dodging.
      const spin = 0;
      const warn = Math.max(50, A.w(50));
      A.laser({ angle: a0, spin, warn, fire: A.w(110), width: 13, color: C.red, follow: true });
      A.laser({ angle: a0 + PI, spin, warn, fire: A.w(110), width: 13, color: C.red, follow: true });
    }

    i++;
    yield 1;
  }
}

export const BOSS_CHAOS = {
  id: 'chaos',
  name: 'CHAOS ENGINE',
  title: 'Deterministic Ruin',
  color: C.red,
  accent: C.amber,
  shape: 'star5',
  rings: ['penta', 'star5'],
  hitR: 33,
  phases: [
    { name: 'Strange Attractor', hp: 10600, time: 52 * 60, script: strangeAttractor, move: moveSway },
    { name: 'Sweep Lasers',      hp: 11600, time: 55 * 60, script: sweepLasers,      move: moveStatic },
    { name: 'Lissajous Choir',   hp: 12400, time: 58 * 60, script: lissajousChoir,   move: moveLissajous },
    { name: 'Convergence',       hp: 13600, time: 60 * 60, script: convergence,      move: moveWide },
    { name: 'Final Theorem',     hp: 0, time: 40 * 60, survival: true, script: finalTheorem, move: moveLissajous },
  ],
};
