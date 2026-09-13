// Autopilot quality benchmark. Runs the shipped bot at the real hitbox and
// reports, per phase, whether it survives and how much room it leaves itself.
//
//   node tools/botbench.mjs [--diff 4] [--frames 3600] [--port 8500]
//
// Three numbers matter:
//   survived      did it get through the window without being hit
//   tightest      the smallest gap it accepted (a training aid should not be
//                 threading sub-pixel gaps -- that is not a route a human can
//                 copy)
//   idle drift    where it ends up with no bullets on screen, which is where
//                 a tie-breaking bug shows itself

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const DIFF = num('--diff', 4);
const FRAMES = num('--frames', 3600);
const PORT = num('--port', 8500 + (process.pid % 200));

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

const rows = await page.evaluate(({ diff, frames }) => {
  const { game } = window.__BOSSRUSH;
  const out = [];
  const roster = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    roster.push({ name: game.boss.def.name, phases: game.boss.def.phases.map((p) => p.name) });
  }

  for (let b = 0; b < 5; b++) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      game.settings.autopilot = true;
      game.settings.autofire = true;
      game.debugStart(b, diff, 0);
      game.boss.state = 'fight';
      game.boss.startPhase(ph);
      game.boss.hp = game.boss.hpMax = 1e9;
      game.autopilot.reset();

      const p = game.player;
      let died = -1;
      let tightest = 1e9;
      for (let f = 0; f < frames; f++) {
        p.invuln = 0;
        game.update();
        if (p.deathAnim > 0) { died = f; break; }
        const pool = game.bullets;
        for (let i = 0; i < pool.n; i++) {
          const bl = pool.a[i];
          if (bl.harmless) continue;
          const dx = bl.x - p.x, dy = bl.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy) - bl.hr - p.hitR;
          if (d < tightest) tightest = d;
        }
      }
      out.push({
        boss: roster[b].name,
        phase: `${ph + 1}. ${roster[b].phases[ph]}`,
        survived: died < 0,
        diedAt: died < 0 ? '' : (died / 60).toFixed(1) + 's',
        tightest: Math.round(tightest * 10) / 10,
      });
    }
  }
  return out;
}, { diff: DIFF, frames: FRAMES });

// Where does it settle with an empty screen? A resting bot should not walk
// into a corner.
const idle = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  game.settings.autopilot = true;
  game.debugStart(0, 2, 0);
  game.boss.state = 'fight';
  game.boss.startPhase(0);
  game.boss.hp = game.boss.hpMax = 1e9;
  game.autopilot.reset();
  const p = game.player;
  const path = [];
  for (let f = 0; f < 420; f++) {
    game.bullets.clear();          // keep the field empty every frame
    game.lasers.length = 0;
    game.update();
    if (f % 105 === 0) path.push(`(${Math.round(p.x)},${Math.round(p.y)})`);
  }
  return { path: path.join(' -> '), end: `(${Math.round(p.x)},${Math.round(p.y)})` };
});

const DIFFN = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'][DIFF];
console.log(`Autopilot at ${DIFFN}, real hitbox, ${(FRAMES / 60).toFixed(0)}s per phase\n`);
console.log('BOSS          PHASE                        RESULT        TIGHTEST GAP');
console.log('-'.repeat(72));
let deaths = 0;
let worst = 1e9;
for (const r of rows) {
  if (!r.survived) deaths++;
  worst = Math.min(worst, r.tightest);
  console.log(
    r.boss.padEnd(14) + r.phase.padEnd(29) +
    (r.survived ? 'survived' : 'DIED ' + r.diedAt).padEnd(14) +
    r.tightest + 'px',
  );
}
console.log('-'.repeat(72));
console.log(`${deaths} death(s) across ${rows.length} phases; tightest gap accepted anywhere: ${worst}px`);
console.log(`\nIdle drift with an empty screen (starts at 356,644):\n  ${idle.path}\n  ends ${idle.end}`);

await browser.close();
server.kill();
