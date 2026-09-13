// Pooled cosmetic effects: sparks, expanding rings, drifting shards, score pops.

import { TAU } from './mathx.js';
import { shapePath } from './sprites.js';

class Particle {
  constructor() { this.init(); }
  init() {
    this.kind = 'spark';
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.age = 0; this.life = 30;
    this.size = 2; this.grow = 0;
    this.rot = 0; this.spin = 0;
    this.drag = 0.92;
    this.color = '#ffffff';
    this.shape = 'circle';
    this.text = '';
    this.alpha = 1;
    this.width = 2;
  }
}

export class Particles {
  constructor(max = 1400) {
    this.max = max;
    this.a = [];
    this.n = 0;
  }

  spawn() {
    if (this.n >= this.max) this.n = this.max - 1;
    let p = this.a[this.n];
    if (!p) { p = new Particle(); this.a[this.n] = p; }
    this.n++;
    p.init();
    return p;
  }

  clear() { this.n = 0; }

  spark(x, y, color, count = 6, speed = 3, life = 26) {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      const a = Math.random() * TAU, s = speed * (0.4 + Math.random() * 0.8);
      p.kind = 'spark';
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = life * (0.6 + Math.random() * 0.7);
      p.size = 1.4 + Math.random() * 1.8;
      p.color = color;
    }
  }

  shards(x, y, color, shape, count = 5, speed = 2.4, life = 34) {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random());
      p.kind = 'shard';
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.size = 2 + Math.random() * 3.5;
      p.rot = Math.random() * TAU;
      p.spin = (Math.random() - 0.5) * 0.3;
      p.color = color;
      p.shape = shape;
      p.drag = 0.95;
    }
  }

  ring(x, y, color, size = 10, grow = 4, life = 26, width = 3) {
    const p = this.spawn();
    p.kind = 'ring';
    p.x = x; p.y = y;
    p.size = size; p.grow = grow;
    p.life = life;
    p.color = color;
    p.width = width;
  }

  pop(x, y, text, color = '#cfefff', life = 46) {
    const p = this.spawn();
    p.kind = 'text';
    p.x = x; p.y = y;
    p.vy = -0.7;
    p.life = life;
    p.color = color;
    p.text = text;
  }

  dot(x, y, color, size, life) {
    const p = this.spawn();
    p.kind = 'spark';
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.size = size; p.life = life;
    p.color = color;
    p.drag = 1;
  }

  update() {
    for (let i = 0; i < this.n; i++) {
      const p = this.a[i];
      p.age++;
      p.x += p.vx; p.y += p.vy;
      if (p.kind !== 'text') { p.vx *= p.drag; p.vy *= p.drag; }
      if (p.kind === 'ring') p.size += p.grow;
      if (p.kind === 'shard') p.rot += p.spin;
      if (p.kind === 'text') p.vy *= 0.94;
      if (p.age >= p.life) {
        this.a[i] = this.a[this.n - 1];
        this.a[this.n - 1] = p;
        this.n--; i--;
      }
    }
  }

  draw(g) {
    for (let i = 0; i < this.n; i++) {
      const p = this.a[i];
      const t = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, t);
      switch (p.kind) {
        case 'ring':
          g.strokeStyle = p.color;
          g.lineWidth = p.width * t;
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, TAU);
          g.stroke();
          break;
        case 'shard':
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          shapePath(g, p.shape, p.size * t);
          g.fill();
          g.restore();
          break;
        case 'text':
          g.fillStyle = p.color;
          g.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(p.text, p.x, p.y);
          break;
        default:
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, p.y, p.size * t, 0, TAU);
          g.fill();
          break;
      }
    }
    g.globalAlpha = 1;
  }
}
