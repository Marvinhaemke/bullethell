// Read a death log back and summarise it.
//
//   node tools/deaths.mjs deaths.json        # a log exported from the browser
//   node tools/deaths.mjs --bot --boss 5     # generate one with the dodging bot
//
// The game records every death (src/deaths.js) into localStorage. To get your
// own log out, open the console on the game page and run:
//
//   copy(__BOSSRUSH.game.deaths.export())        // Chrome/Firefox: to clipboard
//   __BOSSRUSH.game.deaths.export()              // or just read it
//
// then save it to a file and pass it here.
//
// WHAT IT IS FOR
//
// npm run difficulty predicts how hard a phase is from a model of a player --
// straight-line prediction, a movement budget, a reaction window. This is the
// ground truth to check that model against. The columns line up on purpose:
// `clear` here is the same clearance the sweep calls `room`, so a phase whose
// deaths happen at a clearance far above its measured room is one the model is
// getting wrong.
//
// --bot fills a log from the dodging bot instead of a person. That is useful
// for regression, not for tuning: the bot dies to things people do not and
// survives things people do not.

import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const USE_BOT = args.includes('--bot');
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));

let entries;

if (USE_BOT) {
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const { setTimeout: sleep } = await import('node:timers/promises');

  const PORT = num('--port', 8500 + (process.pid % 200));
  const BOSS = args.includes('--boss') ? num('--boss', 1) - 1 : null;
  const TRIALS = num('--trials', 4);
  const FRAMES = num('--frames', 2400);

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

  entries = await page.evaluate(([bosses, trials, frames]) => {
    const { game: g } = window.__BOSSRUSH;
    g.deaths.clear();
    g.settings.autopilot = true;
    g.settings.autofire = true;
    for (const bi of bosses) {
      for (let di = 0; di < 5; di++) {
        const probe = () => { g.debugStart(bi, di, 0); return g.boss.def.phases.length; };
        const phases = probe();
        for (let phi = 0; phi < phases; phi++) {
          for (let t = 0; t < trials; t++) {
            g.autopilot.reset();
            g.debugStart(bi, di, 0);
            g.boss.state = 'fight';
            g.boss.startPhase(phi);
            g.boss.hp = g.boss.hpMax = 1e9;
            g.state = 'fight';
            g.player.x = 160 + (t % 3) * 180;
            g.player.y = 600;
            g.player.invuln = 0;
            for (let f = 0; f < frames; f++) {
              g.update();
              if (g.player.deathAnim > 0) break;
            }
          }
        }
      }
    }
    return g.deaths.entries;
  }, [BOSS === null ? [0, 1, 2, 3, 4] : [BOSS], TRIALS, FRAMES]);

  await browser.close();
  server.kill();
} else {
  if (!file || !existsSync(file)) {
    console.error('Pass an exported log, or --bot to generate one.\n' +
      'Export from the game console with: __BOSSRUSH.game.deaths.export()');
    process.exit(1);
  }
  entries = JSON.parse(readFileSync(file, 'utf8'));
}

if (!Array.isArray(entries) || !entries.length) {
  console.log('No deaths recorded.');
  process.exit(0);
}

// Same grouping as DeathLog.summary, reimplemented here so the tool can read a
// plain JSON file without loading the game.
const by = new Map();
for (const e of entries) {
  const key = `${e.bossName}|${e.phase + 1}. ${e.phaseName}|${e.diff}`;
  let r = by.get(key);
  if (!r) {
    r = { boss: e.bossName, phase: `${e.phase + 1}. ${e.phaseName}`, diff: e.diff,
      n: 0, traits: Object.create(null), causes: Object.create(null),
      into: [], clear: [], bullets: [] };
    by.set(key, r);
  }
  r.n++;
  r.causes[e.cause] = (r.causes[e.cause] || 0) + 1;
  const tr = e.killer ? e.killer.traits : [];
  if (e.killer && !tr.length) r.traits.straight = (r.traits.straight || 0) + 1;
  for (const t of tr) r.traits[t] = (r.traits[t] || 0) + 1;
  r.into.push(e.intoPhase);
  if (e.clearance !== null && e.clearance !== undefined) r.clear.push(e.clearance);
  r.bullets.push(e.bullets);
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const rows = [...by.values()].sort((a, b) => b.n - a.n);

const human = entries.filter((e) => !e.autopilot).length;
console.log(`${entries.length} death(s) recorded` +
  (human === entries.length ? '' : ` (${human} by a player, ${entries.length - human} by the bot)`));
console.log('');
console.log('BOSS          PHASE                      DIFF      N   into   clear  bullets  killed by');
console.log('-'.repeat(100));
for (const r of rows) {
  const top = Object.entries(r.traits).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const how = r.causes.laser === r.n ? 'beam'
    : top.map(([k, v]) => `${k} x${v}`).join(', ') || 'unknown';
  console.log(
    r.boss.padEnd(14) + r.phase.padEnd(27) + r.diff.padEnd(9) +
    String(r.n).padStart(3) +
    `${mean(r.into).toFixed(0)}s`.padStart(7) +
    `${mean(r.clear) === null ? '--' : mean(r.clear).toFixed(0) + 'px'}`.padStart(8) +
    `${mean(r.bullets).toFixed(0)}`.padStart(9) + '  ' + how);
}

// Which behaviours kill, across everything. The point of recording traits off
// the bullet rather than off a label: this table cannot go stale when a
// pattern changes.
const allTraits = Object.create(null);
for (const e of entries) {
  const tr = e.killer ? e.killer.traits : [];
  if (e.cause === 'laser') allTraits.beam = (allTraits.beam || 0) + 1;
  else if (!tr.length) allTraits.straight = (allTraits.straight || 0) + 1;
  for (const t of tr) allTraits[t] = (allTraits[t] || 0) + 1;
}
console.log('\nKilling bullet behaviour, all deaths:');
for (const [k, v] of Object.entries(allTraits).sort((a, b) => b[1] - a[1])) {
  const pct = (100 * v / entries.length).toFixed(0);
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${pct.padStart(3)}%  ` +
    '#'.repeat(Math.round(v / entries.length * 40)));
}
