// Boss entity: phase state machine, coroutine runners, damage, rendering.

import { TAU, clamp } from './mathx.js';
import { PLAY, C } from './config.js';
import { Attack } from './attack.js';
import { drawShape } from './sprites.js';

/**
 * Steps a pattern generator. Scripts communicate by yielding a frame count:
 * `yield 8` means "resume eight frames from now". Values below 1 are clamped
 * so a buggy script cannot spin the frame forever.
 */
class Runner {
  constructor(gen) { this.gen = gen; this.wait = 0; this.done = false; }
  step() {
    if (this.done) return;
    let guard = 0;
    while (this.wait <= 0) {
      const r = this.gen.next();
      if (r.done) { this.done = true; return; }
      this.wait = Math.max(1, Math.round(r.value || 1));
      if (++guard > 64) break;
    }
    this.wait--;
  }
}

export class Boss {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.x = PLAY.cx;
    this.y = PLAY.y + 150;
    this.hitR = def.hitR || 30;
    this.phaseIndex = -1;
    this.phase = null;
    this.hp = 1; this.hpMax = 1;
    this.timer = 0;      // survival phases only: counts down to the clear
    this.elapsed = 0;    // damage phases: counts up, for the speed bonus
    this.state = 'intro';       // intro | fight | break | dead
    this.stateT = 0;
    this.spin = 0;
    this.flash = 0;
    this.defeated = false;
    this.attack = null;
    this.atkRunner = null;
    this.moveRunner = null;
    this.nameCardT = 0;
    this.phaseNoMiss = true;
    this.totalPhases = def.phases.length;
    this.introT = 96;
  }

  get alive() { return this.state !== 'dead'; }
  get vulnerable() { return this.state === 'fight' && !this.phase.survival; }

  startPhase(i) {
    const def = this.def;
    if (i >= def.phases.length) { this.beginDeath(); return; }

    this.phaseIndex = i;
    this.phase = def.phases[i];
    const scale = this.game.diff.bossHp;
    this.hpMax = Math.max(1, Math.round((this.phase.hp || 0) * scale));
    this.hp = this.hpMax;
    // A damage phase has no time limit; `time` is only the par it is scored
    // against. For a survival phase the clock *is* the win condition.
    this.timer = this.phase.time || 60 * 60;
    this.par = this.phase.time || 60 * 60;
    this.elapsed = 0;
    this.phaseNoMiss = true;
    this.state = 'fight';
    this.stateT = 0;
    this.nameCardT = 150;

    // Fresh, deterministic RNG stream per boss/phase/difficulty.
    const seed = hashSeed(def.id + '|' + i + '|' + this.game.diff.key);
    this.attack = new Attack(this.game, this, seed);
    this.atkRunner = new Runner(this.phase.script(this.attack));
    this.moveRunner = new Runner((this.phase.move || defaultMove)(this.attack));
    this.game.sfx.play('phase');
  }

  beginDeath() {
    this.state = 'dead';
    this.stateT = 0;
    this.defeated = true;
    this.game.onBossDefeated();
  }

  damage(amount) {
    if (!this.vulnerable) return 0;
    const dealt = Math.min(this.hp, amount);
    this.hp -= dealt;
    this.flash = Math.min(8, this.flash + 2);
    if (this.hp <= 0) this.breakPhase();
    return dealt;
  }

  breakPhase() {
    const g = this.game;
    this.state = 'break';
    this.stateT = 0;
    this.hp = 0;

    g.bullets.clearArea(g, this.x, this.y, 0);
    g.lasers.length = 0;
    g.addShake(14);
    g.sfx.play('defeat');
    g.particles.ring(this.x, this.y, this.def.color, 30, 16, 34, 5);
    g.particles.ring(this.x, this.y, C.white, 18, 22, 26, 3);
    g.particles.shards(this.x, this.y, this.def.color, this.def.shape, 22, 5, 52);

    g.onPhaseCleared(this.phaseIndex, this.elapsed, this.par, this.phaseNoMiss);
  }

  update() {
    this.stateT++;
    this.spin += 0.011;
    if (this.flash > 0) this.flash--;
    if (this.nameCardT > 0) this.nameCardT--;

    if (this.state === 'intro') {
      // Glide down into position while the name card plays.
      const t = clamp(this.stateT / this.introT, 0, 1);
      this.y = PLAY.y - 60 + (PLAY.y + 150 - (PLAY.y - 60)) * (1 - (1 - t) * (1 - t));
      if (this.stateT >= this.introT) this.startPhase(0);
      return;
    }

    if (this.state === 'break') {
      if (this.stateT % 7 === 0) {
        const a = Math.random() * TAU;
        this.game.particles.spark(
          this.x + Math.cos(a) * 26, this.y + Math.sin(a) * 26,
          this.def.accent, 5, 3.4, 30,
        );
      }
      if (this.stateT >= 78) this.startPhase(this.phaseIndex + 1);
      return;
    }

    if (this.state === 'dead') {
      if (this.stateT % 4 === 0) {
        const a = Math.random() * TAU, r = 10 + Math.random() * 40;
        this.game.particles.spark(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, this.def.color, 8, 4.5, 40);
      }
      return;
    }

    // --- fighting ---
    this.attack.t++;
    this.moveRunner.step();
    this.atkRunner.step();

    this.x = clamp(this.x, PLAY.x + 56, PLAY.right - 56);
    this.y = clamp(this.y, PLAY.y + 56, PLAY.y + 340);

    this.elapsed++;
    // Only a survival phase ends on the clock -- and there, running it out is
    // the clear, not a fallback. Damage phases end when their health does, so
    // there is no timer quietly rescuing a player who cannot break them.
    if (this.phase.survival && this.timer > 0) {
      this.timer--;
      if (this.timer === 0) this.breakPhase();
    }
  }

  draw(g) {
    if (this.state === 'dead' && this.stateT > 60) return;

    const def = this.def;
    const hurt = this.flash > 0;
    const pulse = 1 + Math.sin(this.stateT * 0.06) * 0.05;
    const scale = this.state === 'break'
      ? 1 + Math.sin(this.stateT * 0.5) * 0.12
      : this.state === 'dead'
        ? Math.max(0, 1 - this.stateT / 60)
        : pulse;

    g.save();
    g.translate(this.x, this.y);
    g.scale(scale, scale);

    // Outer aura.
    const auraR = 52 + Math.sin(this.stateT * 0.04) * 5;
    const grad = g.createRadialGradient(0, 0, 4, 0, 0, auraR);
    grad.addColorStop(0, hexAlpha(def.color, 0.30));
    grad.addColorStop(1, hexAlpha(def.color, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, auraR, 0, TAU);
    g.fill();

    // Counter-rotating shells.
    const shells = def.rings || ['hex', 'circle'];
    for (let i = 0; i < shells.length; i++) {
      const dir = i % 2 ? -1 : 1;
      g.save();
      g.rotate(this.spin * dir * (1 + i * 0.6));
      g.globalAlpha = 0.55 - i * 0.12;
      drawShape(g, shells[i], 44 - i * 12, null, hurt ? '#ffffff' : def.accent, 2.2);
      g.restore();
    }

    // Tick marks orbiting the core, one per remaining phase.
    const left = this.totalPhases - this.phaseIndex;
    g.globalAlpha = 0.85;
    for (let i = 0; i < left; i++) {
      const a = this.spin * -1.7 + i * TAU / Math.max(1, left);
      g.fillStyle = def.accent;
      g.beginPath();
      g.arc(Math.cos(a) * 34, Math.sin(a) * 34, 3, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    // Core.
    g.save();
    g.rotate(-this.spin * 0.8);
    g.shadowColor = def.color;
    g.shadowBlur = hurt ? 34 : 20;
    drawShape(g, def.shape, 22, hurt ? '#ffffff' : def.color, '#ffffff', 1.6);
    g.shadowBlur = 0;
    g.restore();

    // Invulnerable survival phases get a locked-shield indicator.
    if (this.state === 'fight' && this.phase && this.phase.survival) {
      g.strokeStyle = C.white;
      g.globalAlpha = 0.35 + 0.25 * Math.sin(this.stateT * 0.15);
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(0, 0, 60, this.spin * 2 + i * TAU / 6, this.spin * 2 + i * TAU / 6 + 0.6);
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    g.restore();
  }

  /** Floating phase title, drawn in playfield space. */
  drawNameCard(g) {
    if (this.nameCardT <= 0 || !this.phase) return;
    const t = this.nameCardT / 150;
    const slide = (1 - Math.min(1, (1 - t) * 6)) * 40;
    const alpha = Math.min(1, t * 4) * Math.min(1, (1 - t) * 8 + 0.2);

    g.save();
    g.globalAlpha = clamp(alpha, 0, 1);
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillStyle = this.def.color;
    g.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(
      (this.phase.survival ? 'SURVIVAL ' : 'PATTERN ') + (this.phaseIndex + 1) + ' / ' + this.totalPhases,
      PLAY.right - 16 + slide, PLAY.y + 52,
    );
    g.fillStyle = C.white;
    g.font = '700 26px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(this.phase.name.toUpperCase(), PLAY.right - 16 + slide, PLAY.y + 80);
    g.restore();
  }
}

function* defaultMove(A) {
  yield* A.moveTo(PLAY.cx, PLAY.y + 160, 60);
  while (true) yield 1;
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hexAlpha(hex, a) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
