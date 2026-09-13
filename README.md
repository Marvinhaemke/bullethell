# Bullet Hell — Boss Rush

A canvas bullet-hell boss rush built from basic shapes on black. Five bosses,
twenty patterns, and every bullet curtain generated algorithmically — cellular
automata, logistic-map chaos, polar rose curves, phyllotaxis, logarithmic
spirals, recursive splitting and ballistic arcs — rather than hand-placed.

No dependencies, no build step, no assets. Plain ES modules and a 2D canvas.

![Rule 30 pattern](docs/rule-thirty.png)

## Running it

```bash
python3 serve.py          # then open http://localhost:8000
```

A server is needed because ES modules will not load over `file://`. If you would
rather have something you can just double-click:

```bash
python3 build.py          # writes dist/index.html, a single self-contained file
```

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Move |
| **Shift** (hold) | Focus — half speed, tighter and stronger shot, hitbox shown |
| **Z** / Space | Fire (hold) — unfocused shots home, focused shots fly straight |
| **X** / C | Bomb — clears bullets, damages the boss, grants invulnerability |
| **Esc** / P | Pause |
| Shift + **R** | Restart the current boss |
| **M** | Mute |

Three menu options worth knowing about:

| Option | |
| --- | --- |
| **AUTOFIRE** | Fire without holding anything. On by default; holding Z still works. |
| **AUTOPILOT** | A dodging bot plays for you. It is the same bot `npm run survive` uses to prove patterns are dodgeable, and it only ever produces inputs a human has — nine headings, focused or not, at the game's own speeds. Bombs and pause stay yours. |
| **SHOT OPACITY** | Dim your own shots (down to hidden) so enemy bullets read more clearly in dense patterns. |

Only the small red dot at your centre collides; the hull is decoration. Passing
close to a bullet without dying scores a **graze**, which is where most of your
points come from.

## Modes

**Five difficulties.** Difficulty is not just a speed slider. Each level scales
bullet speed, bullet count and volley rate — and, crucially, enables another
*layer* of each pattern. A pattern on Lunatic has sub-patterns that simply do
not exist on Normal, so the fights differ in structure, not only in numbers.

| | Speed | Density | Rate | Extra layers | Aim |
| --- | --- | --- | --- | --- | --- |
| Novice | ×0.72 | ×0.55 | ×1.50 | 0 | loose |
| Easy | ×0.86 | ×0.76 | ×1.22 | 1 | loose |
| Normal | ×1.00 | ×1.00 | ×1.00 | 2 | fair |
| Hard | ×1.14 | ×1.32 | ×0.84 | 3 | leading |
| Lunatic | ×1.30 | ×1.70 | ×0.70 | 4 | perfect, leading |

**Three life modes**, granted *per boss* so every fight starts on equal footing:
Infinite (deaths cost score only), 3 Lives, and 1 Life.

Both are selectable from the main menu and from the pause menu mid-fight.

## The bosses

Each boss has three to five patterns. Depleting a pattern's health bar clears
the screen and advances to the next. **There is no time limit** — a pattern
ends when its health does. Each one still has a par time, and clearing under
par is what pays the speed bonus.

That works because the two firing stances trade damage against attention.
Unfocused shots **home**, so you can give the screen your whole attention and
still make steady progress: playing a boss entirely unfocused clears each
pattern in about its par time. Focused shots fly straight and hit roughly six
times harder, but only if you stand where the boss is and stay there.

The one exception is Chaos Engine's final pattern, which is a **survival**
phase: there the clock is the win condition, and running it out is the clear.

### 1 · SENTINEL — *Rotational Primer*
Clean rotational geometry. Precessing rings, two counter-wound spiral arms whose
reversal bunches them into a wall, and expanding regular polygons — each bullet
rides its own edge's outward normal, so the polygon keeps straight edges as it
grows — with a rotating notch to aim for.

### 2 · WEAVER — *Lattice Interference*
Grids and interference. Crossing walls with gaps that move diagonally; two
orbiting satellite emitters whose overlapping sprays produce a live moiré field;
a ring of cells running **elementary cellular automaton rule 30**, whose live
cells become bullets, so the volley is deterministic but never repeats (rule 90
rides underneath at higher difficulties, laying clean Sierpiński triangles over
the chaos); and finally bullets that ricochet off the walls into a standing
lattice.

![Maelstrom](docs/maelstrom.png)

### 3 · ORBITER — *Ballistics & Vortices*
Physics. Bullets lobbed on gravity arcs that cross where they land; a vortex
built by launching at a fixed pitch angle to the radius, which is what actually
draws a logarithmic spiral; concentric batteries that latch into orbit, spin up
while you watch, then fire outward one gear at a time; and mirrored fans of
constant-curvature arcs with a few genuine seekers mixed in.

### 4 · FRACTAL — *Recursive Bloom*
Recursion and parametric curves. Shells that split, and whose children split
again, two or three generations deep. A phyllotaxis phase pairing a golden-angle
stream — the most *irrational* rotation, so it never forms arms and instead
spreads the most even curtain a single emitter can make — against a ring of
eight precessing by a hair, which is about as rational as a rotation gets and
does draw arms. An emitter that walks the polar rose `r = cos(kθ)` and fires
along the local radius, so the bullets literally draw the rose before unfolding
it. And a dense ring that freezes mid-flight, shimmers, then relaunches straight
at wherever you happen to be standing.

![Phyllotaxis](docs/phyllotaxis.png)

### 5 · CHAOS ENGINE — *Deterministic Ruin*
The finale. Firing angles taken from iterates of the logistic map at r = 3.94 —
fully deterministic, never periodic. Rotating beam sweeps over a pellet curtain.
Three emitters riding Lissajous curves across the field. Bullets converging
inward from the border while a ring accelerates outward. Then a 40-second
**survival** phase where the boss is invulnerable and four generators run at
once on a single clock.

![Sweep lasers](docs/sweep-lasers.png)

## How patterns are written

Patterns are generator functions that `yield` a number of frames to wait, which
lets densely-timed choreography read as straight-line code:

```js
function* cardinalBloom(A) {
  A.st({ shape: 'circle', color: C.cyan, r: 6 });
  let k = 0;
  while (true) {
    const n = A.n(11, 6);                       // count, scaled by density
    A.ring({ n, speed: A.spd(2.15), angle: k * 0.37 });

    if (A.L(1)) {                               // Easy and above
      A.ring({ n, speed: A.spd(1.45), angle: -k * 0.37 + 0.2, color: C.blue });
    }
    if (k % 3 === 2) {
      A.fan({ n: A.n(5, 3), spread: 0.42, speed: A.spd(3.6),
              angle: A.aimLead(undefined, undefined, 3.6),
              shape: 'kunai', color: C.white });
    }
    k++;
    yield A.w(26);                              // delay, scaled by rate
  }
}
```

Difficulty threads through four helpers — `A.n()` scales counts, `A.spd()`
scales velocity, `A.w()` scales delays, and `A.L(k)` gates a whole optional
sub-pattern. That last one is what makes the difficulties structurally
different.

Bullet behaviour is data, not closures, so the pool stays allocation-free while
still supporting gravity (`ax`/`ay`), constant-curvature steering (`turn`,
`turnDecay`), speed ramps (`accel`, `minSpeed`, `maxSpeed`), stop-and-snap
(`stopT`, `goT`, `goMode`), wall bounces (`bounce`), soft homing (`homeT`,
`homeK`), orbit-then-release (`orbit`) and recursive splitting (`split`).

## Layout

```
index.html          styles.css        serve.py     build.py
src/
  main.js           bootstrap, fixed-timestep loop, canvas sizing
  game.js           scenes, run state, collisions, HUD
  boss.js           phase state machine, coroutine runner
  attack.js         the pattern-authoring API (A.ring, A.fan, A.polyRing, ...)
  patterns.js       shared movement scripts, cellular automata, logistic map
  bullets.js        data-driven bullet pool
  autopilot.js      the dodging bot: in-game autopilot and test harness
  player.js  lasers.js  particles.js  sprites.js
  ui.js  input.js  audio.js  storage.js  config.js  mathx.js  rng.js
  bosses/boss1..5.js
tools/
  smoke.mjs         headless play-through of every boss at every difficulty
  census.mjs        per-phase bullet-count and frame-cost report
  shots.mjs         screenshot every phase
  probe.mjs         damage throughput and phase pacing
```

## Development

```bash
npm install         # playwright, for the headless tests only
npm test            # drives every boss at every difficulty in Chromium
npm run survive     # can a player actually dodge each pattern?
npm run margins     # how much dodging room each pattern really has
npm run deadzones   # can you park anywhere and ignore a pattern?
npm run bot         # autopilot quality: survival, gap width, idle drift
npm run census      # per-phase bullet counts and render cost
npm run lint
```

`npm test` boots the game in headless Chromium, steps the fixed-timestep loop by
hand (so results do not depend on wall-clock speed), and fails on any console
error, page exception, stalled pattern script, runaway bullet count or broken
menu transition. `npm run census` is the balancing tool — it runs each of the 20
patterns in isolation and reports peak concurrent bullets and frame cost per
difficulty.

Every pattern is seeded per boss/phase/difficulty, so a given fight plays back
identically each attempt.
