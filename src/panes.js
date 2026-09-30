// Crystal panes: visible boundaries that refract bullets.
//
// A pane is a line across the playfield with a crystal on one side of it. A
// bullet spawned with `refract: true` that crosses from the open side into the
// crystal obeys Snell's law: it bends by the ratio of refractive indices and
// changes speed, the way light does entering glass. Past the critical angle it
// cannot enter at all and reflects instead. A pane can also DISPERSE -- split
// each bullet into a fan of colours, the way a prism splits white light.
//
// WHY THIS IS ALLOWED. The design rule this game settled on is that a bullet
// should not change course after launch, because a path that changes while you
// are reading it cannot be read. The one sanctioned exception is Delayed
// Theorem's: a change that happens somewhere you can see, by a rule you can
// learn. A pane is that exception made into a mechanic. The line is drawn on
// the screen, it does not move while bullets are crossing it, and every bullet
// that meets it does the same thing -- so where a bullet will bend, and which
// way, is visible from the moment it leaves the boss.

import { tint } from './sprites.js';

export const MAX_PANES = 2;

// The colours a dispersed bullet splits into, red to violet. Taken from the
// game's own palette so every fragment is a bullet colour players already know.
export const SPECTRUM = ['#ff4b3e', '#ff9330', '#ffd23f', '#a6ff4d', '#3fe0ff', '#5b7cff', '#a978ff'];

export class Pane {
  /**
   * @param {object} o
   *   x0,y0,x1,y1  endpoints. Bullets bend on crossing to the RIGHT-hand side
   *                walking from (x0,y0) to (x1,y1): left-to-right, downward.
   *   eta          n(before) / n(after) for a bullet crossing that way. Under 1
   *                bends toward the normal and is light entering glass; over 1
   *                bends away, and past the critical angle reflects -- light
   *                trying to leave it.
   *   slow         speed multiplier on crossing.
   *   disperse     { n, spread, speed?, r?, shape? } to split on crossing.
   *   color        the crystal's tint.
   *   crystal      'back' (default) if the glass is the side bullets cross
   *                into, 'front' if it is the side they come from. Only
   *                changes which side is drawn as crystal.
   *   swing        { amp, period, phase? } rock about the midpoint, radians.
   *   source       an {x, y} (the boss) whose escape cone to draw on the
   *                surface, for a pane with eta over 1: the stretch of it that
   *                light from there can get through.
   */
  constructor(o) {
    this.x0 = o.x0; this.y0 = o.y0; this.x1 = o.x1; this.y1 = o.y1;
    this.eta = o.eta === undefined ? 0.7 : o.eta;
    this.slow = o.slow === undefined ? 1 : o.slow;
    this.disperse = o.disperse || null;
    this.color = o.color || '#cfefff';
    this.front = o.crystal === 'front';
    this.swing = o.swing || null;
    this.source = o.source || null;
    this.grow = o.grow === undefined ? 45 : o.grow;
    this.age = 0;
    this.flash = 0;
    this.reveal = 0;
    // The pivot and rest angle, for a pane that rocks.
    this.cx = (o.x0 + o.x1) / 2; this.cy = (o.y0 + o.y1) / 2;
    this.half = Math.hypot(o.x1 - o.x0, o.y1 - o.y0) / 2;
    this.rest = Math.atan2(o.y1 - o.y0, o.x1 - o.x0);
    this.orient();
  }

  /** Recompute the unit normal after the endpoints move. */
  orient() {
    const dx = this.x1 - this.x0, dy = this.y1 - this.y0;
    const len = Math.hypot(dx, dy) || 1;
    this.dx = dx / len; this.dy = dy / len;
    // Normal toward the bending side: the direction rotated a quarter turn
    // clockwise on a y-down screen.
    this.nx = -this.dy; this.ny = this.dx;
    this.len = len;
  }

  /** Signed distance from the pane: negative on the near side. */
  side(x, y) {
    return (x - this.x0) * this.nx + (y - this.y0) * this.ny;
  }

  /**
   * Is (x, y) within the part of the pane that exists yet? A pane grows out
   * from its middle when it is raised, and it only bends light where it has
   * been drawn -- a bullet crossing a stretch still to come would bend at
   * nothing the player can see.
   */
  spans(x, y) {
    const t = (x - this.cx) * this.dx + (y - this.cy) * this.dy;
    return Math.abs(t) <= this.half * this.reveal + 2;
  }

  update() {
    this.age++;
    if (this.flash > 0) this.flash -= 0.04;
    const r = Math.min(1, this.age / Math.max(1, this.grow));
    this.reveal = 1 - (1 - r) * (1 - r);
    if (this.swing) {
      const s = this.swing;
      const a = this.rest + s.amp * Math.sin(this.age * Math.PI * 2 / s.period + (s.phase || 0));
      const c = Math.cos(a) * this.half, d = Math.sin(a) * this.half;
      this.x0 = this.cx - c; this.y0 = this.cy - d;
      this.x1 = this.cx + c; this.y1 = this.cy + d;
      this.orient();
    }
  }

  /**
   * Where on the surface light from `source` can get out: the two points at
   * the critical angle either side of the foot of the perpendicular. Null if
   * there is no such stretch, or no source.
   */
  window() {
    const S = this.source;
    if (!S || this.eta <= 1) return null;
    const h = -this.side(S.x, S.y);
    if (h <= 0) return null;
    const tc = Math.tan(Math.asin(1 / this.eta));
    const along = (S.x - this.cx) * this.dx + (S.y - this.cy) * this.dy;
    return { a: along - h * tc, b: along + h * tc };
  }

  draw(g, t) {
    const e = this.reveal;
    const mx = this.cx, my = this.cy;
    const hx = this.dx * this.half * e, hy = this.dy * this.half * e;
    const ax = mx - hx, ay = my - hy, bx = mx + hx, by = my + hy;
    // The crystal's side of the line.
    const cs = this.front ? -1 : 1;
    const nx = this.nx * cs, ny = this.ny * cs;

    g.save();
    // The crystal itself: a wash of colour on its side of the line, strongest
    // at the surface. Very faint -- this lies under bullets -- but enough
    // that which side of the pane you are on is never a question.
    const depth = 90;
    const gr = g.createLinearGradient(mx, my, mx + nx * depth, my + ny * depth);
    gr.addColorStop(0, tint(this.color, -0.2, 0.16 * e));
    gr.addColorStop(1, tint(this.color, -0.2, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(ax, ay); g.lineTo(bx, by);
    g.lineTo(bx + nx * depth, by + ny * depth); g.lineTo(ax + nx * depth, ay + ny * depth);
    g.closePath();
    g.fill();
    g.fillStyle = tint(this.color, -0.3, 0.035 * e);
    g.beginPath();
    g.moveTo(ax, ay); g.lineTo(bx, by);
    g.lineTo(bx + nx * 1400, by + ny * 1400); g.lineTo(ax + nx * 1400, ay + ny * 1400);
    g.closePath();
    g.fill();

    // Facets just inside the surface: a zigzag of cut lines, so the band reads
    // as crystal and not as a gradient.
    g.strokeStyle = tint(this.color, 0.1, 0.16 * e);
    g.lineWidth = 1;
    g.beginPath();
    const step = 34;
    const n = Math.floor(this.half * 2 * e / step);
    for (let i = 0; i <= n; i++) {
      const px = ax + this.dx * i * step, py = ay + this.dy * i * step;
      const d = i % 2 ? 22 : 9;
      if (i === 0) g.moveTo(px + nx * d, py + ny * d);
      else g.lineTo(px + nx * d, py + ny * d);
    }
    g.stroke();

    // The surface: a glowing line with a white core. It brightens briefly
    // whenever something crosses it, so the pane visibly does the bending.
    const glow = 0.5 + 0.25 * Math.sin(t * 0.05) + Math.max(0, this.flash);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = this.color;
    g.globalAlpha = 0.22 * e;
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.globalAlpha = Math.min(1, glow) * e;
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = '#ffffff';
    g.globalAlpha = 0.7 * e;
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();

    // The escape window, if this pane has one: the stretch where light from
    // the boss gets through, drawn as a brighter band with bright ends --
    // everything that meets the surface outside it is going to bounce.
    const w = this.window();
    if (w) {
      const lim = this.half * e;
      const wa = Math.max(-lim, w.a), wb = Math.min(lim, w.b);
      if (wb > wa) {
        const x0 = mx + this.dx * wa, y0 = my + this.dy * wa;
        const x1 = mx + this.dx * wb, y1 = my + this.dy * wb;
        g.strokeStyle = '#ffffff';
        g.globalAlpha = (0.16 + 0.06 * Math.sin(t * 0.09)) * e;
        g.lineWidth = 12;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.globalAlpha = 0.9 * e;
        g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.fillStyle = '#ffffff';
        for (const [qx, qy, lim2] of [[x0, y0, w.a], [x1, y1, w.b]]) {
          if (Math.abs(lim2) > lim) continue;
          g.globalAlpha = 0.85 * e;
          const s2 = 3.2;
          g.beginPath();
          g.moveTo(qx - this.nx * s2 * 2.6, qy - this.ny * s2 * 2.6);
          g.lineTo(qx + this.dx * s2, qy + this.dy * s2);
          g.lineTo(qx + this.nx * s2 * 2.6, qy + this.ny * s2 * 2.6);
          g.lineTo(qx - this.dx * s2, qy - this.dy * s2);
          g.closePath(); g.fill();
        }
      }
    }

    // Light running along the surface.
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const u = ((t * 0.004 + k / 3) % 1);
      const px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
      const s = 2.2 + Math.sin(t * 0.2 + k) * 0.8;
      g.globalAlpha = 0.8 * e;
      g.beginPath();
      g.moveTo(px - this.dx * s * 3, py - this.dy * s * 3);
      g.lineTo(px - this.nx * s * 0.5, py - this.ny * s * 0.5);
      g.lineTo(px + this.dx * s * 3, py + this.dy * s * 3);
      g.lineTo(px + this.nx * s * 0.5, py + this.ny * s * 0.5);
      g.closePath(); g.fill();
    }
    g.restore();
  }
}

/** Break every pane into falling glass, and clear the list. */
export function shatterPanes(game) {
  const panes = game.panes;
  for (let k = 0; k < panes.length; k++) {
    const p = panes[k];
    const e = p.reveal;
    const n = Math.max(2, Math.round(p.half * 2 * e / 26));
    for (let i = 0; i <= n; i++) {
      const u = (i / n - 0.5) * 2 * p.half * e;
      game.particles.shards(p.cx + p.dx * u, p.cy + p.dy * u, p.color, 'diamond', 1, 1.6, 40);
    }
  }
  panes.length = 0;
}

/**
 * Bend one bullet through `p` if it has just crossed into the crystal.
 * Returns 'pass', 'reflect' or 'split' (the caller removes a split parent).
 *
 * Snell's law in vector form, with d the unit heading and n the normal into
 * the crystal: cos(i) = d.n, sin^2(t) = eta^2 (1 - cos^2(i)); past 1 there is
 * no transmitted ray and the bullet reflects, d' = d - 2 cos(i) n. Otherwise
 * d' = eta d - (eta cos(i) - cos(t)) n.
 */
export function refract(b, p) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 1e-6) return 'pass';
  const dx = b.vx / sp, dy = b.vy / sp;
  const ci = dx * p.nx + dy * p.ny;
  if (ci <= 0) return 'pass';            // moving away from the crystal
  const eta = p.eta;
  const st2 = eta * eta * (1 - ci * ci);
  const s = p.side(b.x, b.y);
  if (st2 > 1) {
    // Total internal reflection: mirror the heading and put the bullet back
    // on the open side, exactly as far from the surface as it overshot.
    b.vx = (dx - 2 * ci * p.nx) * sp;
    b.vy = (dy - 2 * ci * p.ny) * sp;
    b.x -= p.nx * (2 * s + 0.1);
    b.y -= p.ny * (2 * s + 0.1);
    return 'reflect';
  }
  const ct = Math.sqrt(1 - st2);
  const k = eta * ci - ct;
  const tx = eta * dx - k * p.nx, ty = eta * dy - k * p.ny;
  const ns = sp * p.slow;
  b.vx = tx * ns;
  b.vy = ty * ns;
  p.flash = 0.35;
  return p.disperse ? 'split' : 'pass';
}
