// Tiny WebAudio synth. No samples, no assets -- just oscillators and noise
// bursts so the build stays a handful of text files.

/** Sound levels, in the order the menu cycles them. */
export const SOUND_OFF = 0;
export const SOUND_NO_SHOTS = 1;
export const SOUND_ON = 2;
export const SOUND_LEVELS = [
  { name: 'OFF', blurb: 'Silence.' },
  { name: 'NO SHOTS', blurb: 'Everything except your own gun. Autofire is 20 shots a second.' },
  { name: 'ON', blurb: 'Everything.' },
];

// What your own fire sounds like: the shot going out and the shot landing.
// Both repeat at the fire rate, which is what makes them the pair worth
// silencing on their own -- muting one while the other machine-guns away
// would not be worth a setting.
const SHOT_SOUNDS = new Set(['shoot', 'hit']);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.level = SOUND_ON;
    this.lastAt = Object.create(null);
  }

  /** True if a cue at this name would be audible right now. */
  audible(name) {
    if (this.level === SOUND_OFF) return false;
    if (this.level === SOUND_NO_SHOTS && SHOT_SOUNDS.has(name)) return false;
    return true;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = 0) {
    const ctx = this.ensure();
    if (!ctx || this.level === SOUND_OFF) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, cutoff = 1800, sweepTo = 0) {
    const ctx = this.ensure();
    if (!ctx || this.level === SOUND_OFF) return;
    const t = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  /** Rate-limited so a 20-shots-per-second stream does not turn into mush. */
  play(name, minGapMs = 0) {
    if (!this.audible(name)) return;
    const now = performance.now();
    if (minGapMs && this.lastAt[name] && now - this.lastAt[name] < minGapMs) return;
    this.lastAt[name] = now;

    switch (name) {
      case 'shoot':   this.tone(920, 0.05, 'square', 0.035, 1400); break;
      case 'shot':    this.tone(280, 0.09, 'triangle', 0.08, 180); break;
      case 'burst':   this.tone(180, 0.22, 'sawtooth', 0.09, 90); break;
      case 'charge':  this.tone(120, 0.42, 'sawtooth', 0.08, 460); break;
      case 'laser':   this.tone(70, 0.5, 'sawtooth', 0.1, 240); break;
      case 'hit':     this.tone(1500, 0.03, 'square', 0.02, 900); break;
      case 'graze':   this.tone(2100, 0.05, 'sine', 0.05, 2600); break;
      case 'bomb':    this.noise(0.7, 0.34, 4200, 120); this.tone(90, 0.7, 'sawtooth', 0.16, 40); break;
      case 'death':   this.noise(0.55, 0.3, 2400, 90); this.tone(220, 0.5, 'square', 0.12, 40); break;
      case 'phase':   this.tone(330, 0.3, 'square', 0.11, 660); this.noise(0.35, 0.16, 3000, 300); break;
      case 'defeat':  this.noise(1.1, 0.32, 5000, 80); this.tone(160, 1.0, 'sawtooth', 0.14, 35); break;
      case 'move':    this.tone(660, 0.04, 'square', 0.04, 760); break;
      case 'select':  this.tone(520, 0.09, 'square', 0.07, 1040); break;
      case 'back':    this.tone(420, 0.09, 'square', 0.06, 220); break;
      case 'extend':  this.tone(660, 0.12, 'triangle', 0.1, 1320); break;
      default: break;
    }
  }
}
