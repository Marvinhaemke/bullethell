// Game shell: scene machine, run bookkeeping, collisions, HUD and menus.

import { TAU, clamp } from './mathx.js';
import {
  VIEW, PLAY, SIDEBAR, C, DIFFICULTIES, LIFE_MODES, GRAZE_RADIUS, SCORE,
} from './config.js';
import { Input } from './input.js';
import { Sfx, SOUND_LEVELS } from './audio.js';
import { Music } from './music.js';
import { RunLog } from './runlog.js';
import { BulletPool } from './bullets.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { SHIPS, shipAt } from './ships.js';
import { Autopilot } from './autopilot.js';
import { Boss, hexAlpha } from './boss.js';
import { BOSSES } from './bosses/index.js';
import { loadSettings, saveSettings, submitRecord, getRecord } from './storage.js';
import { text, panel, pips, Menu, fadeRect } from './ui.js';
import { drawShape } from './sprites.js';

const BOMB_RADIUS_MAX = 340;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.input = new Input(window);
    this.sfx = new Sfx();
    this.music = new Music();
    this.log = new RunLog();
    this.settings = loadSettings();
    this.sfx.level = this.settings.sound;
    this.music.setVolume(this.settings.music);

    this.bullets = new BulletPool();
    this.particles = new Particles();
    this.lasers = [];
    this.player = new Player(this);
    this.autopilot = new Autopilot(this);
    this.boss = null;

    this.frame = 0;
    this.shake = 0;
    this.flash = 0;
    this.scene = 'title';
    this.sceneT = 0;
    this.state = 'idle';        // play sub-state: intro | fight | bossdown | gameover
    this.stateT = 0;
    this.run = null;
    this.bomb = null;
    this.starfield = makeStarfield();
    this.fps = 60;
    this.dpr = 1;               // set by the host on resize
    this.logNote = '';
    this.logNoteT = 0;

    this.buildMenus();
  }

  get diff() { return DIFFICULTIES[this.settings.diff]; }
  get lifeMode() { return LIFE_MODES[this.settings.life]; }
  get ship() { return shipAt(this.settings.ship); }

  // -------------------------------------------------------------------------
  // Menus
  // -------------------------------------------------------------------------
  buildMenus() {
    const cycle = (key, list, dir) => {
      this.settings[key] = (this.settings[key] + dir + list.length) % list.length;
      saveSettings(this.settings);
    };

    const diffItem = {
      label: 'DIFFICULTY',
      value: () => this.diff.name,
      valueColor: () => this.diff.color,
      change: (d) => cycle('diff', DIFFICULTIES, d),
      hint: () => this.diff.blurb,
    };
    const lifeItem = {
      label: 'LIVES PER BOSS',
      value: () => this.lifeMode.name,
      valueColor: () => (this.settings.life === 2 ? C.red : this.settings.life === 0 ? C.green : C.amber),
      change: (d) => cycle('life', LIFE_MODES, d),
      hint: () => this.lifeMode.blurb,
    };
    const shipItem = {
      label: 'SHIP',
      value: () => this.ship.name,
      valueColor: () => this.ship.color,
      change: (d) => cycle('ship', SHIPS, d),
      hint: () => this.ship.blurb,
    };
    const soundItem = {
      label: 'SOUND',
      value: () => SOUND_LEVELS[this.settings.sound].name,
      valueColor: () => (this.settings.sound === 0 ? C.dust
        : this.settings.sound === 1 ? C.amber : C.green),
      change: (d) => { this.cycleSound(d); },
      hint: () => SOUND_LEVELS[this.settings.sound].blurb + ' Cycle anytime with M.',
    };
    const musicItem = {
      label: 'MUSIC',
      value: () => (this.settings.music <= 0 ? 'OFF' : Math.round(this.settings.music * 100) + '%'),
      valueColor: () => (this.settings.music <= 0 ? C.dust
        : this.music.available ? C.violet : C.dim),
      change: (d) => {
        const next = Math.round((this.settings.music + d * 0.1) * 10) / 10;
        this.settings.music = Math.min(1, Math.max(0, next));
        this.music.setVolume(this.settings.music);
        saveSettings(this.settings);
      },
      hint: () => (this.music.available
        ? 'Volume for the tracks in music/.'
        : 'No tracks found. Drop mp3s into music/ and run: npm run music'),
    };
    const autofireItem = {
      label: 'AUTOFIRE',
      value: () => (this.settings.autofire ? 'ON' : 'OFF'),
      valueColor: () => (this.settings.autofire ? C.green : C.dust),
      change: () => {
        this.settings.autofire = !this.settings.autofire;
        saveSettings(this.settings);
      },
      hint: () => (this.settings.autofire
        ? 'Fires continuously. Holding Z still works.'
        : 'Hold Z to fire.'),
    };
    const autopilotItem = {
      label: 'AUTOPILOT',
      value: () => (this.settings.autopilot ? 'ON' : 'OFF'),
      valueColor: () => (this.settings.autopilot ? C.amber : C.dust),
      change: () => {
        this.settings.autopilot = !this.settings.autopilot;
        this.autopilot.reset();
        saveSettings(this.settings);
      },
      hint: 'Let the dodging bot play. Bombs and pause stay yours.',
    };
    const alphaItem = {
      label: 'SHOT OPACITY',
      value: () => (this.settings.shotAlpha <= 0 ? 'HIDDEN' : Math.round(this.settings.shotAlpha * 100) + '%'),
      valueColor: () => (this.settings.shotAlpha <= 0 ? C.dust : C.cyan),
      change: (d) => {
        const next = Math.round((this.settings.shotAlpha + d * 0.1) * 10) / 10;
        this.settings.shotAlpha = Math.min(1, Math.max(0, next));
        saveSettings(this.settings);
      },
      hint: 'Dim your own shots so enemy bullets read more clearly.',
    };

    // The log is only worth keeping if it can leave the browser. Clearing sits
    // next to it because the useful thing to send is one session, not every
    // session since the tracker was added.
    const logItem = {
      label: 'DOWNLOAD LOG',
      value: () => (this.log.size ? String(this.log.size) : '--'),
      valueColor: () => (this.log.size ? C.teal : C.dust),
      action: () => {
        if (!this.log.size) return;
        this.logNote = this.log.download() ? 'SAVED' : 'BLOCKED';
        this.logNoteT = 150;
      },
      hint: () => (this.log.size
        ? 'Every death, graze and pattern attempt so far, as a JSON file.'
        : 'Nothing recorded yet. Play a pattern and it fills up.'),
    };
    const clearLogItem = {
      label: 'CLEAR LOG',
      value: () => '',
      action: () => {
        this.log.clear();
        this._phaseKey = null;
        this.logNote = 'CLEARED';
        this.logNoteT = 150;
      },
      hint: 'Wipes it immediately. Download first if you want to keep it.',
    };

    this.mainMenu = new Menu([
      { label: 'START BOSS RUSH', action: () => this.startRun('rush', 0), hint: 'All five bosses back to back.' },
      { label: 'BOSS SELECT', action: () => this.setScene('select'), hint: 'Practise any single boss.' },
      { separator: true },
      diffItem,
      lifeItem,
      shipItem,
      { separator: true },
      autofireItem,
      autopilotItem,
      alphaItem,
      soundItem,
      musicItem,
      { separator: true },
      logItem,
      clearLogItem,
      { separator: true },
      { label: 'HOW TO PLAY', action: () => this.setScene('help'), hint: 'Controls and scoring.' },
    ]);

    const bossItems = BOSSES.map((b, i) => ({
      label: `${String(i + 1).padStart(2, '0')}  ${b.name}`,
      value: () => {
        const rec = getRecord(this.recordKey('practice', b.id));
        return rec ? rec.toLocaleString() : '--';
      },
      valueColor: () => b.color,
      action: () => this.startRun('practice', i),
      hint: () => `${b.title} · ${b.phases.length} patterns`,
    }));
    bossItems.push({ separator: true });
    bossItems.push({ label: 'BACK', action: () => this.setScene('menu') });
    this.selectMenu = new Menu(bossItems, { onCancel: () => this.setScene('menu') });

    this.pauseMenu = new Menu([
      { label: 'RESUME', action: () => { this.scene = 'play'; } },
      { label: 'RESTART BOSS', action: () => this.startBoss(this.run.index, true) },
      { separator: true },
      diffItem,
      lifeItem,
      shipItem,
      { separator: true },
      autofireItem,
      autopilotItem,
      alphaItem,
      soundItem,
      musicItem,
      { separator: true },
      logItem,
      { separator: true },
      { label: 'QUIT TO MENU', action: () => this.setScene('menu') },
    ], { onCancel: () => { this.scene = 'play'; } });

    this.overMenu = new Menu([
      { label: 'RETRY BOSS', action: () => this.startBoss(this.run.index, true) },
      { label: 'QUIT TO MENU', action: () => this.setScene('menu') },
    ]);
  }

  /**
   * Open and close phase records by watching the boss's phase change, rather
   * than calling out from each of the half-dozen places a pattern can end.
   * Missing one of those would silently lose records, which is the one failure
   * a log must not have.
   */
  syncPhaseRecord() {
    const b = this.boss;
    const key = b && b.state === 'fight' && b.phase
      ? `${b.def.id}:${b.phaseIndex}:${this.log.run ? this.log.run.id : ''}` : null;
    if (key === this._phaseKey) return;
    if (this._phaseKey) this.log.closePhase(this._lastOutcome || 'superseded', this);
    this._lastOutcome = null;
    this._phaseKey = key;
    if (key) this.log.beginPhase(this);
  }

  /** Step the sound level, wrapping. `d` may be negative from the menu's left arrow. */
  cycleSound(d) {
    const n = SOUND_LEVELS.length;
    this.settings.sound = (this.settings.sound + d + n) % n;
    this.sfx.level = this.settings.sound;
    saveSettings(this.settings);
  }

  setScene(name) {
    if ((name === 'menu' || name === 'title') && this.run) {
      this.log.endRun(this.state === 'gameover' ? 'gameover' : 'quit');
      this._phaseKey = null;
    }
    this.scene = name;
    this.sceneT = 0;
    // Menus, the title and the results share one cue; fights get their boss's.
    if (name === 'menu' || name === 'title' || name === 'select' || name === 'help') {
      this.music.play('menu');
    } else if (name === 'results') {
      this.music.play('results');
    }
    if (name === 'menu' || name === 'title') {
      this.run = null;
      this.boss = null;
      this.bullets.clear();
      this.particles.clear();
      this.lasers.length = 0;
      this.bomb = null;
    }
  }

  recordKey(mode, bossId) {
    return `${mode}:${bossId}:${this.diff.key}:${this.lifeMode.key}`;
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------
  startRun(mode, bossIndex) {
    this.log.beginRun(this, mode, bossIndex);
    this._phaseKey = null;
    this.run = {
      mode,
      order: mode === 'rush' ? BOSSES.map((_, i) => i) : [bossIndex],
      slot: 0,
      index: bossIndex,
      score: 0,
      graze: 0,
      deaths: 0,
      bombsUsed: 0,
      frames: 0,
      results: [],
      startedAt: this.frame,
    };
    this.startBoss(bossIndex, false);
  }

  startBoss(index, restart) {
    const run = this.run;
    run.index = index;
    this.music.play(`boss${index + 1}`);
    if (restart) {
      run.score = Math.max(0, run.score);
      run.deaths = 0;
      run.bombsUsed = 0;
    }
    run.bossScore = 0;
    run.lives = this.lifeMode.lives;
    run.bombs = this.lifeMode.bombs;
    run.bossStart = this.frame;
    run.bossDeaths = 0;

    this.bullets.clear();
    this.particles.clear();
    this.lasers.length = 0;
    this.bomb = null;
    this.player.reset(true);
    this.boss = new Boss(this, BOSSES[index]);
    this.state = 'fight';
    this.stateT = 0;
    this.scene = 'play';
    this.sfx.play('phase');
  }

  addScore(v) {
    if (!this.run) return;
    this.run.score = Math.max(0, this.run.score + v);
    this.run.bossScore = Math.max(0, (this.run.bossScore || 0) + v);
  }

  addShake(v) { this.shake = Math.min(26, this.shake + v); }

  onPhaseCleared(phaseIndex, elapsed, par, noMiss) {
    this._lastOutcome = 'cleared';
    // Scored against par rather than against a countdown: break it faster than
    // the pattern's par time and the surplus is the bonus.
    const underPar = Math.max(0, (par - elapsed) / 60);
    const bonusTime = Math.round(underPar * SCORE.timeBonus);
    let gain = SCORE.phaseClear + bonusTime;
    if (noMiss) gain += SCORE.phaseNoMiss;
    this.addScore(gain);
    this.particles.pop(PLAY.cx, PLAY.cy - 60, (noMiss ? 'NO MISS  +' : 'PATTERN CLEAR  +') + gain.toLocaleString(),
      noMiss ? C.amber : C.ice, 90);
    this.flash = Math.max(this.flash, 0.35);
  }

  onBossDefeated() {
    this.state = 'bossdown';
    this.stateT = 0;
    this.addScore(SCORE.bossClear);
    this.bullets.clearArea(this, 0, 0, 0);
    this.lasers.length = 0;
    this.addShake(20);
    this.flash = 0.7;
    this.sfx.play('defeat');
  }

  advanceAfterBoss() {
    const run = this.run;
    const def = BOSSES[run.index];
    run.results.push({
      boss: def.name,
      color: def.color,
      score: Math.round(run.bossScore || 0),
      deaths: run.bossDeaths,
      frames: this.frame - run.bossStart,
    });

    submitRecord(this.recordKey('practice', def.id), run.bossScore || 0);

    run.slot++;
    if (run.slot < run.order.length) {
      this.startBoss(run.order[run.slot], false);
    } else {
      if (run.mode === 'rush') submitRecord(this.recordKey('rush', 'all'), run.score);
      this.setScene('results');
      this.scene = 'results';
      this.resultsCleared = true;
    }
  }

  respawnPlayer() {
    const run = this.run;
    if (!run) return;
    if (run.lives <= 0) {
      this.state = 'gameover';
      this.stateT = 0;
      this.overMenu.index = 0;
      return;
    }
    this.player.reset(false);
    run.bombs = this.lifeMode.bombs;
  }

  playerDied(killer = null, cause = 'bullet') {
    const run = this.run;
    const p = this.player;
    // Before clearArea below wipes the evidence.
    this.log.record(this, killer, cause);
    this.sfx.play('death');
    this.addShake(18);
    this.flash = 0.55;
    this.particles.ring(p.x, p.y, C.red, 12, 14, 34, 4);
    this.particles.shards(p.x, p.y, C.ice, 'tri', 14, 4, 46);
    this.particles.spark(p.x, p.y, C.white, 26, 6, 40);
    this.bullets.clearArea(this, p.x, p.y, 150, false);

    run.deaths++;
    run.bossDeaths++;
    if (this.boss) this.boss.phaseNoMiss = false;
    this.addScore(SCORE.death);
    if (run.lives !== Infinity) run.lives = Math.max(0, run.lives - 1);
  }

  useBomb() {
    const run = this.run;
    if (!run || this.bomb || this.state !== 'fight') return;
    if (this.player.deathAnim > 0) return;
    if (run.bombs <= 0) return;
    run.bombs--;
    run.bombsUsed++;
    this.log.count('bombs');
    this.addScore(SCORE.bomb);
    this.bomb = { x: this.player.x, y: this.player.y, r: 20, t: 0 };
    this.player.invuln = Math.max(this.player.invuln, 150);
    this.player.bombAnim = 40;
    this.addShake(16);
    this.flash = 0.5;
    this.sfx.play('bomb');
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update() {
    this.frame++;
    this.sceneT++;
    if (this.shake > 0) this.shake *= 0.88;
    if (this.flash > 0) this.flash *= 0.86;

    if (this.input.pressed('mute')) this.cycleSound(1);

    switch (this.scene) {
      case 'title':
        if (this.input.pressed('confirm') || this.input.pressed('pause')) {
          this.sfx.play('select');
          this.setScene('menu');
        }
        break;
      case 'menu': this.mainMenu.update(this.input, this.sfx); break;
      case 'select': this.selectMenu.update(this.input, this.sfx); break;
      case 'help':
        if (this.input.pressed('confirm') || this.input.pressed('cancel') || this.input.pressed('pause')) {
          this.sfx.play('back');
          this.setScene('menu');
        }
        break;
      case 'pause': this.pauseMenu.update(this.input, this.sfx); break;
      case 'results':
        if (this.input.pressed('confirm') || this.input.pressed('cancel')) {
          this.sfx.play('select');
          this.setScene('menu');
        }
        break;
      case 'play': this.updatePlay(); break;
      default: break;
    }

    this.input.endFrame();
  }

  updatePlay() {
    this.stateT++;
    this.syncPhaseRecord();

    if (this.input.pressed('pause') && this.state !== 'gameover') {
      this.scene = 'pause';
      this.pauseMenu.index = 0;
      this.sfx.play('back');
      return;
    }
    if (this.input.pressed('restart') && this.input.held('focus')) {
      this.startBoss(this.run.index, true);
      return;
    }

    if (this.state === 'gameover') {
      this.particles.update();
      if (this.stateT > 40) this.overMenu.update(this.input, this.sfx);
      return;
    }

    if (this.state === 'bossdown') {
      this.boss.update();
      this.particles.update();
      this.player.update(this.input);
      if (this.stateT % 6 === 0) {
        this.particles.ring(this.boss.x, this.boss.y, this.boss.def.color, 10 + this.stateT, 6, 30, 3);
      }
      if (this.stateT > 130) this.advanceAfterBoss();
      return;
    }

    // --- fight ---
    // The autopilot writes the keys it would hold, so movement still runs
    // through the ordinary input path -- it plays the game, it does not
    // bypass it.
    if (this.settings.autopilot && this.player.deathAnim === 0) {
      this.autopilot.drive(this.input, this.settings.autofire);
    }
    this.player.update(this.input);
    if (this.boss) this.boss.update();
    this.bullets.update(this);
    this.particles.update();
    this.updateLasers();
    this.updateBomb();
    this.collide();
    if (this.run) this.run.frames++;
  }

  updateLasers() {
    for (let i = 0; i < this.lasers.length; i++) {
      const l = this.lasers[i];
      l.update();
      if (!l.alive) { this.lasers.splice(i, 1); i--; }
    }
  }

  updateBomb() {
    const b = this.bomb;
    if (!b) return;
    b.t++;
    b.r = 20 + BOMB_RADIUS_MAX * (1 - (1 - Math.min(1, b.t / 46)) ** 2);
    this.bullets.clearArea(this, b.x, b.y, b.r);
    if (this.boss && this.boss.vulnerable && b.t % 4 === 0) {
      const dealt = this.boss.damage(90);
      if (dealt) this.addScore(dealt * SCORE.damage);
    }
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      this.particles.spark(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, C.ice, 1, 2, 18);
    }
    if (b.t > 60) this.bomb = null;
  }

  collide() {
    const p = this.player;
    const run = this.run;
    const bl = this.bullets;
    const grazeR2 = (GRAZE_RADIUS) ** 2;

    // --- player shots vs boss ---
    if (this.boss && this.boss.state === 'fight') {
      const bx = this.boss.x, by = this.boss.y, br = this.boss.hitR;
      for (let i = 0; i < p.shotN; i++) {
        const s = p.shots[i];
        const dx = s.x - bx, dy = s.y - by;
        const rr = br + s.r;
        if (dx * dx + dy * dy < rr * rr) {
          if (this.boss.vulnerable) {
            const dealt = this.boss.damage(s.dmg);
            this.log.count('damage', dealt);
            this.addScore(dealt * SCORE.damage);
            this.particles.spark(s.x, s.y, C.ice, 2, 2.2, 12);
          } else {
            // Survival phases deflect shots with a visible ping.
            this.particles.spark(s.x, s.y, C.dust, 2, 1.8, 10);
          }
          this.sfx.play('hit', 55);
          p.killShot(i);
        }
      }
    }

    if (p.deathAnim > 0) return;

    // --- bullets vs player ---
    const vulnerable = p.invuln <= 0;
    for (let i = 0; i < bl.n; i++) {
      const b = bl.a[i];
      if (b.harmless) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (vulnerable) {
        const hit = b.hr + p.hitR;
        if (d2 < hit * hit) {
          if (p.hit()) this.playerDied(b, 'bullet');
          return;
        }
      }
      if (!b.grazed) {
        const gr = b.hr + GRAZE_RADIUS;
        if (d2 < gr * gr) {
          b.grazed = true;
          run.graze++;
          this.addScore(SCORE.graze);
          this.log.count('grazes');
          if (run.graze % 25 === 0) this.particles.pop(p.x, p.y - 22, 'GRAZE ' + run.graze, C.amber, 40);
          this.particles.dot(b.x, b.y, C.white, 3, 8);
          this.sfx.play('graze', 90);
        }
      }
    }

    // --- lasers vs player ---
    if (vulnerable) {
      for (let i = 0; i < this.lasers.length; i++) {
        if (this.lasers[i].hits(p.x, p.y, p.hitR)) {
          if (p.hit()) this.playerDied(null, 'laser');
          return;
        }
      }
    }
    void grazeR2;
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------
  draw() {
    const g = this.g;
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, VIEW.w, VIEW.h);

    switch (this.scene) {
      case 'title': this.drawTitle(g); break;
      case 'menu': this.drawMenu(g); break;
      case 'select': this.drawSelect(g); break;
      case 'help': this.drawHelp(g); break;
      case 'results': this.drawResults(g); break;
      case 'play':
      case 'pause':
        this.drawPlay(g);
        if (this.scene === 'pause') this.drawPause(g);
        break;
      default: break;
    }
  }

  /**
   * Faint drifting grid + parallax dots so the black is not featureless.
   * Menus pass the full viewport; the fight clips it to the playfield.
   */
  drawBackdrop(g, t, rect) {
    const R = rect || PLAY;
    const right = R.x + R.w, bottom = R.y + R.h;
    g.save();
    g.beginPath();
    g.rect(R.x, R.y, R.w, R.h);
    g.clip();

    g.strokeStyle = 'rgba(40,58,102,0.20)';
    g.lineWidth = 1;
    const step = 56;
    const off = (t * 0.35) % step;
    g.beginPath();
    for (let x = R.x - step; x < right + step; x += step) {
      g.moveTo(x + 0.5, R.y); g.lineTo(x + 0.5, bottom);
    }
    for (let y = R.y + off - step; y < bottom + step; y += step) {
      g.moveTo(R.x, y + 0.5); g.lineTo(right, y + 0.5);
    }
    g.stroke();

    for (let i = 0; i < this.starfield.length; i++) {
      const s = this.starfield[i];
      const x = R.x + (s.x % R.w);
      const y = R.y + ((s.y + t * s.sp) % R.h);
      g.fillStyle = `rgba(150,180,255,${s.a})`;
      g.fillRect(x, y, s.r, s.r);
    }
    g.restore();
  }

  /** Full-viewport backdrop for the menu scenes. */
  drawMenuBackdrop(g, t) {
    this.drawBackdrop(g, t, { x: 0, y: 0, w: VIEW.w, h: VIEW.h });
  }

  drawPlay(g) {
    const t = this.frame;
    const sh = this.shake;
    const ox = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;
    const oy = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;

    this.drawBackdrop(g, t);

    g.save();
    g.translate(ox, oy);
    g.save();
    g.beginPath();
    g.rect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    g.clip();

    if (this.boss) this.boss.draw(g);
    for (let i = 0; i < this.lasers.length; i++) this.lasers[i].draw(g);
    this.player.drawShots(g);
    this.bullets.draw(g);
    this.particles.draw(g);
    if (this.player.deathAnim === 0) this.player.draw(g);
    this.drawBombWave(g);

    g.restore();
    g.restore();

    // Playfield frame.
    g.strokeStyle = '#1d2740';
    g.lineWidth = 1;
    g.strokeRect(PLAY.x - 0.5, PLAY.y - 0.5, PLAY.w + 1, PLAY.h + 1);

    if (this.boss) {
      this.drawBossBar(g);
      this.boss.drawNameCard(g);
    }
    this.drawHud(g);

    if (this.flash > 0.02) {
      g.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`;
      g.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
    }

    if (this.state === 'gameover') this.drawGameOver(g);
    if (this.state === 'bossdown') this.drawBossDown(g);
  }

  drawBombWave(g) {
    const b = this.bomb;
    if (!b) return;
    const t = b.t / 60;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = C.cyan;
    g.globalAlpha = 0.5 * (1 - t);
    g.lineWidth = 14 * (1 - t) + 2;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.18 * (1 - t);
    g.fillStyle = C.blue;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, TAU);
    g.fill();
    g.restore();
  }

  drawBossBar(g) {
    const boss = this.boss;
    if (boss.state === 'intro') return;
    const x = PLAY.x + 14, w = PLAY.w - 28, y = PLAY.y + 14;

    // Segmented phase track.
    const segs = boss.totalPhases;
    const segW = w / segs;
    const survival = boss.phase && boss.phase.survival;
    for (let i = 0; i < segs; i++) {
      const done = i < boss.phaseIndex;
      const cur = i === boss.phaseIndex;
      // A survival pattern has no health, so its segment counts the clock down
      // instead -- otherwise it would sit at full forever.
      const frac = cur
        ? (survival
          ? clamp(boss.timer / Math.max(1, boss.phase.time), 0, 1)
          : clamp(boss.hp / boss.hpMax, 0, 1))
        : done ? 0 : 1;
      const sx = x + i * segW;
      g.fillStyle = '#0e1424';
      g.fillRect(sx + 1, y, segW - 2, 7);
      if (frac > 0) {
        g.fillStyle = cur ? (survival ? C.ice : boss.def.color) : '#2a3655';
        g.fillRect(sx + 1, y, (segW - 2) * frac, 7);
      }
      g.strokeStyle = cur ? hexAlpha(boss.def.color, 0.7) : '#1e2740';
      g.lineWidth = 1;
      g.strokeRect(sx + 1.5, y + 0.5, segW - 3, 6);
    }

    g.textBaseline = 'alphabetic';
    text(g, boss.def.name, x, y - 5, { size: 13, weight: 700, color: C.white, track: 2 });
    const ph = boss.phase;
    if (ph && ph.survival) {
      // Survival is the one place a clock still decides anything, and here
      // running it down is the win, so it goes green as it closes.
      const secs = Math.ceil(boss.timer / 60);
      text(g, 'SURVIVE ' + secs.toString().padStart(2, '0'), PLAY.right - 14, y - 5,
        { size: 15, weight: 700, align: 'right', color: secs <= 10 ? C.green : C.ice, track: 1 });
    } else if (ph) {
      // Damage phases have no deadline. The clock counts up, and dims past par
      // so you can see the speed bonus slipping away without being rushed.
      const secs = Math.floor(boss.elapsed / 60);
      const overPar = boss.elapsed > boss.par;
      text(g, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
        PLAY.right - 14, y - 5,
        { size: 15, weight: 700, align: 'right', color: overPar ? '#5b6688' : '#8ea0c8' });
    }
  }

  drawHud(g) {
    const x = SIDEBAR.x, w = SIDEBAR.w;
    const run = this.run;
    g.textBaseline = 'alphabetic';

    text(g, 'BOSS RUSH', x, SIDEBAR.y + 22, { size: 20, weight: 700, color: C.white, track: 3 });
    text(g, this.run && this.run.mode === 'practice' ? 'PRACTICE' : 'FULL RUSH', x, SIDEBAR.y + 40,
      { size: 10, color: C.dust, track: 2 });

    let y = SIDEBAR.y + 72;
    panel(g, x, y, w, 96);
    text(g, 'SCORE', x + 12, y + 20, { size: 10, color: '#63719a', track: 2 });
    text(g, Math.round(run ? run.score : 0).toLocaleString(), x + w - 12, y + 42,
      { size: 24, weight: 700, align: 'right', color: C.white });
    text(g, 'GRAZE', x + 12, y + 66, { size: 10, color: '#63719a', track: 2 });
    text(g, (run ? run.graze : 0).toLocaleString(), x + w - 12, y + 82,
      { size: 17, weight: 700, align: 'right', color: C.amber });

    y += 110;
    panel(g, x, y, w, 76);
    text(g, 'LIVES', x + 12, y + 20, { size: 10, color: '#63719a', track: 2 });
    if (run && run.lives === Infinity) {
      text(g, '∞', x + w - 14, y + 24, { size: 20, weight: 700, align: 'right', color: C.green });
    } else {
      pips(g, x + w - 14 - (this.lifeMode.lives - 1) * 14, y + 15,
        run ? run.lives : 0, this.lifeMode.lives === Infinity ? 3 : this.lifeMode.lives, C.ice, 'tri', 9, 14);
    }
    text(g, 'BOMBS', x + 12, y + 52, { size: 10, color: '#63719a', track: 2 });
    pips(g, x + w - 14 - (this.lifeMode.bombs - 1) * 14, y + 47,
      run ? run.bombs : 0, this.lifeMode.bombs, C.cyan, 'circle', 9, 14);

    y += 90;
    panel(g, x, y, w, 86);
    text(g, 'DIFFICULTY', x + 12, y + 20, { size: 10, color: '#63719a', track: 2 });
    text(g, this.diff.name, x + w - 12, y + 21, { size: 14, weight: 700, align: 'right', color: this.diff.color, track: 1 });
    text(g, 'MODE', x + 12, y + 44, { size: 10, color: '#63719a', track: 2 });
    text(g, this.lifeMode.name, x + w - 12, y + 45, { size: 12, weight: 700, align: 'right', color: C.dust, track: 1 });
    text(g, 'SHIP', x + 12, y + 68, { size: 10, color: '#63719a', track: 2 });
    text(g, this.ship.name, x + w - 12, y + 69, { size: 12, weight: 700, align: 'right', color: this.ship.color, track: 1 });

    // Boss roster with progress ticks.
    y += 100;
    text(g, 'ROSTER', x, y, { size: 10, color: '#63719a', track: 2 });
    y += 12;
    for (let i = 0; i < BOSSES.length; i++) {
      const b = BOSSES[i];
      const active = run && run.index === i && this.scene === 'play';
      const done = run && run.order.indexOf(i) !== -1 && run.order.indexOf(i) < run.slot;
      const yy = y + i * 26;
      g.globalAlpha = active ? 1 : done ? 0.55 : 0.3;
      g.save();
      g.translate(x + 11, yy + 9);
      drawShape(g, b.shape, 7, active ? b.color : null, b.color, 1.4);
      g.restore();
      text(g, b.name, x + 26, yy + 13, { size: 11, weight: active ? 700 : 400, color: active ? C.white : C.dust, track: 1 });
      if (done) text(g, '✓', x + w - 8, yy + 13, { size: 12, align: 'right', color: C.green });
      g.globalAlpha = 1;
    }

    // Live pattern label + engine stats.
    y += BOSSES.length * 26 + 14;
    if (this.boss && this.boss.phase) {
      panel(g, x, y, w, 52);
      text(g, 'CURRENT PATTERN', x + 12, y + 18, { size: 9, color: '#63719a', track: 2 });
      text(g, this.boss.phase.name.toUpperCase(), x + 12, y + 38,
        { size: 13, weight: 700, color: this.boss.def.color, track: 1 });
      y += 66;
    }

    // Make it unmistakable that the bot is driving, not the player.
    if (this.settings.autopilot) {
      panel(g, x, y, w, 30, { stroke: hexAlpha(C.amber, 0.5) });
      const blink = 0.65 + 0.35 * Math.sin(this.frame * 0.1);
      g.globalAlpha = blink;
      text(g, '● AUTOPILOT', x + 12, y + 20, { size: 12, weight: 700, color: C.amber, track: 2 });
      g.globalAlpha = 1;
      y += 40;
    }

    text(g, `BULLETS ${String(this.bullets.count).padStart(4, ' ')}`, x, VIEW.h - 42,
      { size: 10, color: '#4d597d', track: 1 });
    text(g, `${this.fps.toFixed(0)} FPS`, x, VIEW.h - 28, { size: 10, color: '#4d597d', track: 1 });
    text(g, 'ESC PAUSE · M SOUND', x + w, VIEW.h - 28, { size: 10, color: '#3f4a68', align: 'right', track: 1 });
  }

  drawBossDown(g) {
    const a = clamp(this.stateT / 30, 0, 1) * clamp((130 - this.stateT) / 25, 0, 1);
    g.globalAlpha = a;
    text(g, 'PATTERN COMPLETE', PLAY.cx, PLAY.cy - 20,
      { size: 15, align: 'center', color: C.dust, track: 4 });
    text(g, this.boss.def.name + ' DOWN', PLAY.cx, PLAY.cy + 22,
      { size: 38, weight: 700, align: 'center', color: C.white, track: 4, glow: this.boss.def.color, glowSize: 24 });
    g.globalAlpha = 1;
  }

  drawGameOver(g) {
    fadeRect(g, PLAY.x, PLAY.y, PLAY.w, PLAY.h, Math.min(0.78, this.stateT / 50));
    const a = clamp(this.stateT / 30, 0, 1);
    g.globalAlpha = a;
    text(g, 'GAME OVER', PLAY.cx, PLAY.y + 250,
      { size: 44, weight: 700, align: 'center', color: C.red, track: 6, glow: C.red, glowSize: 26 });
    text(g, `${BOSSES[this.run.index].name} · ${this.diff.name} · ${this.lifeMode.name}`,
      PLAY.cx, PLAY.y + 282, { size: 12, align: 'center', color: C.dust, track: 2 });
    text(g, 'SCORE ' + Math.round(this.run.score).toLocaleString(), PLAY.cx, PLAY.y + 312,
      { size: 16, weight: 700, align: 'center', color: C.white, track: 2 });
    if (this.stateT > 40) this.overMenu.draw(g, PLAY.cx - 110, PLAY.y + 384, { width: 220, size: 15, lineHeight: 36 });
    g.globalAlpha = 1;
  }

  drawPause(g) {
    fadeRect(g, 0, 0, VIEW.w, VIEW.h, 0.72);
    text(g, 'PAUSED', PLAY.cx, PLAY.y + 160,
      { size: 34, weight: 700, align: 'center', color: C.white, track: 6 });
    this.pauseMenu.draw(g, PLAY.cx - 190, PLAY.y + 240, { width: 380, size: 15, lineHeight: 34 });
  }

  // --- non-play scenes ------------------------------------------------------
  drawTitle(g) {
    const t = this.sceneT;
    this.drawMenuBackdrop(g, t);
    this.drawTitleOrnament(g, t);

    text(g, 'BULLET HELL', VIEW.w / 2, 250,
      { size: 22, align: 'center', color: C.cyan, track: 14 });
    text(g, 'BOSS RUSH', VIEW.w / 2, 330,
      { size: 78, weight: 700, align: 'center', color: C.white, track: 10, glow: C.blue, glowSize: 30 });
    text(g, 'FIVE BOSSES · TWENTY ALGORITHMIC PATTERNS · FIVE DIFFICULTIES',
      VIEW.w / 2, 372, { size: 12, align: 'center', color: C.dust, track: 3 });

    if ((t >> 5) % 2 === 0) {
      text(g, 'PRESS  Z  OR  ENTER', VIEW.w / 2, 500,
        { size: 18, weight: 700, align: 'center', color: C.amber, track: 6 });
    }
    text(g, 'ARROWS / WASD MOVE · Z FIRE · SHIFT FOCUS · X / SPACE BOMB',
      VIEW.w / 2, 700, { size: 11, align: 'center', color: '#59658a', track: 2 });
  }

  drawTitleOrnament(g, t) {
    // A live sample of the boss shapes orbiting the title.
    g.save();
    g.translate(VIEW.w / 2, 300);
    for (let i = 0; i < BOSSES.length; i++) {
      const b = BOSSES[i];
      const a = t * 0.006 + i * TAU / BOSSES.length;
      const r = 300 + Math.sin(t * 0.01 + i) * 26;
      g.save();
      g.translate(Math.cos(a) * r, Math.sin(a) * r * 0.55);
      g.rotate(t * 0.01 * (i % 2 ? -1 : 1));
      g.globalAlpha = 0.55;
      drawShape(g, b.shape, 18, null, b.color, 1.6);
      g.globalAlpha = 0.2;
      drawShape(g, b.shape, 30, null, b.accent, 1);
      g.restore();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  drawMenu(g) {
    this.drawMenuBackdrop(g, this.sceneT);
    text(g, 'BOSS RUSH', 120, 150, { size: 46, weight: 700, color: C.white, track: 8, glow: C.blue, glowSize: 22 });
    text(g, 'SELECT YOUR TERMS', 124, 178, { size: 11, color: C.dust, track: 5 });
    this.mainMenu.draw(g, 124, 270, { width: 430, size: 17, lineHeight: 40 });
    if (this.logNoteT > 0) {
      this.logNoteT--;
      g.globalAlpha = Math.min(1, this.logNoteT / 40);
      text(g, `LOG ${this.logNote}`, 124, 700,
        { size: 12, color: this.logNote === 'BLOCKED' ? C.red : C.teal, track: 3 });
      g.globalAlpha = 1;
    }

    // Difficulty ladder readout.
    const px = 640, py = 240;
    panel(g, px, py, 264, 250);
    text(g, 'DIFFICULTY LADDER', px + 16, py + 26, { size: 10, color: '#63719a', track: 2 });
    for (let i = 0; i < DIFFICULTIES.length; i++) {
      const d = DIFFICULTIES[i];
      const yy = py + 52 + i * 30;
      const on = i === this.settings.diff;
      g.globalAlpha = on ? 1 : 0.45;
      text(g, d.name, px + 16, yy, { size: 12, weight: on ? 700 : 400, color: d.color, track: 1 });
      // Layer dots show how many optional sub-patterns switch on.
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(px + 140 + k * 13, yy - 4, 3.4, 0, TAU);
        if (k < d.layers) { g.fillStyle = d.color; g.fill(); }
        else { g.strokeStyle = '#333d5a'; g.lineWidth = 1; g.stroke(); }
      }
      text(g, '×' + d.density.toFixed(2), px + 248, yy, { size: 10, align: 'right', color: '#7d8db3' });
      g.globalAlpha = 1;
    }
    text(g, 'DOTS = EXTRA PATTERN LAYERS', px + 16, py + 218, { size: 9, color: '#4d597d', track: 1 });
    text(g, '× = BULLET DENSITY', px + 16, py + 234, { size: 9, color: '#4d597d', track: 1 });

    this.drawShipPanel(g, px, py + 268);

    const rec = getRecord(this.recordKey('rush', 'all'));
    if (rec) {
      text(g, 'BEST RUSH · ' + this.diff.name + ' · ' + this.lifeMode.name,
        124, 640, { size: 10, color: '#63719a', track: 2 });
      text(g, rec.toLocaleString(), 124, 668, { size: 22, weight: 700, color: C.amber });
    }
  }

  /**
   * Armament readout: what the selected ship fires in each stance. The point
   * of the roster is the trade between stances, so both are shown side by
   * side rather than only the one you are holding.
   */
  drawShipPanel(g, px, py) {
    const ship = this.ship;
    panel(g, px, py, 264, 140);
    text(g, 'ARMAMENT', px + 16, py + 24, { size: 10, color: '#63719a', track: 2 });

    g.save();
    g.translate(px + 232, py + 26);
    g.rotate(-Math.PI / 2);
    g.shadowColor = ship.color; g.shadowBlur = 14;
    drawShape(g, ship.shape, 11, '#0b1524', ship.color, 1.6);
    g.shadowBlur = 0;
    g.restore();

    text(g, ship.name, px + 16, py + 48, { size: 17, weight: 700, color: ship.color, track: 3 });

    const stances = [['UNFOCUSED', ship.unfocused], ['FOCUSED', ship.focused]];
    for (let i = 0; i < stances.length; i++) {
      const [name, list] = stances[i];
      const yy = py + 76 + i * 32;
      text(g, name, px + 16, yy, { size: 9, color: '#4d597d', track: 1 });
      let cx = px + 16;
      for (let k = 0; k < list.length; k++) {
        const w = list[k];
        const label = `${w.n}×${w.kind.toUpperCase()}`;
        text(g, label, cx, yy + 16, { size: 10, weight: 700, color: w.color, track: 1 });
        cx += label.length * 7 + 12;
      }
    }
  }

  drawSelect(g) {
    this.drawMenuBackdrop(g, this.sceneT);
    text(g, 'BOSS SELECT', 120, 130, { size: 34, weight: 700, color: C.white, track: 6 });
    text(g, this.diff.name + ' · ' + this.lifeMode.name, 124, 156, { size: 11, color: this.diff.color, track: 3 });
    this.selectMenu.draw(g, 124, 230, { width: 400, size: 16, lineHeight: 38 });

    // Live preview of the highlighted boss.
    const idx = Math.min(this.selectMenu.index, BOSSES.length - 1);
    const b = BOSSES[idx];
    const px = 620, py = 200;
    panel(g, px, py, 290, 380);
    g.save();
    g.translate(px + 145, py + 100);
    const t = this.sceneT;
    for (let i = 0; i < 2; i++) {
      g.save();
      g.rotate(t * 0.012 * (i ? -1 : 1));
      g.globalAlpha = 0.6 - i * 0.25;
      drawShape(g, (b.rings || ['hex'])[i % (b.rings || ['hex']).length], 52 - i * 14, null, b.accent, 2);
      g.restore();
    }
    g.globalAlpha = 1;
    g.shadowColor = b.color; g.shadowBlur = 22;
    drawShape(g, b.shape, 26, b.color, C.white, 1.5);
    g.shadowBlur = 0;
    g.restore();

    text(g, b.name, px + 145, py + 200, { size: 22, weight: 700, align: 'center', color: C.white, track: 3 });
    text(g, b.title.toUpperCase(), px + 145, py + 222, { size: 10, align: 'center', color: b.accent, track: 2 });
    text(g, 'PATTERNS', px + 20, py + 258, { size: 10, color: '#63719a', track: 2 });
    for (let i = 0; i < b.phases.length; i++) {
      const ph = b.phases[i];
      text(g, String(i + 1).padStart(2, '0'), px + 20, py + 282 + i * 20, { size: 11, color: '#4d597d' });
      text(g, ph.name.toUpperCase() + (ph.survival ? '  (SURVIVAL)' : ''),
        px + 48, py + 282 + i * 20, { size: 11, color: C.dust, track: 0.6 });
    }
  }

  drawHelp(g) {
    this.drawMenuBackdrop(g, this.sceneT);
    text(g, 'HOW TO PLAY', 120, 130, { size: 34, weight: 700, color: C.white, track: 6 });

    const rows = [
      ['ARROWS / WASD', 'Move'],
      ['SHIFT (hold)', 'Focus: half speed, tight shot, visible hitbox'],
      ['Z', 'Fire (hold) — or turn AUTOFIRE on and forget it'],
      ['', 'Unfocused mixes straight, spread and homing. Focus is the ship’s specialty.'],
      ['X / SPACE', 'Bomb: clears bullets, damages boss, grants invulnerability'],
      ['ESC / P', 'Pause'],
      ['SHIFT + R', 'Restart the current boss'],
      ['M', 'Cycle sound: ON → OFF → NO SHOTS'],
    ];
    const options = [
      ['SHIP', 'Four loadouts. They differ in what focusing commits you to, not in speed.'],
      ['AUTOFIRE', 'Fire without holding anything. On by default.'],
      ['AUTOPILOT', 'A dodging bot plays for you — the same one the tests use.'],
      ['SHOT OPACITY', 'Dim your own shots so enemy bullets read more clearly.'],
      ['SOUND', 'OFF, NO SHOTS (everything but your own gun), or ON.'],
      ['MUSIC', 'Volume for the tracks in music/. See the README to add your own.'],
    ];
    let y = 210;
    for (const [k, v] of rows) {
      text(g, k, 124, y, { size: 13, weight: 700, color: C.cyan, track: 1 });
      text(g, v, 330, y, { size: 13, color: C.dust });
      y += 30;
    }

    y += 16;
    text(g, 'IN THE MENU', 124, y, { size: 11, color: '#63719a', track: 2 });
    y += 22;
    for (const [k, v] of options) {
      text(g, k, 124, y, { size: 12, weight: 700, color: C.amber, track: 1 });
      text(g, v, 330, y, { size: 12, color: C.dust });
      y += 24;
    }

    y += 18;
    text(g, 'THE HITBOX IS THE RED DOT', 124, y, { size: 14, weight: 700, color: C.white, track: 2 });
    y += 24;
    const notes = [
      'Only the small dot at your centre collides. The hull is decoration.',
      'Passing close to a bullet without dying scores a GRAZE — the main',
      'source of points beyond raw damage.',
      '',
      'Each boss has multiple patterns. Depleting a pattern\'s health bar',
      'clears the screen and advances to the next. There is no time limit:',
      'clearing under the pattern\'s par time is what pays the speed bonus.',
      '',
      'Lives are granted per boss, so every fight starts on equal footing.',
    ];
    for (const n of notes) {
      text(g, n, 124, y, { size: 12, color: '#7d8db3' });
      y += 20;
    }

    text(g, 'PRESS Z OR ESC TO GO BACK', VIEW.w / 2, 700,
      { size: 12, align: 'center', color: C.amber, track: 3 });
  }

  drawResults(g) {
    this.drawMenuBackdrop(g, this.sceneT);
    const run = this.run;
    text(g, run && run.mode === 'rush' ? 'RUSH CLEARED' : 'BOSS CLEARED', VIEW.w / 2, 140,
      { size: 44, weight: 700, align: 'center', color: C.white, track: 8, glow: C.cyan, glowSize: 26 });
    text(g, this.diff.name + ' · ' + this.lifeMode.name, VIEW.w / 2, 174,
      { size: 13, align: 'center', color: this.diff.color, track: 4 });

    if (!run) return;
    const x = VIEW.w / 2 - 300;
    let y = 240;
    panel(g, x, y, 600, 60 + run.results.length * 34);
    text(g, 'BOSS', x + 20, y + 26, { size: 10, color: '#63719a', track: 2 });
    text(g, 'TIME', x + 380, y + 26, { size: 10, color: '#63719a', track: 2, align: 'right' });
    text(g, 'MISSES', x + 460, y + 26, { size: 10, color: '#63719a', track: 2, align: 'right' });
    text(g, 'SCORE', x + 580, y + 26, { size: 10, color: '#63719a', track: 2, align: 'right' });

    for (let i = 0; i < run.results.length; i++) {
      const r = run.results[i];
      const yy = y + 54 + i * 34;
      text(g, r.boss, x + 20, yy, { size: 14, weight: 700, color: r.color, track: 1 });
      text(g, fmtTime(r.frames), x + 380, yy, { size: 13, color: C.dust, align: 'right' });
      text(g, String(r.deaths), x + 460, yy, { size: 13, color: r.deaths ? C.red : C.green, align: 'right' });
      text(g, r.score.toLocaleString(), x + 580, yy, { size: 13, color: C.white, align: 'right' });
    }

    y += 90 + run.results.length * 34;
    text(g, 'TOTAL', x + 20, y, { size: 14, color: '#63719a', track: 3 });
    text(g, Math.round(run.score).toLocaleString(), x + 580, y,
      { size: 30, weight: 700, color: C.amber, align: 'right' });
    text(g, `GRAZE ${run.graze.toLocaleString()}   ·   MISSES ${run.deaths}   ·   BOMBS ${run.bombsUsed}`,
      x + 20, y + 30, { size: 12, color: C.dust, track: 1 });

    // Where the misses actually came from. The per-boss column above says how
    // many; this says which pattern and what kind of bullet, which is the part
    // worth knowing.
    const worst = this.log.summary().slice(0, 3);
    if (worst.length) {
      y += 62;
      text(g, 'WHERE YOU DIED', x + 20, y, { size: 10, color: '#63719a', track: 2 });
      for (let i = 0; i < worst.length; i++) {
        const r = worst[i];
        const top = Object.entries(r.traits).sort((a, b) => b[1] - a[1])[0];
        const how = r.causes.laser >= r.n ? 'beams'
          : top ? `${top[0]} bullets` : 'bullets';
        text(g, `${r.phase}`, x + 20, y + 22 + i * 20,
          { size: 12, color: C.dust, track: 0.5 });
        text(g, `${r.diff.toUpperCase()}`, x + 300, y + 22 + i * 20,
          { size: 11, color: '#63719a', align: 'right' });
        text(g, how, x + 440, y + 22 + i * 20, { size: 11, color: '#7d8db3', align: 'right' });
        text(g, `x${r.n}`, x + 500, y + 22 + i * 20,
          { size: 12, weight: 700, color: C.red, align: 'right' });
      }
    }

    text(g, 'PRESS Z TO CONTINUE', VIEW.w / 2, 700,
      { size: 13, align: 'center', color: C.amber, track: 4 });
  }

  // Test/debug entry point: jump straight into a fight.
  debugStart(bossIndex = 0, diffIndex = 2, lifeIndex = 0) {
    this.settings.diff = clamp(diffIndex, 0, DIFFICULTIES.length - 1);
    this.settings.life = clamp(lifeIndex, 0, LIFE_MODES.length - 1);
    this.startRun('practice', clamp(bossIndex, 0, BOSSES.length - 1));
  }
}

function fmtTime(frames) {
  const s = frames / 60;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, '0')}`;
}

function makeStarfield() {
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * PLAY.w,
      y: Math.random() * PLAY.h,
      sp: 0.12 + Math.random() * 0.5,
      r: Math.random() < 0.8 ? 1 : 2,
      a: 0.08 + Math.random() * 0.22,
    });
  }
  return stars;
}
