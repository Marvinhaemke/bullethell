// Sweeping beam hazards: telegraphed, then lethal, then fading.

import { TAU, segDistSq } from './mathx.js';
import { PLAY } from './config.js';

export class Laser {
  constructor(opts) {
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.angle = opts.angle || 0;
    this.spin = opts.spin || 0;
    this.warn = opts.warn === undefined ? 55 : opts.warn;
    this.fire = opts.fire === undefined ? 90 : opts.fire;
    this.fade = opts.fade === undefined ? 18 : opts.fade;
    this.width = opts.width === undefined ? 14 : opts.width;
    this.len = opts.len === undefined ? 1300 : opts.len;
    this.color = opts.color || '#ff4b3e';
    this.follow = opts.follow || null;   // entity whose position the beam tracks
    this.age = 0;
    this.alive = true;
  }

  get state() {
    if (this.age < this.warn) return 'warn';
    if (this.age < this.warn + this.fire) return 'fire';
    return 'fade';
  }

  update() {
    this.age++;
    if (this.follow) { this.x = this.follow.x; this.y = this.follow.y; }
    if (this.state !== 'warn') this.angle += this.spin;
    if (this.age >= this.warn + this.fire + this.fade) this.alive = false;
  }

  /** Half-width of the lethal core, ramping in as the beam opens. */
  hitWidth() {
    if (this.state !== 'fire') return 0;
    const t = Math.min(1, (this.age - this.warn) / 6);
    return this.width * 0.5 * t;
  }

  hits(px, py, pr) {
    const hw = this.hitWidth();
    if (hw <= 0) return false;
    const ex = this.x + Math.cos(this.angle) * this.len;
    const ey = this.y + Math.sin(this.angle) * this.len;
    const reach = hw + pr;
    return segDistSq(px, py, this.x, this.y, ex, ey) < reach * reach;
  }

  draw(g) {
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    const ex = this.x + ca * this.len;
    const ey = this.y + sa * this.len;
    const st = this.state;

    g.save();
    if (st === 'warn') {
      // The warning is a line of small diamond glints marching outward along
      // the beam's path, brightening as the beam gets close to firing -- the
      // crystal version of the old dashed line, and doing the same job: this
      // is exactly where it will be.
      const t = this.age / this.warn;
      const pulse = 0.28 + 0.32 * Math.abs(Math.sin(this.age * 0.35));
      g.globalAlpha = pulse;
      g.strokeStyle = this.color;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(ex, ey); g.stroke();
      g.fillStyle = this.color;
      const step = 22, sz = 1.6 + t * 2.2;
      const nx = -sa, ny = ca;
      for (let d = (this.age * 2) % step; d < this.len; d += step) {
        const px = this.x + ca * d, py = this.y + sa * d;
        g.beginPath();
        g.moveTo(px + ca * sz * 1.6, py + sa * sz * 1.6);
        g.lineTo(px + nx * sz, py + ny * sz);
        g.lineTo(px - ca * sz * 1.6, py - sa * sz * 1.6);
        g.lineTo(px - nx * sz, py - ny * sz);
        g.closePath();
        g.fill();
      }
    } else {
      const t = st === 'fire'
        ? Math.min(1, (this.age - this.warn) / 6)
        : 1 - (this.age - this.warn - this.fire) / this.fade;
      const w = this.width * Math.max(0, t);
      const nx = -sa, ny = ca;
      const line = (off, width) => {
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(this.x + nx * off, this.y + ny * off);
        g.lineTo(ex + nx * off, ey + ny * off);
        g.stroke();
      };
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = this.color;
      g.globalAlpha = 0.26;
      line(0, w * 2.2);
      g.globalAlpha = 0.85;
      line(0, w);
      // Dispersion: a cyan fringe along one edge and a violet one along the
      // other, which is what a beam through a prism does to its edges. Thin
      // and inside the glow, so the lethal width still reads from the core.
      g.globalAlpha = 0.55 * t;
      g.strokeStyle = '#3fe0ff';
      line(w * 0.55, Math.max(1, w * 0.16));
      g.strokeStyle = '#c070ff';
      line(-w * 0.55, Math.max(1, w * 0.16));
      g.globalAlpha = 1;
      g.strokeStyle = '#ffffff';
      line(0, Math.max(1, w * 0.34));
      // Muzzle: a flare of light where the beam leaves the emitter. Kept
      // modest because beams usually leave the boss in threes and fours, and
      // additive flares stack -- at full strength they swallowed the boss.
      g.fillStyle = this.color;
      g.globalAlpha = 0.28;
      g.beginPath(); g.arc(this.x, this.y, w * 1.1, 0, TAU); g.fill();
      g.globalAlpha = 0.45;
      g.fillStyle = '#ffffff';
      const f = w * 1.1;
      g.beginPath();
      g.moveTo(this.x - f, this.y); g.lineTo(this.x, this.y - f * 0.18);
      g.lineTo(this.x + f, this.y); g.lineTo(this.x, this.y + f * 0.18);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(this.x, this.y - f); g.lineTo(this.x + f * 0.18, this.y);
      g.lineTo(this.x, this.y + f); g.lineTo(this.x - f * 0.18, this.y);
      g.closePath(); g.fill();
    }
    g.restore();
  }
}

export function clipToPlayfield(g) {
  g.beginPath();
  g.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  g.clip();
}
