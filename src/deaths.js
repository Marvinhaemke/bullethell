// Death log: what killed the player, where, and what the screen looked like.
//
// Tuning this game has run on the dodging bot, and the bot is not a person --
// it plans straight lines, cannot orbit a sweep, and has no idea a pattern is
// about to do something. Every number in npm run difficulty is a model of a
// player. This records the real thing, so the model can eventually be checked
// against it rather than trusted.
//
// Recorded at the collision site, where the killing bullet is still in hand:
// guessing afterwards from "what was nearby" gets it wrong exactly when the
// screen is busiest, which is when it matters.
//
// Entries persist to localStorage and survive reloads, capped so a long
// session cannot fill the quota. Nothing here is sent anywhere; it is read
// back through window.__BOSSRUSH.deaths or the tools.

import { PLAY } from './config.js';

const KEY = 'bosrush.deaths.v1';
const CAP = 400;

/**
 * The behaviours that make a bullet hard to read, taken from the bullet's own
 * fields rather than from a label the pattern had to remember to attach. Same
 * principle as the difficulty sweep: ask the data what it does.
 */
function traits(b) {
  const t = [];
  if (b.turn !== 0) t.push('curving');
  if (b.ax !== 0 || b.ay !== 0) t.push('gravity');
  if (b.accel !== 0) t.push('accelerating');
  if (b.bounce > 0) t.push('bouncing');
  if (b.homeT > 0) t.push('homing');
  if (b.stopT > 0 || b.goT > 0) t.push('stop-go');
  if (b.orbit) t.push('orbiting');
  if (b.frozen) t.push('frozen');
  if (b.split) t.push('splitting');
  return t;
}

export class DeathLog {
  constructor() {
    this.entries = [];
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this.entries = parsed.slice(-CAP);
    } catch (_) {
      this.entries = [];
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.entries));
    } catch (_) {
      // Quota, private mode, blocked storage. Losing the log must never cost
      // the player their run, so this stays best-effort.
    }
  }

  /**
   * @param {object} game
   * @param {object|null} bullet  the bullet that connected, if it was a bullet
   * @param {string} cause        'bullet' | 'laser'
   */
  record(game, bullet, cause) {
    const p = game.player;
    const boss = game.boss;
    if (!boss || !boss.phase) return;

    // How much room there was at the instant of death, and how crowded it was:
    // the two numbers the difficulty sweep predicts, so they can be compared.
    let nearest = Infinity;
    let near = 0;
    const pool = game.bullets;
    for (let i = 0; i < pool.n; i++) {
      const b = pool.a[i];
      if (b.harmless) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y) - b.hr - p.hitR;
      if (d < nearest) nearest = d;
      if (d < 190) near++;
    }

    const e = {
      t: Date.now(),
      boss: boss.def.id,
      bossName: boss.def.name,
      phase: boss.phaseIndex,
      phaseName: boss.phase.name,
      survival: !!boss.phase.survival,
      diff: game.diff.key,
      life: game.lifeMode.key,
      ship: game.ship.id,
      mode: game.run ? game.run.mode : 'unknown',
      autopilot: !!game.settings.autopilot,
      // Where in the phase, and where on the screen. Both matter: dying at 2s
      // is a different problem from dying at 50s, and a death in a corner is a
      // different problem from one under the boss.
      intoPhase: +(boss.elapsed / 60).toFixed(2),
      phasePar: +((boss.par || 0) / 60).toFixed(1),
      hpLeft: boss.hpMax ? +(boss.hp / boss.hpMax).toFixed(3) : null,
      x: Math.round(p.x - PLAY.x),
      y: Math.round(p.y - PLAY.y),
      bullets: pool.count,
      nearBullets: near,
      clearance: Number.isFinite(nearest) ? +nearest.toFixed(1) : null,
      cause,
    };

    if (bullet) {
      const sp = Math.hypot(bullet.vx, bullet.vy);
      e.killer = {
        color: bullet.color,
        shape: bullet.shape,
        r: +bullet.hr.toFixed(1),
        speed: +sp.toFixed(2),
        age: bullet.age,
        traits: traits(bullet),
        // Was it coming at the player, or did the player move into it? The
        // difference is the difference between a pattern being unfair and a
        // player being careless, and it is not recoverable after the fact.
        closing: sp > 0.01
          ? +(((p.x - bullet.x) * bullet.vx + (p.y - bullet.y) * bullet.vy)
            / (sp * Math.max(1, Math.hypot(p.x - bullet.x, p.y - bullet.y)))).toFixed(2)
          : 0,
      };
    }

    this.entries.push(e);
    if (this.entries.length > CAP) this.entries = this.entries.slice(-CAP);
    this.save();
    return e;
  }

  clear() {
    this.entries = [];
    try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  }

  /** Deaths grouped by phase and difficulty, worst first. */
  summary({ includeAutopilot = false } = {}) {
    const by = new Map();
    for (const e of this.entries) {
      if (!includeAutopilot && e.autopilot) continue;
      const key = `${e.bossName}|${e.phase + 1}. ${e.phaseName}|${e.diff}`;
      let row = by.get(key);
      if (!row) {
        row = {
          boss: e.bossName, phase: `${e.phase + 1}. ${e.phaseName}`, diff: e.diff,
          n: 0, traits: Object.create(null), causes: Object.create(null),
          intoPhase: [], clearance: [], bullets: [],
        };
        by.set(key, row);
      }
      row.n++;
      row.causes[e.cause] = (row.causes[e.cause] || 0) + 1;
      for (const t of (e.killer ? e.killer.traits : [])) {
        row.traits[t] = (row.traits[t] || 0) + 1;
      }
      if (e.killer && !e.killer.traits.length) row.traits.straight = (row.traits.straight || 0) + 1;
      row.intoPhase.push(e.intoPhase);
      if (e.clearance !== null) row.clearance.push(e.clearance);
      row.bullets.push(e.bullets);
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return [...by.values()]
      .map((r) => ({
        ...r,
        avgIntoPhase: mean(r.intoPhase),
        avgClearance: mean(r.clearance),
        avgBullets: mean(r.bullets),
      }))
      .sort((a, b) => b.n - a.n);
  }

  /** Everything, as JSON, for feeding back into tuning. */
  export() { return JSON.stringify(this.entries, null, 2); }
}
