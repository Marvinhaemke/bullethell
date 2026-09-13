// The dodging bot, shared by the in-game autopilot and tools/survivable.mjs.
//
// It only ever produces inputs a human has: one of nine directions, focused or
// not, at the game's own speeds. Nothing here reaches past the input layer, so
// when it clears a pattern that is a genuine demonstration the pattern is
// dodgeable -- which is what makes it usable as a test as well as a demo.
//
// Each frame it projects nearby bullets forward and scores every candidate
// heading, in strict priority: survive the horizon, then take the route whose
// *tightest* point is widest, then drift back towards a low central resting
// spot. Maximising the narrowest gap rather than the average one is what makes
// the line it takes worth copying -- an average-room planner will happily
// thread a sub-pixel gap because the rest of the route was comfortable.
//
// Two structural limits, both visible on the beam phases. It evaluates
// straight-line headings, so it cannot plan a curve -- and surviving a
// multi-beam pinwheel means orbiting the boss, which is exactly a curve. And
// it has no memory, so it cannot set up for a wave it can already see coming.

import { PLAY } from './config.js';
import { PLAYER_SPEED } from './player.js';

const HORIZON = 26;       // frames of lookahead
const NEAR = 170;         // only bullets this close are worth planning around
const REPLAN = 1;         // replan every frame
const BEAM_LOOKAHEAD = 150;

// A gap wider than this counts as simply safe; beyond it, extra room buys
// nothing and the resting preference takes over instead.
const CLEAR_CAP = 110;

// Where to drift back to when nothing is threatening. Low and central is the
// posture a player actually wants: it keeps the boss in the shot lane and
// leaves room to run in every direction.
const HOME_X = PLAY.cx;
const HOME_Y = PLAY.bottom - 120;

// Scoring weights. Surviving the horizon dominates everything, so the bot
// never trades a frame of life for position; below that it maximises the
// narrowest gap it has to pass through, and only then prefers home.
const W_SURVIVE = 1e6;    // per frame survived
const W_GAP = 3000;       // per pixel of the tightest gap on the route
const W_HOME = 10;        // per pixel away from the resting spot
const W_WALL = 80;        // per pixel inside the wall margin
const WALL_MARGIN = 70;
const W_HYSTERESIS = 400; // keep the current heading when it is a true tie
// Deliberately below W_SURVIVE: avoiding a beam must never outrank staying
// alive for one more frame.
const W_BEAM = 6e5;
const BEAM_STEP = 6;      // coarse sampling past the bullet horizon
const W_HOLD = 800;       // per pixel outside the radius a sweep lets you hold

// Heading -> the keys a player would be holding to produce it.
const KEYS = {
  '-1,-1': ['ArrowLeft', 'ArrowUp'], '0,-1': ['ArrowUp'], '1,-1': ['ArrowRight', 'ArrowUp'],
  '-1,0': ['ArrowLeft'], '0,0': [], '1,0': ['ArrowRight'],
  '-1,1': ['ArrowLeft', 'ArrowDown'], '0,1': ['ArrowDown'], '1,1': ['ArrowRight', 'ArrowDown'],
};

const DIRS = Object.keys(KEYS).map((k) => {
  const [dx, dy] = k.split(',').map(Number);
  const len = Math.hypot(dx, dy) || 1;
  return { key: k, keys: KEYS[k], dx: dx / len, dy: dy / len };
});

const clampX = (v) => (v < PLAY.x + 10 ? PLAY.x + 10 : v > PLAY.right - 10 ? PLAY.right - 10 : v);
const clampY = (v) => (v < PLAY.y + 10 ? PLAY.y + 10 : v > PLAY.bottom - 10 ? PLAY.bottom - 10 : v);

/** Perpendicular distance from a point to a beam's line at a given angle. */
function beamDistance(l, x, y, ang) {
  const ex = l.x + Math.cos(ang) * l.len;
  const ey = l.y + Math.sin(ang) * l.len;
  const dx = ex - l.x, dy = ey - l.y;
  const len2 = dx * dx + dy * dy;
  let u = len2 > 0 ? ((x - l.x) * dx + (y - l.y) * dy) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = l.x + dx * u - x, qy = l.y + dy * u - y;
  return Math.hypot(qx, qy);
}

export class Autopilot {
  constructor(game) {
    this.game = game;
    this.held = DIRS[4];          // '0,0'
    this.focus = false;
    this.tick = 0;
    this.threats = [];
  }

  /** Release everything this bot holds, so toggling it off hands control back cleanly. */
  release(input) {
    if (!input) return;
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft', 'KeyZ']) {
      input.down.delete(k);
    }
  }

  reset() {
    this.tick = 0;
    this.held = DIRS[4];
    this.focus = false;
    this.release(this.game.input);
  }

  /**
   * Project the bullets near the player forward once per planning step, so
   * every candidate heading is scored against the same predicted future.
   */
  projectNearby(px, py) {
    const pool = this.game.bullets;
    const out = this.threats;
    out.length = 0;
    const reach = (NEAR + HORIZON * 7) ** 2;
    for (let i = 0; i < pool.n; i++) {
      const b = pool.a[i];
      if (b.harmless) continue;
      const dx = b.x - px, dy = b.y - py;
      if (dx * dx + dy * dy > reach) continue;

      // Cheap Euler roll-forward honouring the behaviours that actually bend
      // a trajectory inside the lookahead window.
      const xs = new Float32Array(HORIZON);
      const ys = new Float32Array(HORIZON);
      let x = b.x, y = b.y, vx = b.vx, vy = b.vy, turn = b.turn;
      const frozen = b.frozen;
      for (let t = 0; t < HORIZON; t++) {
        if (!frozen) {
          if (turn !== 0) {
            const c = Math.cos(turn), s = Math.sin(turn);
            const nx = vx * c - vy * s;
            vy = vx * s + vy * c; vx = nx;
            if (b.turnDecay !== 1) turn *= b.turnDecay;
          }
          if (b.ax !== 0 || b.ay !== 0) { vx += b.ax; vy += b.ay; }
          x += vx; y += vy;
        }
        xs[t] = x; ys[t] = y;
      }
      out.push({ xs, ys, r: b.hr });
    }
    return out;
  }

  /**
   * How threatening is this point, t frames from now, given where the beams
   * will be by then? Returns 0..1. Position and beam angle are evaluated at
   * the same instant, which is the whole point: a beam is only dangerous
   * where it will be when it is lethal, not where it is drawn now.
   */
  beamThreatAt(x, y, t, pr) {
    const lasers = this.game.lasers;
    let worst = 0;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      const age = l.age + t;
      if (age < l.warn || age >= l.warn + l.fire) continue;   // not lethal then
      const danger = l.width * 0.5 + pr + 30;
      const d = beamDistance(l, x, y, l.angle + l.spin * t);
      if (d >= danger) continue;
      // Closer in space and sooner in time both raise the threat.
      const threat = (1 - d / danger) * (1 - t / BEAM_LOOKAHEAD);
      if (threat > worst) worst = threat;
    }
    return worst;
  }

  /**
   * A rotating beam sweeps faster the further out you stand, so there is a
   * radius beyond which it simply outruns you: past speed/spin, no amount of
   * running keeps you ahead of it and you have to be somewhere else when it
   * arrives. On this game's beam phase that limit falls *inside* the usual
   * resting spot at the bottom of the screen, so a bot that likes sitting low
   * is standing where the sweep is guaranteed to catch it.
   *
   * Pull it in to a radius it can actually hold while beams are turning.
   */
  holdRadiusPenalty(x, y) {
    const boss = this.game.boss;
    if (!boss) return 0;
    const lasers = this.game.lasers;
    let maxSpin = 0;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      if (l.age >= l.warn + l.fire) continue;
      const sp = Math.abs(l.spin);
      if (sp > maxSpin) maxSpin = sp;
    }
    if (maxSpin < 1e-4) return 0;
    const hold = PLAYER_SPEED.free / maxSpin;
    const r = Math.hypot(x - boss.x, y - boss.y);
    return r > hold ? (r - hold) * W_HOLD : 0;
  }

  /** Is a beam lethal at this point, t frames from now? */
  beamHits(x, y, t, pr) {
    const lasers = this.game.lasers;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      const age = l.age + t;
      if (age < l.warn || age >= l.warn + l.fire) continue;
      if (beamDistance(l, x, y, l.angle + l.spin * t) < l.width * 0.5 + pr) return true;
    }
    return false;
  }

  /**
   * Higher is safer. Survive the horizon first; then take the route whose
   * *tightest* point is widest -- the widest-gap objective, not the roomiest
   * on average. Maximising the bottleneck is what stops the bot threading
   * sub-pixel gaps, and it is what makes the line it takes worth copying.
   */
  scoreMove(px, py, dir, speed, pr) {
    const threats = this.threats;
    let x = px, y = py;
    let firstHit = HORIZON;
    let bottleneck = CLEAR_CAP;

    for (let t = 0; t < HORIZON; t++) {
      x = clampX(x + dir.dx * speed);
      y = clampY(y + dir.dy * speed);

      let nearest = CLEAR_CAP;
      for (let i = 0; i < threats.length; i++) {
        const th = threats[i];
        const dx = th.xs[t] - x, dy = th.ys[t] - y;
        const d2 = dx * dx + dy * dy;
        const reach = th.r + pr + CLEAR_CAP;
        if (d2 > reach * reach) continue;          // too far to matter
        const clear = Math.sqrt(d2) - (th.r + pr);
        if (clear < nearest) nearest = clear;
      }
      if (nearest < 0) { firstHit = t; break; }
      if (this.beamHits(x, y, t, pr)) { firstHit = t; break; }
      if (nearest < bottleneck) bottleneck = nearest;
    }

    // Beams outlive the bullet horizon -- a telegraph can run 40+ frames, and
    // a sweep longer still. Keep walking this heading past the horizon and ask
    // where it leaves us *at the moment each beam is lethal*. Judging beams
    // only at the end of the horizon is useless: by then every heading has
    // escaped, they all score equally, and the bot dithers on the beam line
    // until it opens underneath it.
    let beamThreat = 0;
    if (firstHit === HORIZON) {
      let bx = x, by = y;
      for (let t = HORIZON; t < BEAM_LOOKAHEAD; t += BEAM_STEP) {
        bx = clampX(bx + dir.dx * speed * BEAM_STEP);
        by = clampY(by + dir.dy * speed * BEAM_STEP);
        const th = this.beamThreatAt(bx, by, t, pr);
        if (th > beamThreat) beamThreat = th;
      }
    }

    // Resting preference, which only decides things once the route is clear:
    // with no bullets in reach every candidate bottoms out at CLEAR_CAP, and
    // without this the comparison would fall through to iteration order and
    // walk the bot into a corner.
    const home = Math.hypot(x - HOME_X, y - HOME_Y);
    const wall = Math.min(x - PLAY.x, PLAY.right - x, PLAY.bottom - y, y - PLAY.y);
    const wallPenalty = wall < WALL_MARGIN ? (WALL_MARGIN - wall) * W_WALL : 0;

    return firstHit * W_SURVIVE
      + bottleneck * W_GAP
      - home * W_HOME
      - wallPenalty
      - this.holdRadiusPenalty(x, y)
      - beamThreat * W_BEAM;
  }

  /** Pick the safest heading available right now. */
  choose() {
    const p = this.game.player;
    const pr = p.hitR;
    this.projectNearby(p.x, p.y);

    let best = DIRS[4], bestFocus = false, bestScore = -Infinity;
    for (let f = 0; f < 2; f++) {
      const focus = f === 1;
      const speed = focus ? PLAYER_SPEED.focus : PLAYER_SPEED.free;
      for (let i = 0; i < DIRS.length; i++) {
        const dir = DIRS[i];
        const s = this.scoreMove(p.x, p.y, dir, speed, pr)
          // Hold the current heading through an exact tie. Without this the
          // comparison falls through to iteration order, which both jitters
          // and biases every idle frame towards one corner.
          + (dir === this.held && focus === this.focus ? W_HYSTERESIS : 0);
        if (s > bestScore) { bestScore = s; best = dir; bestFocus = focus; }
      }
    }
    return { dir: best, focus: bestFocus };
  }

  /**
   * Drive the player for one frame by writing the keys it would hold. Call
   * before game.update(); movement then runs through the normal input path.
   */
  drive(input, autofire) {
    if (this.tick % REPLAN === 0) {
      const pick = this.choose();
      this.held = pick.dir;
      this.focus = pick.focus;
    }
    this.tick++;

    this.release(input);
    for (const k of this.held.keys) input.down.add(k);
    if (this.focus) input.down.add('ShiftLeft');
    // Without autofire the demo would never damage the boss.
    if (!autofire) input.down.add('KeyZ');
  }
}

export const AUTOPILOT_CONST = { HORIZON, REPLAN };
