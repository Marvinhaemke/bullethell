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
| **Shift** (hold) | Focus — half speed, the ship's heavy armament, hitbox shown |
| **Z** | Fire (hold) — unfocused mixes straight, spread and homing |
| **X** / Space | Bomb — clears bullets, damages the boss, grants invulnerability |
| **Esc** / P | Pause |
| Shift + **R** | Restart the current boss |
| **M** | Cycle sound |

Space bombs rather than fires. With autofire on by default the fire key is
barely touched, while a bomb is the one thing you reach for in a panic, so the
biggest key on the keyboard belongs to it.

Menu options worth knowing about:

| Option | |
| --- | --- |
| **SHIP** | Four loadouts — see [Ships](#ships). They differ in what they shoot, never in how fast they move. |
| **AUTOFIRE** | Fire without holding anything. On by default; holding Z still works. |
| **AUTOPILOT** | A dodging bot plays for you. It is the same bot `npm run survive` uses to prove patterns are dodgeable, and it only ever produces inputs a human has — nine headings, focused or not, at the game's own speeds. Bombs and pause stay yours. |
| **SHOT OPACITY** | Dim your own shots (down to hidden) so enemy bullets read more clearly in dense patterns. |
| **SOUND** | Three levels: **ON**, **NO SHOTS**, **OFF**. `M` cycles them. |
| **MUSIC** | Volume for whatever you put in `music/` — see [Music](#music). |

**NO SHOTS** silences your own gun — the shot going out and the shot landing —
and keeps everything else. Autofire is twenty shots a second, so that pair is
most of what you hear; muting only one of them would not be worth a setting.

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
| Hard | ×1.07 | ×1.16 | ×0.91 | 3 | leading |
| Lunatic | ×1.20 | ×1.46 | ×0.79 | 4 | perfect, leading |

The top two tiers are deliberately **compressed** rather than stepping in even
ratio. Difficulty is badly superlinear in these knobs: at the old ×1.32 density
and ×1.14 speed, the Normal→Hard step was multiplying a logged player's deaths
by roughly four, spanning the whole of the target band and overshooting it.

**Three life modes**, granted *per boss* so every fight starts on equal footing:
Infinite (deaths cost score only), 3 Lives, and 1 Life.

Both are selectable from the main menu and from the pause menu mid-fight.

## The bosses

Each boss has three to five patterns. Depleting a pattern's health bar clears
the screen and advances to the next. **There is no time limit** — a pattern
ends when its health does. Each one still has a par time, and clearing under
par is what pays the speed bonus.

That works because the two firing stances trade damage against attention.
Every ship's **unfocused** loadout mixes straight, spread and homing fire, and
enough of it lands without aiming that you can give the screen your whole
attention and still make steady progress: dodging a pattern and never focusing
clears it in about its par time. **Focusing** is the ship's specialty, worth
roughly two to three times as much — but only while you stand where the boss is.

The one exception is Chaos Engine's final pattern, which is a **survival**
phase: there the clock is the win condition, and running it out is the clear.

### 1 · SENTINEL — *Rotational Primer*
Clean rotational geometry. Precessing rings, two counter-wound spiral arms whose
reversal bunches them into a wall, and expanding regular polygons — each bullet
is carried outward along its own radius at a speed proportional to how far out
it starts, which is a homothety, so the polygon keeps straight edges and grows
in proportion — with a notch that follows you to aim for.

### 2 · WEAVER — *Lattice Interference*
Grids and interference. Crossing walls with gaps that move diagonally; two
orbiting satellite emitters whose overlapping sprays produce a live moiré field;
a ring of cells running **elementary cellular automaton rule 30**, whose live
cells become bullets, so the volley is deterministic but never repeats (rule 90
rides underneath at higher difficulties, laying clean Sierpiński triangles over
the chaos); and finally bullets that ricochet into a standing lattice off three
of the four walls — the floor does not reflect, because the floor is the wall
the player is standing against.

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
once on a single clock — its beam pair is *held still* rather than swept, which
is the one place in the game a sweep was the wrong call: it turns over a curtain
several hundred bullets deep, so being caught on the wrong side of it does not
mean running, it means crossing that curtain, and often there is no route.

![Sweep lasers](docs/sweep-lasers.png)

<a id="ships"></a>
## Ships

Four loadouts, chosen in the menu. Movement speed is identical across the
roster — they differ in what they shoot, not how they dodge, which is also what
keeps the autopilot's planning valid for all of them.

Only fans and seekers are aimed at the boss when they leave the ship. Straight
lanes are not: lining them up is the entire cost of using them, and it is why
the two ships built around them are the slowest while dodging and the fastest
once planted.

| Ship | Unfocused | Focused | |
| --- | --- | --- | --- |
| **VECTOR** | 1 straight · 2 spread · 2 homing | two forward lanes | Balanced. Good everywhere, best nowhere. |
| **TRACER** *(default)* | 3 homing · 2 spread | three seekers | Lands wherever you are. Least punished for bad position, least rewarded for good. |
| **BLOOM** | 4 spread · 1 homing | a five-wide fan | Forgiving aim. The fan spends its outer shots on empty space at range. |
| **LANCE** | 2 straight · 1 spread · 1 homing | one heavy bolt | Highest ceiling, no margin. Dead weight unless you are under the boss. |

Measured with `npm run ships`, as a multiple of par time (lower is faster):

| | dodging, never focused | lined up, focused |
| --- | --- | --- |
| VECTOR | 1.00 | 0.49 |
| TRACER | 0.93 | 0.46 |
| BLOOM | 1.06 | 0.60 |
| LANCE | 1.15 | 0.35 |

The per-phase columns matter more than the totals: BLOOM and LANCE are almost
exactly anti-correlated, because the patterns where the boss stands still are
the ones where straight lanes land and a long-range fan wastes its edges.

<a id="difficulty"></a>
## Judging difficulty

`npm run margins` measures one thing: the largest hitbox the dodging bot can
clear. That is **space**, and space is not all of difficulty. A homing bullet
takes up no more room than a straight one and is far worse to be near. A bullet
that bounces off a wall occupies the same pixels and invalidates the route you
had planned. A faster bullet leaves the same gap and less time to use it. Two
phases can measure identically on room and play nothing alike.

`npm run difficulty` adds the missing axes. It deliberately does **not** carry a
table of modifiers per behaviour — "homing counts double" is a guess dressed as
a number, and it silently misses any behaviour nobody thought to tag. Instead it
models what a player actually does: look at a bullet, assume it keeps going the
way it is going, and plan a route through the gap. The harness records every
nearby bullet, waits 26 frames, and measures **how much less room there turned
out to be than that straight-line reading predicted**.

One measurement, and every behaviour falls out of it at once — curvature,
gravity, speed ramps, stop-and-snap, wall bounces, homing, orbits — each in
proportion to how badly it breaks the assumption. A straight bullet scores zero
no matter how fast it travels, which is right: fast-and-straight is a reaction
problem, not a prediction one, and it lands on a different axis.

| | |
| --- | --- |
| `room` | median clearance to the nearest bullet. Space. |
| `drift` | how much of that room the straight-line reading got wrong. Predictability. |
| `react` | frames until the most urgent closing bullet arrives. This is where speed shows up. |
| `aimed` | share of bullets launched within 8° of the player. Standing still is not a plan. |
| `tight` | the 10th-percentile `room`. You die at a pattern's pinch points, not in its typical conditions. |
| `warn` | reading time: how old a bullet was, in frames, the first time it came within 60px. 10th percentile again. |
| `flux` | bullets newly entering the planning radius per second. Reported, not scored. |
| `aimRate` | aimed launches per second — the same events as `aimed`, counted absolutely. Reported, not scored. |
| `stroom` | clearance a player could *hold throughout* a 48-frame window, over (x, y, t). A floor check, not a ranking — see below. |

They compose without fudge factors, because they are all in the same units.
`tight - drift` is the gap you can actually count on, since drift is by
construction the amount your reading of it was wrong. `react x speed` is how far
you can get before contact — so

```
safety = sqrt( (tight - drift) x react x speed x (1 - aimCost x aimed) x min(1, warn/160) )
```

It used to be `min()` of those two budgets, and the run log is what changed it.
The two patterns a player reported as hardest on Normal were the extremes on
exactly the axes `min()` throws away — one killing with bullets at 9.4px/frame
against a 1.5–3.8 norm, the other at 92% aimed — and both scored as unremarkable,
because `reach` ran three to ten times `clearance` and the `min` never picked it.
That is precisely the under-weighting of bullet speed the player had described
from the other end. A product says what a `min` cannot: tight space **and** little
time is worse than either alone. Against deaths-per-attempt over twenty patterns
the product scores **−0.651** where `min()` scored **−0.316**.

Calibrating on one session of one player is worth being honest about. It fixes a
structural flaw that was visible without the data and settles a choice between
two defensible formulas; it is not a fit, and where the data could not separate
two options the existing one was kept. `flux` is the clearest example — it is the
axis a player means by "it feels random", it is measured, and folding it in as a
third term moved the correlation to −0.568, so it stays reported and unscored.
So does `aimRate`: a *share* can be diluted by bolting an unaimed ring onto a
pattern, which is visibly what used to happen to Gear Release between Easy and
Normal, but every rate-based variant scored −0.449 against the share's −0.446 —
inside the noise on seventeen phases. The aim term is the one judgement left, and
it is a flag (`--aim-cost`) rather than a constant so it can be argued with.

### Where a bullet starts

`warn` is the last axis and the one a player asked for twice. Every other axis
looks at bullets already in flight, which quietly assumes they all arrived with
the same amount of notice. They do not. A ring leaving the boss crosses most of
the playfield before it matters — two or three seconds to look at it and pick a
lane. Convergence spawned its wave on the playfield border, *including the
bottom and side edges the player is already sitting against*, so a kunai could
appear thirty pixels away: measured at **three frames** between existing and
being close enough to dodge, against a 150–300 frame norm for every other
pattern in the game. Same speed, same density, a completely different demand —
and that is what "fast bullets that come from much closer than the boss" means
when you are the one playing it.

It enters `safety` in the same place as the aim cost and for the same reason:
reach is the distance you can cover before contact, and distance you did not
know to start covering is not yours. Against the run log this scores **−0.672**
where leaving reading time out scores −0.468 on the same axes, and it is the
only candidate tried that also reproduces the player's own ranking of
Convergence and Reflection as the two hardest patterns on Normal. `--warn-ref`
sets where more notice stops helping.

Two things it took a rewrite to get right, both worth not repeating:

- **Measure the real trajectory, not a straight line at launch.** The first
  version solved for when a bullet's spawn heading would bring it within 60px.
  That can only see bullets already pointed at you, so gravity arcs, ricochets,
  curves and stop-and-snap rings contributed nothing and the axis collapsed into
  a second reading of `aimed` — Ballistic Rain, whose every bullet is a lob
  fired *upward*, scored on a handful of stragglers. A bullet's age the first
  frame it comes close needs no extrapolation and no special case.
- **A bullet born already close is not evidence.** The player can walk into an
  emitter, and on the sparse low tiers the bot does — with nothing to dodge it
  drifts under the boss and a ring spawns around it at age zero. Three phases
  read 0.05–0.09 of their column at Novice *and nowhere else* before those
  samples were excluded. Nothing real is lost: a pattern that puts bullets on
  the player wherever the player is puts them far from its own emitter. The
  cut-off is the planning radius — the same gate `flux` and `react` already use,
  so all three axes speak about one population. A tighter cut-off was not enough
  of a filter: Loom at Novice scored 38 frames against 129 at Easy, the sparsest
  tier reading as the least warning in the phase, because the bot had room to
  sit against a side edge where the horizontal ranks enter beside it.

### Lanes: a hypothesis that did not survive

A player proposed the missing axis was **lane forming** — a route you are pushed
into or choose, not too dense, hard to leave, where *"the screen can be full of
bullets but the lane is still open enough for a human to dodge"*. The prediction
was that phases built that way would be the ones that kill least.

It is measured now — `lanes`, `laneW`, `laneLife` in `--detail` — and the
prediction is **false**. The first implementation cast rays and measured
emptiness rather than corridors, which is its own lesson: *a corridor that bends
is invisible to a straight ray, and a lane that did not bend would not need
choosing*. The second rasterises the free space and runs a max-min search for
the widest bottleneck on any route out. That one is correct — it gives Rose
Curve two routes through a 9px squeeze and Convergence six through a 29px one,
which is what the eye sees — and it still does not predict deaths: **+0.21,
+0.12, −0.10**, with the two strongest pointing the *wrong way*.

The reason is visible once the numbers are up. Lane quality is close to a
measure of how open the field is, and the lethal phases here are the sparse fast
ones, not the dense ones. Convergence has the best lane structure in the game
and the worst death rate, because it kills with speed across an empty screen.

**What the lanes do track is taste**, which is what the player was describing:

| | routes | bottleneck |
| --- | --- | --- |
| *praised* — Phyllotaxis | 1 | 6.8px |
| *praised* — Rose Curve | 2 | 9.0px |
| *praised* — Delayed Theorem | 4 | 20.6px |
| *disliked* — Convergence | 6 | 29.4px |
| *disliked* — Lissajous Choir | 5 | 10.9px |
| *disliked* — Curveshot | 5 | 12.5px |

Few tight routes is the maze feeling that got called satisfying; many wide ones
is an open field, which did not. So these axes are a **design-intent readout** —
what *kind* of phase did I just build — and not a difficulty term.

On the evidence of three logs, the thing that does govern deaths is `drift`: the
only axis whose sign is right on all three. `aimed` is stronger on the two Hard
logs and inverts on Normal, so it is not stable enough to reweight on — every
`--aim-cost` from 0.5 to 2.0 was tried and none wins across all three. Both are
the same statement twice: **a bullet that does something after launch you did
not read**, which is exactly what the design principle above says to avoid.

### Space and time: what one frame cannot show

Every axis above, lanes included, reads a **single frame**, and that misses a
whole class of pattern. The clearest case is a **curtain** — rows of bullets
sweeping down with a gap that slides sideways from row to row. Freeze any frame
and the rows are a grid whose gaps do not line up vertically, so the only way
through is a squeeze between two rows. That is what the lane measure reports for
Weaver's Curtain — a probe pattern built to find exactly this: **3.8px of
bottleneck at Novice falling to 0.0 at Lunatic**, tighter than anything else in
the game. The Curtain has since been removed at the player's request; it did its
job as an instrument and was never much of a fight. The blind spot it found was
real, and this is the measure that closes it.

Played, nobody goes through the rows. You *ride* the gap: stand still, let a row
pass, slide sideways into the next gap as it arrives. A lane-follower written to
check clears the phase for fifty seconds at every tier including Lunatic. The
room is real, there is plenty of it, and none of it exists on any single frame —
it exists in the sequence.

So `stroom` asks over **(x, y, t)**: what is the largest clearance a player
could *hold throughout* the next 48 frames? A max-min dynamic program, one cell
of movement per step, run forward on what the bullets really did.

| Weaver's Curtain (since removed) | NOV | EASY | NORM | HARD | LUN |
| --- | --- | --- | --- | --- | --- |
| one frame (`laneW`) | 3.8px | 2.9px | 0.9px | 1.0px | 0.0px |
| space-time (`stroom`) | 24px | 24px | 22.5px | 22.3px | 21.1px |

**The player has to be persistent**, and that took a wrong answer to learn. The
first version restarted the search from a fixed sample point every window — the
same fixed-point discipline the lane axes use, adopted for the same good reason
— and scored the Curtain *worse* than the snapshot did, 4px at every tier. It
was right to: a player parachuted onto a sample point has to cross the rows to
reach the lane, and would have to do it again every window, forever. **Riding a
lane is a commitment, and the room is only there for someone already in it.** So
the frontier carries over between windows; only the value resets.

**What it said, across all twenty-one phases at five tiers:** `stroom` sat at
its 24px cap in every cell but three, and those three were the Curtain. Read
plainly — *nothing in this game denies a player room*, and the pattern that came
closest was the one the single-frame measure called impossible. That is a floor
check passing, which is what it is for. It should report nothing, like
`npm run deadzones`, and it will fire the day a pattern is built with genuinely
nowhere to be.

**What was tried and dropped: a reader.** `stroom` is prescient — the trajectory
is chosen in hindsight — so a second player was built to be the honest half: at
each window it extrapolated the bullets it could see along straight lines,
solved the same program on that imagined field, and flew the plan through what
really happened. It is gone, because its trace shows it measuring itself. On the
Curtain at Hard it wanders out of the lane during the opening seconds — while
the screen is still filling from the top and every direction reads safe — and
corners itself bottom-left, where the lane is eighteen cells away and its
horizon is sixteen. Every plan from there scores an identical **1.4px**, so the
max-min objective is flat, so it never moves again: 1.4px for the remaining
nineteen windows against the 22px the pattern actually affords. Replanning more
often makes it *worse*, because each fresh plan ratchets it further out.

A better one is a research problem, not a parameter — it needs the thing a
player has and this does not, knowledge of where a pattern *puts* bullets rather
than only where they are. `drift` already measures the read-failure dimension,
at frame level and without an agent.

### What a flat ladder costs the measurement

The second run log is the one that showed the limit. Thirteen of twenty patterns
came back at **zero** deaths per attempt, with everything the player died to
concentrated in three phases. That is the ladder working, and it leaves almost
no spread for a rank correlation to bite on — the same formula that scored
−0.672 against the first log scores −0.197 against the second, and the
difference is the ground truth flattening rather than the model getting worse.

So the honest summary of what the metric is now good for: it is calibrated
against one session, it correctly puts the pattern the player names first at the
top, and it should be read as a way of finding *structural* faults — an
inversion, a phase that gets looser as it gets harder, a cell way off its column
— rather than as a ranking to tune toward. Where it disagrees with a log, the
log wins. It currently flags Loom at four tiers and Maelstrom at two; the player
cleared both without dying once. Both are patterns whose safe route is
signposted — a moving gap, a vortex — and "the room is tight but the way through
is obvious" is not something any axis here measures.

## What a good pattern does

The Fractal is the boss that works. A player named Phyllotaxis, Rose Curve and
Delayed Theorem as the mix they want — *tight dodges from slow, predictable
shapes; challenging without overwhelming; never a test of reaction time* — and a
Hard run bears it out. Those three took 2, 1 and 0 deaths while recording 39, 16
and 32 grazes: the player was constantly close to bullets and almost never hit,
which is the signature of a pattern being **solved** rather than survived.

Set against the same run's worst — Reflection 7, Ballistic Rain 7, Convergence 7,
Curveshot 6 — one distinction does most of the work:

> **Draw shapes by moving the emitter, not by bending the bullets.**

Every phase in that run where a *bullet* changes course after launch is in the
top four killers: Reflection ricochets, Curveshot curves, Ballistic Rain falls.
Every phase that draws its shape by moving the *emission point* while the bullets
fly straight sits at 0–2 deaths — Phyllotaxis steps its emission angle by the
golden angle, Rose Curve walks an emitter along the polar curve, Maelstrom
launches at a fixed pitch to the radius, Twin Helix rotates its arms. The screen
fills with structure either way. The difference is that in the second kind, what
you read at the moment a bullet appears is still true when it reaches you, so
reading it once is worth something.

The rest of what those three have in common:

- **One origin.** Everything comes from the boss, radially. The player learns one
  geometry and it holds for the whole phase. Convergence spawns around the whole
  border and Lissajous Choir's emitters roam the playfield; both are in the worst
  five.
- **One speed per layer,** and layers separated by speed. Phyllotaxis runs at
  1.2, 1.62, 1.8, 2.5 and 3.05 — each layer reads as its own object moving at its
  own rate, rather than as one soup.
- **Slow.** The structural layers sit between 1.2 and 3.0px/frame. Nothing in
  these three is fast.
- **Nothing aimed,** so the shape is the same wherever you stand and what you
  learned last attempt still applies.
- **The shape is shown before it is dangerous.** Rose Curve spends two seconds
  drawing itself before it unfolds. Phyllotaxis's arms are visible as spokes long
  before they arrive.

Delayed Theorem is the exception that sharpens the rule. Its bullets *do* change
course — a dense ring races out at 4.6, freezes, then relaunches aimed — and it
is the one phase in the game at zero deaths on both Normal and Hard. The change
is legal because it happens **stationary and telegraphed**: you are given a
motionless configuration to read and a visible wind-up before anything moves. A
trajectory that changes is fine; a trajectory that changes *while you are trying
to read it* is not.

### Everything shoots downward

The longest-running complaint in four run logs was never about how much or how
fast. It was about **where from**:

> The main problem of relatively fast bullets coming from all directions
> persists. In other levels there may be more and even faster bullets, but at
> least they all come from the top or at a top angle and not from all directions
> at once.

That is a statement about **attention**, not about room. The boss is at the top,
so that is where a player is looking; a pattern that also shoots from behind them
asks them to watch two places at once, and no amount of clearance makes that
readable. It is the same class of problem as an aimed volley — a demand that
cannot be answered by learning the pattern — and it deserves the same treatment.

The sweep measures it now, as `rise` (share of the threat headed *up* the
screen, speed-weighted) and `spread` (how much the threat disagrees about its
heading). They separate the game in one cut. At Hard, eighteen of twenty
patterns score `rise` 0% and `spread` 1–8% — everything in this game shoots
downward, because that is what a boss at the top of the screen does. The two
that did not were the two the player had been naming for four sessions:

| | `rise` | `spread` | why |
| --- | --- | --- | --- |
| Reflection | 16% | 43% | ricochets off all four walls |
| Convergence | 7% | 34% | spawned on the whole perimeter |

Both are fixed at the source rather than tuned down. **Reflection's floor stops
reflecting** — the other three walls still fold every ring back through itself,
which is the pattern; what goes away is being shot in the back by a ricochet you
cannot watch while also watching the boss. **Convergence closes in from the top
edge and the upper sides** instead of the full circle; a ring closing from up
there is still a ring closing on you, and the wave still arrives as one object.
Both now read `rise` 0%, `spread` 11%.

These two are a **check, not a difficulty term**. They are meant to read near
zero, and a phase that lights up is not necessarily hard — it is making a demand
this game has decided not to make.

### The levers, in order

So when a pattern has to come down:

1. **Top speed**, first and always.
2. **Whether the path changes after launch** — and if it must, announce it.
3. **Where it comes from** — if it is not the top, that is the fix.
4. **Aiming** (see below).
5. **Count**, last.

The first four cost readability; only the last costs room. Room is the thing a
player can solve, so it is the last thing to take away — and often the right way
to spend what the first three give back. That is the trade the aimed volleys were
removed on, and it is why Loom at Lunatic and Reflection got the removal with
nothing in its place while eight other phases got denser instead.

## Aimed volleys, and why there are none left

Nine patterns used to punctuate themselves with a fast narrow fan of white
kunai thrown at where the player was standing — 3.5 to 5.1px/frame, aimed or
lead-aimed. They are gone, and where the phase could afford it the density came
back in that phase's own language: paired rings on Cardinal Bloom, a third
strand per arm on Twin Helix, stepped polygons on Polygon Cage, a second cut
through the automaton on Rule Thirty, a third arm ring on Phyllotaxis, a volley
fired back down the petals on Rose Curve, another run of the logistic map on
Strange Attractor, denser ricochet rings on Reflection.

This is a design position rather than a measurement, and it is the player's: an
aimed fast volley moves the difficulty from pattern recognition to reflex, and
reflex is what breaks flow. There is nothing in such a volley to read — only
something to flinch away from — so it interrupts the thing the rest of the
pattern is asking you to do.

Two survive. Final Theorem's fan visibly curves and is now launched across the
field rather than at the player; and Gear Release keeps a single aimed pressure
shot, which exists to stop you parking out of the gears' radial path, and which
is one readable bullet rather than a spray.

Two of the sites took the removal with no replacement at all, because the sweep
said they were already too tight: Loom at Lunatic, and Reflection — the pattern
that a player named as one of the two hardest on Normal *and* as one of the ones
they wanted the aimed volleys out of. Those turned out to be the same note.

The 26-frame horizon matches the autopilot's own lookahead. It matters — a wall
bounce reads as 5.8px of lost room over 20 frames and 18.6px over 45 — so it
wants a reason rather than a round number. Note the autopilot integrates each
bullet's real behaviour where this extrapolates a straight line: that gap is the
point, since a person reads a curve as a line and is wrong by exactly this much.

Two caveats worth knowing. `room` is *typical* clearance where `npm run margins`
answers the worst case, so the two can disagree and both be right; `--detail`
prints a 10th-percentile column so you can see which. And `drift` only covers
bullets already on screen — a volley that splits into three is scored as the new
bullets it becomes, not as the prediction failure it also is.

## The run log

Every number in `npm run difficulty` is a **model** of a player: straight-line
prediction, a movement budget, a reaction window. Every number in `npm run
margins` comes from a bot that plans straight lines, cannot orbit a sweep, and
has no idea a pattern is about to do something. Both are useful and neither is
a person.

So the game records what actually happens, in three streams. Deaths alone are
not enough — a pattern cleared first try having grazed forty bullets and one
cleared on the third attempt both report zero deaths:

### The band

`npm run deaths` scores every phase against a target, in deaths per attempt at
the tier you are meant to be playing:

| | |
| --- | --- |
| **under 0.5** | too easy — though one such phase per boss is fine, more so on the early bosses |
| **0.5 – 1.5** | right |
| **1.5 – 2** | very hard; one per boss is acceptable late in the run |
| **2 – 3** | too hard *here* — this is what the next tier up should look like |
| **over 3** | not a difficulty, a wall: bad design, or two tiers misplaced |

This is the only calibration in the project that came from a person rather than
from a model of one, and it outranks everything else here for exactly that
reason. It is one player's skill — self-described as *"not a hardcore bullet
hell player, but not that bad"* — so read it as what a tier should **feel** like
to the person it is aimed at, not as a universal constant.

It is also what caught the ladder's biggest fault. Three Hard runs at three
attempts a phase scored a **median of 2.00**, with ten of twenty phases above the
band and seven of those at *"two tiers up, or bad design"* — while the same
player's Normal run had thirteen of twenty phases at **zero**. One step was
spanning the entire good band and overshooting it. That is a tier-table problem,
not twenty pattern problems, and it is why `DIFFICULTIES` now compresses toward
the top instead of stepping in even ratio: difficulty is badly superlinear in
these knobs, so the +32% density and +14% speed that used to separate Normal
from Hard were multiplying deaths by about four.

| stream | |
| --- | --- |
| `deaths` | one per death, taken at the collision site where the killing bullet is still in hand — reconstructing it afterwards from what was nearby fails exactly when the screen is busiest |
| `phases` | one per pattern attempt, however it ended: cleared, died out, quit to the menu, or closed the tab mid-fight |
| `runs` | one per run, so boss-select practice and a full rush stay distinguishable |

A death record carries the boss, pattern, difficulty, ship, seconds into the
phase and position; the bullet's colour, shape, radius, speed and whether it was
closing on you; its behaviours — curving, bouncing, homing, accelerating,
stop-go, splitting, orbiting — read off the bullet's **own fields**, so the list
cannot go stale when a pattern changes; and the bullets on screen and your
clearance at that instant.

That last one is deliberate: `clearance` is the same quantity the difficulty
sweep calls `room`, so a phase whose deaths cluster far above its measured room
is one the model is getting wrong.

Reading behaviour off the bullet has one trap worth knowing, because it bit:
`bounce` counts *down* as bounces are spent, so asking whether it is positive
files a ricochet that has finished bouncing as a plain straight shot. It took a
real log, in which Reflection's deaths were all reported as "straight bullets",
to notice. `bounced` now counts the other way.

Everything persists to `localStorage` **as it happens**, not at the end, so a
run abandoned halfway is recorded rather than lost — including boss-select
practice and closing the tab mid-pattern. Capped, and sent nowhere.

**DOWNLOAD LOG** in the main or pause menu writes it out as JSON; the item shows
how many records are waiting. **CLEAR LOG** sits next to it, because the useful
thing to hand over is usually one session rather than every session since the
tracker was added. Then:

```bash
node tools/deaths.mjs bossrush-log-2026-01-01-12-00-00.json
```

which prints deaths per pattern, attempts and clear rate per pattern, and which
bullet behaviours are actually killing. `npm run deaths -- --bot` fills a log
from the dodging bot instead — useful for regression, not for tuning, since the
bot dies to things people do not. It says so plainly: run it today and every
single death across all twenty patterns is a beam.

<a id="music"></a>
## Music

The game ships with none, and stays silent until you add some. To add tracks:

```bash
cp ~/some-track.mp3 music/
```

That is the whole step. A browser cannot list a directory, so the game reads a
manifest — but the manifest is **generated**, not maintained by hand: `serve.py`
builds it per request, and `build.py` and the Vercel build write it at build
time. Uploading a track through the GitHub web UI works as well as adding one
locally, which an earlier version of this got wrong.

By default every track joins one rotation that advances on each scene change.
To pin one to a scene, run `npm run music` to write `music/tracks.json`, then
add a `for` field to its entry:

```json
{
  "tracks": [
    { "file": "opening.mp3", "title": "Opening", "for": "menu" },
    { "file": "sentinel.mp3", "title": "Sentinel", "for": "boss1" },
    { "file": "drift.mp3", "title": "Drift" }
  ]
}
```

Valid values are `menu`, `boss1` … `boss5` and `results`. A scene with nothing
pinned to it falls back to the rotation, so pinning some tracks and not others
works fine. `"loop": false` plays an entry once instead of looping.

Every generator **merges**: hand-added fields survive, and only new files are
added and vanished ones dropped. `npm run music` is the only one that writes to
the repository; the rest generate in memory or into their build output.

Tracks stream from an `<audio>` element rather than decoding into WebAudio
buffers — a decoded three-minute track is ~30MB of `Float32Array` and has to
download in full before a note plays. The cost of streaming is that music lives
outside the sound-effect mixer, which is why it has its own volume setting
rather than riding the SOUND level.

Audio in `music/` is committed by default, because a Vercel deploy builds from
the repository and anything uncommitted would not reach the site. To keep audio
out of git instead, uncomment the `music/*.mp3` line in `.gitignore` and deploy
with `vercel deploy` from your working copy.

<a id="deploying"></a>
## Deploying

The game is static files, so any static host will serve it. For Vercel, import
the repository and accept the defaults — `vercel.json` already sets everything:

| | |
| --- | --- |
| Install | skipped — there are no runtime dependencies |
| Build | `node tools/vercel-build.mjs` |
| Output | `public/` |

The "build" only copies `index.html`, `styles.css`, `src/` and `music/` into
`public/`. There is nothing to compile; the point of the step is that the
deployed file set is explicit and checkable rather than "the repository, minus
whatever `.vercelignore` happens to exclude". It uses Node and no Python, so it
does not depend on what the build image happens to include.

```bash
npm run vercel-build       # then serve public/ to see exactly what deploys
```

`src/*.js` is served `must-revalidate` because the filenames are not content
hashed — a long cache would strand players on an old build. `music/` is
immutable and cached for a year.

## How patterns are written

For what to aim at, see [What a good pattern does](#what-a-good-pattern-does) —
one origin, one speed per layer, shapes drawn by moving the emitter rather than
by bending the bullets. This section is the mechanics.

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

Difficulty threads through six helpers — `A.n()` scales counts, `A.nw()` scales
the count of a rank that fills a *fixed span*, `A.spd()` scales velocity,
`A.w()` scales delays, `A.gap()` scales delays *between waves*, and `A.L(k)`
gates a whole optional sub-pattern. That last one is what makes the difficulties
structurally different.

`A.gap()` exists because of a mistake worth not repeating. Some patterns are
hard because of how many waves are in flight at once rather than how dense one
wave is, and for those, `A.w()` alone does nothing: a wave stays on screen for
about `span / speed` frames, so scaling the gap by `rate` very nearly cancels
the speed change and every difficulty ends up with the same overlap. Chaos
Engine's Convergence ran 7.1 overlapping waves on Novice against 8.3 on
Lunatic. `A.gap()` divides by speed as well, and clamps so it only ever eases —
Normal is the reference tuning and the tiers above it keep the gap they were
designed with.

The same trap catches any layer whose *count* does not go through `A.n()`.
Final Theorem emitted one bullet per frame unconditionally, so it put 784
bullets on screen at Novice and 809 at Lunatic — a 3% difficulty range on a
phase where every other pattern spans sixfold. Anything spawned at a fixed rate
needs its rate scaled, or the easier tiers get slower bullets and more of them.

`A.nw()` is the same trap from the other side: a count that *does* scale, on a
rank where scaling it stops helping. A ring grows as it travels, so adding
bullets to one costs the player a little room; a wall's span never changes, so
every column added subtracts directly from the lane spacing, and once a lane is
thinner than the ship the extra columns only add flux. Loom ran 27 columns
across a 672px playfield at Lunatic — 45% of the width solid, two misaligned
ranks of it at once — and measured as the tightest cell in the game on the
second boss's *opening* pattern. `A.nw()` damps the density step by half, and
only upward: Normal is the reference tuning, so the tiers below it keep the
counts they were designed with.

Three more of the same family turned up in one pass over the sweep, each showing
as a phase that got *looser* the harder the difficulty:

- **`polyRing` never expanded.** Every bullet on an edge took that edge's
  outward normal, which translates the edge rigidly — so a triangle's 45px edge
  was still 45px three hundred pixels out, where the shape it traces needs
  565px. The ring covered about 6% of its own perimeter by the time it reached
  the player, and `perSide` only packed bullets tighter into the same short
  bars. Moving each bullet along its own radius at a speed proportional to its
  distance from the centre is a homothety: the polygon stays a polygon.
- **Rose Curve capped its own density.** `steps` was both how finely the rose is
  traced and how many frames tracing it takes, and it was clamped at 132 — so
  Hard and Lunatic drew the same rose as Normal with faster bullets, which
  spreads it thinner. Sampling and draw time had to be separated.
- **Polygon Cage's notch is aimed at the player,** which makes `A.aim()`'s
  jitter run backwards: everywhere else a tighter aim is a harder pattern, but
  a precisely aimed *escape hatch* is a gift, and Lunatic was handing it over
  perfectly. Worth knowing what did **not** work — moving the notch off the
  player, by a fixed angle or a random one, measured *easier* both times. An
  opening that does not follow you is one you can walk to and then stop.

Bullet behaviour is data, not closures, so the pool stays allocation-free while
still supporting gravity (`ax`/`ay`), constant-curvature steering (`turn`,
`turnDecay`), speed ramps (`accel`, `minSpeed`, `maxSpeed`), stop-and-snap
(`stopT`, `goT`, `goMode`), wall bounces (`bounce`), soft homing (`homeT`,
`homeK`), orbit-then-release (`orbit`) and recursive splitting (`split`).

`maxSpeed` applies to anything that gains speed, not only to `accel` — a gravity
arc has a terminal velocity too. It used to be copied onto the bullet only
inside the `accel` branch, so a pattern could set `ay` and `maxSpeed` together
and have the limit silently dropped at spawn. Ballistic Rain did exactly that,
which is how its lobs came to land at 13.5px/frame against a 1.5–3.8 norm and
became the pattern a player reported as the game's worst difficulty spike. The
cap is applied **along the direction of the acceleration only**: scaling the
whole velocity vector also shortens how far an arc travels sideways, which
pulled those lobs in from the edges and opened a corner of the screen that
nothing could reach.

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
  ships.js          the ship roster, as weapon-component data
  music.js          streams whatever mp3s are in music/
  runlog.js         the run log: deaths, pattern attempts, runs
  player.js  lasers.js  particles.js  sprites.js
  ui.js  input.js  audio.js  storage.js  config.js  mathx.js  rng.js
  bosses/boss1..5.js
musicscan.py        the music manifest scanner, shared by serve.py and build.py
tools/
  smoke.mjs         headless play-through of every boss at every difficulty
  census.mjs        per-phase bullet-count and frame-cost report
  ships.mjs         per-ship clear time, dodging vs lined up
  audiokeys.mjs     sound levels, key bindings, the music drop-in path
  autopsy.mjs       what kills you on one phase, and how pressure builds
  difficulty.mjs    difficulty on space AND predictability, not space alone
  deaths.mjs        read a run log back, or fill one with the bot
  music.mjs         the music manifest scanner, and a CLI to write it out
  vercel-build.mjs  assemble public/ for a static deploy
  shots.mjs         screenshot every phase
  probe.mjs         damage throughput and phase pacing
```

## Development

```bash
npm install         # playwright, for the headless tests only
npm test            # drives every boss at every difficulty in Chromium
npm run survive     # can a player actually dodge each pattern?
npm run margins     # how much dodging room each pattern really has
npm run difficulty  # ...and how much of that room you can rely on
npm run deadzones   # can you park anywhere and ignore a pattern?
npm run autopsy -- --boss 5 --phase 4   # why is this phase hard?
npm run deaths -- --bot                # what actually kills the bot
npm run bot         # autopilot quality: survival, gap width, idle drift
npm run ships       # is every ship worth picking?
npm run audio       # sound levels, key bindings, music end to end
npm run music       # write music/tracks.json, for pinning tracks to scenes
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
