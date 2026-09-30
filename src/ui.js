// Canvas UI primitives and a small keyboard-driven menu system.

import { TAU, clamp } from './mathx.js';
import { C } from './config.js';
import { gemSprite, blit } from './sprites.js';

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

/** A chamfered outline -- the cut-glass corner every panel and bar shares. */
export function chamfer(g, x, y, w, h, c) {
  const k = Math.min(c, w / 2, h / 2);
  g.moveTo(x + k, y);
  g.lineTo(x + w - k, y);
  g.lineTo(x + w, y + k);
  g.lineTo(x + w, y + h - k);
  g.lineTo(x + w - k, y + h);
  g.lineTo(x + k, y + h);
  g.lineTo(x, y + h - k);
  g.lineTo(x, y + k);
  g.closePath();
}

/**
 * A pane of cut glass: chamfered corners, a faint violet body darkening
 * downward, and a lit bevel along the top edge where the light from above
 * catches it. The fill stays dark and mostly opaque on purpose -- every panel
 * has text on it, and a HUD you have to squint at is not an improvement.
 */
export function panel(g, x, y, w, h, o = {}) {
  const c = o.radius === undefined ? 7 : o.radius + 3;
  if (o.fill) {
    g.fillStyle = o.fill;
  } else {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(24,18,54,0.88)');
    gr.addColorStop(1, 'rgba(8,7,22,0.88)');
    g.fillStyle = gr;
  }
  g.beginPath();
  chamfer(g, x, y, w, h, c);
  g.fill();
  if (o.stroke !== null) {
    g.strokeStyle = o.stroke || 'rgba(128,108,230,0.30)';
    g.lineWidth = o.lineWidth || 1;
    g.stroke();
    // The lit bevel.
    g.strokeStyle = 'rgba(210,200,255,0.20)';
    g.beginPath();
    g.moveTo(x + c + 0.5, y + 0.5);
    g.lineTo(x + w - c - 0.5, y + 0.5);
    g.stroke();
  }
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

/** A crystal bar: lit along its top, darker beneath, with a bright leading edge. */
export function bar(g, x, y, w, h, frac, color, bg = '#110d26') {
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) {
    g.fillStyle = color;
    g.fillRect(x, y, fw, h);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(x, y, fw, Math.max(1, h * 0.34));
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x, y + h * 0.66, fw, h * 0.34);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(x + fw - 1, y, 1, h);
  }
  g.strokeStyle = 'rgba(210,200,255,0.16)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Segmented meter used for lives and bombs: a row of stones, spent ones hollow. */
export function pips(g, x, y, count, max, color, shape = 'square', size = 6, gap = 11) {
  const cut = shape === 'tri' ? 'tri' : shape === 'circle' ? 'circle' : 'square';
  const r = size * 0.62;
  const full = gemSprite(cut, color, r, { glow: 5 });
  for (let i = 0; i < max; i++) {
    const cx = x + i * gap;
    if (i < count) {
      blit(g, full, cx, y, cut === 'tri' ? -Math.PI / 2 : 0);
    } else {
      g.save();
      g.translate(cx, y);
      if (cut === 'tri') g.rotate(-Math.PI / 2);
      g.beginPath();
      if (cut === 'circle') g.arc(0, 0, r, 0, TAU);
      else if (cut === 'tri') {
        for (let k = 0; k < 3; k++) {
          const a = k * TAU / 3;
          if (k === 0) g.moveTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
          else g.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
        }
        g.closePath();
      } else g.rect(-r * 0.84, -r * 0.84, r * 1.68, r * 1.68);
      g.strokeStyle = '#322a58';
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }
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
        // A cut-glass bar that fades out to the right, and a stone to mark
        // the row -- the crystal version of the old highlight and caret.
        const glow = 0.16 + 0.06 * Math.sin(this.t * 0.09);
        const gr = g.createLinearGradient(x - 14, 0, x + w + 14, 0);
        gr.addColorStop(0, `rgba(120,110,255,${glow + 0.08})`);
        gr.addColorStop(0.7, `rgba(90,150,255,${glow * 0.6})`);
        gr.addColorStop(1, 'rgba(90,150,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        chamfer(g, x - 14, cy - size - 6, w + 28, size + 18, 6);
        g.fill();
        g.fillStyle = `rgba(220,215,255,${0.22 + glow * 0.4})`;
        g.fillRect(x - 8, cy - size - 6, w * 0.6, 1);
        const bob = Math.sin(this.t * 0.12) * 1.2;
        blit(g, gemSprite('diamond', C.cyan, 5, { glow: 7 }), x - 20 + bob, cy - size * 0.3, this.t * 0.03);
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
