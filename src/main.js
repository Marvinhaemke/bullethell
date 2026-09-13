// Bootstrap: canvas sizing, fixed-timestep loop, audio unlock.

import { VIEW } from './config.js';
import { Game } from './game.js';
import { setSpriteScale } from './sprites.js';

const STEP_MS = 1000 / 60;
const MAX_CATCHUP = 5;

const canvas = document.getElementById('game');
const game = new Game(canvas);

// Render at device resolution so bullets stay crisp on hidpi screens, while
// all game logic keeps working in the fixed 1024x768 coordinate space.
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(VIEW.w * dpr);
  canvas.height = Math.round(VIEW.h * dpr);
  game.dpr = dpr;
  setSpriteScale(dpr);

  const pad = 24;
  const availW = Math.max(320, window.innerWidth - pad);
  const availH = Math.max(240, window.innerHeight - pad - 26);
  const scale = Math.min(availW / VIEW.w, availH / VIEW.h);
  canvas.style.width = Math.round(VIEW.w * scale) + 'px';
  canvas.style.height = Math.round(VIEW.h * scale) + 'px';
}

window.addEventListener('resize', resize);
resize();

// Music is optional: if music/tracks.json is absent this resolves to silence.
// Inlined by build.py for the single-file bundle, fetched otherwise.
if (window.__BOSSRUSH_MUSIC) game.music.accept(window.__BOSSRUSH_MUSIC);
game.music.load();

// Browsers require a gesture before audio may start.
const unlock = () => { game.sfx.ensure(); game.sfx.resume(); game.music.resume(); };
window.addEventListener('keydown', unlock, { once: true });
window.addEventListener('pointerdown', unlock, { once: true });

let last = performance.now();
let acc = 0;
let fpsAcc = 0;
let fpsFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);

  let dt = now - last;
  last = now;
  // A backgrounded tab produces a huge dt; clamp instead of fast-forwarding.
  if (dt > 250) dt = STEP_MS;
  acc += dt;

  let steps = 0;
  while (acc >= STEP_MS && steps < MAX_CATCHUP) {
    game.update();
    acc -= STEP_MS;
    steps++;
  }
  if (steps === MAX_CATCHUP) acc = 0;

  game.draw();

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 500) {
    game.fps = (fpsFrames * 1000) / fpsAcc;
    fpsAcc = 0;
    fpsFrames = 0;
  }
}

requestAnimationFrame(frame);

// Walking away mid-pattern is a data point, not an absence of one: pagehide
// fires on tab close and on mobile backgrounding where unload does not.
window.addEventListener('pagehide', () => game.log.endRun('closed'));

// Handy for debugging and for the automated smoke test.
window.__BOSSRUSH = { game, VIEW };
