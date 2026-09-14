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
    const cols = A.nw(16, 11);
    // The gap is a fraction of the wall, not a fixed number of slots -- a
    // fixed count would swallow a sparse Novice wall whole.
    // Widest where the two ranks cross, which is the only place this pattern is
    // actually tight: the gap has to admit a diagonal route through both.
    // Wider at the bottom of the ladder than it used to be. A wall gives less
    // notice than anything fired from the boss -- it spans the playfield, so it
    // is already beside you when it starts -- and once reading time entered the
    // measurement this phase read as the tightest row in the game at every
    // tier. The gap is the only thing here that can give time back.
    // Novice is left where it was. The gap is a half-width in SLOTS and the
    // skip test is an integer comparison, so at Novice's eleven columns the
    // step from 0.21 to 0.30 is the step from five empty slots to seven -- a
    // wall that is mostly hole, and the dead-zone scan duly found two places to
    // park in the middle of it. The sag this was widening for was at Easy
    // through Hard, and Novice already measured fine.
    // Hard's gap matches Lunatic's. The wider Lunatic gap was compensation for
    // a much denser Lunatic wall; with the top two tiers compressed there is
    // less to compensate for, and Hard was left tighter than the tier above it
    // -- the tightest cell in the game, and 2.33 deaths an attempt in a log
    // whose band tops out at 1.5.
    // Hard gets the widest gap in the ladder and Lunatic the narrowest above
    // Normal. Loom has no Lunatic-only layer any more -- the aimed kunai fan
    // that used to be its L(4) came out -- so with the top tiers compressed,
    // the gap is the only thing left that can tell those two tiers apart, and
    // Hard was reading tighter than the tier above it. Hard is also the cell a
    // log put at 2.33 deaths an attempt against a band topping out at 1.5.
    const gapW = cols * (A.L(4) ? 0.23 : A.L(3) ? 0.28 : A.L(2) ? 0.25 : A.L(1) ? 0.24 : 0.21);
    const gapIdx = A.rnd.ri(1, cols - 2);

    if (k % 2 === 0) {
      // Walk the whole rank sideways by an irrational-ish fraction of a lane
      // each volley. Lane spacing is far wider than the player, so columns
      // that land in the same place every time leave a slot you can simply
      // stand in and let every wall pass by -- which makes the moving gap,
      // the entire point of the pattern, irrelevant. Drifting the phase means
      // no slot survives two volleys.
      const lane = PLAY.w / cols;
      A.wall({
        n: cols, gapIdx, gapW, angle: HALF_PI,
        x: PLAY.cx + (((k * 0.37) % 1) - 0.5) * lane,
        y: PLAY.y - 14, span: PLAY.w,
        speed: A.spd(2.35),
      });
    } else {
      const fromLeft = A.rnd.r() < 0.5;
      const rows = A.nw(14, 10);
      A.wall({
        n: rows, gapIdx: A.rnd.ri(1, rows - 2), gapW: rows * (A.L(3) ? 0.11 : A.L(1) ? 0.16 : 0.19),
        angle: fromLeft ? 0 : PI,
        x: fromLeft ? PLAY.x - 14 : PLAY.right + 14,
        y: PLAY.cy, span: PLAY.h,
        speed: A.spd(2.2), color: C.rose,
      });
    }

    if (A.L(3)) {
      // A second, slower weave offset by half a beat keeps the lattice moving.
      //
      // Gated at L(3) rather than L(2). This layer is the whole difference
      // between one wall to thread and two misaligned ones, and switching it
      // on at Normal made that the single largest step anywhere on the ladder
      // -- the sweep put Loom at 1.00 of its column on Easy and 0.60 on
      // Normal, and it reads in play as losing a life or two to the boss's
      // opening pattern. Hard and Lunatic still get it.
      // Sparser than the rank it crosses, and faster than it used to be. This
      // layer travels slowest, so far more of it is resident at once than of
      // anything else in the phase -- at Lunatic the two ranks together put 40
      // bullets a second on screen, more than the final boss's last pattern,
      // and Loom read as the tightest cell in the game. Three fifths of the
      // columns keeps the lattice legible and the crossings countable.
      const xc = Math.max(7, Math.round(cols * 0.6));
      A.wall({
        // Wider than the wall it crosses, not narrower: this gap is offset by
        // half a rank on purpose, so a tight one means threading two
        // misaligned slots at once and the room collapsed threefold the moment
        // this layer switched on at Normal. Scaled by xc/cols so it stays the
        // same fraction of the span now that it is cut from fewer slots.
        n: xc, gapIdx: (Math.round(gapIdx * xc / cols) + (xc >> 1)) % xc,
        gapW: gapW * (xc / cols) * 1.35,
        angle: HALF_PI, x: PLAY.cx + (((k * 0.61) % 1) - 0.5) * (PLAY.w / xc),
        y: PLAY.y - 40, span: PLAY.w,
        speed: A.spd(1.85), color: C.violet, shape: 'diamond', r: 5,
      });
    }
    // Lunatic used to add a fast aimed kunai fan here. Removed with nothing in
    // its place: see "Aimed volleys" in the README for why it went, and the
    // sweep for why nothing replaced it -- Loom at Lunatic was already the
    // tightest cell in the game, so this is the one site where the reflex tax
    // was also simply too much pattern.

    A.sfx('shot', 80);
    k++;
    // A rank takes span/speed frames to cross, so A.w alone left about the
    // same number of walls in flight at every tier.
    yield A.gap(34);
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
  let beat = 0;

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

    // A second reading of the same automaton, counter-rotating and slower,
    // instead of the fast aimed kunai this used to throw every fourth step.
    // The cells are the phase; taking another cut through them is the way to
    // make it denser without asking the player to stop reading and flinch.
    //
    // Every other beat, not every beat. On every beat it put 1271 bullets on
    // screen at Hard -- half again as many as anything else in the game -- and
    // at that point the automaton has stopped being a structure you read and
    // become a texture you hope to be lucky in.
    if (A.L(3) && beat % 2 === 0) {
      for (let i = 0; i < M; i++) {
        if (!cells[i]) continue;
        A.one({
          angle: -rot * 0.6 + (i + 0.5) * TAU / M,
          speed: A.spd(1.55),
          shape: 'diamond', color: C.rose, r: 4.4,
          radius: 30,
        });
      }
    }

    rot += 0.21;
    beat++;
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
    // A bouncing bullet has no exit -- clampLife exempts it precisely because
    // its lifetime IS its exit -- so the population here compounds three ways
    // at once: more bullets per wave, more waves per second, and each one
    // crossing the field once per bounce. At Lunatic that stacked up to some
    // 600 ricochets in a closed box, and this phase measured the single
    // tightest cell in the game.
    //
    // Two caps. Bounces stop at 2, so a bullet crosses three times rather than
    // four; and the lifetime scales with rate, so the count on screen tracks
    // density like everywhere else. Both clamped to ease only: Normal is the
    // reference tuning and Novice's already-generous field is left alone.
    // 1/1/1/2/2. A second bounce squares the number of reflections you have to
    // hold in your head, so turning it on at Normal was a step-change in chaos
    // rather than a gradient. It arrives at Hard, with the rest of the ladder
    // carried by density and speed.
    //
    // Note it no longer costs anything in DENSITY, only in chaos: lifetime is a
    // range now, so a bullet travels 760px whether it turns once or twice.
    // Giving the low tiers a second bounce for coverage was tried on that basis
    // and changed neither the parking spots nor the hitbox ladder, so the
    // simpler ladder stands.
    const bounces = A.D.layers >= 3 ? 2 : 1;
    // Lifetime as RANGE rather than frames. A bouncer is exempt from
    // clampLife -- its lifetime IS its exit -- so `life` alone decides how far
    // it gets, and a flat frame count means slowing the bullets down quietly
    // shortens their reach. Slowing this ring by 18% put the far corner of the
    // field 624px away with only 532px of travel left in a bullet, and opened
    // a spot at Novice you could park in. 760px covers the playfield diagonal
    // with enough left to bounce back across it.
    const range = (v) => Math.round(760 / v);
    // 1.85/1.4 -> 1.55/1.18. Both bullets that killed a player here were
    // ricochets at 1.4 and 1.62 that had been in the box for four hundred-odd
    // frames: by then a bouncer has changed direction twice and where it is
    // going is a question, not a reading. Slowing the whole lattice is the
    // difference between a question you can answer and one you cannot.
    //
    // Counts at Normal and above come down with it. `range` holds travel
    // distance constant, so a slower bullet simply lives longer -- leaving the
    // counts alone would have put a fifth more ricochets in the box and spent
    // the slowdown on density.
    const fast = A.spd(1.55);
    const slow = A.spd(1.18);
    const mid = A.spd(1.36);
    // The FLOORS go the other way, because slowing the lattice cost the low
    // tiers their coverage rather than their density. A slower bullet still
    // traces 760px, but it visits those pixels over eleven seconds instead of
    // eight, and the dead-zone scan started finding places along the bottom
    // that nothing reached inside its window. More bearings per wave is the
    // cheapest way to buy that back; more waves, longer travel and a second
    // bounce were all tried and all cost more for less.
    //
    // Jitter below Normal for the same reason. Evenly spaced slots precessing
    // by a fixed step visit a fixed lattice of bearings, and that lattice had a
    // hole in it -- one spot stayed unthreatened through every count and range,
    // and merely moved when the bearings changed. Jitter is already the knob
    // the low tiers use for sloppy aim, and a third of a slot of it closes the
    // lattice statistically rather than by coincidence.
    const spray = () => (A.L(2) ? 0 : A.jit() * 2);
    A.ring({
      n: A.n(10, 9), speed: fast, angle: k * 0.91 + spray(),
      bounce: bounces, life: range(fast),
    });
    if (A.L(1)) {
      A.ring({
        n: A.n(8, 6), speed: slow, angle: -k * 1.3 + 0.4 + spray(),
        bounce: bounces, life: range(slow), color: C.magenta, shape: 'hex', r: 5.2,
      });
    }
    if (A.L(2)) {
      A.ring({
        n: A.n(6, 3), speed: mid, angle: k * 0.55 + 1.1,
        bounce: bounces, life: range(mid), color: C.rose, shape: 'diamond', r: 4.8,
      });
    }
    // An aimed kunai fan at 4.7px/frame -- the fastest volley in the game --
    // used to land here every other beat. Gone, and the rings above carry what
    // it was carrying: counts up by half and a third ring from Normal.
    //
    // This is the trade the whole pass is built on. A player named this as one
    // of the two hardest patterns on Normal and also said the fast aimed
    // volleys were the part they wanted gone -- and those are the same note,
    // not two. The lattice is the thing worth looking at here; the kunai was
    // the thing that punished you for looking at it.
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
