// localStorage wrapper. Every read is defensive: private-mode browsers and
// cleared site data must not break the game.

const SETTINGS_KEY = 'bosrush.settings.v1';
const RECORDS_KEY = 'bosrush.records.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignore */ }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * `sound` used to be a boolean and is now a level (0 off, 1 no shots, 2 on).
 * Saved settings from before the change still say true/false, so map them
 * rather than dropping the player back to the default.
 */
function soundLevel(v) {
  if (v === true) return 2;
  if (v === false) return 0;
  return Number.isInteger(v) && v >= 0 && v <= 2 ? v : 2;
}

export function loadSettings() {
  const s = read(SETTINGS_KEY, {});
  const alpha = typeof s.shotAlpha === 'number' ? s.shotAlpha : 0.85;
  const music = typeof s.music === 'number' ? s.music : 0.6;
  return {
    diff: Number.isInteger(s.diff) ? s.diff : 2,
    life: Number.isInteger(s.life) ? s.life : 1,
    // Tracer (index 1) is the default. Upper bound is left to shipAt(), so this
    // module stays free of any dependency on the roster -- which is also why
    // the default is a bare index rather than a lookup by id.
    ship: Number.isInteger(s.ship) && s.ship >= 0 ? s.ship : 1,
    sound: soundLevel(s.sound),
    music: clamp01(music),
    // Autofire on by default: there is never a reason to withhold fire here,
    // and holding Z still works for anyone who prefers it.
    autofire: s.autofire !== false,
    autopilot: s.autopilot === true,
    shotAlpha: clamp01(alpha),
  };
}

export function saveSettings(s) { write(SETTINGS_KEY, s); }

export function loadRecords() { return read(RECORDS_KEY, {}); }

/** Records are keyed by `<mode>:<bossId|rush>:<difficulty>:<lifeMode>`. */
export function submitRecord(key, score) {
  const all = loadRecords();
  const prev = all[key] || 0;
  if (score > prev) {
    all[key] = Math.round(score);
    write(RECORDS_KEY, all);
    return true;
  }
  return false;
}

export function getRecord(key) { return loadRecords()[key] || 0; }
