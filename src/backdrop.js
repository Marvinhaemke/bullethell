// The inside of a geode: dark stone, crystal walls growing in from the edges,
// a faint lattice, and dust catching the light.
//
// Everything here sits BEHIND a bullet curtain, so the one rule is contrast.
// The brightest thing in the backdrop is far darker than the dimmest bullet,
// the crystal walls keep to the edges of the field so the middle -- where the
// patterns are densest -- has nothing behind it but the lattice, and nothing
// moves fast enough to be mistaken for a threat out of the corner of an eye.
//
// Three layers, cheapest possible:
//   static   gradient, a pool of light from where the boss sits, a vignette.
//            One cached canvas per rectangle; never redrawn.
//   walls    the crystal formations, one tall cached tile that scrolls down
//            slowly and wraps. Two drawImage calls a frame.
//   live     the lattice lines and the dust, drawn fresh each frame, because
//            they are cheap and they are what makes the stone feel alive.

import { TAU } from './mathx.js';

const HUES = [
  [150, 110, 255],   // amethyst
  [70, 200, 255],    // aquamarine
  [255, 90, 200],    // tourmaline
  [60, 230, 200],    // tanzanite-teal
];

function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasOf(w, h, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * dpr));
  cv.height = Math.max(1, Math.ceil(h * dpr));
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  return { cv, g };
}

/**
 * One crystal prism in profile: a hexagonal column rooted at (x, y), growing
 * along `ang`, `len` long and `wid` across, with a pointed termination. Split
 * down its long axis into a lit face and a shadowed one, which is all it takes
 * to read as a solid.
 */
function prism(g, x, y, ang, len, wid, hue, glow) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const nx = -sa, ny = ca;
  const tip = len, shoulder = len - wid * 0.9;
  const P = (along, across) => [x + ca * along + nx * across, y + sa * along + ny * across];
  const b1 = P(-6, -wid / 2), b2 = P(-6, wid / 2);
  const s1 = P(shoulder, -wid / 2), s2 = P(shoulder, wid / 2);
  const t = P(tip, 0);
  const m0 = P(-6, 0), m1 = P(shoulder, 0);

  // Lit half and dark half, both very dim: these are walls, not threats.
  g.beginPath();
  g.moveTo(...b1); g.lineTo(...s1); g.lineTo(...t); g.lineTo(...m1); g.lineTo(...m0);
  g.closePath();
  g.fillStyle = rgba(hue.map((v) => v * 0.12), 0.9);
  g.fill();
  g.beginPath();
  g.moveTo(...m0); g.lineTo(...m1); g.lineTo(...t); g.lineTo(...s2); g.lineTo(...b2);
  g.closePath();
  g.fillStyle = rgba(hue.map((v) => v * 0.06), 0.92);
  g.fill();

  // Edges catch a little light; the ridge a little more.
  g.lineJoin = 'round';
  g.strokeStyle = rgba(hue, 0.10 + glow * 0.07);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(...b1); g.lineTo(...s1); g.lineTo(...t); g.lineTo(...s2); g.lineTo(...b2);
  g.stroke();
  g.strokeStyle = rgba(hue, 0.15 + glow * 0.08);
  g.beginPath();
  g.moveTo(...m0); g.lineTo(...m1); g.lineTo(...t);
  g.stroke();
}

function wallReach(w) { return Math.min(170, w * 0.24); }

/**
 * The scrolling wall tile. Clusters of prisms root on the left and right
 * edges and lean inward; each is drawn at y, y-h and y+h so the tile wraps
 * without a seam however it is scrolled.
 */
function buildWalls(w, h, dpr, seed) {
  const { cv, g } = canvasOf(w, h, dpr);
  const rnd = mulberry(seed);
  // The walls may reach at most this far in from each side -- the middle of
  // the field is where the patterns live and it stays clear.
  const reach = wallReach(w);
  for (const side of [0, 1]) {
    let y = rnd() * 60;
    while (y < h) {
      const hue = HUES[(rnd() * HUES.length) | 0];
      const count = 2 + ((rnd() * 3) | 0);
      for (let k = 0; k < count; k++) {
        const len = 40 + rnd() * (reach - 40);
        const wid = 12 + rnd() * 22;
        const lean = (rnd() - 0.5) * 1.1;
        const ang = side === 0 ? lean : Math.PI - lean;
        const x = side === 0 ? -4 : w + 4;
        const yy = y + (rnd() - 0.5) * 40;
        const glow = rnd();
        for (const dy of [-h, 0, h]) prism(g, x, yy + dy, ang, len, wid, hue, glow);
      }
      y += 70 + rnd() * 90;
    }
  }
  return cv;
}

/** Gradient, a pool of light where the boss hangs, and a vignette. Static. */
function buildBase(w, h, dpr) {
  const { cv, g } = canvasOf(w, h, dpr);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a0720');
  bg.addColorStop(0.45, '#06051a');
  bg.addColorStop(1, '#030210');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  // Light spilling down from above, as if the geode were cracked open at the
  // top. It also happens to sit behind the boss, which frames it.
  const pool = g.createRadialGradient(w / 2, h * 0.16, 10, w / 2, h * 0.16, Math.max(w, h) * 0.62);
  pool.addColorStop(0, 'rgba(120,90,255,0.16)');
  pool.addColorStop(0.4, 'rgba(70,60,180,0.06)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, w, h);

  const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  return cv;
}

function makeDust(n, seed) {
  const rnd = mulberry(seed);
  const dust = [];
  for (let i = 0; i < n; i++) {
    dust.push({
      x: rnd(), y: rnd(),
      sp: 0.1 + rnd() * 0.42,
      r: rnd() < 0.82 ? 1 : 1.8,
      a: 0.1 + rnd() * 0.28,
      ph: rnd() * TAU,
      tw: 0.02 + rnd() * 0.05,
      hue: HUES[(rnd() * HUES.length) | 0],
    });
  }
  return dust;
}

export class Backdrop {
  constructor() {
    this.cache = new Map();
    this.dpr = 0;
    this.dust = makeDust(110, 7);
  }

  layers(R, dpr) {
    if (dpr !== this.dpr) { this.cache.clear(); this.dpr = dpr; }
    const key = R.w + 'x' + R.h;
    let L = this.cache.get(key);
    if (!L) {
      L = {
        base: buildBase(R.w, R.h, dpr),
        walls: buildWalls(R.w, R.h, dpr, 1234 + R.w),
        // How far in from each side the walls can reach: the tile is empty
        // between the two strips, so only the strips are ever blitted.
        strip: Math.min(R.w / 2, Math.ceil(wallReach(R.w) + 30)),
      };
      this.cache.set(key, L);
    }
    return L;
  }

  draw(g, t, R, dpr = 1) {
    const L = this.layers(R, dpr);
    const right = R.x + R.w, bottom = R.y + R.h;
    g.save();
    g.beginPath();
    g.rect(R.x, R.y, R.w, R.h);
    g.clip();

    g.drawImage(L.base, R.x, R.y, R.w, R.h);

    // The lattice: three families of lines sixty degrees apart -- the unit
    // cell of a crystal, drifting at the old grid's speed so the field still
    // reads as moving. Faint enough to vanish under anything that matters.
    //
    // A true triangular lattice: every slanted line passes through the points
    // where the horizontals cross each other's slants. Its vertical period is
    // two rows, not one -- one row down, the slanted lines land half a cell
    // over -- so the drift wraps at two rows and the scroll never seams.
    const a = 64;                         // triangle side
    const row = a * 0.8660254;            // horizontal line spacing
    const per = row * 2;
    const y0 = R.y - per + (t * 0.35) % per;
    const cot = 0.57735;                  // dx per dy along a 60-degree line
    const fall = R.h + per * 2;
    const span = fall * cot;
    g.strokeStyle = 'rgba(110,100,220,0.065)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = y0; y < bottom + row; y += row) {
      g.moveTo(R.x, y + 0.5); g.lineTo(right, y + 0.5);
    }
    for (let x = R.x - span - a; x <= right + span + a; x += a) {
      g.moveTo(x, y0); g.lineTo(x + span, y0 + fall);
      g.moveTo(x, y0); g.lineTo(x - span, y0 + fall);
    }
    g.stroke();

    // Crystal walls, scrolling a touch slower than the lattice for depth.
    // Drawn as the two edge strips they live in, each in the two pieces the
    // wrap splits it into; the empty middle of the tile is never copied.
    // The tile moves DOWN by `off`: the top `off` rows of the screen show the
    // bottom of the tile, and the rest shows the tile from its top.
    const off = (t * 0.22) % R.h;
    const sw = L.strip, k = L.walls.width / R.w;
    const rest = R.h - off;
    for (const sx of [0, R.w - sw]) {
      if (off > 0) {
        g.drawImage(L.walls, sx * k, rest * k, sw * k, off * k, R.x + sx, R.y, sw, off);
      }
      if (rest > 0) {
        g.drawImage(L.walls, sx * k, 0, sw * k, rest * k, R.x + sx, R.y + off, sw, rest);
      }
    }

    // Dust. Each mote drifts down and twinkles on its own clock; a few of the
    // larger ones flare into a tiny cross at the top of their twinkle.
    for (let i = 0; i < this.dust.length; i++) {
      const m = this.dust[i];
      const x = R.x + m.x * R.w;
      const y = R.y + ((m.y * R.h + t * m.sp) % R.h);
      const tw = 0.5 + 0.5 * Math.sin(t * m.tw + m.ph);
      const a = m.a * (0.35 + 0.65 * tw);
      g.fillStyle = rgba(m.hue.map((v) => 150 + v * 0.4), a);
      g.fillRect(x, y, m.r, m.r);
      if (m.r > 1 && tw > 0.86) {
        g.fillStyle = rgba([235, 230, 255], a * 0.7);
        g.fillRect(x - 2, y + 0.4, 5.8, 1);
        g.fillRect(x + 0.4, y - 2, 1, 5.8);
      }
    }
    g.restore();
  }
}
