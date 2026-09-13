// Music: streams whatever mp3s are sitting in music/.
//
// The game ships with none, and that is the normal state -- everything here
// no-ops quietly when the manifest is missing or empty, so an empty music/
// directory is not an error, it is silence.
//
// Why a manifest instead of reading the directory: a browser cannot list one.
// `npm run music` writes music/tracks.json from the files on disk, and the
// single-file build inlines it (see build.py), so the bundle needs no fetch.
//
// Playback uses an <audio> element rather than WebAudio buffers. A decoded
// three-minute track is ~30MB of Float32 in memory and has to download in full
// before a note plays; an element streams it and starts immediately. The cost
// is that it lives outside the Sfx context, so it carries its own volume.

const FADE_MS = 700;
const FADE_STEP_MS = 40;

/** Scene cues, in the order a track's `for` field is matched against. */
export const CUES = ['menu', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5', 'results'];

export class Music {
  constructor() {
    this.tracks = [];
    this.el = null;
    this.volume = 0.6;
    this.cue = null;
    this.index = 0;        // rotation cursor for unpinned tracks
    this.current = null;
    this.fadeTimer = null;
    this.unlocked = false;
    this.failed = false;
  }

  get available() { return this.tracks.length > 0; }

  /**
   * Take the manifest. Accepts the parsed object so the bundled build can hand
   * over an inlined copy and the dev tree can hand over a fetched one.
   */
  accept(manifest) {
    const list = manifest && Array.isArray(manifest.tracks) ? manifest.tracks : [];
    this.tracks = list.filter((t) => t && typeof t.file === 'string');
  }

  /** Fetch music/tracks.json. A missing file is not an error -- it is silence. */
  async load(url = 'music/tracks.json') {
    if (this.available) return;             // already inlined by the build
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return;
      this.accept(await res.json());
    } catch (_) {
      // Offline, file://, or no manifest. Silence is the right outcome.
    }
    if (this.cue) this.play(this.cue);      // a cue arrived before the manifest
  }

  /**
   * Pick a track for a cue: the first one pinned to it with `for`, else the
   * next unpinned track in rotation, so dropping in a pile of unlabelled files
   * gives a playlist without any configuration at all.
   */
  pick(cue) {
    const pinned = this.tracks.filter((t) => t.for === cue);
    if (pinned.length) return pinned[this.index % pinned.length];
    const free = this.tracks.filter((t) => !t.for);
    const pool = free.length ? free : this.tracks;
    if (!pool.length) return null;
    return pool[this.index % pool.length];
  }

  /** Switch to the track for this cue. Repeating the current cue is a no-op. */
  play(cue) {
    if (this.cue === cue && this.current) return;
    this.cue = cue;
    if (!this.available) return;

    const track = this.pick(cue);
    if (!track) return;
    if (this.current && this.current.file === track.file) return;
    this.index++;
    this.start(track);
  }

  start(track) {
    this.stopNow();
    this.current = track;
    // Filenames come from whatever the player dropped in the folder, so spaces
    // and punctuation are the normal case, not the exception.
    const el = new Audio(`music/${encodeURIComponent(track.file)}`);
    el.loop = track.loop !== false;
    el.volume = 0;
    // A track that will not decode should not keep retrying every scene change.
    el.addEventListener('error', () => { this.failed = true; });
    this.el = el;
    this.fadeTo(this.volume);
    if (this.unlocked) this.resume();
  }

  /** Browsers refuse audio before a gesture; main.js calls this on the first one. */
  resume() {
    this.unlocked = true;
    if (!this.el) return;
    const p = this.el.play();
    // Chrome rejects the promise if the gesture has not landed yet. Not fatal:
    // the next scene change tries again.
    if (p && p.catch) p.catch(() => {});
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.el) this.fadeTo(this.volume);
    if (this.volume === 0) this.stopNow();
    else if (this.unlocked && !this.el && this.cue) { const c = this.cue; this.cue = null; this.play(c); }
  }

  fadeTo(target) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const el = this.el;
    if (!el) return;
    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    const from = el.volume;
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      const v = from + (target - from) * (i / steps);
      try { el.volume = Math.max(0, Math.min(1, v)); } catch (_) { /* detached */ }
      if (i >= steps) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
    }, FADE_STEP_MS);
  }

  stopNow() {
    if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
    if (this.el) { try { this.el.pause(); } catch (_) { /* ignore */ } }
    this.el = null;
    this.current = null;
  }

  stop() {
    this.cue = null;
    this.stopNow();
  }
}
