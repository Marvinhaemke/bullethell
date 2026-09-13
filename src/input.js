// Keyboard state with per-frame edge detection.

const BINDINGS = {
  left:    ['ArrowLeft', 'KeyA'],
  right:   ['ArrowRight', 'KeyD'],
  up:      ['ArrowUp', 'KeyW'],
  down:    ['ArrowDown', 'KeyS'],
  // Space bombs rather than fires. With autofire on by default the fire key is
  // barely touched, while a bomb is the one thing you reach for in a panic --
  // so the biggest key on the keyboard belongs to it.
  shoot:   ['KeyZ'],
  bomb:    ['KeyX', 'Space'],
  focus:   ['ShiftLeft', 'ShiftRight'],
  confirm: ['KeyZ', 'Enter', 'NumpadEnter', 'Space'],
  cancel:  ['KeyX', 'Backspace'],
  pause:   ['Escape', 'KeyP'],
  restart: ['KeyR'],
  mute:    ['KeyM'],
};

const SWALLOW = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Tab', 'Backspace',
]);

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.edge = new Set();
    this.anyEdge = false;
    this.repeat = Object.create(null);

    target.addEventListener('keydown', (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.edge.add(e.code);
      this.anyEdge = true;
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    // Losing focus mid-run should not leave a key stuck on.
    window.addEventListener('blur', () => { this.down.clear(); this.edge.clear(); });
  }

  held(action) {
    const codes = BINDINGS[action];
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true;
    return false;
  }

  pressed(action) {
    const codes = BINDINGS[action];
    for (let i = 0; i < codes.length; i++) if (this.edge.has(codes[i])) return true;
    return false;
  }

  /** Held with keyboard-style auto-repeat -- used for menu navigation. */
  repeated(action, delay = 26, rate = 5) {
    if (this.pressed(action)) { this.repeat[action] = -delay; return true; }
    if (!this.held(action)) { this.repeat[action] = 0; return false; }
    this.repeat[action] = (this.repeat[action] || 0) + 1;
    if (this.repeat[action] >= rate) { this.repeat[action] = 0; return true; }
    return false;
  }

  endFrame() {
    this.edge.clear();
    this.anyEdge = false;
  }
}
