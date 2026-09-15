// The scripting surface every boss pattern is written against.
//
// Attack scripts are generator functions. They `yield <n>` to wait n frames,
// which makes densely-timed patterns readable as straight-line code:
//
//   function* pattern(A) {
//     while (true) {
//       A.ring({ n: A.n(18), speed: A.spd(2.4), angle: A.t * 0.07 });
//       yield A.w(24);
//     }
//   }
//
// Difficulty is threaded through four helpers -- A.n() scales counts,
// A.spd() scales velocity, A.w() scales delays, and A.L(k) gates whole
// optional sub-patterns so higher difficulties differ structurally, not just
// numerically.

import { TAU, PI, HALF_PI, clamp, angleTo } from './mathx.js';
import { PLAY, C } from './config.js';
import { RNG } from './rng.js';
import { Laser } from './lasers.js';
import { clampLife } from './bullets.js';

export class Attack {
  constructor(game, boss, seed) {
    this.game = game;
    this.boss = boss;
    this.D = game.diff;
    this.rnd = new RNG(seed);
    this.t = 0;
    this.style = { shape: 'circle', color: C.cyan, r: 5.5 };
    this.pf = PLAY;
    this.C = C;
  }

  // ---- context ----------------------------------------------------------
  get bx() { return this.boss.x; }
  get by() { return this.boss.y; }
  get px() { return this.game.player.x; }
  get py() { return this.game.player.y; }

  // ---- difficulty scaling -----------------------------------------------
  /** Scale a bullet count by density. */
  n(base, min = 1) { return Math.max(min, Math.round(base * this.D.density)); }

  /**
   * A bullet count for a rank that fills a fixed span -- a wall, a curtain.
   *
   * Density is the wrong knob at full strength here. A ring gets bigger as it
   * travels, so adding bullets to one costs the player a little room; a wall's
   * span never changes, so every column added subtracts directly from the lane
   * spacing, and once a lane is thinner than the ship the extra columns have
   * stopped offering choices and only add flux. Loom ran 27 columns across a
   * 672px playfield at Lunatic's 1.70 density -- 45% of the width solid, two
   * misaligned ranks of it at once -- and the sweep read the second boss's
   * OPENING pattern as the tightest cell in the game (0.46 of its column, 5.8px
   * at the pinch points). Half the density step keeps the rank visibly denser
   * tier over tier while leaving the gap width, the speed and the crossing
   * weave to carry the difficulty.
   *
   * Damped upward only, on the same reasoning as `gap`: Normal is the reference
   * tuning, so the tiers below it keep the counts they were designed with and
   * only the ones above are pulled back.
   */
  nw(base, min = 1) {
    const d = this.D.density;
    return Math.max(min, Math.round(base * (d > 1 ? 1 + (d - 1) * 0.5 : d)));
  }

  /** Scale a speed. */
  spd(v) { return v * this.D.speed; }
  /** Scale a wait, in frames. */
  w(f) { return Math.max(1, Math.round(f * this.D.rate)); }

  /**
   * A wait between waves, for patterns whose difficulty comes from how many
   * waves are in flight at once rather than from how dense one wave is.
   *
   * A wave stays on screen for roughly (span / speed) frames, so scaling the
   * gap by `rate` alone very nearly cancels the speed change: every difficulty
   * ends up with the same number of overlapping waves, and the easier tiers
   * get no relief on the one thing the player actually dies to. Dividing by
   * speed as well makes the overlap itself scale.
   *
   * Clamped to never return less than w(f), so this only ever eases. Normal is
   * the reference tuning and the tiers above it keep the gap they were
   * designed with; only Novice and Easy, where bullets linger, are stretched.
   */
  gap(f) { return Math.max(this.w(f), Math.round(this.w(f) / this.D.speed)); }
  /** Is optional layer `k` (1..4) enabled at this difficulty? */
  L(k) { return this.D.layers >= k; }
  /** Aim error, widest on Novice and zero on Lunatic. */
  jit() { return (this.rnd.r() - 0.5) * this.D.jitter * 0.30; }

  /** Angle from (x,y) -- defaults to the boss -- toward the player. */
  aim(x, y) {
    const ox = x === undefined ? this.bx : x;
    const oy = y === undefined ? this.by : y;
    return angleTo(ox, oy, this.px, this.py) + this.jit();
  }

  /**
   * Leading aim: solves roughly where the player will be. Only the top two
   * difficulties predict; below that it degrades to plain aiming.
   */
  aimLead(x, y, speed) {
    const ox = x === undefined ? this.bx : x;
    const oy = y === undefined ? this.by : y;
    if (!this.L(3)) return this.aim(ox, oy);
    const p = this.game.player;
    const dx = p.x - ox, dy = p.y - oy;
    const t = Math.min(90, Math.hypot(dx, dy) / Math.max(0.5, speed));
    const lead = this.L(4) ? 1 : 0.6;
    return Math.atan2(dy + p.vy * t * lead, dx + p.vx * t * lead) + this.jit();
  }

  /** Set the default shape/colour/radius for subsequent emits. */
  st(o) { Object.assign(this.style, o); return this; }

  sfx(name, gap = 45) { this.game.sfx.play(name, gap); }

  // ---- emitters ---------------------------------------------------------
  _apply(o) {
    const S = this.style;
    const b = this.game.bullets.spawn();
    const ang = o.angle === undefined ? 0 : o.angle;
    const sp = o.speed === undefined ? 2 : o.speed;

    let x = o.x === undefined ? this.bx : o.x;
    let y = o.y === undefined ? this.by : o.y;
    if (o.radius) { x += Math.cos(ang) * o.radius; y += Math.sin(ang) * o.radius; }
    b.x = x; b.y = y;
    b.vx = Math.cos(ang) * sp;
    b.vy = Math.sin(ang) * sp;

    b.shape = o.shape || S.shape;
    b.color = o.color || S.color;
    b.r = o.r === undefined ? S.r : o.r;
    b.hr = o.hr === undefined ? b.r * 0.76 : o.hr;
    if (o.rot !== undefined) b.rot = o.rot;
    if (o.spin !== undefined) b.spin = o.spin;
    if (o.life !== undefined) b.life = o.life;
    if (o.harmless) b.harmless = true;

    if (o.ax) b.ax = o.ax;
    if (o.ay) b.ay = o.ay;
    // Speed limits apply to any bullet that gains speed, not only to `accel`
    // ones: a gravity arc has a terminal velocity too. Nesting these inside
    // the accel branch meant a pattern could write `ay` and `maxSpeed`
    // together -- Ballistic Rain did -- and have the limit silently dropped at
    // spawn, which is how its arcs came to reach 13.5px/frame.
    if (o.maxSpeed !== undefined) b.maxSpeed = o.maxSpeed;
    if (o.minSpeed !== undefined) b.minSpeed = o.minSpeed;
    if (o.accel) {
      b.accel = o.accel;
      b.minSpeed = o.minSpeed === undefined ? 0 : o.minSpeed;
      b.maxSpeed = o.maxSpeed === undefined ? 24 : o.maxSpeed;
    }
    if (o.turn) { b.turn = o.turn; b.turnDecay = o.turnDecay === undefined ? 1 : o.turnDecay; }
    if (o.stopT) {
      b.stopT = o.stopT;
      b.goT = o.goT === undefined ? o.stopT + 45 : o.goT;
      b.goMode = o.goMode === undefined ? 'keep' : o.goMode;
      b.goSpeed = o.goSpeed === undefined ? sp : o.goSpeed;
      b.goSpin = o.goSpin || 0;
    }
    if (o.oscA) { b.oscA = o.oscA; b.oscF = o.oscF || 0.1; b.oscP = o.oscP || 0; }
    if (o.bounce) {
      b.bounce = o.bounce;
      if (o.floorBounce === false) b.floorBounce = false;
    }
    if (o.split) {
      b.split = o.split;
      b.splitGen = o.split.gen || 1;
      b.splitT = o.split.t || 40;
    }
    if (o.homeT) { b.homeT = o.homeT; b.homeK = o.homeK === undefined ? 0.02 : o.homeK; }
    if (o.orbit) {
      const ob = o.orbit;
      b.orbT = ob.t || 60;
      b.orbCx = ob.cx === undefined ? this.bx : ob.cx;
      b.orbCy = ob.cy === undefined ? this.by : ob.cy;
      b.orbR = ob.r === undefined ? 60 : ob.r;
      b.orbA = ob.a || 0;
      b.orbW = ob.w || 0.03;
      b.orbGrow = ob.grow || 0;
      b.orbFollow = !!ob.follow;
      b.releaseSpeed = o.speed === undefined ? 3 : o.speed;
      b.x = b.orbCx + Math.cos(b.orbA) * b.orbR;
      b.y = b.orbCy + Math.sin(b.orbA) * b.orbR;
      b.vx = 0; b.vy = 0;
    }
    // A lifetime may only trim a bullet that has already left the field.
    if (b.orbT > 0) b.life = 0;
    else clampLife(b);
    return b;
  }

  /** Single bullet. */
  one(o) { return this._apply(o); }

  /** Evenly spaced full circle of `n` bullets. */
  ring(o) {
    const n = Math.max(1, o.n | 0);
    const base = o.angle || 0;
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      o.angle = base + i * step;
      this._apply(o);
    }
    o.angle = base;
  }

  /** `n` bullets fanned across a total angular `spread`, centred on `angle`. */
  fan(o) {
    const n = Math.max(1, o.n | 0);
    const base = o.angle || 0;
    const spread = o.spread === undefined ? 0.6 : o.spread;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      o.angle = base + t * spread;
      this._apply(o);
    }
    o.angle = base;
  }

  /** Full ring with a wedge removed -- the classic "find the hole" volley. */
  gapRing(o) {
    const n = Math.max(3, o.n | 0);
    const base = o.angle || 0;
    const gapAt = o.gapAt === undefined ? this.aim() : o.gapAt;
    const gap = o.gap === undefined ? 0.5 : o.gap;
    const step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = base + i * step;
      let d = (a - gapAt) % TAU;
      if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
      if (Math.abs(d) < gap) continue;
      o.angle = a;
      this._apply(o);
    }
    o.angle = base;
  }

  /**
   * A regular polygon of bullets that expands while keeping straight edges:
   * every bullet travels along its own edge's outward normal.
   */
  polyRing(o) {
    const sides = Math.max(3, o.sides | 0 || 4);
    const per = Math.max(1, o.perSide | 0 || 5);
    const base = o.angle || 0;
    const radius = o.radius === undefined ? 24 : o.radius;
    const gapAt = o.gapAt;
    const gap = o.gap === undefined ? 0 : o.gap;
    const cx = o.x === undefined ? this.bx : o.x;
    const cy = o.y === undefined ? this.by : o.y;

    for (let s = 0; s < sides; s++) {
      const a0 = base + s * TAU / sides;
      const a1 = base + (s + 1) * TAU / sides;
      const x0 = cx + Math.cos(a0) * radius, y0 = cy + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius, y1 = cy + Math.sin(a1) * radius;
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per;
        const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        if (gap > 0 && gapAt !== undefined) {
          let d = (Math.atan2(py - cy, px - cx) - gapAt) % TAU;
          if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
          if (Math.abs(d) < gap) continue;
        }
        // Scaled outward from the centre, not pushed along the edge normal.
        //
        // A shared normal per edge translates the edge rigidly: it keeps the
        // length it had at radius 26 forever, so what expands is not a polygon
        // but a handful of short bars drifting apart. A triangle's edge is 45px
        // at spawn and still 45px three hundred pixels out, where the shape it
        // is meant to trace needs 565px -- the ring covered about six percent of
        // its own perimeter by the time it reached the player, and adding
        // bullets only packed them tighter into the same bars, which is why
        // Polygon Cage measured looser the denser the difficulty made it.
        //
        // Moving each bullet along its own radius at a speed proportional to
        // how far out it starts is a homothety: edges stay straight and grow in
        // proportion, so the shape really does stay crisp, and `speed` now
        // means the speed of the corners.
        const dx = px - cx, dy = py - cy;
        const dist = Math.hypot(dx, dy) || radius;
        this._apply(Object.assign({}, o, {
          x: px, y: py,
          angle: Math.atan2(dy, dx),
          speed: (o.speed === undefined ? 1 : o.speed) * (dist / radius),
        }));
      }
    }
  }

  /** A radial "spear": bullets on one heading with stepped speeds. */
  line(o) {
    const n = Math.max(1, o.n | 0);
    const sp = o.speed === undefined ? 2 : o.speed;
    const step = o.speedStep === undefined ? 0.4 : o.speedStep;
    for (let i = 0; i < n; i++) {
      this._apply(Object.assign({}, o, { speed: sp + i * step }));
    }
  }

  /** A straight rank of bullets spanning `w`, all moving on the same heading. */
  wall(o) {
    const n = Math.max(1, o.n | 0);
    const ang = o.angle === undefined ? HALF_PI : o.angle;
    const px = Math.cos(ang + HALF_PI), py = Math.sin(ang + HALF_PI);
    const span = o.span === undefined ? PLAY.w : o.span;
    const cx = o.x === undefined ? PLAY.cx : o.x;
    const cy = o.y === undefined ? PLAY.y - 14 : o.y;
    const gapIdx = o.gapIdx;
    const gapW = o.gapW === undefined ? 0 : o.gapW;
    for (let i = 0; i < n; i++) {
      if (gapW > 0 && gapIdx !== undefined && Math.abs(i - gapIdx) < gapW) continue;
      const t = (i + 0.5) / n - 0.5;
      this._apply(Object.assign({}, o, {
        x: cx + px * t * span,
        y: cy + py * t * span,
        angle: ang,
      }));
    }
  }

  /** Point on the playfield border at perimeter fraction u (0..1). */
  borderPoint(u) {
    const w = PLAY.w, h = PLAY.h;
    const per = 2 * (w + h);
    let d = ((u % 1) + 1) % 1 * per;
    if (d < w) return { x: PLAY.x + d, y: PLAY.y - 8 };
    d -= w;
    if (d < h) return { x: PLAY.right + 8, y: PLAY.y + d };
    d -= h;
    if (d < w) return { x: PLAY.right - d, y: PLAY.bottom + 8 };
    d -= w;
    return { x: PLAY.x - 8, y: PLAY.bottom - d };
  }

  laser(o) {
    // `follow` is resolved AFTER merging the caller's options -- spreading the
    // caller last would put the literal `true` back on the entity, and the
    // beam would then track `true.x` (undefined) and vanish.
    const l = new Laser(Object.assign({ x: this.bx, y: this.by }, o, {
      follow: o.follow === true ? this.boss : (o.follow || null),
    }));
    this.game.lasers.push(l);
    this.sfx('laser', 120);
    return l;
  }

  /** Decorative marker (no collision) -- used to show satellite emitters. */
  mark(x, y, color, size = 5) {
    this.game.particles.dot(x, y, color, size, 10);
  }

  shake(amount) { this.game.addShake(amount); }

  // ---- movement (used from a boss's movement script) --------------------
  *hold(frames) { for (let i = 0; i < frames; i++) yield 1; }

  *moveTo(x, y, frames, ease) {
    const b = this.boss;
    const sx = b.x, sy = b.y;
    const f = Math.max(1, frames | 0);
    const fn = ease || ((t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2));
    for (let i = 1; i <= f; i++) {
      const t = fn(i / f);
      b.x = sx + (x - sx) * t;
      b.y = sy + (y - sy) * t;
      yield 1;
    }
  }

  /** Drift to a random point inside a box near the top of the playfield. */
  *wander(frames, boxW = 300, top = 130, bottom = 250) {
    const x = clamp(PLAY.cx + this.rnd.rr(-boxW / 2, boxW / 2), PLAY.x + 70, PLAY.right - 70);
    const y = PLAY.y + this.rnd.rr(top, bottom);
    yield* this.moveTo(x, y, frames);
  }

  /** Follow a sine path horizontally for `frames`. */
  *sway(frames, amp = 170, speed = 0.021, yBase) {
    const b = this.boss;
    const y0 = yBase === undefined ? b.y : yBase;
    const phase = Math.asin(clamp((b.x - PLAY.cx) / amp, -1, 1));
    for (let i = 0; i < frames; i++) {
      b.x = PLAY.cx + Math.sin(phase + i * speed) * amp;
      b.y = y0 + Math.sin(i * speed * 1.7) * 22;
      yield 1;
    }
  }
}
