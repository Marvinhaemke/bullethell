// Per-phase bullet census. For every boss / phase / difficulty it runs the
// pattern in isolation and reports peak concurrent bullets plus render cost,
// which is how the density curve gets balanced.
//
//   node tools/census.mjs [--diff 4] [--frames 900]

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const pick = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const FRAMES = pick('--frames', 900);
const ONLY_DIFF = args.includes('--diff') ? pick('--diff', 4) : null;

const PORT = 8125;
const server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
await sleep(700);

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium']
  .find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);

const diffs = ONLY_DIFF === null ? [0, 2, 4] : [ONLY_DIFF];

const rows = await page.evaluate(async ({ frames, diffs }) => {
  const { game } = window.__BOSSRUSH;
  const BOSSES = game.constructor;
  void BOSSES;
  const out = [];

  // Reach into the live roster through a started run.
  game.debugStart(0, 2, 0);
  const roster = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    roster.push({ name: game.boss.def.name, phases: game.boss.def.phases.map((p) => p.name) });
  }

  for (let b = 0; b < 5; b++) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      for (const d of diffs) {
        game.debugStart(b, d, 0);
        // Skip the intro and jump straight to the phase under test.
        game.boss.state = 'fight';
        game.boss.startPhase(ph);
        game.boss.hp = game.boss.hpMax = 1e9;   // never break out of the phase
        game.player.invuln = 1e9;

        let peak = 0;
        for (let i = 0; i < frames; i++) {
          game.update();
          if (game.bullets.count > peak) peak = game.bullets.count;
        }
        const t0 = performance.now();
        for (let i = 0; i < 40; i++) { game.update(); game.draw(); }
        const ms = (performance.now() - t0) / 40;

        out.push({
          boss: roster[b].name,
          phase: `${ph + 1}. ${roster[b].phases[ph]}`,
          diff: d,
          peak,
          end: game.bullets.count,
          ms: +ms.toFixed(1),
        });
      }
    }
  }
  return out;
}, { frames: FRAMES, diffs });

const header = `${'BOSS'.padEnd(14)}${'PHASE'.padEnd(26)}` +
  diffs.map((d) => `${('D' + d + ' peak').padStart(9)}${'ms'.padStart(7)}`).join('');
console.log(header);
console.log('-'.repeat(header.length));

const byPhase = new Map();
for (const r of rows) {
  const key = r.boss + '|' + r.phase;
  if (!byPhase.has(key)) byPhase.set(key, []);
  byPhase.get(key).push(r);
}
let worstPeak = 0, worstMs = 0;
for (const [key, list] of byPhase) {
  const [boss, phase] = key.split('|');
  let line = boss.padEnd(14) + phase.padEnd(26);
  for (const r of list) {
    line += String(r.peak).padStart(9) + String(r.ms).padStart(7);
    worstPeak = Math.max(worstPeak, r.peak);
    worstMs = Math.max(worstMs, r.ms);
  }
  console.log(line);
}
console.log('-'.repeat(header.length));
console.log(`worst peak ${worstPeak} bullets, worst frame ${worstMs}ms (software renderer)`);

await browser.close();
server.kill();
