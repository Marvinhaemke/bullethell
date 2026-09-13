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
    const ex = this.x + Math.cos(this.angle) * this.len;
    const ey = this.y + Math.sin(this.angle) * this.len;
    const st = this.state;

    g.save();
    if (st === 'warn') {
      const t = this.age / this.warn;
      g.globalAlpha = 0.28 + 0.32 * Math.abs(Math.sin(this.age * 0.35));
      g.strokeStyle = this.color;
      g.lineWidth = 1 + t * 2;
      g.setLineDash([12, 10]);
      g.lineDashOffset = -this.age * 2;
      g.beginPath();
      g.moveTo(this.x, this.y);
      g.lineTo(ex, ey);
      g.stroke();
      g.setLineDash([]);
    } else {
      const t = st === 'fire'
        ? Math.min(1, (this.age - this.warn) / 6)
        : 1 - (this.age - this.warn - this.fire) / this.fade;
      const w = this.width * Math.max(0, t);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = this.color;
      g.globalAlpha = 0.28;
      g.lineWidth = w * 2.1;
      g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(ex, ey); g.stroke();
      g.globalAlpha = 0.85;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(ex, ey); g.stroke();
      g.globalAlpha = 1;
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1, w * 0.34);
      g.beginPath(); g.moveTo(this.x, this.y); g.lineTo(ex, ey); g.stroke();
      // Muzzle flare.
      g.fillStyle = this.color;
      g.globalAlpha = 0.5;
      g.beginPath(); g.arc(this.x, this.y, w * 1.2, 0, TAU); g.fill();
    }
    g.restore();
  }
}

export function clipToPlayfield(g) {
  g.beginPath();
  g.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  g.clip();
}
