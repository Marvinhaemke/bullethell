// Ship roster.
//
// A ship is two lists of weapon components -- one for each stance -- so the
// loadouts stay data rather than branches in the firing code.
//
// Three kinds of component:
//   straight  fixed forward lanes, no steering. All the damage, none of the
//             forgiveness: it only pays while you are under the boss.
//   spread    a fan, no steering. Trades peak damage for not having to be
//             exactly anywhere.
//   homing    steers onto the boss. Least damage per shot, but it lands while
//             your attention is entirely on the screen.
//
// Every ship's *unfocused* loadout mixes all three, because unfocused is the
// stance you dodge in and it should always do something. What separates the
// ships is what focusing commits you to.
//
// Movement speed is deliberately identical across the roster: the ships differ
// in what they shoot, not how they dodge, which also keeps the autopilot's
// planning valid for all of them.

import { C } from './config.js';

/**
 * @typedef {object} Weapon
 * @property {'straight'|'spread'|'homing'} kind
 * @property {number} n       shots per volley
 * @property {number} [lane]  total lateral width, for straight lanes
 * @property {number} [spread] total angular width, for fans and homing
 * @property {number} dmg     damage per shot
 * @property {number} speed   pixels per frame
 * @property {number} [turn]  steering rate, homing only
 */

const straight = (o) => ({ kind: 'straight', speed: 19, r: 3.6, len: 17, color: C.cyan, lane: 0, ...o });
const spread = (o) => ({ kind: 'spread', speed: 16.5, r: 4, len: 12, color: C.blue, spread: 0.4, ...o });
const homing = (o) => ({ kind: 'homing', speed: 16.5, r: 4, len: 12, color: C.teal, spread: 0.5, turn: 0.55, ...o });

export const SHIPS = [
  {
    id: 'vector',
    name: 'VECTOR',
    blurb: 'Balanced. A little of everything, good everywhere, best nowhere.',
    color: C.cyan,
    shape: 'tri',
    unfocused: [
      straight({ n: 1, dmg: 5.0, color: C.ice }),
      spread({ n: 2, spread: 0.34, dmg: 4.3 }),
      homing({ n: 2, spread: 0.5, dmg: 4.3 }),
    ],
    focused: [
      straight({ n: 2, lane: 14, dmg: 23 }),
    ],
  },
  {
    id: 'tracer',
    name: 'TRACER',
    blurb: 'Focus fires seekers. Less damage, but it lands wherever you are.',
    color: C.green,
    shape: 'diamond',
    unfocused: [
      homing({ n: 3, spread: 0.8, dmg: 3.4 }),
      spread({ n: 2, spread: 0.38, dmg: 2.9 }),
    ],
    focused: [
      homing({ n: 3, spread: 0.7, dmg: 8.0, speed: 15, turn: 0.7, color: C.green, r: 4.6, len: 15 }),
    ],
  },
  {
    id: 'bloom',
    name: 'BLOOM',
    blurb: 'Focus fires a wide fan. Forgiving aim, punishing at close range.',
    color: C.violet,
    shape: 'penta',
    unfocused: [
      spread({ n: 4, spread: 0.55, dmg: 7.2, color: C.violet }),
      homing({ n: 1, spread: 0, dmg: 6.9 }),
    ],
    focused: [
      spread({ n: 5, spread: 0.46, dmg: 16, speed: 18, color: C.violet, r: 4.4, len: 15 }),
    ],
  },
  {
    id: 'lance',
    name: 'LANCE',
    blurb: 'Focus fires one heavy bolt. Highest damage, no margin for error.',
    color: C.amber,
    shape: 'kunai',
    unfocused: [
      straight({ n: 2, lane: 16, dmg: 6.9, color: C.amber }),
      spread({ n: 1, spread: 0, dmg: 5.1 }),
      homing({ n: 1, spread: 0, dmg: 5.1 }),
    ],
    focused: [
      straight({ n: 1, dmg: 62, speed: 21, r: 5.4, len: 26, color: C.amber }),
    ],
  },
];

export function shipAt(index) {
  return SHIPS[Math.min(SHIPS.length - 1, Math.max(0, index | 0))];
}
