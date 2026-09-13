// Canvas UI primitives and a small keyboard-driven menu system.

import { TAU, clamp } from './mathx.js';
import { C } from './config.js';

const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';

export function text(g, str, x, y, o = {}) {
  const size = o.size || 13;
  const weight = o.weight || 400;
  g.font = `${weight} ${size}px ${o.font || MONO}`;
  g.textAlign = o.align || 'left';
  g.textBaseline = o.baseline || 'alphabetic';
  if (o.track) {
    // Manual letter-spacing: canvas has no reliable tracking across browsers.
    const chars = String(str).split('');
    const widths = chars.map((c) => g.measureText(c).width + o.track);
    const total = widths.reduce((a, b) => a + b, 0) - o.track;
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    g.textAlign = 'left';
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.glowSize || 12; }
    g.fillStyle = o.color || C.white;
    for (let i = 0; i < chars.length; i++) {
      g.fillText(chars[i], cx, y);
      cx += widths[i];
    }
    g.shadowBlur = 0;
    return total;
  }
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.glowSize || 12; }
  g.fillStyle = o.color || C.white;
  g.fillText(str, x, y);
  g.shadowBlur = 0;
  return g.measureText(str).width;
}

export function panel(g, x, y, w, h, o = {}) {
  g.fillStyle = o.fill || 'rgba(8,11,20,0.82)';
  g.strokeStyle = o.stroke || '#1e2740';
  g.lineWidth = o.lineWidth || 1;
  g.beginPath();
  const r = o.radius === undefined ? 4 : o.radius;
  roundRect(g, x, y, w, h, r);
  g.fill();
  if (o.stroke !== null) g.stroke();
}

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function bar(g, x, y, w, h, frac, color, bg = '#131a2b') {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  g.fillStyle = color;
  g.fillRect(x, y, fw, h);
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Segmented meter used for lives and bombs. */
export function pips(g, x, y, count, max, color, shape = 'square', size = 6, gap = 11) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * gap;
    g.beginPath();
    if (shape === 'tri') {
      g.moveTo(cx, y - size * 0.7);
      g.lineTo(cx + size * 0.7, y + size * 0.6);
      g.lineTo(cx - size * 0.7, y + size * 0.6);
      g.closePath();
    } else if (shape === 'circle') {
      g.arc(cx, y, size * 0.55, 0, TAU);
    } else {
      g.rect(cx - size * 0.5, y - size * 0.5, size, size);
    }
    if (i < count) { g.fillStyle = color; g.fill(); }
    else { g.strokeStyle = '#2b3650'; g.lineWidth = 1; g.stroke(); }
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export class Menu {
  /**
   * @param {Array} items - { label, value?(), change?(dir), action?(), hint?, disabled?() }
   */
  constructor(items, opts = {}) {
    this.items = items;
    this.index = 0;
    this.onCancel = opts.onCancel || null;
    this.t = 0;
  }

  get current() { return this.items[this.index]; }

  move(dir, sfx) {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      this.index = (this.index + dir + n) % n;
      if (!this.items[this.index].separator) break;
    }
    if (sfx) sfx.play('move');
  }

  update(input, sfx) {
    this.t++;
    if (input.repeated('up')) this.move(-1, sfx);
    if (input.repeated('down')) this.move(1, sfx);

    const it = this.current;
    if (it && it.change) {
      if (input.repeated('left')) { it.change(-1); sfx.play('select'); }
      if (input.repeated('right')) { it.change(1); sfx.play('select'); }
    }
    if (input.pressed('confirm')) {
      if (it && it.action) { sfx.play('select'); it.action(); return true; }
      if (it && it.change) { it.change(1); sfx.play('select'); }
    }
    if (input.pressed('cancel') || input.pressed('pause')) {
      if (this.onCancel) { sfx.play('back'); this.onCancel(); return true; }
    }
    return false;
  }

  /** Draws the menu and returns the y it ended at, so callers can lay out below it. */
  draw(g, x, y, opts = {}) {
    const lh = opts.lineHeight || 34;
    const w = opts.width || 420;
    const size = opts.size || 16;
    let cy = y;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.separator) { cy += lh * 0.45; continue; }

      const active = i === this.index;
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const value = it.value ? it.value() : null;
      const dim = it.disabled && it.disabled();

      if (active) {
        const glow = 0.10 + 0.05 * Math.sin(this.t * 0.09);
        g.fillStyle = `rgba(90,160,255,${glow})`;
        g.beginPath();
        roundRect(g, x - 14, cy - size - 6, w + 28, size + 18, 3);
        g.fill();
        g.fillStyle = C.cyan;
        g.beginPath();
        g.moveTo(x - 22, cy - size * 0.55);
        g.lineTo(x - 22, cy + size * 0.35);
        g.lineTo(x - 13, cy - size * 0.1);
        g.closePath();
        g.fill();
      }

      const col = dim ? '#4b5573' : active ? C.white : '#93a2c4';
      text(g, label, x, cy, { size, color: col, weight: active ? 700 : 400, track: 1 });

      if (value !== null) {
        const vcol = it.valueColor ? it.valueColor() : (active ? C.cyan : '#7d8db3');
        if (it.change) {
          text(g, '‹', x + w - 118, cy, { size, color: active ? C.cyan : '#3d4a6b' });
          text(g, '›', x + w, cy, { size, color: active ? C.cyan : '#3d4a6b' });
        }
        text(g, value, x + w - 58, cy, { size, color: vcol, align: 'center', weight: 700, track: 1 });
      }
      cy += lh;
    }

    const it = this.current;
    if (it && it.hint) {
      const hint = typeof it.hint === 'function' ? it.hint() : it.hint;
      text(g, hint, x + w / 2, cy + 18, { size: 11, color: '#66739a', align: 'center', track: 0.6 });
    }
    return cy;
  }
}

export function fadeRect(g, x, y, w, h, alpha) {
  g.fillStyle = `rgba(0,0,0,${clamp(alpha, 0, 1)})`;
  g.fillRect(x, y, w, h);
}
