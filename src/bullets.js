// Enemy bullet pool.
//
// Every bullet is a plain object with a fixed field set (monomorphic, so the
// JIT stays happy) and its behaviour is driven entirely by data. That lets the
// pattern scripts describe complex motion -- gravity arcs, curving shots,
// stop-and-snap volleys, orbital charges, recursive splits, wall bounces --
// without allocating a closure per bullet.

import { TAU, PI, clamp } from './mathx.js';
import { PLAY, MAX_BULLETS } from './config.js';
import { bulletSprite, DIRECTIONAL } from './sprites.js';

// Generous top margin: ballistic patterns lob bullets high above the field.
const CULL_TOP = 340;
const CULL_SIDE = 80;

export class Bullet {
  constructor() { this.init(); }

  init() {
    this.alive = true;
    this.bornThisFrame = true;
    this.age = 0;
    this.life = 0;              // 0 = no timeout

    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;

    this.r = 5; this.hr = 4;
    this.shape = 'circle';
    this.color = '#3fe0ff';
    this.rot = 0; this.spin = 0;
    this.harmless = false;      // decorative markers
    this.grazed = false;

    // Linear acceleration (gravity / wind).
    this.ax = 0; this.ay = 0;
    // Acceleration along the direction of travel, clamped to [minSpeed,maxSpeed].
    this.accel = 0; this.minSpeed = 0; this.maxSpeed = 24;

    // Constant-curvature steering, optionally decaying to a straight line.
    this.turn = 0; this.turnDecay = 1;

    // Stop-and-snap: freeze at `stopT`, relaunch at `goT`.
    this.stopT = 0; this.goT = 0;
    this.goMode = 'keep';       // 'keep' | 'aim' | 'radial' | number (absolute angle)
    this.goSpeed = 0; this.goSpin = 0;
    this.frozen = false; this.heldAngle = 0;

    // Perpendicular sine weave.
    this.oscA = 0; this.oscF = 0; this.oscP = 0;

    this.bounce = 0;

    // Recursive splitting.
    this.splitT = 0; this.splitGen = 0; this.split = null;

    // Soft homing for a limited window.
    this.homeT = 0; this.homeK = 0;

    // Orbit-then-release ("charge up a gear, then fire it outward").
    this.orbT = 0; this.orbCx = 0; this.orbCy = 0;
    this.orbR = 0; this.orbA = 0; this.orbW = 0; this.orbGrow = 0;
    this.orbFollow = false;     // orbit centre tracks the boss
    this.releaseSpeed = 0;
  }
}

export class BulletPool {
  constructor(max = MAX_BULLETS) {
    this.max = max;
    this.a = [];
    this.n = 0;
    for (let i = 0; i < 256; i++) this.a.push(new Bullet());
  }

  get count() { return this.n; }

  spawn() {
    if (this.n >= this.max) {
      // At the cap, recycle the newest slot rather than growing without bound.
      const b = this.a[this.max - 1];
      b.init();
      return b;
    }
    let b = this.a[this.n];
    if (!b) { b = new Bullet(); this.a[this.n] = b; }
    this.n++;
    b.init();
    return b;
  }

  clear() {
    for (let i = 0; i < this.n; i++) this.a[i].alive = false;
    this.n = 0;
  }

  remove(i) {
    const b = this.a[i];
    b.alive = false;
    this.a[i] = this.a[this.n - 1];
    this.a[this.n - 1] = b;
    this.n--;
  }

  update(game) {
    const px = game.player.x, py = game.player.y;
    for (let i = 0; i < this.n; i++) {
      const b = this.a[i];

      // Bullets created during this frame's boss script wait one frame so
      // they are visible at their spawn point before moving.
      if (b.bornThisFrame) { b.bornThisFrame = false; continue; }

      b.age++;

      // --- orbital charge -------------------------------------------------
      if (b.orbT > 0) {
        if (b.orbFollow && game.boss) { b.orbCx = game.boss.x; b.orbCy = game.boss.y; }
        if (b.age < b.orbT) {
          b.orbA += b.orbW;
          b.orbR += b.orbGrow;
          b.x = b.orbCx + Math.cos(b.orbA) * b.orbR;
          b.y = b.orbCy + Math.sin(b.orbA) * b.orbR;
          b.rot += b.spin;
          continue;
        }
        if (b.age === b.orbT) {
          // Release outward along the current radius.
          const sp = b.releaseSpeed;
          b.vx = Math.cos(b.orbA) * sp;
          b.vy = Math.sin(b.orbA) * sp;
          b.orbT = 0;
        }
      }

      // --- stop and snap --------------------------------------------------
      if (b.stopT && b.age === b.stopT) {
        b.heldAngle = Math.atan2(b.vy, b.vx);
        b.vx = 0; b.vy = 0;
        b.frozen = true;
      }
      if (b.frozen && b.goT && b.age === b.goT) {
        let ang;
        const mode = b.goMode;
        if (mode === 'aim') ang = Math.atan2(py - b.y, px - b.x);
        else if (mode === 'radial') ang = b.heldAngle;
        else if (typeof mode === 'number') ang = b.heldAngle + mode;
        else ang = b.heldAngle;
        ang += b.goSpin;
        const sp = b.goSpeed || 2;
        b.vx = Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        b.frozen = false;
      }

      if (!b.frozen) {
        // --- homing -------------------------------------------------------
        if (b.homeT > 0 && b.age <= b.homeT && b.homeK !== 0) {
          const want = Math.atan2(py - b.y, px - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = (want - cur) % TAU;
          if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
          cur += clamp(d, -b.homeK, b.homeK);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
        }

        // --- constant-curvature steering ----------------------------------
        if (b.turn !== 0) {
          const c = Math.cos(b.turn), s = Math.sin(b.turn);
          const nx = b.vx * c - b.vy * s;
          b.vy = b.vx * s + b.vy * c;
          b.vx = nx;
          if (b.turnDecay !== 1) b.turn *= b.turnDecay;
        }

        // --- speed control ------------------------------------------------
        if (b.accel !== 0) {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.0001) {
            const ns = clamp(sp + b.accel, b.minSpeed, b.maxSpeed);
            const k = ns / sp;
            b.vx *= k; b.vy *= k;
          }
        }

        if (b.ax !== 0 || b.ay !== 0) { b.vx += b.ax; b.vy += b.ay; }

        b.x += b.vx;
        b.y += b.vy;

        // --- perpendicular weave -------------------------------------------
        if (b.oscA !== 0) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const nx = -b.vy / sp, ny = b.vx / sp;
          const k = b.oscA * Math.cos(b.age * b.oscF + b.oscP);
          b.x += nx * k;
          b.y += ny * k;
        }

        // --- wall bounces ---------------------------------------------------
        if (b.bounce > 0) {
          if (b.x < PLAY.x + b.r && b.vx < 0) { b.vx = -b.vx; b.x = PLAY.x + b.r; b.bounce--; }
          else if (b.x > PLAY.right - b.r && b.vx > 0) { b.vx = -b.vx; b.x = PLAY.right - b.r; b.bounce--; }
          if (b.y < PLAY.y + b.r && b.vy < 0) { b.vy = -b.vy; b.y = PLAY.y + b.r; b.bounce--; }
          else if (b.y > PLAY.bottom - b.r && b.vy > 0) { b.vy = -b.vy; b.y = PLAY.bottom - b.r; b.bounce--; }
        }
      }

      b.rot += b.spin;

      // --- recursive split --------------------------------------------------
      if (b.split && b.splitGen > 0 && b.age === b.splitT) {
        this.doSplit(b, px, py);
        this.remove(i); i--;
        continue;
      }

      // --- lifetime / culling ------------------------------------------------
      if (b.life > 0 && b.age >= b.life) { this.remove(i); i--; continue; }
      if (b.x < PLAY.x - CULL_SIDE || b.x > PLAY.right + CULL_SIDE ||
          b.y > PLAY.bottom + CULL_SIDE || b.y < PLAY.y - CULL_TOP) {
        this.remove(i); i--;
      }
    }
  }

  doSplit(b, px, py) {
    const s = b.split;
    const n = s.n || 2;
    const base = s.aim ? Math.atan2(py - b.y, px - b.x) : Math.atan2(b.vy, b.vx);
    const spread = s.spread === undefined ? 0.8 : s.spread;
    // Depth index: 0 for the first split, 1 for the next generation, ...
    const depth = (s.gen || 1) - b.splitGen;
    const colors = s.colors;
    const color = colors ? colors[Math.min(depth, colors.length - 1)] : (s.color || b.color);
    const shrink = s.shrink === undefined ? 0.82 : s.shrink;
    const childR = (s.r || b.r) * Math.pow(shrink, depth);
    const speed = (s.speed || 2) * Math.pow(s.speedMul === undefined ? 1 : s.speedMul, depth);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5);
      const ang = base + t * spread;
      const c = this.spawn();
      c.x = b.x; c.y = b.y;
      c.vx = Math.cos(ang) * speed;
      c.vy = Math.sin(ang) * speed;
      c.r = childR;
      c.hr = childR * 0.76;
      c.shape = s.shape || b.shape;
      c.color = color;
      c.spin = b.spin;
      c.life = s.life || 0;
      c.splitGen = b.splitGen - 1;
      c.splitT = b.splitT;
      c.split = c.splitGen > 0 ? s : null;
      c.turn = s.turn || 0;
      c.turnDecay = s.turnDecay === undefined ? 1 : s.turnDecay;
      c.ay = s.ay || 0;
    }
  }

  draw(g) {
    for (let i = 0; i < this.n; i++) {
      const b = this.a[i];
      const sprite = bulletSprite(b.shape, b.color, b.r);
      const s = sprite.size;
      // Bullets pop in over ~5 frames so dense volleys read as a wave.
      const grow = b.age < 5 ? 0.55 + 0.09 * b.age : 1;

      if (b.frozen) {
        // Frozen bullets shimmer to telegraph the incoming snap.
        g.globalAlpha = 0.75 + 0.25 * Math.sin(b.age * 0.4);
      }

      const rotated = b.rot !== 0 || DIRECTIONAL.has(b.shape);
      if (rotated || grow !== 1) {
        g.save();
        g.translate(b.x, b.y);
        if (rotated) {
          g.rotate(DIRECTIONAL.has(b.shape) && !b.frozen && (b.vx || b.vy)
            ? Math.atan2(b.vy, b.vx) + b.rot
            : b.rot);
        }
        if (grow !== 1) g.scale(grow, grow);
        g.drawImage(sprite.canvas, -sprite.half, -sprite.half, s, s);
        g.restore();
      } else {
        g.drawImage(sprite.canvas, b.x - sprite.half, b.y - sprite.half, s, s);
      }

      if (b.frozen) g.globalAlpha = 1;
    }
  }

  /**
   * Convert bullets to score particles -- used by bombs, deaths and phase
   * breaks. Returns how many were cleared.
   */
  clearArea(game, cx, cy, radius, award = true) {
    const r2 = radius * radius;
    let cleared = 0;
    for (let i = 0; i < this.n; i++) {
      const b = this.a[i];
      const dx = b.x - cx, dy = b.y - cy;
      if (radius > 0 && dx * dx + dy * dy > r2) continue;
      if (cleared < 220) game.particles.spark(b.x, b.y, b.color, 2, 1.6, 16);
      this.remove(i); i--;
      cleared++;
    }
    if (award && cleared) game.addScore(cleared * 8);
    return cleared;
  }
}
