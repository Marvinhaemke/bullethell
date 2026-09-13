// Survivability check: can a player actually dodge each pattern, and does an
// easier difficulty really give more room?
//
//   node tools/survivable.mjs                 # the ladder check (pass/fail)
//   node tools/survivable.mjs --sweep         # measure each phase's real margin
//   node tools/survivable.mjs --boss 2        # one boss only
//   node tools/survivable.mjs --frames 1800   # longer trials
//   node tools/survivable.mjs --port 8200    # pin the dev-server port
//   node tools/survivable.mjs --ladder 1,2,3,4,6   # Novice-first multipliers
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT
//
// A headless dodging bot plays each pattern. If it survives, the pattern is
// demonstrably dodgeable at that hitbox size -- that is a real proof, because
// the bot only uses inputs a human has (eight directions, focus or not, at the
// game's own speeds, through the game's own input handling).
//
// The converse does NOT hold. A death may mean the pattern is unfair, or just
// that the bot played badly: it evaluates straight-line headings only and has
// no memory, so it cannot plan a curve or set up for a wave it can see
// coming. A failure is a flag for review, never a verdict of "impossible".
//
// KNOWN BLIND SPOT: the beam phases (Chaos Engine's "Sweep Lasers" and
// "Final Theorem"), which are where every remaining bot death lands. A
// rotating beam outruns the player past a radius of speed/spin, so surviving
// one means orbiting the boss -- a curve, which a straight-line planner
// cannot express. Treat those two rows as a floor on the bot's skill rather
// than a measurement of the pattern.
//
// THE LADDER
//
// The hardest difficulty is tested at the true hitbox. Each easier tier has to
// clear its own pattern with a proportionally larger one, which is what makes
// "easier" mean more margin rather than only slower bullets. A tier that
// cannot survive at its multiplier is tighter than the tier above it deserves.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const FRAMES = num('--frames', 1500);
const TRIALS = num('--trials', 3);
const ONLY_BOSS = args.includes('--boss') ? num('--boss', 1) - 1 : null;
const SWEEP = args.includes('--sweep');

// Hitbox multiplier required of each difficulty, in DIFFICULTIES order
// (0 Novice ... 4 Lunatic). The hardest tier is held to the true hitbox and
// each easier one to a larger multiple, so "easier" has to mean more room.
//
// Override without editing: --ladder 1,2,3,4,6  (listed Novice-first).
const DEFAULT_LADDER = [15, 10, 6, 3, 1];
const ladderArg = args.indexOf('--ladder');
const HITBOX_LADDER = ladderArg >= 0
  ? args[ladderArg + 1].split(',').map(Number)
  : DEFAULT_LADDER;
if (HITBOX_LADDER.length !== 5 || HITBOX_LADDER.some((n) => !(n > 0))) {
  throw new Error('--ladder needs five positive numbers, Novice first');
}

// Multipliers tried in --sweep mode when measuring a phase's actual margin.
const SWEEP_STEPS = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 26, 34];

const PORT = num('--port', 8160 + (process.pid % 300));
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

// ---------------------------------------------------------------------------
// Test harness. The bot itself lives in src/autopilot.js and ships with the
// game, so this measures the same dodger players can switch on rather than a
// second implementation that could drift from it.
// ---------------------------------------------------------------------------
await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const PLAY = { x: 20, y: 20, w: 672, h: 728, right: 692, bottom: 748, cx: 356 };

  /**
   * Control experiment: how long does a player who never moves last? If
   * standing still already survives the window, the phase is not putting the
   * player under pressure and a bot "clearing" it proves nothing about
   * dodging. Guards the whole suite against passing trivially.
   */
  window.__IDLE = function idle(bossIdx, phaseIdx, diffIdx, frames) {
    game.debugStart(bossIdx, diffIdx, 0);
    game.boss.state = 'fight';
    game.boss.startPhase(phaseIdx);
    game.boss.hp = game.boss.hpMax = 1e9;
    const p = game.player;
    p.x = PLAY.cx;
    p.y = PLAY.bottom - 104;
    for (let f = 0; f < frames; f++) {
      p.hitR = 2.7;
      p.invuln = 0;
      game.input.down.clear();
      game.update();
      if (p.deathAnim > 0) return f;
    }
    return -1;
  };

  /**
   * Play one phase at a given hitbox multiplier. Returns how long the bot
   * lasted; `survived` means it got through the whole window untouched.
   */
  window.__SURVIVE = function run(bossIdx, phaseIdx, diffIdx, mult, frames, startX) {
    game.debugStart(bossIdx, diffIdx, 0);
    game.boss.state = 'fight';
    game.boss.startPhase(phaseIdx);
    game.boss.hp = game.boss.hpMax = 1e9;    // never end the phase early
    game.autopilot.reset();

    const p = game.player;
    p.x = startX;
    p.y = PLAY.bottom - 104;
    const hitR = 2.7 * mult;

    let died = -1;
    let closest = 1e9;

    for (let f = 0; f < frames; f++) {
      p.hitR = hitR;
      p.invuln = 0;                          // no free frames
      if (p.deathAnim > 0) { died = f; break; }

      game.input.down.clear();
      game.autopilot.drive(game.input, true);   // autofire: firing is not under test

      game.update();

      // Track the tightest gap the bot actually threaded.
      const pool = game.bullets;
      for (let i = 0; i < pool.n; i++) {
        const b = pool.a[i];
        if (b.harmless) continue;
        const dx = b.x - p.x, dy = b.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) - b.hr - hitR;
        if (d < closest) closest = d;
      }
      if (p.deathAnim > 0) { died = f; break; }
    }
    game.input.down.clear();
    return {
      survived: died < 0,
      frames: died < 0 ? frames : died,
      closest: Math.round(closest * 10) / 10,
    };
  };
});

// ---------------------------------------------------------------------------
// Drive it
// ---------------------------------------------------------------------------
const roster = await page.evaluate(() => {
  const { game } = window.__BOSSRUSH;
  const out = [];
  for (let b = 0; b < 5; b++) {
    game.debugStart(b, 2, 0);
    out.push({ name: game.boss.def.name, phases: game.boss.def.phases.map((p) => p.name) });
  }
  return out;
});
const DIFF_NAMES = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'];
const bosses = ONLY_BOSS === null ? [0, 1, 2, 3, 4] : [ONLY_BOSS];
const failures = [];

async function trial(b, ph, d, mult) {
  // A few start positions, so one unlucky opening does not decide the verdict.
  const starts = [356, 200, 512].slice(0, TRIALS);
  let best = null;
  for (const sx of starts) {
    const r = await page.evaluate(
      ([bb, pp, dd, mm, ff, ss]) => window.__SURVIVE(bb, pp, dd, mm, ff, ss),
      [b, ph, d, mult, FRAMES, sx],
    );
    if (!best || r.frames > best.frames) best = r;
    if (r.survived) return r;          // one clean run is proof enough
  }
  return best;
}

if (SWEEP) {
  console.log(`Measuring each phase's real margin -- largest hitbox multiple the bot can clear.`);
  console.log(`(${FRAMES} frames per trial, ${TRIALS} starts, x1 hitbox = ${2.7}px radius)\n`);
  console.log('BOSS          PHASE                      ' + DIFF_NAMES.map((n) => n.slice(0, 4).padStart(7)).join(''));
  console.log('-'.repeat(46 + 7 * 5));
  for (const b of bosses) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      const cells = [];
      for (let d = 0; d < 5; d++) {
        let margin = 0;
        for (const m of SWEEP_STEPS) {
          const r = await trial(b, ph, d, m);
          if (!r.survived) break;
          margin = m;
        }
        cells.push(String(margin === 0 ? '<1' : '×' + margin).padStart(7));
      }
      console.log(
        roster[b].name.padEnd(14) + `${ph + 1}. ${roster[b].phases[ph]}`.padEnd(28) + cells.join(''),
      );
    }
  }
} else {
  console.log('Ladder check: each difficulty must be dodgeable at its required hitbox size.');
  console.log(`x1 = the real 2.7px hitbox. ${FRAMES} frames (${(FRAMES / 60).toFixed(0)}s) per trial, up to ${TRIALS} starts.\n`);
  // Control: on the hardest difficulty, standing still must be fatal. If it
  // is not, the suite could pass without demonstrating any dodging at all.
  const idleSurvivors = [];
  for (const b of bosses) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      const f = await page.evaluate(
        ([bb, pp, ff]) => window.__IDLE(bb, pp, 4, ff),
        [b, ph, Math.min(FRAMES, 900)],
      );
      if (f < 0) idleSurvivors.push(`${roster[b].name} ${ph + 1}. ${roster[b].phases[ph]}`);
    }
  }
  if (idleSurvivors.length) {
    console.log('Control check FAILED -- standing still survives these on Lunatic,');
    console.log('so clearing them proves nothing about dodging:');
    for (const s of idleSurvivors) { console.log('  - ' + s); failures.push(`idle player survives ${s} on Lunatic`); }
    console.log('');
  } else {
    console.log('Control: standing still is fatal on every phase at Lunatic. OK\n');
  }

  console.log('BOSS          PHASE                       DIFFICULTY  HITBOX  RESULT');
  console.log('-'.repeat(78));

  for (const b of bosses) {
    for (let ph = 0; ph < roster[b].phases.length; ph++) {
      for (let d = 4; d >= 0; d--) {
        const mult = HITBOX_LADDER[d];
        const r = await trial(b, ph, d, mult);
        const verdict = r.survived
          ? `ok   (closest gap ${r.closest}px)`
          : `HIT at ${(r.frames / 60).toFixed(1)}s`;
        console.log(
          roster[b].name.padEnd(14) +
          `${ph + 1}. ${roster[b].phases[ph]}`.padEnd(28) +
          DIFF_NAMES[d].padEnd(12) +
          ('x' + mult).padEnd(8) +
          verdict,
        );
        if (!r.survived) {
          failures.push(`${roster[b].name} ${ph + 1}. ${roster[b].phases[ph]} @ ${DIFF_NAMES[d]} x${mult}: hit at ${(r.frames / 60).toFixed(1)}s`);
        }
      }
    }
  }
}

await browser.close();
server.kill();

if (!SWEEP) {
  console.log('\n' + '='.repeat(78));
  if (failures.length) {
    console.log(`${failures.length} phase/difficulty pairs the bot could not clear:`);
    for (const f of failures) console.log('  - ' + f);
    console.log('\nA failure is a flag for review, not proof the pattern is impossible:');
    console.log('the bot evaluates straight-line headings only, so it cannot plan the curve');
    console.log('a rotating beam demands, nor set up for a wave it can already see coming.');
    process.exit(1);
  }
  console.log('Every phase is dodgeable at its required hitbox size.');
}
