// Ad-hoc probe used while tuning: reports damage throughput, phase pacing and
// render cost. Not part of the smoke test.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8124;
const server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
await sleep(700);

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium']
  .find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);

const res = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const out = {};

  // --- damage throughput: park the player under a frozen boss -------------
  game.debugStart(0, 2, 0);
  game.input.down.add('KeyZ');
  game.input.down.add('ShiftLeft');
  for (let i = 0; i < 120; i++) game.update();     // clear the intro
  // Freeze the movement script so the boss stays lined up with the player.
  game.boss.moveRunner.done = true;
  game.boss.x = game.player.x;
  game.boss.hp = game.boss.hpMax = 1e9;

  let hits = 0;
  const origDamage = game.boss.damage.bind(game.boss);
  game.boss.damage = (a) => { const d = origDamage(a); if (d) hits++; return d; };

  let hp0 = game.boss.hp;
  for (let i = 0; i < 60; i++) game.update();
  out.focusedDps = Math.round(hp0 - game.boss.hp);
  out.focusedHits = hits;
  game.input.down.delete('ShiftLeft');

  hits = 0;
  hp0 = game.boss.hp;
  for (let i = 0; i < 60; i++) game.update();
  out.spreadDps = Math.round(hp0 - game.boss.hp);
  out.spreadHits = hits;
  game.input.down.delete('KeyZ');

  // --- realistic phase pacing: perfect tracking player --------------------
  const pace = [];
  for (const diff of [0, 2, 4]) {
    game.debugStart(0, diff, 0);
    game.input.down.add('KeyZ');
    game.input.down.add('ShiftLeft');
    let frames = 0;
    let phase = -1;
    const marks = [];
    while (frames < 60 * 200 && game.state === 'fight') {
      // Track the boss horizontally at full unfocused speed, as a competent
      // player would while keeping the boss over the shot lane.
      game.player.x += Math.max(-4.5, Math.min(4.5, game.boss.x - game.player.x));
      game.player.invuln = 60;                      // ignore deaths for pacing
      game.update();
      frames++;
      if (game.boss && game.boss.phaseIndex !== phase) {
        phase = game.boss.phaseIndex;
        marks.push(Math.round(frames / 60));
      }
    }
    game.input.down.delete('KeyZ');
    game.input.down.delete('ShiftLeft');
    pace.push({ diff, totalSec: Math.round(frames / 60), phaseStartsSec: marks, ended: game.state });
  }
  out.pacing = pace;
  return out;
});
console.log(JSON.stringify(res, null, 2));

// --- render cost at high bullet counts -------------------------------------
const perf = await page.evaluate(async () => {
  const { game } = window.__BOSSRUSH;
  const out = [];
  for (const boss of [0, 1, 2, 3, 4]) {
    game.debugStart(boss, 4, 0);
    for (let i = 0; i < 900; i++) game.update();
    const peak = game.bullets.count;
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) { game.update(); game.draw(); }
    const ms = (performance.now() - t0) / 60;
    out.push({ boss: boss + 1, bullets: peak, msPerFrame: +ms.toFixed(2) });
  }
  return out;
});
console.log('\nLunatic render cost (16.7ms budget):');
console.table(perf);

await browser.close();
server.kill();
