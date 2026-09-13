// Player ship: movement, focus mode, forward shots, bombs, death handling.

import { TAU, PI, clamp } from './mathx.js';
import { PLAY, C } from './config.js';
import { drawShape } from './sprites.js';

const SPEED_FREE = 4.55;
const SPEED_FOCUS = 1.85;

/** The autopilot plans against these, so they must be the real values. */
export const PLAYER_SPEED = { free: SPEED_FREE, focus: SPEED_FOCUS };
const FIRE_INTERVAL = 3;
const HIT_RADIUS = 2.7;

// How hard an unfocused shot steers, in radians per frame. It has to be sharp:
// a homing shot turns through a circle of radius speed/turn, and if that is
// wider than the boss's hitbox an overshooting shot orbits forever without
// ever touching it. At 16.5px/frame this keeps the turn circle near 30px,
// inside the ~32px boss radius, so shots that miss come back round and land.
const HOMING_TURN = 0.55;
// A homing shot that misses would otherwise circle forever.
const SHOT_LIFE = 220;

class Shot {
  constructor() { this.init(); }
  init() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.dmg = 10; this.r = 3.5; this.len = 12;
    this.color = C.ice;
    this.homing = 0;
    this.age = 0;
    this.alive = true;
  }
}

export class Player {
  constructor(game) {
    this.game = game;
    this.shots = [];
    this.shotN = 0;
    this.reset(true);
  }

  reset(full = false) {
    this.x = PLAY.cx;
    this.y = PLAY.bottom - 104;
    this.vx = 0; this.vy = 0;
    this.focus = false;
    this.hitR = HIT_RADIUS;
    this.alive = true;
    this.invuln = 110;
    this.fireCd = 0;
    this.deathAnim = 0;
    this.bombAnim = 0;
    this.pulse = 0;
    if (full) { this.shotN = 0; }
  }

  spawnShot() {
    let s = this.shots[this.shotN];
    if (!s) { s = new Shot(); this.shots[this.shotN] = s; }
    this.shotN++;
    s.init();
    return s;
  }

  update(input) {
    const g = this.game;
    this.pulse++;

    if (this.deathAnim > 0) {
      this.deathAnim--;
      if (this.deathAnim === 0) g.respawnPlayer();
      this.updateShots();
      return;
    }

    this.focus = input.held('focus');
    const speed = this.focus ? SPEED_FOCUS : SPEED_FREE;

    let dx = 0, dy = 0;
    if (input.held('left')) dx -= 1;
    if (input.held('right')) dx += 1;
    if (input.held('up')) dy -= 1;
    if (input.held('down')) dy += 1;
    if (dx && dy) { const k = Math.SQRT1_2; dx *= k; dy *= k; }

    this.x = clamp(this.x + dx * speed, PLAY.x + 10, PLAY.right - 10);
    this.y = clamp(this.y + dy * speed, PLAY.y + 10, PLAY.bottom - 10);
    this.vx = dx * speed; this.vy = dy * speed;

    if (this.invuln > 0) this.invuln--;
    if (this.bombAnim > 0) this.bombAnim--;

    if (this.fireCd > 0) this.fireCd--;
    const wantsFire = g.settings.autofire || input.held('shoot');
    if (wantsFire && this.fireCd === 0 && g.state === 'fight') {
      this.fire();
      this.fireCd = FIRE_INTERVAL;
    }

    if (input.pressed('bomb')) g.useBomb();

    this.updateShots();
  }

  /**
   * The two stances trade damage against attention. Unfocused shots steer
   * themselves to the boss, so you can give the screen your whole attention
   * and still make steady progress. Focused shots fly straight and hit far
   * harder, but you have to stand where the boss is and stay there.
   */
  fire() {
    const g = this.game;
    g.sfx.play('shoot', 60);
    if (this.focus) {
      // Focused: two tight high-damage lances, no steering.
      for (let i = -1; i <= 1; i += 2) {
        const s = this.spawnShot();
        s.x = this.x + i * 7; s.y = this.y - 12;
        s.vx = 0; s.vy = -19;
        s.dmg = 23; s.r = 3.6; s.len = 17;
        s.color = C.cyan;
      }
    } else {
      // Unfocused: a three-lane spray that homes.
      const angles = [-0.16, 0, 0.16];
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + angles[i];
        const s = this.spawnShot();
        s.x = this.x + angles[i] * 40; s.y = this.y - 10;
        s.vx = Math.cos(a) * 16.5; s.vy = Math.sin(a) * 16.5;
        s.dmg = 3.5; s.r = 4; s.len = 12;
        s.homing = HOMING_TURN;
        s.color = i === 1 ? C.teal : C.green;
      }
    }
  }

  updateShots() {
    const boss = this.game.boss;
    // Only steer at a boss that can actually be hit; between phases the shots
    // just fly on rather than circling an invulnerable target.
    const target = boss && boss.state === 'fight' ? boss : null;

    for (let i = 0; i < this.shotN; i++) {
      const s = this.shots[i];
      s.age++;

      if (s.homing > 0 && target) {
        const want = Math.atan2(target.y - s.y, target.x - s.x);
        let cur = Math.atan2(s.vy, s.vx);
        let d = (want - cur) % TAU;
        if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
        cur += clamp(d, -s.homing, s.homing);
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(cur) * sp;
        s.vy = Math.sin(cur) * sp;
      }

      s.x += s.vx; s.y += s.vy;

      // A homing shot that overshoots curls back round, so it needs a
      // lifetime -- leaving the top of the screen is no longer the only exit.
      const gone = !s.alive || s.age > SHOT_LIFE
        || s.y < PLAY.y - 30 || s.y > PLAY.bottom + 40
        || s.x < PLAY.x - 40 || s.x > PLAY.right + 40;
      if (gone) {
        this.shots[i] = this.shots[this.shotN - 1];
        this.shots[this.shotN - 1] = s;
        this.shotN--; i--;
      }
    }
  }

  killShot(i) {
    const s = this.shots[i];
    s.alive = false;
  }

  hit() {
    if (this.deathAnim > 0 || this.invuln > 0) return false;
    this.deathAnim = 46;
    this.alive = false;
    return true;
  }

  drawShots(g) {
    // Player shots can be dimmed so they stop competing with enemy bullets
    // for attention -- at high density that readability matters more than
    // seeing your own fire.
    const alpha = this.game.settings.shotAlpha;
    if (alpha <= 0) return;
    g.lineCap = 'round';
    for (let i = 0; i < this.shotN; i++) {
      const s = this.shots[i];
      g.strokeStyle = s.color;
      g.globalAlpha = alpha;
      g.lineWidth = s.r;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.55, s.y - s.vy * 0.55);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.lineCap = 'butt';
  }

  draw(g) {
    if (this.deathAnim > 0) return;

    const blink = this.invuln > 0 && (this.pulse >> 2) % 2 === 0;
    g.save();
    g.translate(this.x, this.y);
    g.globalAlpha = blink ? 0.45 : 1;

    // Focus aura: counter-rotating brackets that tighten as you slow down.
    if (this.focus) {
      const a = this.pulse * 0.05;
      g.strokeStyle = C.cyan;
      g.globalAlpha = (blink ? 0.3 : 0.7);
      g.lineWidth = 1.4;
      for (let k = 0; k < 2; k++) {
        const rr = 18 - k * 5;
        const dir = k ? -1 : 1;
        for (let s = 0; s < 4; s++) {
          g.beginPath();
          g.arc(0, 0, rr, a * dir + s * TAU / 4, a * dir + s * TAU / 4 + 0.62);
          g.stroke();
        }
      }
      g.globalAlpha = blink ? 0.45 : 1;
    }

    // Hull: a simple triangle with a bright outline.
    g.rotate(-Math.PI / 2);
    drawShape(g, 'tri', 11, '#0b1524', C.ice, 1.8);
    g.rotate(Math.PI / 2);

    // Wings react to lateral movement.
    const tilt = clamp(this.vx / SPEED_FREE, -1, 1);
    g.strokeStyle = C.blue;
    g.lineWidth = 1.6;
    g.globalAlpha *= 0.9;
    g.beginPath();
    g.moveTo(-13, 5 - tilt * 3); g.lineTo(-5, -2);
    g.moveTo(13, 5 + tilt * 3); g.lineTo(5, -2);
    g.stroke();
    g.globalAlpha = blink ? 0.45 : 1;

    // Hitbox dot -- always faintly visible, solid while focused.
    g.fillStyle = this.focus ? C.red : 'rgba(255,90,80,0.55)';
    g.beginPath();
    g.arc(0, 0, this.focus ? 3.4 : 2.4, 0, TAU);
    g.fill();
    if (this.focus) {
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, 5.4, 0, TAU);
      g.stroke();
    }

    // Thruster flicker.
    g.globalAlpha = 0.8;
    g.fillStyle = C.cyan;
    const fl = 4 + Math.sin(this.pulse * 0.7) * 2;
    g.beginPath();
    g.moveTo(-3.5, 9); g.lineTo(0, 9 + fl); g.lineTo(3.5, 9);
    g.closePath();
    g.fill();

    g.restore();
    g.globalAlpha = 1;
  }
}
