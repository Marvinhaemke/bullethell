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
      // The third-beat accent, as a pair of rings rather than an aimed spear
      // volley. See "Aimed volleys" in the README: a fast narrow fan thrown at
      // where you are standing is a reflex check, not a pattern -- there is
      // nothing in it to read, only something to flinch away from. Two rings
      // half a slot out of phase ask the question the rest of the phase asks,
      // which is whether the lane you picked is still a lane when the second
      // one arrives.
      const m = A.n(15, 9);
      A.ring({ n: m, speed: A.spd(2.95), angle: off * 1.6, shape: 'diamond', color: C.ice, r: 4.6 });
      A.ring({ n: m, speed: A.spd(2.45), angle: off * 1.6 + TAU / (2 * m), shape: 'diamond', color: C.white, r: 4.4 });
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
      if (A.L(3) && i % 2 === 0) {
        // A third strand on each arm rather than the fast aimed rice this used
        // to spit out every ninth tick. The phase is about the arms bunching at
        // the reversal, so thickening the arms makes the reversal matter more;
        // the rice made you look away from them.
        for (let a = 0; a < arms; a++) {
          A.one({
            angle: ang + a * TAU / arms + 0.26, speed: A.spd(2.25),
            shape: 'pellet', color: C.ice, r: 4.4,
          });
        }
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
    // Aimed, and left aimed. Moving the notch off the player -- by a fixed
    // angle or a random one -- makes this pattern measurably EASIER, not
    // harder: an opening that does not follow you is an opening you can walk
    // to and then stop, while one that tracks you keeps arriving as the ring
    // around it closes. Two attempts at "scatter it more on the high tiers"
    // both read looser than this line. The difficulty belongs in how narrow
    // the notch is and how much is coming with it.
    const gapAt = A.aim();

    A.polyRing({
      sides, perSide: A.n(8, 5), radius: 26,
      speed: A.spd(1.55), angle: k * 0.31,
      // Narrowed a step at a time rather than once, at Normal, from a half-open
      // ring to a third of one. That single step was the whole ladder: the
      // sweep had Novice and Easy at nearly twice their columns' room, then
      // Normal tighter than Hard.
      gapAt, gap: A.L(3) ? 0.26 : A.L(1) ? 0.30 : 0.34,
      shape: 'square', color: C.cyan, r: 5.5,
    });
    if (A.L(1)) {
      A.polyRing({
        sides, perSide: A.n(6, 4), radius: 20,
        speed: A.spd(2.5), angle: -k * 0.31,
        shape: 'diamond', color: C.blue, r: 5,
      });
    }
    if (A.L(3)) {
      A.polyRing({
        sides: sides + 1, perSide: A.n(4, 3), radius: 34,
        speed: A.spd(1.05), angle: k * 0.5,
        shape: 'pellet', color: C.teal, r: 4.2,
      });
    }
    A.sfx('shot', 70);
    yield A.w(44);

    // Three quickening polygons on the off-beat, each one a side busier than
    // the last. This used to be three tightening spears thrown at the player at
    // 4.1, 4.6 and 5.1px/frame -- the most reflex-heavy thing in the game, and
    // the reason this phase played as if it belonged to a different one. The
    // stepped rhythm is the part worth keeping, so it stays; only what arrives
    // on each step changes, into the shape language the phase is already
    // speaking. Each carries its own notch, re-aimed, so the accent still
    // tracks you -- it just does it with a door instead of a spear.
    for (let i = 0; i < 3; i++) {
      A.polyRing({
        sides: sides + 1 + i, perSide: A.n(7, 4), radius: 22,
        speed: A.spd(2.3 + i * 0.45), angle: -k * 0.31 + i * 0.42,
        // Only the first carries a notch. Giving all three one aimed at the
        // player handed over three doors in a row and made the whole accent
        // free -- the sweep read the phase at better than twice its column.
        // One door, then two rings you have to already be through.
        ...(i === 0 ? { gapAt: A.aim(), gap: A.L(2) ? 0.30 : 0.40 } : {}),
        shape: 'pellet', color: C.teal, r: 4.2,
      });
      yield A.w(9);
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
