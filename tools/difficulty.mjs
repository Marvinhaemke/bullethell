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
//   aimRate aimed launches per second -- the same events counted absolutely
//           rather than as a share. Reported only.
//
//           A share can be diluted: bolting an unaimed ring onto a pattern
//           lowers it without making anything safer, and that is visibly what
//           happens to Gear Release between Easy and Normal. A rate cannot be.
//           But a rate over-counts wide rings, where some bullets always
//           happen to be heading at you, and against the run log the two forms
//           are indistinguishable -- every rate variant tried scored -0.449 to
//           the share's -0.446, inside the noise on seventeen phases. So the
//           share stays, on the grounds that it is the one already calibrated,
//           and the rate stays visible next to it as the check on that call.
//   flux    bullets newly entering the planning radius per second. Density and
//           speed together -- a faster field sweeps more past you per second,
//           and so does a denser one. This is the axis a player means by "it
//           feels random": not that any one bullet is unpredictable, but that
//           the picture is replaced faster than it can be read.
//
//           Reported, but deliberately NOT in the headline number. Folding it
//           in as a third term moved the correlation against real play from
//           -0.651 to -0.568, so it is either already carried by the other two
//           or it is noise, and a term that sounds right is not a reason to
//           keep one the data does not support. It stays because it is cheap
//           and it is the axis to look at first when a phase reads as chaotic.
//   lanes   how many distinct directions have a viable route out to 200px.
//   laneW   the narrowest squeeze on the best of those routes, in px.
//   laneLife how long a way out keeps existing, in frames.
//
//           These three describe the SHAPE of the free space, which no other
//           axis here can see: every one of the others is a scalar at a point.
//           Bullets scattered evenly and bullets packed into walls with a
//           corridor between them report the same room, the same flux and the
//           same react, and play nothing alike.
//
//           They do not predict deaths, and that is a finding rather than a
//           disappointment -- see LANES, BELOW.
//
//   stroom  px of clearance a player could have HELD THROUGHOUT a 48-frame
//           window, at best: a max-min dynamic program over (x, y, t), run
//           forward on what the bullets really did. Capped at 24px, because
//           this is a FLOOR CHECK -- whether the pattern leaves anywhere to be
//           -- and not a ranking.
//   stfloor the same over the phase's worst window rather than its typical one.
//
//           Every other axis here, lanes included, reads ONE FRAME, and that
//           misses a whole class of pattern. See SPACE AND TIME, below.
//
// COMBINING THEM
//
// tight and drift are both in pixels and compose without a fudge factor:
// clearance = tight - drift is the pinch-point gap you can count on, because
// drift is by construction the amount your reading of it was wrong.
//
// Reaction converts to pixels the same way: reach = react x player speed is how
// far you can get before contact.
//
// safety is then their GEOMETRIC MEAN, not min(). A player log settled this:
// the two patterns reported as hardest on Normal were the extremes on exactly
// the axes min() was discarding -- one killing with bullets at 9.4px/frame
// against a 1.5-3.8 norm, the other at 92% aimed -- and both scored as
// unremarkable, because reach ran three to ten times clearance and the min()
// never picked it. Against deaths-per-attempt over twenty patterns the product
// scores -0.651 where min() scored -0.316.
//
// Calibrating a difficulty model on one session of one player is worth being
// honest about: it fixes a structural flaw that was visible without the data,
// and it settles a choice between two defensible formulas. It is not a fit, and
// the sample is small enough that the exact weighting inside the product was
// left alone where the data could not separate it.
//
// The aim term is the one judgement call here, and it is exposed as --aim-cost
// so it can be argued with: aimed fire is charged as a fraction of the movement
// budget spent going somewhere rather than dodging.
//
// Lower safety = harder. The number is in pixels and is meant to be compared
// between phases and down a difficulty column, not read as an absolute.
//
// LANES, AND A HYPOTHESIS THAT DID NOT SURVIVE
//
// A player proposed that the missing axis was lane forming: a route you are
// pushed into or choose, not too dense, hard to leave, where "the screen can be
// full of bullets but the lane is still open enough for a human to dodge". The
// prediction was that the phases built that way would be the ones that kill
// least. It was tested twice and it is false both times.
//
// The first attempt cast rays from a sample point and looked for deep clear
// arcs. That measured EMPTINESS, not corridors -- a corridor that bends is
// invisible to a straight ray, and a lane that did not bend would not need
// choosing. Its three axes scored 0.00, 0.03 and -0.15 against the log.
//
// The second attempt is the one in the code: rasterise the free space, stamp a
// clearance field, and run a max-min search for the widest bottleneck on any
// route out. That is a correct measurement of corridor structure -- it agrees
// with the eye, giving Rose Curve two routes through a 9px squeeze and
// Convergence six through a 29px one. It also does not predict deaths: lanes
// +0.21, laneW +0.12, laneLife -0.10, with the two strongest pointing the WRONG
// WAY. More routes and wider bottlenecks go with more deaths, not fewer.
//
// The reason is visible once the numbers are in front of you. Lane quality is
// close to a measure of how open the field is, and in this game the lethal
// phases are the sparse fast ones, not the dense ones. Convergence -- six
// deaths an attempt, the worst in the game -- has the best lane structure of
// any phase, because it kills with speed across an empty screen.
//
// WHAT THE LANES DO TRACK IS TASTE, which is what the player was actually
// describing. Sort the phases by what they said they liked:
//
//   praised   Phyllotaxis 1 route / 6.8px, Rose Curve 2 / 9.0, Delayed 4 / 20.6
//   disliked  Convergence 6 / 29.4, Lissajous 5 / 10.9, Curveshot 5 / 12.5
//
// Few, tight routes is the maze feeling they called satisfying. Many wide ones
// is an open field, which they did not. So these axes belong in the toolkit as
// a design-intent readout -- what KIND of phase did I just build -- and not in
// the difficulty number. Deaths are governed by something else entirely.
//
// WHAT THAT SOMETHING ELSE IS, on the evidence of three logs: `drift` is the
// only axis whose sign is right on all three (-0.264, -0.339, -0.122). `aimed`
// is much stronger on the two Hard logs (-0.466, -0.347) and inverts on Normal,
// so it is not stable enough to reweight on -- every AIM_COST from 0.5 to 2.0
// was tried and none wins across all three. Both of those are the same thing
// said twice: a bullet that does something after launch you did not read. Which
// is exactly what the README's design principle already says to avoid.
//
// SPACE AND TIME
//
// The lane measure above, and every other axis here, reads a single frame. That
// is a blind spot with a shape, and the shape has a name: a curtain. Rows of
// bullets sweeping down the screen with a gap that slides sideways from row to
// row. Freeze any frame and the rows are a grid whose gaps do not line up
// vertically, so the only way through is a squeeze between two rows -- and that
// is what the lane measure reports for Weaver's Curtain: 3.8px of bottleneck at
// Novice falling to 0.0 at Lunatic, tighter than anything else in the game.
//
// Played, nobody goes through the rows. You ride the gap: stand still, let a
// row pass, slide sideways into the next gap as it arrives. A lane-follower
// written to check this clears the phase for fifty seconds at every tier
// including Lunatic. The room is real, there is plenty of it, and none of it
// exists on any single frame -- it exists in the sequence.
//
// So `stroom` asks over (x, y, t) instead: what is the largest clearance a
// player could HOLD THROUGHOUT the next 48 frames? A max-min dynamic program,
// one cell of movement per step. On the Curtain it answers 24 / 24 / 22.5 /
// 22.3 / 21.1px down the tiers, against the snapshot's 3.8 / 2.9 / 0.9 / 1.0 /
// 0.0 -- and 24 is the cap, so the top two are "at least that".
//
// THE PLAYER HAS TO BE PERSISTENT, and that took a wrong answer to learn. The
// first version restarted the search from a fixed sample point every window --
// the same fixed-point discipline the lane axes use, adopted for the same good
// reason -- and it scored the Curtain WORSE than the snapshot did: 4px at every
// tier. It was right to. A player parachuted onto a sample point has to cross
// the rows to reach the lane, and would have to do it again every window,
// forever. Riding a lane is a commitment, and the room is only there for
// someone already in it. So the frontier carries over: every cell a not-yet-hit
// trajectory can reach stays alive across window boundaries, and only the value
// resets, so each window reports the room that window afforded.
//
// It is seeded with the whole playfield, which is the right reading of the
// question -- is there anywhere to be -- and means it needs no sample point and
// so cannot leak one. And it needs no lookahead buffer: a max-min program
// running forward in time only reads clearance up to the step it is on, so the
// field is stamped frame by frame as the game produces it and the answer falls
// out online, with every real curve, bounce and split in it.
//
// WHAT IT SAYS. Across all twenty-one phases at all five tiers, stroom sits at
// its 24px cap in every cell but three, and those three are the Curtain at
// 22.5 / 22.3 / 21.1. Read plainly: NOTHING IN THIS GAME DENIES A PLAYER ROOM,
// and
// the one pattern that comes closest is the one the snapshot called impossible. That is a floor check passing, which is what it is for -- it will
// fire if a pattern is ever built with genuinely nowhere to be, and until then
// it should report nothing, like `npm run deadzones`.
//
// WHAT WAS TRIED AND DROPPED: A READER. stroom is prescient -- the trajectory is
// chosen in hindsight -- so a second player was built to be the honest half: at
// each window it extrapolated the bullets it could see along straight lines,
// solved the same program on that imagined field, and flew the plan through
// what really happened. It is not in the code any more, because its trace shows
// it measuring itself rather than the pattern. On the Curtain at Hard it walks
// out of the lane during the phase's opening seconds -- while the screen is
// still filling from the top and every direction reads as safe -- and ends up
// in the bottom-left corner, where the lane is eighteen cells away and its
// horizon is sixteen. Every plan from there scores an identical 1.4px, so the
// max-min objective is flat, so it never moves again: 1.4px for the remaining
// nineteen windows, against the 22px the pattern actually affords. Replanning
// more often makes it worse, not better, because each fresh plan ratchets it
// further from the lane.
//
// A better model is a real problem, not a parameter: it needs the thing a
// player has and this does not, which is knowledge of where the pattern PUTS
// bullets rather than only where they are. `drift` already measures the
// read-failure dimension at the frame level and measures it without an agent,
// so nothing was lost by dropping this.
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
// Below this much space-time room, a pattern is not hard, it is a wall: even a
// player who knew exactly what every bullet would do could not hold this much
// clearance for a window. Well under a ship width, so it flags only a pattern
// with genuinely nowhere to be.
const ST_FLOOR = num('--st-floor', 12);
const WARN_REF = num('--warn-ref', 160);
// A phase this far below its column's typical safety is out of line with the
// rest of the game at that difficulty, whatever the absolute pixels say.
const OUTLIER = num('--outlier', 0.75);
const ONLY_BOSS = args.includes('--boss') ? num('--boss', 1) - 1 : null;
const ONLY_PHASE = args.includes('--phase') ? num('--phase', 1) - 1 : null;
const DETAIL = args.includes('--detail');
// Raw axes as JSON, so formulas can be compared against a player log without
// re-running the sweep for each one.
const JSON_OUT = args.includes('--json');
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

  // ---- lanes -------------------------------------------------------------
  //
  // Every other axis here is a SCALAR AT A POINT -- clearance to the nearest
  // bullet, time until the most urgent one arrives, how long it existed first.
  // None of them can see the shape of the free space, and the shape is what a
  // player is actually reading. Bullets scattered evenly and bullets packed
  // into walls with a corridor winding between them can report the same `room`,
  // the same `flux` and the same `react`, and play nothing alike: in one every
  // direction is equally bad, in the other there is a route, and following it
  // is the whole pleasure. That difference is a phase feeling dense-but-fair
  // rather than dense-and-random, and it is the standing explanation for why
  // this tool keeps flagging Loom and Maelstrom that the player clears without
  // dying. The room really is tight. The way through is a corridor.
  //
  // Measured as CONNECTIVITY, not as sight-lines. Ray-casting was tried first
  // and is recorded here because it is the obvious cheap proxy and it does not
  // work: a corridor that bends is invisible to a straight ray, and a lane that
  // did not bend would not need choosing. What that version actually measured
  // was emptiness, so it ranked Convergence -- a sparse phase that kills with
  // speed, six deaths an attempt -- as the roomiest lanes in the game, and Rose
  // Curve -- a thousand bullets on screen and no deaths at all -- as the
  // narrowest. Against the log its three axes scored 0.00, 0.03 and -0.15.
  //
  // So: rasterise the free space, then ask for the WIDEST BOTTLENECK on any
  // route out. Stamp each bullet into a clearance grid, then run a max-min
  // search (Dijkstra on "maximise the narrowest cell you pass through") from
  // the sample point outwards. The answer is the width of the tightest squeeze
  // on the best route available -- which is exactly the thing a player means by
  // a lane being open enough, and it is orthogonal to how full the screen is.
  const LANE_CELL = 12;                 // px per grid cell
  const LANE_PAD = 4;                   // px of shoulder past the ship's radius
  const LANE_CLEAR_CAP = 48;            // px; wider than this we stop measuring
  const LANE_OUT = 200;                 // px a route has to reach to count as out
  const LANE_EVERY = 10;                // sample every Nth frame
  // The playfield is read off the game rather than restated, so this grid
  // cannot quietly stop covering it if the layout changes -- but there is no
  // boss to ask at setup time, so the grid is built on first use instead.
  let PLAY = null, LANE_COLS = 0, LANE_ROWS = 0;
  let laneClear = null, laneBest = null, laneSeen = null;
  const laneInit = () => {
    if (PLAY) return;
    PLAY = g.boss.attack.pf;
    LANE_COLS = Math.ceil(PLAY.w / LANE_CELL);
    LANE_ROWS = Math.ceil(PLAY.h / LANE_CELL);
    const n = LANE_COLS * LANE_ROWS;
    laneClear = new Float32Array(n);
    laneBest = new Float32Array(n);
    laneSeen = new Int32Array(n);
  };

  // Sampled at fixed points rather than wherever the bot drifted to. The axes
  // that follow the bot have produced three separate artifacts in this tool
  // already, all of them the bot's position leaking into a number that was
  // supposed to describe the pattern. Lane structure is a property of the
  // field, so it gets measured at the same places every time.
  const LANE_SPOTS = [[200, 600], [356, 600], [512, 600], [356, 470]];

  let laneStamp = 0;

  // ---- space-time reachability -------------------------------------------
  //
  // Everything above, lanes included, reads ONE FRAME, and that misses a whole
  // class of pattern -- a curtain's gap moves between rows, so on any frozen
  // frame there is no way through and in play there is a lane. See SPACE AND
  // TIME at the top of this file for the whole argument and for the player
  // model that was built here and removed.
  //
  // What is left is deliberately one thing: a max-min dynamic program over
  // (x, y, t) that answers whether a pattern leaves anywhere to be. The value
  // of a cell at step t is the narrowest clearance on the best trajectory that
  // reaches it, one step of movement is one cell -- the distance the ship
  // covers in ST_DT frames -- and the frontier PERSISTS across windows, so the
  // answer is the room available to a player already flying the pattern rather
  // than one dropped into it. Seeded with the whole playfield, so it needs no
  // sample point and cannot leak one.
  //
  // It runs forward on the recorded truth with no lookahead buffer, because a
  // max-min program only ever reads clearance up to the step it is on.
  const ST_CELL = 12;                   // px per cell
  // px; past this a gap is simply wide, and the cap is what keeps the stamping
  // affordable -- it sets how many cells each bullet touches, and this runs on
  // every bullet on every frame.
  const ST_CAP = 24;
  const ST_HORIZON = 48;                // frames a window looks ahead
  const ST_BLOCKED = -1e3;              // outside the arena: never a route
  const ST_NEG = -1e9;                  // unreachable, or hit on the way here
  let ST_DT = 3, ST_STEPS = 16, ST_COLS = 0, ST_ROWS = 0;
  let stWalls = null, stClear = null, stVal = null, stValN = null;

  const stInit = (pspeed) => {
    if (stWalls) return;
    ST_DT = Math.max(1, Math.round(ST_CELL / pspeed));
    ST_STEPS = Math.max(4, Math.round(ST_HORIZON / ST_DT));
    ST_COLS = Math.ceil(PLAY.w / ST_CELL);
    ST_ROWS = Math.ceil(PLAY.h / ST_CELL);
    const n = ST_COLS * ST_ROWS;
    // The arena edges live in the grid template, so every field reset puts them
    // back for free and no route ever leaves the playfield. The inset is the
    // player's own clamp, read off player.js rather than restated.
    stWalls = new Float32Array(n).fill(ST_CAP);
    for (let gy = 0; gy < ST_ROWS; gy++) {
      const y = PLAY.y + (gy + 0.5) * ST_CELL;
      for (let gx = 0; gx < ST_COLS; gx++) {
        const x = PLAY.x + (gx + 0.5) * ST_CELL;
        if (x < PLAY.x + 10 || x > PLAY.right - 10 || y < PLAY.y + 10 || y > PLAY.bottom - 10) {
          stWalls[gy * ST_COLS + gx] = ST_BLOCKED;
        }
      }
    }
    stClear = new Float32Array(n);
    stVal = new Float32Array(n); stValN = new Float32Array(n);
  };

  /**
   * Min-stamp one bullet's clearance into a grid.
   *
   * Clearance is to the bullet SURFACE and includes the ship's radius with no
   * shoulder, so what comes out is the same quantity as `room` and the two can
   * be read side by side.
   */
  const stStamp = (grid, bx, by, r) => {
    const cx = (bx - PLAY.x) / ST_CELL - 0.5, cy = (by - PLAY.y) / ST_CELL - 0.5;
    const span = Math.ceil((ST_CAP + r) / ST_CELL);
    const i0 = Math.max(0, Math.floor(cx) - span), i1 = Math.min(ST_COLS - 1, Math.ceil(cx) + span);
    if (i1 < i0) return;
    const j0 = Math.max(0, Math.floor(cy) - span), j1 = Math.min(ST_ROWS - 1, Math.ceil(cy) + span);
    const px0 = PLAY.x + (i0 + 0.5) * ST_CELL - bx;
    for (let gy = j0; gy <= j1; gy++) {
      const py = PLAY.y + (gy + 0.5) * ST_CELL - by;
      const yy = py * py;
      const base = gy * ST_COLS;
      let px = px0;
      for (let gx = i0; gx <= i1; gx++, px += ST_CELL) {
        const c = Math.sqrt(px * px + yy) - r;
        const k = base + gx;
        if (c < grid[k]) grid[k] = c;
      }
    }
  };

  window.__DIFF = function measure(bi, phi, di, frames, horizon, seed, pspeed) {
    g.settings.autopilot = true;
    g.settings.autofire = true;
    g.autopilot.reset();
    g.debugStart(bi, di, 0);
    g.boss.state = 'fight';
    g.boss.startPhase(phi);
    g.boss.hp = g.boss.hpMax = 1e9;
    laneInit();
    stInit(pspeed);

    const p = g.player;
    p.x = 160 + (seed % 3) * 180;
    p.y = 580 + (seed % 2) * 60;

    const rooms = [];
    const drifts = [];
    const reacts = [];
    const laneCounts = [];   // openings visible from a sample point
    const laneWidths = [];   // px across the widest one
    const laneLives = [];    // frames an opening lasted before it closed
    // One entry per sample spot, holding how long a way out has existed there.
    const laneAlive = LANE_SPOTS.map(() => ({ age: 0 }));
    const stRooms = [];      // px a prescient player could have held, per window

    const stN = ST_COLS * ST_ROWS;
    let stFrame = 0;         // frames into the current step
    let stStep = 0;          // steps into the current window

    /** Every in-bounds cell is somewhere a player could be. */
    const stSeed = () => {
      for (let k = 0; k < stN; k++) stVal[k] = stWalls[k] > 0 ? ST_CAP : ST_NEG;
    };
    stSeed();

    /** One step: carry every surviving trajectory forward. */
    const stAdvance = () => {
      for (let k = 0; k < stN; k++) stValN[k] = ST_NEG;
      for (let gy = 0; gy < ST_ROWS; gy++) {
        for (let gx = 0; gx < ST_COLS; gx++) {
          const k = gy * ST_COLS + gx;
          const v0 = stVal[k];
          if (v0 === ST_NEG) continue;
          for (let d = 0; d < 5; d++) {
            const mx = gx + (d === 1 ? 1 : d === 2 ? -1 : 0);
            const my = gy + (d === 3 ? 1 : d === 4 ? -1 : 0);
            if (mx < 0 || my < 0 || mx >= ST_COLS || my >= ST_ROWS) continue;
            const mk = my * ST_COLS + mx;
            const c = stClear[mk];
            if (c <= 0) continue;          // hit: this trajectory is over
            const v = v0 < c ? v0 : c;
            if (v > stValN[mk]) stValN[mk] = v;
          }
        }
      }
      stVal.set(stValN);

      if (++stStep >= ST_STEPS) {
        let best = ST_NEG;
        for (let k = 0; k < stN; k++) if (stVal[k] > best) best = stVal[k];
        if (best === ST_NEG) { best = 0; stSeed(); }
        else for (let k = 0; k < stN; k++) if (stVal[k] > ST_NEG) stVal[k] = ST_CAP;
        stRooms.push(best);
        stStep = 0;
      }
    };

    /** Clearance from every cell centre to the nearest bullet surface, capped. */
    const laneField = (pool, hitR) => {
      laneClear.fill(LANE_CLEAR_CAP);
      const span = Math.ceil((LANE_CLEAR_CAP + 12) / LANE_CELL);
      for (let j = 0; j < pool.n; j++) {
        const b = pool.a[j];
        if (b.harmless) continue;
        const r = b.hr + hitR + LANE_PAD;
        const cx = (b.x - PLAY.x) / LANE_CELL, cy = (b.y - PLAY.y) / LANE_CELL;
        const i0 = Math.max(0, Math.floor(cx) - span), i1 = Math.min(LANE_COLS - 1, Math.ceil(cx) + span);
        const j0 = Math.max(0, Math.floor(cy) - span), j1 = Math.min(LANE_ROWS - 1, Math.ceil(cy) + span);
        for (let gy = j0; gy <= j1; gy++) {
          const py = PLAY.y + (gy + 0.5) * LANE_CELL - b.y;
          for (let gx = i0; gx <= i1; gx++) {
            const px2 = PLAY.x + (gx + 0.5) * LANE_CELL - b.x;
            const c = Math.sqrt(px2 * px2 + py * py) - r;
            const k = gy * LANE_COLS + gx;
            if (c < laneClear[k]) laneClear[k] = c;
          }
        }
      }
    };

    /**
     * The widest bottleneck on any route from (sx, sy) out to LANE_OUT away,
     * and how many distinct bearings such a route reaches.
     *
     * Max-min Dijkstra: the value of a cell is the narrowest clearance on the
     * best path to it, and we always expand the most generous frontier cell
     * first. Clearance is bucketed to the nearest pixel so the queue is an
     * array of buckets rather than a heap -- linear, and the whole grid is
     * three thousand cells.
     */
    const laneRoutes = (sx, sy) => {
      const sgx = Math.min(LANE_COLS - 1, Math.max(0, Math.floor((sx - PLAY.x) / LANE_CELL)));
      const sgy = Math.min(LANE_ROWS - 1, Math.max(0, Math.floor((sy - PLAY.y) / LANE_CELL)));
      laneStamp++;
      const buckets = [];
      for (let i = 0; i <= LANE_CLEAR_CAP; i++) buckets.push([]);
      const push = (k, v) => {
        const b = Math.max(0, Math.min(LANE_CLEAR_CAP, Math.round(v)));
        laneBest[k] = v; laneSeen[k] = laneStamp; buckets[b].push(k);
      };
      const start = sgy * LANE_COLS + sgx;
      push(start, laneClear[start]);
      let best = 0;
      const bearings = [];
      for (let b = LANE_CLEAR_CAP; b >= 0; b--) {
        while (buckets[b].length) {
          const k = buckets[b].pop();
          const v = laneBest[k];
          if (Math.round(Math.max(0, Math.min(LANE_CLEAR_CAP, v))) !== b) continue;
          const gx = k % LANE_COLS, gy = (k / LANE_COLS) | 0;
          const dx = (gx - sgx) * LANE_CELL, dy = (gy - sgy) * LANE_CELL;
          if (dx * dx + dy * dy >= LANE_OUT * LANE_OUT) {
            if (v > best) best = v;
            // Only routes worth taking count as choices: a squeeze narrower
            // than the ship plus a little is not an option, it is a death.
            if (v >= 6) bearings.push(Math.atan2(dy, dx));
            continue;                   // reaching "out" ends this route
          }
          for (let d = 0; d < 4; d++) {
            const nx = gx + (d === 0 ? 1 : d === 1 ? -1 : 0);
            const ny = gy + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= LANE_COLS || ny >= LANE_ROWS) continue;
            const nk = ny * LANE_COLS + nx;
            const nv = Math.min(v, laneClear[nk]);
            if (nv <= 0) continue;
            if (laneSeen[nk] === laneStamp && laneBest[nk] >= nv) continue;
            push(nk, nv);
          }
        }
      }
      // Distinct escapes, as 60-degree sectors of the bearings that got out.
      const sect = new Set();
      for (const a of bearings) sect.add(Math.floor((a + Math.PI) / (Math.PI / 3)));
      return { width: best, routes: sect.size };
    };
    let aimedHits = 0;
    let aimedSeen = 0;
    // Bullets newly entering the planning radius, counted once each. This is
    // density x speed by construction -- a faster field sweeps more bullets
    // past you per second, and so does a denser one -- which is the pairing
    // that reads as "random and fast" in play.
    let entered = 0;
    let wasNear = new Set();

    // Reading time: frames between a bullet existing and it being a threat.
    //
    // Every other axis here looks at bullets already in flight, which quietly
    // assumes they all arrived with the same amount of notice. They do not. A
    // ring leaving the boss crosses most of the playfield before it matters --
    // a hundred frames to look at it and pick a lane. Convergence spawns on the
    // border, including the bottom and the sides the player is already sitting
    // against, and Reflection's ricochets return off the near walls; those
    // arrive with a fraction of the notice at the same speed, which is exactly
    // the difference a player describes as "fast bullets that come from close
    // by" rather than as density.
    //
    // Measured off the real trajectory, not a straight-line reading at launch:
    // a bullet's age the first frame it comes within GUARD of the player. A
    // straight-line test at spawn was tried first and measures the wrong
    // population -- it can only see bullets already pointed at you, so gravity
    // arcs, ricochets, curves and stop-and-snap rings contribute nothing at all
    // and the axis collapses into a second reading of `aimed`. Ballistic Rain,
    // whose every bullet is a lob fired upward, scored on a handful of
    // stragglers. Age at first contact needs no extrapolation and no special
    // case: whatever the bullet did to get there, this is how long the player
    // had to watch it do it.
    // Only bullets born OUTSIDE the planning radius count -- the same gate
    // `flux` and `react` already use, so all three axes speak about the same
    // population: what came into the picture you were planning over.
    //
    // The player can walk into an emitter, and on the sparse low tiers the bot
    // does: with nothing to dodge it drifts wherever it likes, and a rank
    // spawning beside it there is contact almost at once. It is not an ambush
    // if you went to meet it, and there is no way to tell the two apart after
    // the fact. Gating on GUARD instead of NEAR was not enough of a filter:
    // Loom at Novice scored 38 frames against 129 at Easy and 136 at Normal --
    // the sparsest tier reading as the least warning in the phase -- because
    // the bot had room to sit against a side edge, where the horizontal ranks
    // enter a hundred pixels away. Nothing real is lost: a pattern that puts
    // bullets on the player wherever the player is puts them a long way from
    // its own emitter, so they are born far and score their travel honestly.
    const GUARD = 60;           // px; the radius a dodge has to be started for
    const warns = [];
    const seen = new Set();     // every bullet, from its first frame
    const bornFar = new Set();  // ... of which these started outside GUARD
    const warned = new Set();   // bullets whose arrival has been scored
    const measured = new Set(); // bullets whose launch has been scored

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
        // Scored once per bullet: `age <= 1` is true on two consecutive frames
        // depending on where in the update the pattern spawned it, which used
        // to double every launch count here.
        if (b.age <= 1 && !measured.has(b.__id)) {
          measured.add(b.__id);
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.01 && dist > 1) {
            aimedSeen++;
            if ((b.vx * -dx + b.vy * -dy) / (sp * dist) >= AIM_TOL) aimedHits++;
          }
        }

        // Reading time: how old this bullet was the first time it got close
        // enough to have to be dodged.
        if (!seen.has(b.__id)) {
          seen.add(b.__id);
          if (dist > NEAR) bornFar.add(b.__id);
        } else if (dist <= GUARD + b.hr && bornFar.has(b.__id) && !warned.has(b.__id)) {
          warned.add(b.__id);
          warns.push(b.age);
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
        if (!wasNear.has(b.__id)) entered++;
      }
      wasNear = new Set(nearNow.keys());

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

      // Space-time: the truth field for the step this frame belongs to, taken
      // as a minimum over its frames so nothing tunnels between samples.
      if (stFrame === 0) stClear.set(stWalls);
      for (let j = 0; j < pool.n; j++) {
        const b = pool.a[j];
        if (!b.harmless && b.__id !== undefined) stStamp(stClear, b.x, b.y, b.hr + p.hitR);
      }
      if (++stFrame >= ST_DT) { stFrame = 0; stAdvance(); }

      if (f % LANE_EVERY === 0) {
        laneField(pool, p.hitR);
        for (let s = 0; s < LANE_SPOTS.length; s++) {
          const r = laneRoutes(LANE_SPOTS[s][0], LANE_SPOTS[s][1]);
          laneCounts.push(r.routes);
          laneWidths.push(r.width);
          // How long a way out keeps existing. A phase that opens and shuts
          // every few frames is passable on any given frame and unreadable
          // over any stretch of them.
          if (r.routes > 0) laneAlive[s].age += LANE_EVERY;
          else if (laneAlive[s].age > 0) { laneLives.push(laneAlive[s].age); laneAlive[s].age = 0; }
        }
      }
    }
    for (const a of laneAlive) if (a.age > 0) laneLives.push(a.age);

    const p10 = (a) => {
      if (!a.length) return null;
      const t = a.slice().sort((x, y) => x - y);
      return t[Math.floor(t.length * 0.1)];
    };
    return {
      room: median(rooms),
      tight: p10(rooms),
      flux: (entered * 60) / frames,
      drift: p90(drifts),
      react: median(reacts),
      // 999 is the no-data sentinel: nothing came within the guard radius in
      // the whole window, which is the safest a phase can be and not, as an
      // empty-sample zero would have said, the most dangerous.
      warn: warns.length ? p10(warns) : 999,
      lanes: median(laneCounts),
      laneW: median(laneWidths),
      laneLife: median(laneLives),
      stroom: median(stRooms),
      stfloor: stRooms.length ? Math.min(...stRooms) : 0,
      aimed: aimedSeen ? aimedHits / aimedSeen : 0,
      aimRate: (aimedHits * 60) / frames,
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

/**
 * Fold the axes into one number of pixels, calibrated against a player log.
 *
 * The geometric mean of two budgets: the room at the pinch points you can
 * actually rely on, and how far you can travel before the nearest threat
 * arrives. Both in pixels, so their geometric mean is too.
 *
 * Not min(). min() reports the tightest budget and discards the rest, and since
 * reach ran three to ten times clearance on nearly every phase, speed and aim
 * were being measured and then thrown away -- which is exactly the complaint a
 * player log arrived with. A product says what min() cannot: tight space AND
 * little time is worse than either alone.
 *
 * Ranked against deaths-per-attempt from a real session of twenty patterns,
 * this scores -0.651 where min(clearance, reach) scored -0.316.
 *
 * `tight` rather than median room, for the same reason and by the same test:
 * you die at a pattern's pinch points, not in its typical conditions.
 */
function safety(m) {
  const clearance = Math.max(1, m.tight - m.drift);
  const reach = Math.max(1, m.react * PLAYER_SPEED * (1 - AIM_COST * m.aimed) * readable(m));
  return Math.sqrt(clearance * reach);
}

/**
 * How much of the movement budget a player actually gets to use, given how
 * much notice the pattern gives. 1.0 once there is time to read the field.
 *
 * Same structural place as the aim cost, and for the same reason: reach is the
 * distance you can cover before contact, and distance you did not know to start
 * covering is not yours. A pattern that puts its bullets on the border a
 * playfield away gives well over two seconds to pick a lane; one that puts them
 * on the bottom edge the player is already sitting against gives Convergence's
 * 24 frames at Normal, against a 140-frame norm.
 *
 * WARN_REF is where more notice stops helping -- past about two and a half
 * seconds the field has been read and the extra time buys nothing. Against the
 * run log this form scores -0.672 where leaving reading time out scored -0.468
 * on the same axes, and it is the only candidate tried that also reproduces the
 * player's own ranking of Convergence and Reflection as the two hardest
 * patterns on Normal.
 */
function readable(m) {
  return Math.min(1, m.warn / WARN_REF);
}

async function measure(b, ph, d) {
  const runs = [];
  for (let s = 0; s < STARTS; s++) {
    runs.push(await page.evaluate(
      ([bi, phi, di, frames, horizon, seed, sp]) =>
        window.__DIFF(bi, phi, di, frames, horizon, seed, sp),
      [b, ph, d, FRAMES, HORIZON, s, PLAYER_SPEED],
    ));
  }
  const avg = (k) => runs.reduce((a, r) => a + (r[k] ?? 0), 0) / runs.length;
  return {
    room: avg('room'), tight: avg('tight'), flux: avg('flux'),
    drift: avg('drift'), react: avg('react'), warn: avg('warn'),
    lanes: avg('lanes'), laneW: avg('laneW'), laneLife: avg('laneLife'),
    stroom: avg('stroom'), stfloor: avg('stfloor'),
    aimed: avg('aimed'), aimRate: avg('aimRate'),
  };
}

if (JSON_OUT) {
  const out = [];
  for (const b of bosses) {
    const phases = ONLY_PHASE === null ? roster[b].phases.map((_, i) => i) : [ONLY_PHASE];
    for (const ph of phases) {
      const row = { boss: roster[b].name, phase: roster[b].phases[ph], axes: [] };
      for (let d = 0; d < 5; d++) row.axes.push({ diff: DIFFN[d], ...(await measure(b, ph, d)) });
      out.push(row);
    }
  }
  console.log(JSON.stringify({ playerSpeed: PLAYER_SPEED, rows: out }, null, 2));
  await browser.close();
  server.kill();
  process.exit(0);
}

console.log(`Difficulty sweep on space and predictability.`);
console.log(`${(FRAMES / 60).toFixed(0)}s x ${STARTS} start(s) per cell, ` +
  `${HORIZON}-frame prediction horizon, player speed ${PLAYER_SPEED.toFixed(2)}px/f.`);
console.log(`safety = sqrt((tight - drift) x react x speed x (1 - ${AIM_COST} x aimed) ` +
  `x min(1, warn/${WARN_REF})), in px. Lower is harder.`);
console.log(`Space-time: 48-frame windows, ${ST_FLOOR}px floor.\n`);

if (DETAIL) {
  const b = ONLY_BOSS === null ? 4 : ONLY_BOSS;
  const ph = ONLY_PHASE === null ? 0 : ONLY_PHASE;
  console.log(`${roster[b].name}  ${ph + 1}. ${roster[b].phases[ph]}\n`);
  console.log('DIFFICULTY     room    tight    drift    react     warn    aimed  aim/sec     flux   clearance    reach   SAFETY  |  routes   lane   hold  |  st-room  st-min');
  console.log('-'.repeat(168));
  for (let d = 0; d < 5; d++) {
    const m = await measure(b, ph, d);
    const clearance = Math.max(1, m.tight - m.drift);
    const reach = m.react * PLAYER_SPEED * (1 - AIM_COST * m.aimed) * readable(m);
    console.log(
      DIFFN[d].padEnd(12) +
      `${m.room.toFixed(1)}px`.padStart(9) +
      `${m.tight.toFixed(1)}px`.padStart(9) +
      `${m.drift.toFixed(1)}px`.padStart(9) +
      `${m.react.toFixed(1)}f`.padStart(9) +
      `${m.warn.toFixed(0)}f`.padStart(9) +
      `${(m.aimed * 100).toFixed(0)}%`.padStart(9) +
      `${m.aimRate.toFixed(1)}/s`.padStart(9) +
      `${m.flux.toFixed(1)}/s`.padStart(9) +
      `${clearance.toFixed(1)}px`.padStart(12) +
      `${reach.toFixed(1)}px`.padStart(9) +
      `${safety(m).toFixed(1)}px`.padStart(9) +
      '  |' + `${m.lanes.toFixed(1)}`.padStart(8) +
      `${m.laneW.toFixed(1)}px`.padStart(7) + `${m.laneLife.toFixed(0)}f`.padStart(7) +
      '  |' + `${m.stroom.toFixed(1)}px`.padStart(9) + `${m.stfloor.toFixed(1)}px`.padStart(8));
  }
} else {
  console.log('BOSS          PHASE                       ' +
    DIFFN.map((n) => n.slice(0, 4).padStart(9)).join('') + '   drift  aimed   warn');
  console.log('-'.repeat(44 + 9 * 5 + 22));

  const rows = [];
  for (const b of bosses) {
    const phases = ONLY_PHASE === null
      ? roster[b].phases.map((_, i) => i) : [ONLY_PHASE];
    for (const ph of phases) {
      const cells = [];
      const st = [];
      let driftSum = 0, aimSum = 0, warnSum = 0;
      for (let d = 0; d < 5; d++) {
        const m = await measure(b, ph, d);
        cells.push(safety(m));
        st.push(m);
        driftSum += m.drift;
        aimSum += m.aimed;
        warnSum += m.warn;
      }
      rows.push({
        boss: roster[b].name,
        name: roster[b].phases[ph],
        label: `${ph + 1}. ${roster[b].phases[ph]}`,
        cells,
        st,
      });
      console.log(
        roster[b].name.padEnd(14) +
        `${ph + 1}. ${roster[b].phases[ph]}`.padEnd(28) +
        cells.map((v) => `${v.toFixed(1)}`.padStart(9)).join('') +
        `${(driftSum / 5).toFixed(1)}px`.padStart(9) +
        `${(aimSum / 5 * 100).toFixed(0)}%`.padStart(7) +
        `${(warnSum / 5).toFixed(0)}f`.padStart(7));
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

  // The space-time verdict, which is a check rather than a ranking: a pattern
  // where even a player who knew exactly what every bullet would do could not
  // hold a ship's width of clearance. It is meant to read EMPTY. Anything here
  // has a stretch with nowhere to be, which is a different complaint from being
  // hard and is not fixed by retuning a tier.
  const forced = [];
  const unread = [];
  for (const r of rows) {
    r.st.forEach((m, d) => {
      if (m.stroom < ST_FLOOR) {
        forced.push(`${r.boss} ${r.name} @ ${DIFFN[d]}: ${m.stroom.toFixed(1)}px typical`);
      }
      if (m.stfloor < ST_FLOOR) {
        unread.push(`${r.boss} ${r.name} @ ${DIFFN[d]}: ${m.stfloor.toFixed(1)}px in its worst window`);
      }
    });
  }
  console.log(`\nSpace-time: ${forced.length} cell(s) typically below the ${ST_FLOOR}px floor, ` +
    `${unread.length} that dip below it in their worst window.`);
  for (const f of forced.slice(0, 8)) console.log('  typical  ' + f);
  for (const u of unread.slice(0, 8)) console.log('  worst    ' + u);

  if (bumps.length) {
    console.log(`\n${bumps.length} non-monotonic step(s) -- an easier tier that is not easier:`);
    for (const b of bumps) console.log('  - ' + b);
  } else {
    console.log('\nEvery phase gets monotonically safer as difficulty drops.');
  }
}

await browser.close();
server.kill();
