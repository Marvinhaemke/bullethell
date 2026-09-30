// BOSS 5 -- PRISM
// Crystal optics. Panes of glass that bend bullets by Snell's law, snowflakes
// that grow from a seed and fall, white light split into a spectrum, and a
// crystal the boss sits inside that only lets light out through a window.
//
// Three of the four phases are built on the pane (see panes.js), which is the
// one place this game lets a bullet change course in flight -- and it is
// allowed for the same reason Delayed Theorem's snap is: the change happens at
// a line drawn on the screen, by one rule, well above where the player stands.
// Below the glass, everything flies straight again, so what the player has to
// read is a shape leaving a visible line rather than a trajectory bending
// toward them.

import { TAU, HALF_PI, clamp } from '../mathx.js';
import { PLAY, C } from '../config.js';
import { moveStatic, moveSway, moveWide } from '../patterns.js';

// Panes run a little past both walls, so nothing ever goes round an end of
// one inside the field -- and a pane that rocks still reaches the walls.
const LEFT = PLAY.x - 40, RIGHT = PLAY.right + 40;

// --- Phase 1: Refraction ----------------------------------------------------
// A pane of glass across the field, and rings. A bullet crossing into the glass
// bends toward the vertical and slows to 0.62 of its speed -- and because the
// bend and the slowing are the same ratio, which is what Snell's law says of
// real light, each ring stays a coherent wavefront on the far side. It comes
// through as a ripple that flattens and slows as it enters, not a circle.
//
// The player lives in the glass. What reaches them is a train of flat, slow
// fronts: tight, but the tightest part of the screen is also the slowest.
//
// The glass is also a LENS, and the counts are sized for it. A plain ring
// sends most of its lower half out through the side walls before it gets
// anywhere near the player; the glass turns everything that meets it within
// the field toward the vertical, so about twice as many of a ring's bullets
// reach the bottom of the screen, and slowed to 0.62 they stay there 1.6 times
// as long. A refracted ring is worth about three and a half plain ones, and
// these rings are that much sparser than Sentinel's or Fractal's.
const GLASS1 = PLAY.y + 300;

function* refraction(A) {
  A.pane({ x0: LEFT, y0: GLASS1, x1: RIGHT, y1: GLASS1, eta: 0.62, slow: 0.62, color: C.teal });
  yield 24;
  let k = 0;
  while (true) {
    const n = A.n(22, 12);
    const step = TAU / n;
    // Each volley turns by the golden fraction of a step. Alternating
    // half-steps looked like brickwork but sent every front down the same two
    // sets of rays forever -- the boss does not move -- and the dead-zone
    // scan found lanes between them four times calmer than the field. The
    // golden fraction never repeats a ray closely, so every front lands in
    // the gaps of the last few and no lane survives.
    const base = HALF_PI + ((k * 0.618034) % 1) * step;
    A.ring({ n, speed: A.spd(2.6), angle: base, shape: 'kunai', color: C.teal, r: 4.6, refract: true });

    // Further rings on the same beat, each at its own speed. Below the glass
    // every family is its own train of fronts, moving at its own rate --
    // the Phyllotaxis rule, one speed per layer -- and the faster fronts
    // overtake the slower ones on the way down rather than crossing them.
    if (A.L(1)) {
      const m = A.n(14, 7);
      A.ring({
        n: m, speed: A.spd(1.8), angle: base + TAU / m * 0.25,
        shape: 'diamond', color: C.ice, r: 4.4, refract: true,
      });
    }
    // The fast and the middling families take turns, a volley each.
    if (A.L(2) && k % 2 === 0) {
      const m = A.n(12, 6);
      A.ring({
        n: m, speed: A.spd(3.2), angle: base + TAU / m * 0.75,
        shape: 'rice', color: C.green, r: 4.2, refract: true,
      });
    }
    if (A.L(3) && k % 2 === 1) {
      const m = A.n(18, 9);
      A.ring({
        n: m, speed: A.spd(2.2), angle: base + TAU / m * 0.5,
        shape: 'pellet', color: C.cyan, r: 4, refract: true,
      });
    }
    A.sfx('shot', 60);
    k++;
    yield A.gap(40);
  }
}

// --- Phase 2: Dendrite ------------------------------------------------------
// The boss throws seed crystals to fixed sites across the upper field. Each
// one nucleates a snowflake, which GROWS: every bullet in it leaves the seed
// at a speed proportional to how far out its point in the flake is, and all of
// them decelerate to rest over the same number of frames. That is a homothety
// -- the flake is the same shape at every instant, only larger -- so what
// appears is a crystal growing, not a burst.
//
// Then it freezes and shimmers, and falls. Straight down, rigid, seed and all,
// one flake after another in a cascade across the field. Nothing is aimed and
// nothing turns once it is moving: the flakes are shown whole, stationary, for
// the better part of a second before they drop, and they fall as the shape you
// were shown.
const ARM = [0.25, 0.5, 0.75, 1];

/** A snowflake's points, in units of its arm length, with how to draw each. */
function flakeShape(A, rot) {
  const pts = [];
  for (let j = 0; j < 6; j++) {
    const a = rot + j * TAU / 6;
    const ux = Math.cos(a), uy = Math.sin(a);
    for (const d of ARM) pts.push({ x: ux * d, y: uy * d, a, kind: d === 1 ? 'tip' : 'arm' });
    // Side branches leave the arm at sixty degrees, as they do on real ice.
    const branch = (at, lens) => {
      for (const sgn of [-1, 1]) {
        const b = a + sgn * TAU / 6;
        const vx = Math.cos(b), vy = Math.sin(b);
        for (const l of lens) pts.push({ x: ux * at + vx * l, y: uy * at + vy * l, a: b, kind: 'branch' });
      }
    };
    if (A.L(1)) branch(0.5, [0.17, 0.33]);
    if (A.L(3)) branch(0.8, [0.15]);
  }
  return pts;
}

/**
 * Where wave `k`'s seeds land: one row, alternately high and low, nudged a
 * quarter slot left or right each wave so consecutive waves interleave.
 * Returned in cascade order, which alternates direction too.
 */
function sites(A, k) {
  const m = A.L(2) ? 4 : 3;
  const nudge = k % 2 ? 0.22 : -0.22;
  const out = [];
  for (let i = 0; i < m; i++) {
    out.push({
      x: clamp(PLAY.x + PLAY.w * (i + 0.5 + nudge) / m, PLAY.x + 72, PLAY.right - 72),
      y: PLAY.y + ((i + k) % 2 ? 300 : 222),
    });
  }
  if (k % 2) out.reverse();
  return out;
}

function* dendrite(A) {
  const FLY = 36;          // seed flight, frames
  const GROW = 60;         // flake growth, frames
  const THROW = 4;         // between seeds
  let k = 0;
  while (true) {
    const S = sites(A, k);
    const m = S.length;
    // The flakes grow with the tier: the gaps between neighbours are what a
    // player threads here, and a bigger flake at the same spacing is a
    // narrower gap -- the one thing that makes this phase harder, where more
    // speed only shortens a wait that was never the problem. (A fifth flake
    // was tried for Lunatic and measured EASIER: five had to be smaller to
    // fit, and five small flakes leave more room than four large ones.)
    const R = A.L(4) ? 69 : A.L(3) ? 67 : A.L(2) ? 62 : A.L(1) ? 58 : 56;
    // Alternate waves turn the flakes a twelfth: arms level, then upright.
    const shape = flakeShape(A, k % 2 ? TAU / 12 : 0);
    const hold = A.w(44), cascade = A.w(24);
    const fall = A.spd(1.55);
    // Speed per unit of arm length. A bullet leaving at v and slowing by
    // v/GROW a frame travels v(GROW-1)/2 before it stops, so this puts the
    // tips exactly R out.
    const tip = 2 * R / (GROW - 1);
    const bloom = (m - 1) * THROW + FLY + 8;

    const seeds = [];
    for (let i = 0; i < m; i++) {
      const s = S[i];
      const dx = s.x - A.bx, dy = s.y - A.by;
      // Frames are counted from this wave's first throw, so a seed thrown
      // later waits correspondingly less to fall with its flake.
      const at = i * THROW;
      seeds.push(A.one({
        angle: Math.atan2(dy, dx), speed: Math.hypot(dx, dy) / (FLY - 1),
        stopT: FLY, goT: bloom + GROW + hold + i * cascade - at, goMode: HALF_PI, goSpeed: fall,
        shape: 'hex', color: C.white, r: 7,
      }));
      if (i < m - 1) yield THROW;
    }
    A.sfx('charge', 90);
    yield bloom - (m - 1) * THROW;

    for (let i = 0; i < m; i++) {
      const s = S[i], seed = seeds[i];
      // A seed the player bombed is gone, and grows nothing.
      if (!seed.alive || !seed.frozen || Math.abs(seed.x - s.x) > 1 || Math.abs(seed.y - s.y) > 1) continue;
      for (const p of shape) {
        const v = tip * Math.hypot(p.x, p.y);
        A.one({
          x: s.x, y: s.y, angle: Math.atan2(p.y, p.x),
          speed: v, accel: -v / GROW, minSpeed: 0,
          stopT: GROW, goT: GROW + hold + i * cascade, goMode: HALF_PI, goSpeed: fall,
          shape: p.kind === 'tip' ? 'hex' : 'diamond', rot: p.a,
          color: p.kind === 'branch' ? C.cyan : p.kind === 'tip' ? C.white : C.ice,
          r: p.kind === 'tip' ? 4.8 : p.kind === 'branch' ? 3.9 : 4.3,
        });
      }
    }
    A.sfx('burst', 90);

    if (A.L(2)) {
      // A slow ring from the boss as the flakes start to grow: something
      // that is not a snowflake, arriving through the gaps between them.
      A.ring({ n: A.n(26, 12), speed: A.spd(1.35), angle: k * 0.41, shape: 'rice', color: C.blue, r: 4.2 });
      if (A.L(3)) A.ring({ n: A.n(26, 12), speed: A.spd(1.8), angle: -k * 0.41 + 0.14, shape: 'rice', color: C.violet, r: 4.2 });
      if (A.L(4)) A.ring({ n: A.n(12, 8), speed: A.spd(2.1), angle: k * 0.23 + 0.3, shape: 'pellet', color: C.cyan, r: 4 });
    }

    k++;
    yield Math.max(1, A.gap(184) - bloom);
  }
}

// --- Phase 3: Dispersion ----------------------------------------------------
// White light in, a spectrum out. The boss fires spears of white orbs at the
// glass; every orb that crosses it splits into a fan of colours, red to violet,
// in the same order every time -- violet bends most, so it is always the edge
// of the fan nearest the vertical, the way a real prism orders its spectrum.
//
// A spear's orbs travel at stepped speeds along one heading, so they strike
// the same point on the glass one after another, and what leaves that point
// is a set of nested rainbow fans rippling outward from it. The boss sways,
// so the points walk along the pane from volley to volley.
const GLASS3 = PLAY.y + 292;

function* dispersion(A) {
  const colors = A.L(4) ? 5 : A.L(1) ? 4 : 3;
  // Narrow spectra: each orb comes out as a ray of colours a few degrees
  // across, not a fan. Wide fans from neighbouring spears overlapped into
  // confetti a hundred pixels below the glass; narrow ones stay separate rays
  // with lanes between them all the way down.
  A.pane({
    x0: LEFT, y0: GLASS3, x1: RIGHT, y1: GLASS3, eta: 0.8, slow: 0.78, color: C.ice,
    disperse: { n: colors, spread: 0.065 * (colors - 1), r: 4, shape: 'rice' },
  });
  yield 24;
  let k = 0;
  while (true) {
    // Few rays, far apart. What a player threads here is the dark between
    // two spectra, and every ray added to the same span narrows all of those
    // at once -- four across 1.6 radians left lanes a tenth of a radian wide,
    // the tightest thing in the game. A fourth ray comes with a wider span.
    const m = A.L(3) ? 4 : 3;
    const span = A.L(3) ? 1.9 : 1.6;
    const sweep = Math.sin(k * 0.61) * 0.16;
    for (let j = 0; j < m; j++) {
      A.line({
        angle: HALF_PI + (j / (m - 1) - 0.5) * span + sweep,
        n: 2, speed: A.spd(2.0), speedStep: A.spd(0.34),
        shape: 'circle', color: C.white, r: 6.2, refract: true,
      });
    }
    A.sfx('shot', 60);
    k++;
    yield A.gap(46);

    if (A.L(2) && k % 2 === 0) {
      // Between spears, a ring of white light: its lower half comes through
      // as a wavefront of spectra, a band of colour rather than a point.
      A.ring({
        n: A.n(18, 8), speed: A.spd(1.7), angle: HALF_PI + k * 0.19,
        shape: 'circle', color: C.white, r: 5.4, refract: true,
      });
      yield A.w(12);
    }
  }
}

// --- Phase 4: Critical Angle ------------------------------------------------
// Now the boss is inside the crystal and the player is outside it. Light
// leaving glass bends AWAY from the vertical, and past the critical angle --
// 41.8 degrees for this glass -- it cannot leave at all: it reflects. So the
// pane is a mirror everywhere except a window straight below the boss (this
// is Snell's window, which is why a diver looking up sees the sky as a disc).
//
// Everything the boss fires meets the glass. What falls outside the window
// comes back up as the mirror image of the ring it left; what falls inside it
// comes out, fanned wide. The window is drawn on the glass, and the glass
// rocks slowly, so the fan of escaping light swings from side to side --
// the shape drawn by moving the emitter, where the emitter is the window.
const GLASS4 = PLAY.y + 290;

function* criticalAngle(A) {
  A.pane({
    x0: LEFT, y0: GLASS4, x1: RIGHT, y1: GLASS4, eta: 1.5, slow: 1.5, crystal: 'front', color: C.violet,
    swing: { amp: A.L(3) ? 0.26 : 0.2, period: 560 }, source: A.boss,
  });
  yield 30;
  let k = 0, next = 0;
  while (true) {
    if (A.t >= next) {
      const n = A.n(40, 22);
      const step = TAU / n;
      const base = HALF_PI + (k % 2) * step * 0.5;
      // Light leaves glass faster than it moves inside it -- by the same
      // ratio it bends by, which is what keeps each ring's escaping arc a
      // coherent wavefront, a ripple spreading out of the window. So the
      // rings are fired slow: 1.8 inside is 2.7 outside.
      A.ring({ n, speed: A.spd(1.8), angle: base, shape: 'kunai', color: C.ice, r: 4.6, refract: true });
      if (A.L(1)) {
        const m = A.n(28, 14);
        A.ring({
          n: m, speed: A.spd(1.3), angle: base + TAU / m * 0.25,
          shape: 'diamond', color: C.violet, r: 4.4, refract: true,
        });
      }
      A.sfx('shot', 60);
      k++;
      next = A.t + A.gap(28);
    }
    if (A.L(2) && A.t % A.w(A.L(3) ? 8 : 13) === 0) {
      // Rotating arms. Each passes the window once a turn and comes out as a
      // sweep across the whole lower field -- the glass spreads the eighty
      // degrees of the window over a hundred and eighty.
      const arms = A.L(4) ? 4 : A.L(3) ? 3 : 2;
      for (let j = 0; j < arms; j++) {
        A.one({
          angle: A.t * 0.019 + j * TAU / arms, speed: A.spd(1.7),
          shape: 'rice', color: C.magenta, r: 4, refract: true,
        });
      }
    }
    yield 1;
  }
}

export const BOSS_PRISM = {
  id: 'prism',
  name: 'PRISM',
  title: 'Refraction & Growth',
  color: C.ice,
  accent: C.teal,
  spectrum: true,
  shape: 'diamond',
  rings: ['diamond', 'hex'],
  hitR: 30,
  phases: [
    { name: 'Refraction',     hp: 10200, time: 52 * 60, script: refraction,    move: moveStatic },
    { name: 'Dendrite',       hp: 11000, time: 55 * 60, script: dendrite,      move: moveWide },
    { name: 'Dispersion',     hp: 11800, time: 58 * 60, script: dispersion,    move: moveSway },
    { name: 'Critical Angle', hp: 12600, time: 60 * 60, script: criticalAngle, move: moveStatic },
  ],
};
