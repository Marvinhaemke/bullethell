// Captures a PNG of every boss phase (and the menus) so patterns can be
// eyeballed without playing through the whole rush.
//
//   node tools/shots.mjs [--diff 4]

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const di = args.indexOf('--diff');
const DIFF = di >= 0 ? Number(args[di + 1]) : 4;
const OUT = new URL('./shots/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const PORT = 8126;
const server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
await sleep(700);

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium']
  .find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1120, height: 880 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);

const shot = async (name) => {
  await page.screenshot({ path: new URL(name + '.png', OUT).pathname });
  console.log('  ' + name + '.png');
};

// --- menus ---
console.log('menus');
await page.evaluate(() => { const { game } = window.__BOSSRUSH; game.setScene('title'); for (let i = 0; i < 40; i++) game.update(); game.draw(); });
await shot('00-title');
await page.evaluate(() => { const { game } = window.__BOSSRUSH; game.setScene('menu'); for (let i = 0; i < 20; i++) game.update(); game.draw(); });
await shot('01-menu');
await page.evaluate(() => { const { game } = window.__BOSSRUSH; game.setScene('select'); game.selectMenu.index = 4; for (let i = 0; i < 20; i++) game.update(); game.draw(); });
await shot('02-select');
await page.evaluate(() => { const { game } = window.__BOSSRUSH; game.setScene('help'); for (let i = 0; i < 5; i++) game.update(); game.draw(); });
await shot('03-help');

// --- every phase ---
const phases = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const list = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    game.boss.def.phases.forEach((p, i) => list.push({ b, i, boss: game.boss.def.id, name: p.name }));
  }
  return list;
});

console.log(`phases (difficulty ${DIFF})`);
for (const p of phases) {
  await page.evaluate(({ b, i, diff }) => {
    const { game } = window.__BOSSRUSH;
    game.debugStart(b, diff, 0);
    game.boss.state = 'fight';
    game.boss.startPhase(i);
    game.boss.hp = game.boss.hpMax = 1e9;
    game.player.invuln = 1e9;
    // Park the player somewhere representative and let the pattern develop.
    for (let f = 0; f < 460; f++) {
      game.player.x = game.pfCx || 356;
      game.player.y = 600 + Math.sin(f / 40) * 40;
      game.update();
    }
    game.draw();
  }, { b: p.b, i: p.i, diff: DIFF });
  const slug = `${p.b + 1}${String.fromCharCode(97 + p.i)}-${p.boss}-${p.name.toLowerCase().replace(/\W+/g, '-')}`;
  await shot(slug);
}

await browser.close();
server.kill();
console.log(`\nWrote ${phases.length + 4} images to tools/shots/`);
