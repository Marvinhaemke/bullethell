// Ship balance bench: how long each ship takes to break each damage phase.
//
//   node tools/ships.mjs [--diff 2] [--stance both|dodge|commit] [--port N]
//
// Two drivers, because the two stances are played completely differently and
// one measurement cannot stand in for both:
//
//   dodge   The dodging bot drives, never focusing. This is the baseline: a
//           phase's `time` is its par, and the design target is that simply
//           dodging and plinking clears at roughly par. The bot does not aim,
//           so straight lanes rarely land here -- which is the point. While
//           you are dodging, unaimed weapons are a bonus, not the floor.
//   commit  A player lined up under the boss, focused, tracking its x at focus
//           speed. This is the reward for standing still, and it is the only
//           driver that can measure a straight weapon at all: scored against
//           the bot, a heavy forward bolt reads as doing no damage rather than
//           as demanding position.
//
// Both drivers are immortal. The question here is what the gun does, not
// whether the route is survivable -- botbench.mjs answers that one.
//
// Survival phases have no health, so they are skipped.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const str = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};
const DIFF = num('--diff', 2);
const STANCE = str('--stance', 'both');
const CAP = num('--cap', 90 * 60);
const PORT = num('--port', 8800 + (process.pid % 200));

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
  const { game: g } = window.__BOSSRUSH;

  // In `dodge` the bot picks the heading as usual; only the stance key is
  // rewritten, so the route is the bot's own.
  const realDrive = g.autopilot.drive.bind(g.autopilot);
  g.autopilot.drive = function drive(input, autofire) {
    realDrive(input, autofire);
    input.down.delete('ShiftLeft');
  };

  // `commit` holds the keys a player would: chase the boss's x, and focus once
  // lined up. Focus speed is 1.85px/frame and several bosses drift faster than
  // that, so a driver that focuses unconditionally can never catch them and
  // reads every moving phase as zero damage. Letting go of focus to reposition
  // is the actual tactic, so the driver uses it.
  const LINED = 24;
  function driveCommit(input) {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ShiftLeft']) {
      input.down.delete(k);
    }
    const dx = g.boss.x - g.player.x;
    if (Math.abs(dx) < LINED) input.down.add('ShiftLeft');
    if (dx > 2) input.down.add('ArrowRight');
    else if (dx < -2) input.down.add('ArrowLeft');
  }

  window.__RUN = function run(ship, bi, phi, di, stance, cap) {
    g.settings.ship = ship;
    g.settings.autofire = true;
    g.settings.autopilot = stance === 'dodge';
    g.autopilot.reset();
    g.debugStart(bi, di, 0);
    g.boss.state = 'fight';
    g.boss.startPhase(phi);
    // Immortal: a death mid-run would measure the route, not the gun.
    g.player.invuln = 1e9;

    let frames = 0;
    while (g.boss.phaseIndex === phi && g.boss.state === 'fight' && frames < cap) {
      g.player.invuln = 1e9;
      if (stance === 'commit') driveCommit(g.input);
      g.update();
      frames++;
    }
    return { frames, cleared: g.boss.state !== 'fight', hpLeft: Math.max(0, g.boss.hp) };
  };
});

const roster = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const out = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    out.push({
      name: game.boss.def.name,
      phases: game.boss.def.phases.map((p) => ({
        name: p.name, survival: !!p.survival, time: p.time || 60 * 60,
      })),
    });
  }
  return out;
});
// The roster is not on `window`, so walk indices until the names repeat --
// `game.ship` clamps, so the last name comes back forever past the end.
const shipNames = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const names = [];
  const start = game.settings.ship;
  for (let i = 0; i < 32; i++) {
    game.settings.ship = i;
    const n = game.ship.name;
    if (names.includes(n)) break;
    names.push(n);
  }
  game.settings.ship = start;
  return names;
});

const DIFFN = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'];
const stances = STANCE === 'both' ? ['dodge', 'commit'] : [STANCE];
const BLURB = {
  dodge: 'bot driving, never focused -- the baseline, target ~1.00 vs par',
  commit: 'lined up under the boss, focused -- the reward for standing still',
};

console.log(`Ship bench @ ${DIFFN[DIFF]}: seconds to break each damage phase.`);
console.log('"par" is the phase\'s scoring time.\n');

for (const stance of stances) {
  console.log(`=== ${stance.toUpperCase()} · ${BLURB[stance]} ===`);
  console.log('BOSS          PHASE                       par' +
    shipNames.map((n) => n.slice(0, 7).padStart(9)).join(''));
  console.log('-'.repeat(46 + 9 * shipNames.length));

  const totals = shipNames.map(() => 0);
  let parTotal = 0;
  let phaseCount = 0;

  for (let b = 0; b < roster.length; b++) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      const p = roster[b].phases[ph];
      if (p.survival) continue;
      const cells = [];
      for (let s = 0; s < shipNames.length; s++) {
        const r = await page.evaluate(
          ([ship, bi, phi, di, st, cap]) => window.__RUN(ship, bi, phi, di, st, cap),
          [s, b, ph, DIFF, stance, CAP],
        );
        const secs = r.frames / 60;
        totals[s] += r.cleared ? secs : CAP / 60;
        cells.push((r.cleared ? secs.toFixed(1) : `>${(CAP / 60).toFixed(0)}`).padStart(9));
      }
      parTotal += p.time / 60;
      phaseCount++;
      console.log(roster[b].name.padEnd(14) +
        `${ph + 1}. ${p.name}`.padEnd(28) +
        (p.time / 60).toFixed(0).padStart(4) +
        cells.join(''));
    }
  }

  console.log('-'.repeat(46 + 9 * shipNames.length));
  console.log('TOTAL'.padEnd(42) + parTotal.toFixed(0).padStart(6) +
    totals.map((t) => t.toFixed(0).padStart(9)).join(''));
  console.log('vs par'.padEnd(42) + '1.00'.padStart(6) +
    totals.map((t) => (t / parTotal).toFixed(2).padStart(9)).join(''));
  const spread = Math.max(...totals) / Math.min(...totals);
  console.log(`\n${phaseCount} damage phases · spread fastest-to-slowest ship: ` +
    `${spread.toFixed(2)}×\n`);
}

await browser.close();
server.kill();
