// Headless smoke test: boots the game in Chromium, drives every boss at every
// difficulty for a simulated stretch of play, and fails on any console error,
// page exception, stalled pattern script or runaway bullet count.
//
//   node tools/smoke.mjs [--shots] [--url http://localhost:8000/]
//
// With --shots it also writes PNGs of each boss to tools/shots/.

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const urlArg = args.indexOf('--url');
const PORT = 8123;
const URL = urlArg >= 0 ? args[urlArg + 1] : `http://localhost:${PORT}/`;
const OWN_SERVER = urlArg < 0;

// Frames of simulated play per boss/difficulty combination.
const FRAMES_PER_CASE = 1500;

let server = null;
if (OWN_SERVER) {
  server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
  await sleep(700);
}

const failures = [];

// Prefer a preinstalled Chromium when the bundled revision is missing (common
// in sandboxes where browsers are provisioned separately).
function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const launchOpts = { args: ['--no-sandbox', '--disable-gpu'] };
try {
  if (!existsSync(chromium.executablePath())) throw new Error('missing');
} catch (_) {
  const exe = findChromium();
  if (!exe) throw new Error('No Chromium found; run: npx playwright install chromium');
  launchOpts.executablePath = exe;
}

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') failures.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}\n${err.stack || ''}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH, null, { timeout: 10000 });

// Drive the game deterministically from inside the page: stop rAF and step the
// fixed-timestep update by hand so results do not depend on wall-clock speed.
await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  window.__T = {
    /** Advance n logical frames, optionally holding input keys. */
    run(n, keys = []) {
      const g = game;
      for (const k of keys) g.input.down.add(k);
      const stats = { maxBullets: 0, frames: 0 };
      for (let i = 0; i < n; i++) {
        g.update();
        stats.maxBullets = Math.max(stats.maxBullets, g.bullets.count);
        stats.frames++;
      }
      g.draw();
      for (const k of keys) g.input.down.delete(k);
      return stats;
    },
    state() {
      const g = game;
      return {
        scene: g.scene,
        state: g.state,
        bullets: g.bullets.count,
        lasers: g.lasers.length,
        particles: g.particles.n,
        boss: g.boss && {
          name: g.boss.def.name,
          phase: g.boss.phaseIndex,
          phaseName: g.boss.phase && g.boss.phase.name,
          hp: g.boss.hp,
          hpMax: g.boss.hpMax,
          bossState: g.boss.state,
          atkDone: g.boss.atkRunner ? g.boss.atkRunner.done : null,
          moveDone: g.boss.moveRunner ? g.boss.moveRunner.done : null,
          x: Math.round(g.boss.x),
          y: Math.round(g.boss.y),
        },
        score: g.run && Math.round(g.run.score),
        lives: g.run && g.run.lives,
      };
    },
    start(boss, diff, life) {
      game.debugStart(boss, diff, life);
    },
  };
});

if (wantShots) mkdirSync(new URL('./shots/', import.meta.url), { recursive: true });

// --- regression: bullets must never wink out inside the playfield ----------
// A `life` in frames is difficulty-dependent -- lower difficulties slow
// bullets down, so the time needed to cross the field grows while a fixed
// lifetime does not. That once left several patterns evaporating mid-screen.
// Free-flying bullets may only leave by exiting the field; wall-bouncers and
// homing seekers are the deliberate exceptions and fade out visibly.
console.log('Checking every phase for bullets expiring on screen...');
const vanishing = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const bad = [];
  const roster = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    roster.push({ name: game.boss.def.name, phases: game.boss.def.phases.map((p) => p.name) });
  }
  for (let b = 0; b < 5; b++) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      let popped = 0;
      // Novice is the worst case: the slowest bullets, so the longest crossing.
      for (const d of [0, 2, 4]) {
        game.debugStart(b, d, 0);
        game.boss.state = 'fight';
        game.boss.startPhase(ph);
        game.boss.hp = game.boss.hpMax = 1e9;
        game.player.invuln = 1e9;

        const pool = game.bullets;
        const origRemove = pool.remove.bind(pool);
        pool.remove = (i) => {
          const bl = pool.a[i];
          const inside = bl.x > 40 && bl.x < 672 && bl.y > 40 && bl.y < 728;
          const exempt = bl.bounce > 0 || bl.homeT > 0 || bl.wasBouncer;
          if (bl.life > 0 && bl.age >= bl.life && inside && !exempt) popped++;
          origRemove(i);
        };
        // Tag bouncers at spawn: `bounce` counts down, so by removal time a
        // spent bouncer is indistinguishable from a free-flying bullet.
        const origSpawn = pool.spawn.bind(pool);
        pool.spawn = () => { const bl = origSpawn(); bl.wasBouncer = false; return bl; };
        for (let f = 0; f < 900; f++) {
          game.update();
          for (let i = 0; i < pool.n; i++) if (pool.a[i].bounce > 0) pool.a[i].wasBouncer = true;
        }
        pool.remove = origRemove;
        pool.spawn = origSpawn;
      }
      if (popped > 0) {
        bad.push({ boss: roster[b].name, phase: `${ph + 1}. ${roster[b].phases[ph]}`, popped });
      }
    }
  }
  return bad;
});

if (vanishing.length) {
  for (const v of vanishing) {
    console.log(`  ${v.boss} ${v.phase}: ${v.popped} bullets expired mid-field`);
    failures.push(`${v.boss} ${v.phase}: ${v.popped} bullets expired inside the playfield`);
  }
} else {
  console.log('  none — every bullet leaves by exiting the field.\n');
}

console.log('boss  diff  frames  maxBullets  endPhase  bulletsLeft  note');
console.log('-'.repeat(74));

for (let boss = 0; boss < 5; boss++) {
  for (let diff = 0; diff < 5; diff++) {
    // Infinite lives so a hit never ends the case early; the player just sits
    // still, which is the harshest possible test of bullet volume.
    await page.evaluate(([b, d]) => window.__T.start(b, d, 0), [boss, diff]);
    const stats = await page.evaluate((n) => window.__T.run(n, ['KeyZ']), FRAMES_PER_CASE);
    const st = await page.evaluate(() => window.__T.state());

    const notes = [];
    if (!st.boss) notes.push('NO BOSS');
    else {
      if (st.boss.atkDone) notes.push('attack script ended');
      if (st.boss.moveDone) notes.push('move script ended');
      if (st.boss.bossState === 'intro') notes.push('stuck in intro');
    }
    if (stats.maxBullets > 3600) notes.push(`bullet flood ${stats.maxBullets}`);
    if (st.scene !== 'play') notes.push(`scene=${st.scene}`);

    const name = st.boss ? st.boss.name : '?';
    console.log(
      `${String(boss + 1).padEnd(5)} ${String(diff).padEnd(5)} ${String(stats.frames).padEnd(7)} ` +
      `${String(stats.maxBullets).padEnd(11)} ${String(st.boss ? st.boss.phase : '-').padEnd(9)} ` +
      `${String(st.bullets).padEnd(12)} ${name} ${notes.join('; ')}`,
    );
    for (const n of notes) {
      if (n.startsWith('bullet flood') || n === 'NO BOSS' || n.includes('script ended') || n === 'stuck in intro') {
        failures.push(`boss ${boss + 1} diff ${diff}: ${n}`);
      }
    }

    if (wantShots && diff === 4) {
      await page.screenshot({ path: new URL(`./shots/boss${boss + 1}.png`, import.meta.url).pathname });
    }
  }
}

// --- exercise the menus, pause, death, bomb and results paths ---------------
console.log('\nUI / lifecycle checks');
const ui = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const out = {};
  const step = (n, keys = []) => window.__T.run(n, keys);

  game.setScene('title');
  step(3);
  out.title = game.scene;

  // title -> menu -> boss select -> back
  game.input.edge.add('Enter'); step(1); out.afterEnter = game.scene;
  game.input.edge.add('ArrowDown'); step(1);
  game.input.edge.add('Enter'); step(1); out.afterSelect = game.scene;
  game.input.edge.add('Backspace'); step(1); out.afterBack = game.scene;

  // help screen renders
  game.setScene('help'); step(2); game.draw(); out.help = game.scene;

  // start a fight, pause, resume
  game.debugStart(0, 2, 1);
  step(200, ['KeyZ']);
  game.input.edge.add('Escape'); step(1); out.paused = game.scene;
  game.draw();
  game.input.edge.add('Escape'); step(1); out.resumed = game.scene;

  // bombs
  const bombsBefore = game.run.bombs;
  game.useBomb();
  step(70);
  out.bombUsed = bombsBefore - game.run.bombs;

  // deaths drain lives and eventually end the run, and each one is logged
  out.livesStart = game.run.lives;
  game.deaths.clear();
  const fake = { color: '#ff0000', shape: 'circle', hr: 5, vx: 0, vy: 3,
    age: 20, turn: 0.02, ax: 0, ay: 0, accel: 0, bounce: 0, homeT: 0,
    stopT: 0, goT: 0, orbit: null, frozen: false, split: null };
  for (let i = 0; i < 4; i++) {
    game.player.invuln = 0;
    game.player.hit();
    game.playerDied(fake, 'bullet');
    step(60);
  }
  out.livesEnd = game.run.lives;
  out.gameOverState = game.state;
  // The log is the raw material for future tuning, so it has to survive a
  // reload and name the pattern and the behaviour that did the killing.
  out.deathsLogged = game.deaths.entries.length;
  const last = game.deaths.entries[game.deaths.entries.length - 1] || {};
  out.deathPhase = last.phaseName || null;
  out.deathTraits = last.killer ? last.killer.traits.join('+') : null;
  out.deathPersisted = JSON.parse(localStorage.getItem('bosrush.deaths.v1') || '[]').length;
  out.deathSummary = game.deaths.summary({ includeAutopilot: true }).length;
  game.draw();

  // clearing a boss advances / produces results
  game.debugStart(0, 0, 0);
  step(30);
  for (let p = 0; p < 8; p++) {
    if (!game.boss || game.boss.state === 'dead') break;
    game.boss.hp = 1;
    game.boss.damage(999);
    step(120);
  }
  step(200);
  out.afterClear = game.scene;
  out.results = game.run ? game.run.results.length : -1;
  game.draw();
  return out;
});
console.log(JSON.stringify(ui, null, 2));

if (ui.afterEnter !== 'menu') failures.push(`title->menu failed (got ${ui.afterEnter})`);
if (ui.afterSelect !== 'select') failures.push(`menu->select failed (got ${ui.afterSelect})`);
if (ui.afterBack !== 'menu') failures.push(`select->menu failed (got ${ui.afterBack})`);
if (ui.paused !== 'pause') failures.push(`pause failed (got ${ui.paused})`);
if (ui.resumed !== 'play') failures.push(`resume failed (got ${ui.resumed})`);
if (ui.bombUsed !== 1) failures.push(`bomb did not consume a stock (got ${ui.bombUsed})`);
if (ui.gameOverState !== 'gameover') failures.push(`3-life mode did not reach game over (got ${ui.gameOverState})`);
if (ui.deathsLogged !== 4) failures.push(`death log missed deaths (got ${ui.deathsLogged} of 4)`);
if (ui.deathPersisted !== 4) failures.push(`death log did not persist (got ${ui.deathPersisted} of 4)`);
if (!ui.deathPhase) failures.push('death log did not record which pattern');
if (ui.deathTraits !== 'curving') failures.push(`death log misread the bullet (got ${ui.deathTraits})`);
if (ui.deathSummary < 1) failures.push('death log summary came back empty');
if (ui.afterClear !== 'results') failures.push(`boss clear did not reach results (got ${ui.afterClear})`);

await browser.close();
if (server) server.kill();

console.log('\n' + '='.repeat(74));
if (failures.length) {
  console.log(`FAILED with ${failures.length} problem(s):`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All checks passed.');
