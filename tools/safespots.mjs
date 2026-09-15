// Dead-zone scanner: find places you can park and never be threatened.
//
//   node tools/safespots.mjs [--frames 900] [--boss 3] [--near 22]
//
// A bullet-hell pattern is broken if there is somewhere you can sit still and
// ignore it. This parks a motionless player at a spread of realistic parking
// spots -- along the bottom of the screen, where players actually sit -- and
// reports any spot nothing ever came near.
//
// The player really is placed at the spot under test, which matters: most of
// these patterns aim at the player, so testing a point without the player
// standing on it measures a different pattern than the one you would face.
//
// "Threatened" means a bullet or beam came within `--near` pixels of the
// hitbox: close enough that a real player would have had to move.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const FRAMES = num('--frames', 900);
const NEAR = num('--near', 22);
// A spot threatened this many times less often than a typical one is a shelter:
// not a dead zone, but a place the pattern has effectively conceded.
//
// Three, set from the one a player found by hand. Maelstrom's floor was
// threatened 18-22% of frames against 50-78% along the middle of the field, and
// their report of it was "very easy if you stay at the bottom, but almost
// impossible if you stay anywhere else" -- so threefold is already enough to
// decide a phase. Note `near` is 22px to a bullet's surface where GRAZE_RADIUS
// is 15px to its centre, which is why a spot can sit at a fifth of frames under
// threat here and still record no grazes at all in a real run.
const SHELTER = num('--shelter', 3);
const ONLY_BOSS = args.includes('--boss') ? num('--boss', 1) - 1 : null;
const PORT = num('--port', 8600 + (process.pid % 200));

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
  const PLAY = { x: 20, y: 20, right: 692, bottom: 748 };

  // Parking spots across the bottom, where a player actually sits -- plus two
  // rows at mid height, which is what makes the shelter comparison mean
  // anything.
  //
  // The grid used to stop at 0.80 and that is how Maelstrom's calm floor got
  // past this tool for so long: every spot it tested was INSIDE the shelter, so
  // the calmest spot and the typical spot were the same place and the ratio
  // came out at 2. A measure of "is one place unusually safe" needs somewhere
  // unsafe in the sample.
  const SPOTS = [];
  for (const fy of [0.45, 0.65, 0.80, 0.90, 0.97]) {
    for (const fx of [0.08, 0.25, 0.5, 0.75, 0.92]) {
      SPOTS.push({
        x: PLAY.x + (PLAY.right - PLAY.x) * fx,
        y: PLAY.y + (PLAY.bottom - PLAY.y) * fy,
      });
    }
  }
  window.__SPOTS = SPOTS;

  window.__PARK = function park(bi, phi, di, frames, near) {
    const { game: g } = window.__BOSSRUSH;
    let safeCount = 0;
    const safeSpots = [];
    const press = [];
    for (let si = 0; si < SPOTS.length; si++) {
      const spot = SPOTS[si];
      g.settings.autopilot = false;
      g.debugStart(bi, di, 0);
      g.boss.state = 'fight';
      g.boss.startPhase(phi);
      g.boss.hp = g.boss.hpMax = 1e9;

      const p = g.player;
      let threatened = false;
      // Frames on which SOMETHING was close enough to have to be dodged. The
      // binary "never threatened" test below is the hard failure; this is the
      // gradient, and the gradient is what a player actually reports.
      let pressed = 0;
      for (let f = 0; f < frames; f++) {
        // Pin the player to the spot: patterns that aim will aim here.
        p.x = spot.x; p.y = spot.y;
        p.vx = 0; p.vy = 0;
        p.invuln = 1e9;
        g.input.down.clear();
        g.update();

        let near1 = false;
        const pool = g.bullets;
        for (let j = 0; j < pool.n; j++) {
          const bl = pool.a[j];
          if (bl.harmless) continue;
          const dx = bl.x - spot.x, dy = bl.y - spot.y;
          const reach = bl.hr + near;
          if (dx * dx + dy * dy < reach * reach) { near1 = true; break; }
        }
        if (!near1) {
          for (let j = 0; j < g.lasers.length; j++) {
            if (g.lasers[j].hits(spot.x, spot.y, near)) { near1 = true; break; }
          }
        }
        if (near1) { pressed++; threatened = true; }
      }
      press.push(pressed / frames);
      if (!threatened) {
        safeCount++;
        safeSpots.push(`(${Math.round(spot.x)},${Math.round(spot.y)})`);
      }
    }
    // How much calmer the calmest place to stand is than a typical one. A
    // pattern with no dead zone at all can still be broken by this: if one
    // corner is threatened a tenth as often as the rest of the field, that
    // corner is the pattern, and everything else is scenery.
    const sorted = press.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const lo = sorted[0];
    const at = SPOTS[press.indexOf(lo)];
    return {
      safeCount, total: SPOTS.length, safeSpots,
      calm: lo, typical: med,
      // A floor of one frame in the window keeps this finite when the calmest
      // spot is never threatened at all -- that case is already the hard
      // failure above, and does not need an infinity here as well.
      shelter: med / Math.max(lo, 1 / frames),
      at: `(${Math.round(at.x)},${Math.round(at.y)})`,
    };
  };
});

const roster = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const out = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    out.push({ name: game.boss.def.name, phases: game.boss.def.phases.map((p) => p.name) });
  }
  return out;
});

const bosses = ONLY_BOSS === null ? [0, 1, 2, 3, 4] : [ONLY_BOSS];
const DIFFN = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'];
const spotCount = await page.evaluate(() => window.__SPOTS.length);

console.log(`Dead-zone scan: ${spotCount} parking spots, ${(FRAMES / 60).toFixed(0)}s each, ` +
  `threatened = within ${NEAR}px.`);
console.log('A spot is "safe" if nothing came near it for the whole window; a cell');
console.log(`reading xN has no such spot but its calmest is N times calmer than typical.\n`);
console.log('BOSS          PHASE                      ' +
  DIFFN.map((n) => n.slice(0, 4).padStart(9)).join(''));
console.log('-'.repeat(44 + 9 * 5));

const findings = [];
const shelters = [];
for (const b of bosses) {
  for (let ph = 0; ph < roster[b].phases.length; ph++) {
    const cells = [];
    for (let d = 0; d < 5; d++) {
      const r = await page.evaluate(
        ([bi, phi, di, frames, near]) => window.__PARK(bi, phi, di, frames, near),
        [b, ph, d, FRAMES, NEAR],
      );
      cells.push((r.safeCount === 0 ? `x${r.shelter.toFixed(0)}` : `${r.safeCount}/${r.total}`).padStart(9));
      if (r.safeCount > 0) {
        findings.push(`${roster[b].name} ${ph + 1}. ${roster[b].phases[ph]} @ ${DIFFN[d]}: ` +
          `${r.safeCount} of ${r.total} spots never threatened  ${r.safeSpots.slice(0, 4).join(' ')}`);
      } else if (r.shelter >= SHELTER) {
        shelters.push(`${roster[b].name} ${ph + 1}. ${roster[b].phases[ph]} @ ${DIFFN[d]}: ` +
          `${r.at} is threatened ${(r.calm * 100).toFixed(1)}% of frames against ` +
          `${(r.typical * 100).toFixed(1)}% typical -- ${r.shelter.toFixed(0)}x calmer`);
      }
    }
    console.log(roster[b].name.padEnd(14) + `${ph + 1}. ${roster[b].phases[ph]}`.padEnd(30) + cells.join(''));
  }
}

console.log('-'.repeat(44 + 9 * 5));
if (findings.length) {
  console.log(`\n${findings.length} phase/difficulty pair(s) with a spot you can park in:`);
  for (const f of findings) console.log('  - ' + f);
} else {
  console.log('\nNo parking spots: every phase threatens every tested position.');
}
if (shelters.length) {
  console.log(`\n${shelters.length} phase/difficulty pair(s) with a SHELTER -- no dead zone,`);
  console.log(`but one place ${SHELTER}x calmer than the rest of the field:`);
  for (const sh of shelters) console.log('  - ' + sh);
}

await browser.close();
server.kill();
if (findings.length) process.exit(1);
