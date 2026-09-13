// Difficulty sweep on space AND predictability.
//
//   node tools/difficulty.mjs [--frames 1200] [--starts 2] [--boss 5]
//   node tools/difficulty.mjs --detail --boss 5 --phase 4
//
// WHY THIS EXISTS
//
// survivable.mjs --sweep measures one thing: the largest hitbox the bot can
// clear, which is space. Space is not all of difficulty. A homing bullet takes
// up no more room than a straight one and is far worse to be near; a bullet
// that bounces off a wall occupies the same pixels and invalidates the route
// you had planned; a faster bullet leaves the same gap and less time to use
// it. Two phases can measure identically on room and play nothing alike.
//
// HOW PREDICTABILITY IS MEASURED
//
// Not by tagging behaviours -- no "homing counts double" table, which would be
// a guess dressed as a number, and would silently miss any behaviour nobody
// thought to tag. Instead the thing a player actually does is modelled: you
// look at a bullet, assume it keeps going the way it is going, and plan a
// route through the gap. So the harness records every nearby bullet's position
// and velocity, waits HORIZON frames, and measures how far from that straight
// line it actually ended up.
//
// That one number falls out of every behaviour at once: curvature (turn),
// gravity (ax/ay), speed ramps (accel), stop-and-snap (stopT/goT), wall
// bounces, homing, orbits and splits all move a bullet off the line a player
// extrapolated, in proportion to how badly they break the assumption. A
// straight bullet scores zero no matter how fast it is going.
//
// THE AXES
//
//   room    median clearance from the hitbox to the nearest bullet, in px.
//           Space, as it is moment to moment. Note this is TYPICAL room, where
//           survivable.mjs --sweep answers the worst case (the largest hitbox
//           that never dies). The two can disagree -- a phase can be roomier
//           on average and tighter at its pinch points -- and where they do,
//           both are right about different things. `tight`, the 10th
//           percentile, is shown in --detail so the disagreement is visible.
//   drift   how much LESS room there turned out to be, HORIZON frames on, than
//           a straight-line reading of the same bullets predicted, in px.
//           Predictability: the part of the room you cannot rely on. Reported
//           at the 90th percentile over frames, because a bounce or a snap
//           betrays you once a cycle rather than every frame and a median
//           would report zero for a pattern that does it twice a second.
//   react   median frames until the most urgent closing bullet arrives.
//           Reaction: this is where faster bullets show up, since speed
//           shortens it while leaving room untouched.
//   aimed   share of nearby bullets launched within 8 degrees of the player.
//           Position: aimed fire means standing still is not a plan, so part
//           of your movement budget goes on repositioning.
//
// COMBINING THEM
//
// room and drift are both in pixels and compose without a fudge factor:
// clearance = room - drift is the gap you can actually count on, because drift
// is by construction the amount your reading of the gap was wrong.
//
// Reaction converts to pixels the same way: reach = react x player speed is how
// far you can get before contact. Needing room you cannot reach in time is the
// same as not having it, so safety = min(clearance, reach).
//
// The aim term is the one judgement call here, and it is exposed as --aim-cost
// so it can be argued with: aimed fire is charged as a fraction of the movement
// budget spent going somewhere rather than dodging.
//
// Lower safety = harder. The number is in pixels and is meant to be compared
// between phases and down a difficulty column, not read as an absolute.
//
// WHAT IT DOES NOT SEE
//
// Beams. Every axis here is computed from the bullet pool, so a phase can be
// made meaningfully easier or harder by changing its sweeps and this will
// report no change at all. Sweep Lasers and Final Theorem are the two phases
// that matters for, and on both the run log is the better witness -- every
// recorded bot death across the whole game is a beam. Splits are the other
// gap: a volley that becomes three is scored as the new bullets it produces,
// not as the prediction failure it also is.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const num = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const FRAMES = num('--frames', 1200);
const STARTS = num('--starts', 2);
// 26 frames, matching the autopilot's own lookahead (AUTOPILOT_CONST.HORIZON).
// The horizon matters -- a wall bounce reads as 5.8px of lost room over 20
// frames and 18.6px over 45 -- so it wants a reason rather than a round
// number, and "however far ahead the planner this suite already trusts looks"
// is the one available. Note the autopilot integrates each bullet's real
// behaviour where this extrapolates a straight line: that gap is the point,
// since a person reads a curve as a line and is wrong by exactly this much.
const HORIZON = num('--horizon', 26);
const AIM_COST = num('--aim-cost', 0.5);
// A phase this far below its column's typical safety is out of line with the
// rest of the game at that difficulty, whatever the absolute pixels say.
const OUTLIER = num('--outlier', 0.75);
const ONLY_BOSS = args.includes('--boss') ? num('--boss', 1) - 1 : null;
const ONLY_PHASE = args.includes('--phase') ? num('--phase', 1) - 1 : null;
const DETAIL = args.includes('--detail');
const PORT = num('--port', 8400 + (process.pid % 200));

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

  // Identity for bullets, so a snapshot can be matched to the same bullet
  // HORIZON frames later. The pool recycles objects, so the id has to be
  // stamped at spawn rather than derived from the slot. Harness-only: nothing
  // in the game reads it.
  let nextId = 1;
  const realSpawn = g.bullets.spawn.bind(g.bullets);
  g.bullets.spawn = function spawn() {
    const b = realSpawn();
    b.__id = nextId++;
    return b;
  };

  const median = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  // Prediction failure is occasional by nature -- a wall bounce or a snap
  // happens once a cycle, not every frame -- so the median would report zero
  // for a pattern that betrays you badly twice a second. room and react stay
  // on the median because they describe the steady state; this describes the
  // exceptions, and the exceptions are what kill you.
  const p90 = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
  };

  // Only bullets this close are ones a player is planning around.
  const NEAR = 190;
  const AIM_TOL = Math.cos(8 * Math.PI / 180);

  window.__DIFF = function measure(bi, phi, di, frames, horizon, seed) {
    g.settings.autopilot = true;
    g.settings.autofire = true;
    g.autopilot.reset();
    g.debugStart(bi, di, 0);
    g.boss.state = 'fight';
    g.boss.startPhase(phi);
    g.boss.hp = g.boss.hpMax = 1e9;

    const p = g.player;
    p.x = 160 + (seed % 3) * 180;
    p.y = 580 + (seed % 2) * 60;

    const rooms = [];
    const drifts = [];
    const reacts = [];
    let aimedHits = 0;
    let aimedSeen = 0;

    // Ring of snapshots: each entry is a Map(id -> [x, y, vx, vy]) of the
    // bullets that were near the player on that frame.
    const ring = new Array(horizon).fill(null);

    for (let f = 0; f < frames; f++) {
      p.invuln = 1e9;            // measuring pressure, not the bot's survival
      g.update();

      const pool = g.bullets;
      const live = new Map();
      const nearNow = new Map();
      let room = 1e9;
      let soonest = 1e9;

      for (let j = 0; j < pool.n; j++) {
        const b = pool.a[j];
        if (b.harmless || b.__id === undefined) continue;
        live.set(b.__id, b);

        const dx = b.x - p.x, dy = b.y - p.y;
        const dist = Math.hypot(dx, dy);
        const clear = dist - b.hr - p.hitR;
        if (clear < room) room = clear;

        // Aimed on launch: heading within AIM_TOL of the line to the player.
        // Checked before the proximity gate below, because aimed fire is
        // launched from the boss -- a screen away -- and gating it on being
        // near the player measured essentially nothing.
        if (b.age <= 1) {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.01 && dist > 1) {
            aimedSeen++;
            if ((b.vx * -dx + b.vy * -dy) / (sp * dist) >= AIM_TOL) aimedHits++;
          }
        }

        if (dist > NEAR) continue;

        const ux = -dx / (dist || 1), uy = -dy / (dist || 1);

        // Time until it reaches the hitbox at the current closing rate. The
        // player's own velocity counts: closing is relative.
        const closing = (b.vx - p.vx) * ux + (b.vy - p.vy) * uy;
        if (closing > 0.01) {
          const t = clear / closing;
          if (t >= 0 && t < soonest) soonest = t;
        }

        nearNow.set(b.__id, [b.x, b.y, b.vx, b.vy]);
      }

      if (room < 1e9) rooms.push(room);
      if (soonest < 1e9) reacts.push(soonest);

      // Compare the snapshot from `horizon` frames ago against where those
      // bullets actually are now. Bullets that have since been culled are
      // skipped: they left the field, which is not a prediction failure.
      // How much less room there turned out to be than a straight-line reading
      // predicted. Measured as room rather than as bullet displacement, and
      // over the same set of bullets, so it is in the same units and the same
      // population as `room` and can simply be subtracted from it. A bullet
      // that swerves away from you is not a threat, so only the shortfall
      // counts.
      const past = ring[f % horizon];
      if (past) {
        let predicted = 1e9, actual = 1e9;
        for (const [id, s] of past) {
          const b = live.get(id);
          if (!b) continue;
          const hr = b.hr + p.hitR;
          const px = s[0] + s[2] * horizon, py = s[1] + s[3] * horizon;
          const pc = Math.hypot(px - p.x, py - p.y) - hr;
          const ac = Math.hypot(b.x - p.x, b.y - p.y) - hr;
          if (pc < predicted) predicted = pc;
          if (ac < actual) actual = ac;
        }
        if (predicted < 1e9) drifts.push(Math.max(0, predicted - actual));
      }
      ring[f % horizon] = nearNow;
    }

    const p10 = (a) => {
      if (!a.length) return null;
      const t = a.slice().sort((x, y) => x - y);
      return t[Math.floor(t.length * 0.1)];
    };
    return {
      room: median(rooms),
      tight: p10(rooms),
      drift: p90(drifts),
      react: median(reacts),
      aimed: aimedSeen ? aimedHits / aimedSeen : 0,
      samples: { rooms: rooms.length, drifts: drifts.length, reacts: reacts.length },
    };
  };
});

const PLAYER_SPEED = await page.evaluate(() => {
  // Read the real value rather than restating it: the tool would quietly go
  // wrong if movement were ever retuned.
  const { game: g } = window.__BOSSRUSH;
  g.debugStart(0, 2, 0);
  g.input.down.clear();
  g.input.down.add('ArrowLeft');
  const before = g.player.x;
  g.player.update(g.input);
  const v = Math.abs(g.player.x - before);
  g.input.down.clear();
  return v;
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

const DIFFN = ['NOVICE', 'EASY', 'NORMAL', 'HARD', 'LUNATIC'];
const bosses = ONLY_BOSS === null ? [0, 1, 2, 3, 4] : [ONLY_BOSS];

/** Fold the four axes into one number of pixels. See the header. */
function safety(m) {
  const clearance = Math.max(0, m.room - m.drift);
  const reach = m.react * PLAYER_SPEED * (1 - AIM_COST * m.aimed);
  return Math.max(0, Math.min(clearance, reach));
}

async function measure(b, ph, d) {
  const runs = [];
  for (let s = 0; s < STARTS; s++) {
    runs.push(await page.evaluate(
      ([bi, phi, di, frames, horizon, seed]) => window.__DIFF(bi, phi, di, frames, horizon, seed),
      [b, ph, d, FRAMES, HORIZON, s],
    ));
  }
  const avg = (k) => runs.reduce((a, r) => a + (r[k] ?? 0), 0) / runs.length;
  return {
    room: avg('room'), tight: avg('tight'),
    drift: avg('drift'), react: avg('react'), aimed: avg('aimed'),
  };
}

console.log(`Difficulty sweep on space and predictability.`);
console.log(`${(FRAMES / 60).toFixed(0)}s x ${STARTS} start(s) per cell, ` +
  `${HORIZON}-frame prediction horizon, player speed ${PLAYER_SPEED.toFixed(2)}px/f.`);
console.log(`safety = min(room - drift, react x speed x (1 - ${AIM_COST} x aimed)), in px. ` +
  `Lower is harder.\n`);

if (DETAIL) {
  const b = ONLY_BOSS === null ? 4 : ONLY_BOSS;
  const ph = ONLY_PHASE === null ? 0 : ONLY_PHASE;
  console.log(`${roster[b].name}  ${ph + 1}. ${roster[b].phases[ph]}\n`);
  console.log('DIFFICULTY     room    tight    drift    react    aimed   clearance    reach   SAFETY');
  console.log('-'.repeat(89));
  for (let d = 0; d < 5; d++) {
    const m = await measure(b, ph, d);
    const clearance = Math.max(0, m.room - m.drift);
    const reach = m.react * PLAYER_SPEED * (1 - AIM_COST * m.aimed);
    console.log(
      DIFFN[d].padEnd(12) +
      `${m.room.toFixed(1)}px`.padStart(9) +
      `${m.tight.toFixed(1)}px`.padStart(9) +
      `${m.drift.toFixed(1)}px`.padStart(9) +
      `${m.react.toFixed(1)}f`.padStart(9) +
      `${(m.aimed * 100).toFixed(0)}%`.padStart(9) +
      `${clearance.toFixed(1)}px`.padStart(12) +
      `${reach.toFixed(1)}px`.padStart(9) +
      `${safety(m).toFixed(1)}px`.padStart(9));
  }
} else {
  console.log('BOSS          PHASE                       ' +
    DIFFN.map((n) => n.slice(0, 4).padStart(9)).join('') + '   drift  aimed');
  console.log('-'.repeat(44 + 9 * 5 + 15));

  const rows = [];
  for (const b of bosses) {
    const phases = ONLY_PHASE === null
      ? roster[b].phases.map((_, i) => i) : [ONLY_PHASE];
    for (const ph of phases) {
      const cells = [];
      let driftSum = 0, aimSum = 0;
      for (let d = 0; d < 5; d++) {
        const m = await measure(b, ph, d);
        cells.push(safety(m));
        driftSum += m.drift;
        aimSum += m.aimed;
      }
      rows.push({
        boss: roster[b].name,
        name: roster[b].phases[ph],
        label: `${ph + 1}. ${roster[b].phases[ph]}`,
        cells,
      });
      console.log(
        roster[b].name.padEnd(14) +
        `${ph + 1}. ${roster[b].phases[ph]}`.padEnd(28) +
        cells.map((v) => `${v.toFixed(1)}`.padStart(9)).join('') +
        `${(driftSum / 5).toFixed(1)}px`.padStart(9) +
        `${(aimSum / 5 * 100).toFixed(0)}%`.padStart(7));
    }
  }

  console.log('-'.repeat(44 + 9 * 5 + 15));

  // A tier that is not easier than the one above it is the thing worth
  // finding: it means the difficulty setting is not buying what it claims.
  const bumps = [];
  for (const r of rows) {
    for (let d = 0; d < 4; d++) {
      // Relative, so only a step a player could feel is reported rather than
      // every sub-pixel wobble between two sampled runs.
      if (r.cells[d] < r.cells[d + 1] * 0.97) {
        bumps.push(`${r.boss} ${r.name} @ ${DIFFN[d]} (${r.cells[d].toFixed(1)}px) ` +
          `is tighter than ${DIFFN[d + 1]} (${r.cells[d + 1].toFixed(1)}px)`);
      }
    }
  }
  const medians = DIFFN.map((_, d) => {
    const v = rows.map((r) => r.cells[d]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  console.log('\nColumn medians: ' +
    DIFFN.map((n, d) => `${n} ${medians[d].toFixed(1)}px`).join('   '));

  // The same table as a fraction of its column, which is the view that makes
  // an outlier obvious: a phase at 0.5 is half as safe as a typical phase at
  // the same difficulty, whatever the absolute numbers happen to be.
  console.log('\nAs a fraction of the column median (1.00 = a typical phase; ' +
    `below ${OUTLIER.toFixed(2)} is flagged):`);
  console.log('BOSS          PHASE                       ' +
    DIFFN.map((n) => n.slice(0, 4).padStart(9)).join(''));
  console.log('-'.repeat(44 + 9 * 5));
  const outliers = [];
  for (const r of rows) {
    const cells = r.cells.map((v, d) => v / medians[d]);
    console.log(
      r.boss.padEnd(14) + r.label.padEnd(28) +
      cells.map((v) => (v < OUTLIER ? `*${v.toFixed(2)}` : v.toFixed(2)).padStart(9)).join(''));
    cells.forEach((v, d) => {
      if (v < OUTLIER) outliers.push({ boss: r.boss, name: r.name, d, v, px: r.cells[d] });
    });
  }
  if (outliers.length) {
    outliers.sort((a, b) => a.v - b.v);
    console.log(`\n${outliers.length} cell(s) below ${OUTLIER.toFixed(2)}, tightest first:`);
    for (const o of outliers.slice(0, 12)) {
      console.log(`  - ${o.boss} ${o.name} @ ${DIFFN[o.d]}: ` +
        `${o.px.toFixed(1)}px, ${o.v.toFixed(2)} of the column`);
    }
  }

  if (bumps.length) {
    console.log(`\n${bumps.length} non-monotonic step(s) -- an easier tier that is not easier:`);
    for (const b of bumps) console.log('  - ' + b);
  } else {
    console.log('\nEvery phase gets monotonically safer as difficulty drops.');
  }
}

await browser.close();
server.kill();
