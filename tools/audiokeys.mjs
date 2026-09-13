// Checks the sound levels, the bomb/fire rebinding and the music plumbing in a
// real browser.
//
//   node tools/audiokeys.mjs [--port N]
//
// These are all things that are trivially wrong in ways nothing else notices:
// a key bound to two actions, a mute level that silences the wrong cue, a
// manifest that never reaches the player. Each assertion below is a thing that
// would otherwise only surface as "the sound is wrong" days later.

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const pi = args.indexOf('--port');
const PORT = pi >= 0 ? Number(args[pi + 1]) : 8900 + (process.pid % 200);

const server = spawn('python3', ['serve.py', String(PORT), '--quiet'], { stdio: 'ignore' });
await sleep(700);

const exe = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p));
// Autoplay is normally gated on a gesture, which main.js satisfies on the
// player's first keypress. Headless has no gesture, so grant it here -- this
// tests that playback works, not that the browser's policy exists.
const launchOpts = {
  args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
};
try {
  if (!existsSync(chromium.executablePath())) throw new Error('missing');
} catch (_) {
  if (!exe) { server.kill(); throw new Error('No Chromium found'); }
  launchOpts.executablePath = exe;
}

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);

const fails = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails.push(name);
};

// --- key bindings ---------------------------------------------------------
console.log('\nKey bindings');
const keys = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  const probe = (code) => {
    g.input.down.clear(); g.input.edge.clear();
    g.input.down.add(code); g.input.edge.add(code);
    const out = {
      shoot: g.input.held('shoot'),
      bomb: g.input.pressed('bomb'),
      confirm: g.input.pressed('confirm'),
    };
    g.input.down.clear(); g.input.edge.clear();
    return out;
  };
  return { space: probe('Space'), z: probe('KeyZ'), x: probe('KeyX') };
});
check('Space bombs', keys.space.bomb);
check('Space does not fire', !keys.space.shoot);
check('Space still confirms in menus', keys.space.confirm);
check('Z fires', keys.z.shoot);
check('Z does not bomb', !keys.z.bomb);
check('X bombs', keys.x.bomb);

// Space must actually spend a bomb in play, not just register as an edge.
const bombed = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  g.debugStart(0, 2, 1);
  g.boss.state = 'fight'; g.boss.startPhase(0); g.state = 'fight';
  const before = g.run.bombs;
  g.input.down.add('Space'); g.input.edge.add('Space');
  g.update();
  const after = g.run.bombs;
  g.input.down.clear(); g.input.edge.clear();
  return { before, after };
});
check('Space spends a bomb in play', bombed.after === bombed.before - 1,
  `${bombed.before} -> ${bombed.after}`);

// --- sound levels ---------------------------------------------------------
console.log('\nSound levels');
const levels = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  const at = (lv) => {
    g.sfx.level = lv;
    return {
      shoot: g.sfx.audible('shoot'),
      hit: g.sfx.audible('hit'),
      bomb: g.sfx.audible('bomb'),
      select: g.sfx.audible('select'),
    };
  };
  return { off: at(0), noShots: at(1), on: at(2) };
});
check('OFF silences everything',
  !levels.off.shoot && !levels.off.hit && !levels.off.bomb && !levels.off.select);
check('NO SHOTS silences your own gun', !levels.noShots.shoot && !levels.noShots.hit);
check('NO SHOTS keeps everything else', levels.noShots.bomb && levels.noShots.select);
check('ON plays everything',
  levels.on.shoot && levels.on.hit && levels.on.bomb && levels.on.select);

const cycled = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  g.settings.sound = 2; g.sfx.level = 2;
  const seen = [];
  for (let i = 0; i < 4; i++) { g.cycleSound(1); seen.push(g.settings.sound); }
  g.cycleSound(-1);
  return { seen, back: g.settings.sound, sfx: g.sfx.level };
});
check('M cycles 2 -> 0 -> 1 -> 2', cycled.seen.join(',') === '0,1,2,0', cycled.seen.join(','));
check('menu left arrow steps back', cycled.back === 2);
check('the level reaches the synth', cycled.sfx === cycled.back);

const persisted = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  g.settings.sound = 1;
  localStorage.setItem('bosrush.settings.v1', JSON.stringify(g.settings));
  return { roundTrip: JSON.parse(localStorage.getItem('bosrush.settings.v1')).sound };
});
check('the level persists', persisted.roundTrip === 1);

// Reload with a legacy boolean in storage and confirm the migration.
await page.evaluate(() => {
  localStorage.setItem('bosrush.settings.v1', JSON.stringify({ sound: false, diff: 3 }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);
const migrated = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  return { sound: g.settings.sound, diff: g.settings.diff, level: g.sfx.level };
});
check('legacy sound:false migrates to OFF', migrated.sound === 0 && migrated.level === 0);
check('other legacy settings survive', migrated.diff === 3);

await page.evaluate(() => {
  localStorage.setItem('bosrush.settings.v1', JSON.stringify({ sound: true }));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.__BOSSRUSH);
const migratedOn = await page.evaluate(() => window.__BOSSRUSH.game.settings.sound);
check('legacy sound:true migrates to ON', migratedOn === 2);

// --- music ----------------------------------------------------------------
console.log('\nMusic');
const music = await page.evaluate(async () => {
  const { game: g } = window.__BOSSRUSH;

  // An empty manifest must be silence, not an error -- that is the shipping
  // state before anyone adds a track. Asserted against a manifest handed over
  // here rather than against whatever happens to be in music/, so the check
  // keeps testing the behaviour once the repo does carry tracks.
  g.music.accept({ tracks: [] });
  let threw = null;
  try { g.music.play('menu'); } catch (e) { threw = e.message; }
  const empty = { available: g.music.available, el: !!g.music.el, threw };

  g.music.accept({
    tracks: [
      { file: 'a.mp3', title: 'A', for: 'menu' },
      { file: 'b.mp3', title: 'B', for: 'boss2' },
      { file: 'c.mp3', title: 'C' },
      { file: 'd.mp3', title: 'D' },
    ],
  });
  const picks = {
    menu: g.music.pick('menu').file,
    boss2: g.music.pick('boss2').file,
    // Nothing is pinned to boss1, so it must fall back to the rotation.
    boss1: g.music.pick('boss1').file,
  };

  g.music.index = 0;
  const rotation = [g.music.pick('boss1').file];
  g.music.index++;
  rotation.push(g.music.pick('boss1').file);

  return { empty, picks, rotation };
});
check('an empty manifest is silence, not an error',
  !music.empty.available && !music.empty.el && music.empty.threw === null,
  music.empty.threw || '');
check('a pinned track wins its cue', music.picks.menu === 'a.mp3' && music.picks.boss2 === 'b.mp3');
check('an unpinned cue falls back to the rotation',
  music.picks.boss1 === 'c.mp3' || music.picks.boss1 === 'd.mp3');
check('the rotation advances', music.rotation[0] !== music.rotation[1],
  music.rotation.join(' -> '));

const cues = await page.evaluate(() => {
  const { game: g } = window.__BOSSRUSH;
  const seen = [];
  g.music.play = function play(cue) { seen.push(cue); };
  g.setScene('menu');
  g.debugStart(2, 2, 0);
  g.setScene('results');
  return seen;
});
check('the menu cues music', cues.includes('menu'));
check('a fight cues its own boss', cues.includes('boss3'), cues.join(','));
check('results cues music', cues.includes('results'));

// --- the drop-in path, end to end ----------------------------------------
// The headline claim is "put mp3 files in music/ and they play", so test it
// with real files rather than only the picking logic. Anything this writes is
// removed again below, and the existing manifest is restored byte for byte.
console.log('\nDropping files into music/');
const MUSIC = 'music';
const MANIFEST = join(MUSIC, 'tracks.json');
const backup = existsSync(MANIFEST) ? readFileSync(MANIFEST) : null;
// A real MPEG-1 Layer III frame header plus a frame of silence: something a
// browser will decode, unlike a renamed text file.
const mp3 = Buffer.concat(Array(40).fill(
  Buffer.concat([Buffer.from([0xFF, 0xFB, 0x90, 0x00]), Buffer.alloc(413)]),
));
// A space in the name on purpose: unencoded, the URL 404s.
const temp = ['zz test track.mp3', 'zz_test_two.mp3'].map((f) => join(MUSIC, f));

try {
  mkdirSync(MUSIC, { recursive: true });
  for (const f of temp) writeFileSync(f, mp3);
  execFileSync(process.execPath, ['tools/music.mjs'], { stdio: 'pipe' });

  const listed = JSON.parse(readFileSync(MANIFEST, 'utf8')).tracks.map((t) => t.file);
  check('the generator finds dropped files',
    temp.every((f) => listed.includes(basename(f))), listed.join(', '));

  // The failure this guards against actually happened: tracks uploaded through
  // the GitHub web UI left the checked-in manifest empty, and the game played
  // nothing. Nothing may require a command to have been run.
  writeFileSync(MANIFEST, JSON.stringify({ tracks: [] }) + '\n');

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__BOSSRUSH);
  await page.waitForFunction(() => window.__BOSSRUSH.game.music.available, { timeout: 5000 })
    .catch(() => {});

  const live = await page.evaluate(async () => {
    const { game: g } = window.__BOSSRUSH;
    g.music.resume();
    g.setScene('menu');
    const el = g.music.el;
    if (!el) return { loaded: false };
    await new Promise((r) => setTimeout(r, 900));
    return {
      loaded: true,
      src: el.src,
      decodeError: !!el.error,
      advancing: el.currentTime > 0,
      volume: Number(el.volume.toFixed(2)),
    };
  });
  check('a stale manifest does not silence the music', live.loaded);
  check('a name with a space resolves', live.loaded && !live.decodeError,
    live.src ? decodeURIComponent(live.src.split('/music/')[1] || '') : '');
  check('playback advances', live.advancing === true);
  check('it reaches the set volume', live.volume === 0.6, String(live.volume));
} finally {
  for (const f of temp) if (existsSync(f)) unlinkSync(f);
  if (backup) writeFileSync(MANIFEST, backup);
  else if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
}

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.kill();

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed:`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('All audio and key-binding checks passed.');
