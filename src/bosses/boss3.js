// BOSS 3 -- ORBITER
// Physics-driven bullets: ballistic arcs under gravity, a whirlpool built from
// constant-curvature steering, orbital batteries that charge then release, and
// curving crossfire with a few genuine seekers.

import { TAU, HALF_PI } from '../mathx.js';
import { C, PLAY } from '../config.js';
import { moveWide, moveStatic, moveTriangle, moveSway } from '../patterns.js';

// --- Phase 1: Ballistic Rain ------------------------------------------------
// Bullets are lobbed upward and fall back under gravity. The arcs cross, so
// the danger is not the launch but where the shells land.
function* ballisticRain(A) {
  A.st({ shape: 'circle', color: C.amber, r: 5.5 });
  let k = 0;
  while (true) {
    const n = A.n(11, 6);
    const g = 0.075 * A.D.speed;
    const swing = Math.sin(k * 0.5) * 0.34;

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const ang = -HALF_PI + t * 1.5 + swing;
      A.one({
        angle: ang,
        speed: A.spd(4.6 + (i % 3) * 0.55),
        ay: g, maxSpeed: 11,
      });
    }

    if (A.L(1)) {
      // A flatter, faster salvo that arrives before the lobs land.
      A.fan({
        n: A.n(3, 2), spread: 0.26, speed: A.spd(3.5),
        angle: A.aim(), shape: 'rice', color: C.orange, r: 4.4,
      });
    }
    if (A.L(3)) {
      // Mortars that arc in from off the top of the screen.
      for (let i = 0; i < A.n(2, 1); i++) {
        const x = A.rnd.rr(PLAY.x + 40, PLAY.right - 40);
        A.one({
          x, y: PLAY.y - 40, angle: HALF_PI + A.rnd.rr(-0.3, 0.3),
          speed: A.spd(1.2), ay: g * 0.8, maxSpeed: 9,
          shape: 'hex', color: C.red, r: 6,
        });
      }
    }
    A.sfx('shot', 80);
    k++;
    yield A.w(18);
  }
}

// --- Phase 2: Maelstrom -----------------------------------------------------
// Every bullet steers at a constant rate while decelerating, which traces true
// logarithmic spiral arms. Two counter-wound layers produce the vortex.
function* maelstrom(A) {
  A.st({ shape: 'circle', color: C.orange, r: 5 });
  let th = 0;
  while (true) {
    // Launching at a fixed angle to the radius is what makes a logarithmic
    // spiral: the constant pitch draws the arms, the gentle turn curls them.
    // (Firing straight outward just produces uniform noise.)
    const arms = A.n(3, 2) + 1;
    const pitch = 1.02;
    for (let a = 0; a < arms; a++) {
      const ang = th + a * TAU / arms;
      A.one({
        angle: ang + pitch, radius: 34,
        speed: A.spd(2.7),
        turn: -0.010, turnDecay: 0.998,
        life: 300,
      });
    }
    if (A.L(2)) {
      for (let a = 0; a < arms; a++) {
        const ang = -th * 1.35 + a * TAU / arms;
        A.one({
          angle: ang - pitch, radius: 28,
          speed: A.spd(2.15), turn: 0.013, turnDecay: 0.998,
          color: C.amber, r: 4.6, life: 300,
        });
      }
    }
    if (A.L(4) && (A.t % 96) < 3) {
      // Outward pressure wave to stop players from camping the eye.
      A.ring({ n: A.n(20, 14), speed: A.spd(1.1), angle: th,
        accel: 0.02, maxSpeed: A.spd(4), shape: 'ring', color: C.red, r: 5.5 });
    }
    th += 0.105;
    A.sfx('shot', 130);
    yield A.w(5);
  }
}

// --- Phase 3: Gear Release --------------------------------------------------
// Concentric rings of bullets latch into orbit around the boss, spin up while
// you watch, then fire outward one gear at a time.
function* gearRelease(A) {
  let k = 0;
  while (true) {
    const gears = 2 + (A.L(2) ? 1 : 0) + (A.L(4) ? 1 : 0);
    const holdBase = A.w(96);

    for (let g = 0; g < gears; g++) {
      const n = A.n(19, 11);
      const R = 56 + g * 30;
      const w = (g % 2 ? -1 : 1) * 0.036;
      const hold = holdBase - g * 12;
      for (let i = 0; i < n; i++) {
        A.one({
          orbit: { r: R, a: i * TAU / n + g * 0.4 + k * 0.2, w, t: hold, grow: 0.06, follow: true },
          speed: A.spd(3.0),
          shape: 'hex', color: g % 2 ? C.amber : C.orange, r: 5.6, spin: 0.05,
        });
      }
      A.sfx('charge', 200);
      yield A.w(16);
    }

    // While the gears spin up, keep pressure on so standing still is bad.
    const wait = holdBase - A.w(16) * gears + A.w(24);
    let tick = 0;
    for (let i = 0; i < Math.max(1, wait); i += 12) {
      // Always aimed, at every difficulty: the gears themselves are radial, so
      // without this there is nothing stopping a player parking out of their
      // path and waiting the charge out.
      A.one({
        angle: A.aim(), speed: A.spd(3.6),
        shape: 'rice', color: C.white, r: 4.2,
      });
      if (A.L(2) && tick % 2 === 0) {
        A.ring({
          n: A.n(7, 4), speed: A.spd(1.5), angle: tick * 0.4,
          shape: 'pellet', color: C.amber, r: 4.2, life: 300,
        });
      }
      tick++;
      yield 12;
    }

    A.shake(6);
    k++;
    yield A.w(26);
  }
}

// --- Phase 4: Curveshot -----------------------------------------------------
// Mirrored fans of arcing bullets that bend in opposite directions, plus slow
// seekers that force you to keep moving through the crossfire.
function* curveshot(A) {
  A.st({ shape: 'rice', color: C.amber, r: 4.7 });
  let k = 0;
  while (true) {
    const sgn = k % 2 ? 1 : -1;
    const n = A.n(7, 4);
    const aim = A.aimLead(undefined, undefined, 2.8);

    // `turn` is an angular rate, so the radius a bullet curves through is
    // speed/turn -- which means a fixed rate curls tighter at the difficulties
    // that slow bullets down. Left unscaled, Novice bullets orbited the boss
    // at a ~98px radius and never reached the lower half of the screen at all.
    // Scaling with speed keeps the drawn shape the same on every difficulty.
    const curve = 0.021 * A.D.speed;
    const decay = 0.98;
    // Every bullet in the volley curves, the one aimed straight at you
    // included -- so aiming the fan at the player just guarantees it arrives
    // somewhere else. Lead by half the total bend instead, and the arc sweeps
    // through the aim point rather than away from it.
    const bend = curve / (1 - decay);

    // Both fans always fire: bending the same volley two ways *is* the
    // pattern, and with only one of them there is no crossfire to be caught in.
    A.fan({ n, spread: 1.1, angle: aim - sgn * bend * 0.5, speed: A.spd(2.85), turn: sgn * curve, turnDecay: decay });
    A.fan({ n, spread: 1.1, angle: aim + sgn * bend * 0.5, speed: A.spd(2.4), turn: -sgn * curve, turnDecay: decay, color: C.orange });
    if (A.L(2) && k % 2 === 0) {
      A.ring({ n: A.n(12, 8), speed: A.spd(1.9), angle: k * 0.5, shape: 'pellet', color: C.red, r: 4.2 });
    }
    if (A.L(3) && k % 3 === 0) {
      for (let i = 0; i < A.n(3, 1); i++) {
        A.one({
          angle: A.rnd.rr(0, TAU), speed: A.spd(1.7),
          homeT: 150, homeK: 0.026,
          shape: 'star4', color: C.red, r: 6.2, spin: 0.12, life: 700,
        });
      }
      A.sfx('burst', 150);
    }
    A.sfx('shot', 80);
    k++;
    yield A.w(24);
  }
}

export const BOSS_ORBITER = {
  id: 'orbiter',
  name: 'ORBITER',
  title: 'Ballistics & Vortices',
  color: C.amber,
  accent: C.orange,
  shape: 'tri',
  rings: ['tri', 'hex'],
  hitR: 32,
  phases: [
    { name: 'Ballistic Rain', hp: 9000, time: 48 * 60, script: ballisticRain, move: moveWide },
    { name: 'Maelstrom',      hp: 10400, time: 52 * 60, script: maelstrom,     move: moveStatic },
    { name: 'Gear Release',   hp: 11200, time: 58 * 60, script: gearRelease,   move: moveTriangle },
    { name: 'Curveshot',      hp: 12000, time: 58 * 60, script: curveshot,     move: moveSway },
  ],
};
