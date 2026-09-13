// Global constants: layout, palette, difficulty tables, life modes.

export const VIEW = { w: 1024, h: 768 };

// The playfield occupies the left column; the HUD sidebar fills the rest.
export const PLAY = {
  x: 20, y: 20, w: 672, h: 728,
  right: 692, bottom: 748,
  cx: 356, cy: 384,
};

export const SIDEBAR = { x: 706, y: 20, w: 298, h: 728 };

// Neon-on-black palette. Bullets use these directly.
export const C = {
  cyan: '#3fe0ff',
  ice: '#cfefff',
  blue: '#5b7cff',
  violet: '#a978ff',
  magenta: '#ff4fd0',
  rose: '#ff5f7e',
  red: '#ff4b3e',
  orange: '#ff9330',
  amber: '#ffd23f',
  lime: '#a6ff4d',
  green: '#3dffa0',
  teal: '#2ff0d0',
  white: '#ffffff',
  dust: '#8d9ac0',
  dim: '#3b445e',
};

export const MAX_BULLETS = 4200;
export const GRAZE_RADIUS = 15;

/**
 * Five difficulty modes. Every knob is consumed by the pattern scripts:
 *   speed    - bullet velocity multiplier
 *   density  - bullet-count multiplier (ring sizes, fan widths, stream counts)
 *   rate     - wait-time multiplier between volleys (lower = faster)
 *   jitter   - aim inaccuracy in the boss's favour... reversed: higher = sloppier
 *   layers   - how many *optional sub-patterns* switch on (0..4). This is what
 *              makes higher difficulties structurally different, not just faster.
 *   bossHp   - phase HP multiplier
 */
export const DIFFICULTIES = [
  { key: 'novice',  name: 'NOVICE',  speed: 0.72, density: 0.55, rate: 1.50, jitter: 1.00, layers: 0, bossHp: 0.72, color: '#6fe3a0', blurb: 'Sparse, slow, forgiving aim.' },
  { key: 'easy',    name: 'EASY',    speed: 0.86, density: 0.76, rate: 1.22, jitter: 0.62, layers: 1, bossHp: 0.86, color: '#7fd4ff', blurb: 'One extra layer per pattern.' },
  { key: 'normal',  name: 'NORMAL',  speed: 1.00, density: 1.00, rate: 1.00, jitter: 0.34, layers: 2, bossHp: 1.00, color: '#ffd23f', blurb: 'The patterns as designed.' },
  { key: 'hard',    name: 'HARD',    speed: 1.14, density: 1.32, rate: 0.84, jitter: 0.14, layers: 3, bossHp: 1.16, color: '#ff9330', blurb: 'Denser weaves, leading aim.' },
  { key: 'lunatic', name: 'LUNATIC', speed: 1.30, density: 1.70, rate: 0.70, jitter: 0.00, layers: 4, bossHp: 1.32, color: '#ff4b3e', blurb: 'Every layer live. Perfect aim.' },
];

/** Lives are granted per boss, so each fight starts from the same footing. */
export const LIFE_MODES = [
  { key: 'infinite', name: 'INFINITE', lives: Infinity, bombs: 3, blurb: 'Death costs score, never the run.' },
  { key: 'three',    name: '3 LIVES',  lives: 3,        bombs: 2, blurb: 'Three misses per boss.' },
  { key: 'one',      name: '1 LIFE',   lives: 1,        bombs: 1, blurb: 'One miss ends the boss.' },
];

export const SCORE = {
  damage: 0.55,       // per point of damage dealt
  graze: 14,
  bulletCleared: 8,
  phaseClear: 25000,
  phaseNoMiss: 40000,
  bossClear: 120000,
  timeBonus: 900,     // per second of remaining phase timer
  death: -60000,
  bomb: -12000,
};
