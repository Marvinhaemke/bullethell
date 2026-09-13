// BOSS 1 -- SENTINEL
// Rotational geometry: rings, counter-rotating helices, expanding polygons.
// The teaching boss. Every pattern has one clean idea and a visible rhythm.

import { TAU } from '../mathx.js';
import { C } from '../config.js';
import { moveWide, moveSway, moveStatic } from '../patterns.js';

// --- Phase 1: Cardinal Bloom ------------------------------------------------
// A slowly precessing ring, an inverse-rotating slow ring underneath it, and
// an aimed spear volley on every third beat.
function* cardinalBloom(A) {
  A.st({ shape: 'circle', color: C.cyan, r: 6 });
  let k = 0;
  while (true) {
    const n = A.n(11, 6);
    const off = k * 0.37;

    A.ring({ n, speed: A.spd(2.15), angle: off });
    A.sfx('shot', 70);

    if (A.L(1)) {
      A.ring({ n, speed: A.spd(1.45), angle: -off + 0.2, color: C.blue, r: 5 });
    }
    if (A.L(3)) {
      // A fast outer ring at double density, precessing the other way.
      A.ring({ n: n * 2, speed: A.spd(3.15), angle: off * -1.7, color: C.ice, r: 4, shape: 'pellet' });
    }
    if (k % 3 === 2) {
      A.fan({
        n: A.n(5, 3), spread: 0.42, speed: A.spd(3.6),
        angle: A.aimLead(undefined, undefined, 3.6),
        shape: 'kunai', color: C.white, r: 4.5,
      });
    }
    if (A.L(4) && k % 6 === 5) {
      // Lunatic only: a delayed reversal ring that snaps back at the player.
      A.ring({
        n: A.n(14, 8), speed: A.spd(3.4), angle: off * 2,
        shape: 'diamond', color: C.teal, r: 5,
        stopT: 30, goT: 62, goMode: 'aim', goSpeed: A.spd(2.6),
      });
    }

    k++;
    yield A.w(26);
  }
}

// --- Phase 2: Twin Helix ----------------------------------------------------
// Two spiral arms wound in opposite directions. Every sweep the spin reverses,
// which briefly bunches the arms into a wall -- the reversal is the danger.
function* twinHelix(A) {
  A.st({ shape: 'circle', color: C.teal, r: 5.5 });
  let dir = 1;
  let ang = 0;
  while (true) {
    const arms = 2 + (A.L(2) ? 1 : 0) + (A.L(4) ? 1 : 0);
    const sweep = A.w(120);

    for (let i = 0; i < sweep; i++) {
      ang += dir * 0.115;
      for (let a = 0; a < arms; a++) {
        const base = a * TAU / arms;
        A.one({ angle: ang + base, speed: A.spd(2.5) });
        A.one({ angle: -ang + base + 0.5, speed: A.spd(2.0), color: C.blue, r: 4.6 });
      }
      if (A.L(3) && i % 9 === 0) {
        A.one({ angle: A.aim(), speed: A.spd(4.2), shape: 'rice', color: C.white, r: 4.4 });
      }
      // The emission rate itself scales -- otherwise Novice gets the same
      // wall of spiral bullets as Lunatic, just moving slower.
      yield Math.max(2, A.w(3));
    }

    // Reversal shockwave: a slow gap ring that forces a reposition.
    A.gapRing({
      n: A.n(30, 16), speed: A.spd(1.7), angle: ang,
      gap: A.L(3) ? 0.42 : 0.6, gapAt: A.aim(),
      shape: 'ring', color: C.ice, r: 5.5,
    });
    A.sfx('burst', 100);
    A.shake(4);
    dir = -dir;
    yield A.w(34);
  }
}

// --- Phase 3: Polygon Cage --------------------------------------------------
// Expanding regular polygons (each bullet rides its edge's outward normal, so
// the shape stays crisp as it grows) with a rotating notch, punctuated by
// stepped aimed volleys.
function* polygonCage(A) {
  let k = 0;
  while (true) {
    const sides = 3 + (k % 4);
    const gapAt = A.aim();

    A.polyRing({
      sides, perSide: A.n(7, 4), radius: 26,
      speed: A.spd(1.55), angle: k * 0.31,
      gapAt, gap: A.L(2) ? 0.34 : 0.5,
      shape: 'square', color: C.cyan, r: 5.5,
    });
    if (A.L(2)) {
      A.polyRing({
        sides, perSide: A.n(5, 3), radius: 20,
        speed: A.spd(2.5), angle: -k * 0.31,
        shape: 'diamond', color: C.blue, r: 5,
      });
    }
    if (A.L(4)) {
      A.polyRing({
        sides: sides + 1, perSide: A.n(4, 3), radius: 34,
        speed: A.spd(1.05), angle: k * 0.5,
        shape: 'pellet', color: C.teal, r: 4.2,
      });
    }
    A.sfx('shot', 70);
    yield A.w(44);

    // Three tightening spears, each faster than the last.
    for (let i = 0; i < 3; i++) {
      A.fan({
        n: A.n(3, 2), spread: 0.34 - i * 0.08,
        speed: A.spd(4.1 + i * 0.5),
        angle: A.aimLead(undefined, undefined, 4.1 + i * 0.5),
        shape: 'rice', color: C.white, r: 4.3,
      });
      yield A.w(7);
    }

    k++;
    yield A.w(30);
  }
}

export const BOSS_SENTINEL = {
  id: 'sentinel',
  name: 'SENTINEL',
  title: 'Rotational Primer',
  color: C.cyan,
  accent: C.blue,
  shape: 'circle',
  rings: ['hex', 'circle'],
  hitR: 30,
  phases: [
    { name: 'Cardinal Bloom', hp: 7600,  time: 45 * 60, script: cardinalBloom, move: moveWide },
    { name: 'Twin Helix',     hp: 8800, time: 50 * 60, script: twinHelix,     move: moveSway },
    { name: 'Polygon Cage',   hp: 10500, time: 55 * 60, script: polygonCage,   move: moveStatic },
  ],
};
