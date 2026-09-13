// The dodging bot, shared by the in-game autopilot and tools/survivable.mjs.
//
// It only ever produces inputs a human has: one of nine directions, focused or
// not, at the game's own speeds. Nothing here reaches past the input layer, so
// when it clears a pattern that is a genuine demonstration the pattern is
// dodgeable -- which is what makes it usable as a test as well as a demo.
//
// The planner is deliberately simple: each planning step it projects nearby
// bullets forward, scores every candidate heading by how long it survives and
// how much room it leaves, and takes the best. It has no memory and no notion
// of setting up for the next wave, so it plays tidily rather than well.

import { PLAY } from './config.js';
import { PLAYER_SPEED } from './player.js';

const HORIZON = 16;       // frames of lookahead
const NEAR = 150;         // only bullets this close are worth planning around
const REPLAN = 2;         // hold a chosen heading this many frames
const BEAM_LOOKAHEAD = 150;

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
    const reach = (NEAR + HORIZON * 6) ** 2;
    for (let i = 0; i < pool.n; i++) {
      const b = pool.a[i];
      if (b.harmless) continue;
      const dx = b.x - px, dy = b.y - py;
      if (dx * dx + dy * dy > reach) continue;

      // Cheap Euler roll-forward honouring the behaviours that actually bend
      // a trajectory inside a 16-frame window.
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
   * Standing in a beam that has not fired yet is safe this instant and fatal
   * shortly after -- and the telegraph runs far longer than the lookahead, so
   * a purely reactive planner parks in the beam and dies when it opens. Push
   * out of the corridor while the warning is still up, which is what the
   * telegraph is there for.
   */
  beamAversion(x, y, pr) {
    const lasers = this.game.lasers;
    let penalty = 0;
    for (let i = 0; i < lasers.length; i++) {
      const l = lasers[i];
      if (l.age >= l.warn) continue;           // already firing: handled as a hit
      const framesLeft = l.warn - l.age;
      if (framesLeft > BEAM_LOOKAHEAD) continue;
      const d = beamDistance(l, x, y, l.angle + l.spin * framesLeft);
      const danger = l.width * 0.5 + pr + 26;
      if (d < danger) {
        penalty += (1 - d / danger) * (1 - framesLeft / BEAM_LOOKAHEAD) * 4e5;
      }
    }
    return penalty;
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

  /** Higher is safer: survive longer first, then keep more room. */
  scoreMove(px, py, dir, speed, pr) {
    const threats = this.threats;
    let x = px, y = py;
    let firstHit = HORIZON;
    let roominess = 0;

    for (let t = 0; t < HORIZON; t++) {
      x += dir.dx * speed;
      y += dir.dy * speed;
      if (x < PLAY.x + 10) x = PLAY.x + 10;
      if (x > PLAY.right - 10) x = PLAY.right - 10;
      if (y < PLAY.y + 10) y = PLAY.y + 10;
      if (y > PLAY.bottom - 10) y = PLAY.bottom - 10;

      let nearest = 1e9;
      for (let i = 0; i < threats.length; i++) {
        const th = threats[i];
        const dx = th.xs[t] - x, dy = th.ys[t] - y;
        const clear = Math.sqrt(dx * dx + dy * dy) - (th.r + pr);
        if (clear < nearest) nearest = clear;
        if (clear < 0 && t < firstHit) firstHit = t;
      }
      if (firstHit === HORIZON && this.beamHits(x, y, t, pr)) firstHit = t;
      if (firstHit < HORIZON) break;
      roominess += Math.min(nearest, 60);
    }

    const edge = Math.min(x - PLAY.x, PLAY.right - x, PLAY.bottom - y, y - PLAY.y);
    return firstHit * 1e6 + roominess * 10 + Math.min(edge, 90) - this.beamAversion(x, y, pr);
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
          // Standing still is legitimate but should not win ties.
          - (dir.dx === 0 && dir.dy === 0 ? 1 : 0)
          // Prefer committing to a real move; focus is for fine work.
          - (focus ? 2 : 0);
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
