// Run log: what happened, pattern by pattern, and what killed you.
//
// Tuning this game has run on the dodging bot, and the bot is not a person --
// it plans straight lines, cannot orbit a sweep, and has no idea a pattern is
// about to do something. Every number in npm run difficulty is a model of a
// player. This records the real thing, so the model can be checked against it
// rather than trusted.
//
// Three streams, because a death on its own does not say how hard a pattern
// was. A pattern you clear first time having grazed forty bullets and one you
// clear on the third attempt produce the same zero deaths.
//
//   deaths   one per death, taken at the collision site where the killing
//            bullet is still in hand -- reconstructing it afterwards from
//            "what was nearby" fails exactly when the screen is busiest
//   phases   one per pattern attempt, however it ended: cleared, died out,
//            quit to the menu, or closed the tab mid-fight
//   runs     one per run, so practice in boss select and a full rush stay
//            distinguishable
//
// Everything persists to localStorage as it happens, not at the end, so a run
// abandoned halfway is recorded rather than lost. Nothing is sent anywhere; it
// is read back through the menu's DOWNLOAD LOG, window.__BOSSRUSH.game.log, or
// the tools.

import { PLAY } from './config.js';

const KEY = 'bosrush.runlog.v1';
const LEGACY_KEY = 'bosrush.deaths.v1';
// Deaths are the detailed stream and the one that grows fastest; phase records
// are small and far more useful in bulk, so they get a much higher ceiling.
const CAP = { deaths: 600, phases: 3000, runs: 400 };
const SCHEMA = 2;

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
  // `bounce` counts DOWN as they are spent, so asking only whether it is
  // positive files a bullet that has finished ricocheting as a plain straight
  // one -- which is precisely what it did to Reflection.
  if (b.bounce > 0 || b.bounced > 0) t.push('bouncing');
  if (b.homeT > 0) t.push('homing');
  if (b.stopT > 0 || b.goT > 0) t.push('stop-go');
  if (b.orbT > 0) t.push('orbiting');
  if (b.frozen) t.push('frozen');
  // splitT survives onto the children, where `split` itself is cleared on the
  // last generation, so this catches the whole family rather than just parents.
  if (b.split || b.splitT > 0) t.push('splitting');
  return t;
}

export class RunLog {
  constructor() {
    this.deaths = [];
    this.phases = [];
    this.runs = [];
    this.open = null;        // the phase attempt in progress
    this.run = null;         // the run in progress
    this.load();
  }

  /** Deaths only, kept because the results screen and the tools read it. */
  get entries() { return this.deaths; }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        this.deaths = Array.isArray(parsed.deaths) ? parsed.deaths.slice(-CAP.deaths) : [];
        this.phases = Array.isArray(parsed.phases) ? parsed.phases.slice(-CAP.phases) : [];
        this.runs = Array.isArray(parsed.runs) ? parsed.runs.slice(-CAP.runs) : [];
      }
      // A log written before phases and runs existed is still worth keeping.
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy && !this.deaths.length) {
        const old = JSON.parse(legacy);
        if (Array.isArray(old)) this.deaths = old.slice(-CAP.deaths);
      }
    } catch (_) {
      this.deaths = []; this.phases = []; this.runs = [];
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        schema: SCHEMA,
        deaths: this.deaths,
        phases: this.phases,
        runs: this.runs,
      }));
    } catch (_) {
      // Quota, private mode, blocked storage. Losing the log must never cost
      // the player their run, so this stays best-effort.
    }
  }

  /** Shared identity fields, so every stream can be sliced the same way. */
  static context(game) {
    return {
      diff: game.diff.key,
      life: game.lifeMode.key,
      ship: game.ship.id,
      mode: game.run ? game.run.mode : 'none',
      autopilot: !!game.settings.autopilot,
    };
  }

  beginRun(game, mode, bossIndex) {
    this.endRun('abandoned');
    this.run = {
      t: Date.now(), id: `r${Date.now().toString(36)}`,
      // Spread first, then the explicit mode: this runs before game.run is
      // assigned, so context() cannot see the mode yet and would report 'none'.
      ...RunLog.context(game),
      mode, boss: bossIndex,
      phases: 0, deaths: 0, grazes: 0, bombs: 0, cleared: 0,
    };
  }

  endRun(outcome) {
    this.closePhase('quit');
    if (!this.run) return;
    this.run.outcome = outcome;
    this.run.seconds = +((Date.now() - this.run.t) / 1000).toFixed(1);
    this.runs.push(this.run);
    if (this.runs.length > CAP.runs) this.runs = this.runs.slice(-CAP.runs);
    this.run = null;
    this.save();
  }

  beginPhase(game) {
    this.closePhase('superseded');
    const boss = game.boss;
    if (!boss || !boss.phase) return;
    this.open = {
      t: Date.now(),
      runId: this.run ? this.run.id : null,
      boss: boss.def.id,
      bossName: boss.def.name,
      phase: boss.phaseIndex,
      phaseName: boss.phase.name,
      survival: !!boss.phase.survival,
      par: +((boss.par || 0) / 60).toFixed(1),
      ...RunLog.context(game),
      deaths: 0, grazes: 0, bombs: 0, damage: 0,
    };
  }

  /**
   * Close the attempt in progress. Called on a clear, on a death that ends the
   * run, on quitting to the menu, and from a pagehide handler -- so walking
   * away mid-pattern still leaves a record of how far you got.
   */
  closePhase(outcome, game) {
    const o = this.open;
    if (!o) return;
    this.open = null;
    if (outcome === 'superseded' && !o.deaths && !o.grazes && !o.damage) return;
    o.outcome = outcome === 'superseded' ? 'cleared' : outcome;
    o.seconds = +((Date.now() - o.t) / 1000).toFixed(1);
    if (game && game.boss && game.boss.hpMax) {
      o.hpLeft = +(Math.max(0, game.boss.hp) / game.boss.hpMax).toFixed(3);
    }
    this.phases.push(o);
    if (this.phases.length > CAP.phases) this.phases = this.phases.slice(-CAP.phases);
    if (this.run) {
      this.run.phases++;
      this.run.deaths += o.deaths;
      this.run.grazes += o.grazes;
      this.run.bombs += o.bombs;
      if (o.outcome === 'cleared') this.run.cleared++;
    }
    this.save();
  }

  /** Cheap per-frame counters; they only reach storage when the phase closes. */
  count(what, n = 1) { if (this.open) this.open[what] += n; }

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

    this.deaths.push(e);
    if (this.deaths.length > CAP.deaths) this.deaths = this.deaths.slice(-CAP.deaths);
    this.count('deaths');
    this.save();
    return e;
  }

  clear() {
    this.deaths = []; this.phases = []; this.runs = [];
    this.open = null; this.run = null;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (_) { /* ignore */ }
  }

  /** Deaths grouped by phase and difficulty, worst first. */
  summary({ includeAutopilot = false } = {}) {
    const by = new Map();
    for (const e of this.deaths) {
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
  export() {
    // Flush whatever is in progress first, so a log downloaded mid-fight
    // includes the fight it was downloaded during.
    const snapshotOpen = this.open ? [{ ...this.open, outcome: 'in-progress' }] : [];
    return JSON.stringify({
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      deaths: this.deaths,
      phases: this.phases.concat(snapshotOpen),
      runs: this.runs,
    }, null, 2);
  }

  get size() { return this.deaths.length + this.phases.length + this.runs.length; }

  /**
   * Hand the log to the player as a file. A canvas game has nowhere to put a
   * text blob otherwise, and asking someone to open a console to report a
   * difficulty problem is asking them not to bother.
   */
  download() {
    try {
      const blob = new Blob([this.export()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `bossrush-log-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (_) {
      return false;
    }
  }
}
