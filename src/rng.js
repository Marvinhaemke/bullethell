// Seeded PRNG (mulberry32). Patterns draw from a per-phase seed so a given
// boss/phase/difficulty combination plays back identically every attempt.

export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 0x9e3779b9; }

  r() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  rr(a, b) { return a + (b - a) * this.r(); }
  ri(a, b) { return Math.floor(this.rr(a, b + 1)); }
  pick(list) { return list[Math.floor(this.r() * list.length)]; }
  sign() { return this.r() < 0.5 ? -1 : 1; }
}
