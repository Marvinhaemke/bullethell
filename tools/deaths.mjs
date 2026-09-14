// Read a run log back and summarise it.
//
//   node tools/deaths.mjs bossrush-log.json   # a log exported from the game
//   node tools/deaths.mjs --bot --boss 5      # generate one with the dodging bot
//
// The game records deaths, pattern attempts and runs (src/runlog.js) as they
// happen. Get the file with DOWNLOAD LOG in the main or pause menu -- no
// console needed -- or from __BOSSRUSH.game.log.export().
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

/**
 * The target band, in the player's own words and numbers.
 *
 * This is the only calibration in the project that comes from a person rather
 * than from a model of one, and it is worth more than the sweep for exactly
 * that reason. It is one player's skill -- self-described as "not a hardcore
 * bullet hell player, but not that bad" -- so it is a statement about what a
 * difficulty tier should FEEL like to the person it is aimed at, not a
 * universal constant. Re-read it as: at the tier you are meant to be playing,
 *
 *   under 0.5   too easy -- though one such phase per boss is fine, and
 *               especially so on the earlier bosses
 *   0.5 to 1.5  right
 *   1.5 to 2    very hard, and one per boss is acceptable late in the run
 *   2 to 3      too hard here; this is what the NEXT tier up should look like
 *   over 3      not a difficulty, a wall: bad design, or two tiers misplaced
 *
 * IT IS A BAND FOR HARD, and only for Hard. The player who gave it said so
 * plainly when a Normal log was scored against it and came back full of zeroes:
 * "Normal should read below my band. It would be very weird if normal was just
 * as difficulty as Hard. The band I defined is only for Hard at my current
 * skill level." So a Normal log sitting under the band is the ladder working,
 * not a fault to fix, and this tool says which tier it is scoring.
 */
const BANDS = [
  { max: 0.5, key: 'easy', label: 'too easy' },
  { max: 1.5, key: 'good', label: 'good' },
  { max: 2.0, key: 'steep', label: 'very hard (one per boss ok)' },
  { max: 3.0, key: 'over', label: 'TOO HARD -- belongs one tier up' },
  { max: Infinity, key: 'wall', label: 'WALL -- two tiers up, or bad design' },
];
function verdict(dpa) { return BANDS.find((b) => dpa < b.max); }

function banding(rows) {
  const tiers = [...new Set(rows.map((r) => r.diff))];
  const by = new Map(BANDS.map((b) => [b.key, []]));
  for (const r of rows) by.get(verdict(r.deaths / r.tries).key).push(r);
  const dpa = rows.map((r) => r.deaths / r.tries).sort((a, b) => a - b);
  const med = dpa.length % 2 ? dpa[(dpa.length - 1) / 2]
    : (dpa[dpa.length / 2 - 1] + dpa[dpa.length / 2]) / 2;

  const scope = tiers.length === 1 ? tiers[0].toUpperCase() : tiers.join(' + ').toUpperCase();
  console.log(`\nAgainst the target band (${scope}):`);
  if (!tiers.includes('hard')) {
    console.log('  NOTE: the band is a HARD-tier calibration. A lower tier is');
    console.log('  SUPPOSED to sit under it -- that is the ladder, not a fault.');
  }
  for (const b of BANDS) {
    const n = by.get(b.key).length;
    console.log(`  ${b.label.padEnd(34)} ${String(n).padStart(3)}  ` + '#'.repeat(n));
  }
  console.log(`\n  median ${med.toFixed(2)} deaths/attempt -- the band wants 0.5 to 1.5.`);

  // One easy phase per boss is fine; two is a boss with a hole in it.
  const easyPer = new Map();
  for (const r of by.get('easy')) easyPer.set(r.boss, (easyPer.get(r.boss) || 0) + 1);
  const crowded = [...easyPer].filter(([, n]) => n > 1);
  if (crowded.length) {
    console.log('  bosses with more than one too-easy phase: ' +
      crowded.map(([b, n]) => `${b} (${n})`).join(', '));
  }
  const bad = [...by.get('over'), ...by.get('wall')];
  if (bad.length) {
    console.log('\n  Above the band, worst first:');
    for (const r of bad) {
      console.log(`    ${r.phase.padEnd(24)} ${(r.deaths / r.tries).toFixed(2)}  ${verdict(r.deaths / r.tries).label}`);
    }
  }
}


const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const USE_BOT = args.includes('--bot');
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));

let entries;
let phases = [];
let runs = [];

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
    g.log.clear();
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
    return g.log.deaths;
  }, [BOSS === null ? [0, 1, 2, 3, 4] : [BOSS], TRIALS, FRAMES]);

  await browser.close();
  server.kill();
} else {
  if (!file || !existsSync(file)) {
    console.error('Pass an exported log, or --bot to generate one.\n' +
      'Export from the game console with: __BOSSRUSH.game.deaths.export()');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  // A log exported before phases and runs existed is a bare array.
  entries = Array.isArray(raw) ? raw : raw.deaths || [];
  if (!Array.isArray(raw) && Array.isArray(raw.phases) && raw.phases.length) {
    phases = raw.phases;
    runs = Array.isArray(raw.runs) ? raw.runs : [];
  }
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
// Attempts per pattern. Deaths alone cannot say how hard something was: a
// pattern cleared first try having grazed forty bullets and one cleared on the
// third attempt both report zero deaths.
if (phases.length) {
  const pby = new Map();
  for (const ph of phases) {
    if (ph.autopilot) continue;
    const key = `${ph.bossName}|${ph.phase + 1}. ${ph.phaseName}|${ph.diff}`;
    let r = pby.get(key);
    if (!r) {
      r = { boss: ph.bossName, phase: `${ph.phase + 1}. ${ph.phaseName}`, diff: ph.diff,
        tries: 0, cleared: 0, deaths: 0, grazes: 0, bombs: 0, secs: [] };
      pby.set(key, r);
    }
    r.tries++;
    if (ph.outcome === 'cleared') r.cleared++;
    r.deaths += ph.deaths || 0;
    r.grazes += ph.grazes || 0;
    r.bombs += ph.bombs || 0;
    if (ph.seconds) r.secs.push(ph.seconds);
  }
  const prows = [...pby.values()].sort((a, b) => (b.deaths / b.tries) - (a.deaths / a.tries));
  if (prows.length) {
    console.log('\nPattern attempts, worst deaths-per-attempt first:');
    console.log('BOSS          PHASE                      DIFF    TRIES  CLEARED  DEATHS/TRY  GRAZE/TRY   AVG TIME  VERDICT');
    console.log('-'.repeat(116));
    for (const r of prows) {
      console.log(
        r.boss.padEnd(14) + r.phase.padEnd(27) + r.diff.padEnd(7) +
        String(r.tries).padStart(6) + String(r.cleared).padStart(9) +
        (r.deaths / r.tries).toFixed(2).padStart(12) +
        (r.grazes / r.tries).toFixed(0).padStart(11) +
        `${mean(r.secs) === null ? '--' : mean(r.secs).toFixed(0) + 's'}`.padStart(11) +
        '  ' + verdict(r.deaths / r.tries).label);
    }
    banding(prows);
  }
}

if (runs.length) {
  const human = runs.filter((r) => !r.autopilot);
  console.log(`\n${human.length} run(s): ` +
    Object.entries(human.reduce((a, r) => {
      a[r.outcome] = (a[r.outcome] || 0) + 1; return a;
    }, {})).map(([k, v]) => `${v} ${k}`).join(', '));
}

console.log('\nKilling bullet behaviour, all deaths:');
for (const [k, v] of Object.entries(allTraits).sort((a, b) => b[1] - a[1])) {
  const pct = (100 * v / entries.length).toFixed(0);
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${pct.padStart(3)}%  ` +
    '#'.repeat(Math.round(v / entries.length * 40)));
}
