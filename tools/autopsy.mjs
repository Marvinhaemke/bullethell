// What actually kills you on a phase, and when.
//
//   node tools/autopsy.mjs --boss 5 --phase 4 [--diff 1] [--trials 12]
//
// The margin sweep says a phase is tight; it does not say which of the four
// things happening at once is doing the killing. This runs the dodging bot
// repeatedly and records, for each death, how far into the phase it happened
// and what the killing bullet was -- its colour and shape, which in these
// patterns identify the layer that spawned it.
//
// It also reports pressure over time: bullets on screen and how much clear
// room the bot had, bucketed by second, so a pattern that ramps into an
// unwinnable state shows up as a curve rather than as a single number.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const BOSS = num('--boss', 5) - 1;
const PHASE = num('--phase', 4) - 1;
const DIFF = args.includes('--diff') ? num('--diff', 1) : null;
const TRIALS = num('--trials', 12);
const FRAMES = num('--frames', 2400);
const PORT = num('--port', 8700 + (process.pid % 200));

const server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
await sleep(700);

const exe = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p));
const launchOpts = { args: ['--no-sandbox', '--disable-gpu'] };
try {
  if (!existsSync(chromium.executablePath())) throw new Error('missing');
} catch (_) {
  if (!exe) { server.kill(); throw new Error('No Chromium found'); }
  launchOpts.executablePath = exe;
}

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);

await page.evaluate(() => {
  window.__AUTOPSY = function autopsy(bi, phi, di, frames, seed) {
    const { game: g } = window.__BOSSRUSH;
    g.settings.autopilot = true;
    g.settings.autofire = true;
    g.autopilot.reset();
    g.debugStart(bi, di, 0);
    g.boss.state = 'fight';
    g.boss.startPhase(phi);
    g.boss.hp = g.boss.hpMax = 1e9;      // never break the phase early
    // Different starting corners, so one lucky spot cannot carry the result.
    const p = g.player;
    p.x = 120 + (seed % 4) * 150;
    p.y = 560 + (seed % 3) * 50;
    p.invuln = 0;

    const buckets = [];
    let deathFrame = -1;
    let killer = null;

    for (let f = 0; f < frames; f++) {
      // Immortal on purpose after the first death is recorded: we want the
      // whole pressure curve, not just the run-up to one hit.
      if (deathFrame < 0) {
        // Find the nearest threat now, so the killing layer is identifiable.
        let best = null, bestD = 1e9;
        const pool = g.bullets;
        for (let j = 0; j < pool.n; j++) {
          const b = pool.a[j];
          if (b.harmless) continue;
          const d = Math.hypot(b.x - p.x, b.y - p.y) - b.hr - p.hitR;
          if (d < bestD) { bestD = d; best = b; }
        }
        if (bestD < 0.8) killer = best ? { color: best.color, shape: best.shape } : null;
      }

      const wasAlive = p.deathAnim === 0;
      g.update();
      if (wasAlive && p.deathAnim > 0 && deathFrame < 0) {
        deathFrame = f;
        // A beam kill leaves no bullet nearby.
        if (!killer) killer = { color: 'BEAM', shape: 'beam' };
      }
      // Immortal only AFTER the first death, so the pressure curve runs the
      // full length. Granting it earlier would make every trial survive.
      if (deathFrame >= 0) { p.invuln = 1e9; p.deathAnim = 0; p.alive = true; }

      if (f % 60 === 0) {
        let nearest = 999;
        const pool = g.bullets;
        for (let j = 0; j < pool.n; j++) {
          const b = pool.a[j];
          if (b.harmless) continue;
          const d = Math.hypot(b.x - p.x, b.y - p.y) - b.hr - p.hitR;
          if (d < nearest) nearest = d;
        }
        buckets.push({ s: Math.round(f / 60), n: g.bullets.count, near: Math.round(nearest) });
      }
    }
    return { deathFrame, killer, buckets };
  };
});

const meta = await page.evaluate(([bi, phi]) => {
  const { game } = window.__BOSSRUSH;
  game.debugStart(bi, 2, 0);
  return { boss: game.boss.def.name, phase: game.boss.def.phases[phi].name };
}, [BOSS, PHASE]);

const DIFFN = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'];
const diffs = DIFF === null ? [0, 1, 2, 3, 4] : [DIFF];

console.log(`Autopsy: ${meta.boss} ${PHASE + 1}. ${meta.phase}`);
console.log(`${TRIALS} trials x ${(FRAMES / 60).toFixed(0)}s, real hitbox, bot driving.\n`);

for (const d of diffs) {
  const deaths = [];
  const killers = Object.create(null);
  const curve = [];

  for (let t = 0; t < TRIALS; t++) {
    const r = await page.evaluate(
      ([bi, phi, di, frames, seed]) => window.__AUTOPSY(bi, phi, di, frames, seed),
      [BOSS, PHASE, d, FRAMES, t],
    );
    if (r.deathFrame >= 0) {
      deaths.push(r.deathFrame / 60);
      const key = r.killer ? `${r.killer.color} ${r.killer.shape}` : 'unknown';
      killers[key] = (killers[key] || 0) + 1;
    }
    r.buckets.forEach((b, i) => {
      if (!curve[i]) curve[i] = { s: b.s, n: 0, near: 0, k: 0 };
      curve[i].n += b.n; curve[i].near += b.near; curve[i].k++;
    });
  }

  const rate = deaths.length / TRIALS;
  const median = deaths.length
    ? deaths.slice().sort((a, b) => a - b)[deaths.length >> 1].toFixed(1) : '--';
  console.log(`${DIFFN[d].padEnd(8)} died ${deaths.length}/${TRIALS} ` +
    `(${(rate * 100).toFixed(0)}%)   median survival ${median}s`);

  const byKiller = Object.entries(killers).sort((a, b) => b[1] - a[1]);
  if (byKiller.length) {
    console.log('         killed by: ' + byKiller.map(([k, v]) => `${k} x${v}`).join(', '));
  }
  const cells = curve.filter((_, i) => i % 5 === 0).slice(0, 9);
  console.log('         bullets/s: ' +
    cells.map((c) => `${c.s}s:${Math.round(c.n / c.k)}`).join('  '));
  console.log('         room/s:    ' +
    cells.map((c) => `${c.s}s:${Math.round(c.near / c.k)}px`).join('  '));
  console.log('');
}

await browser.close();
server.kill();
