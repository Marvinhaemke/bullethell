// Rebuild music/tracks.json from whatever is sitting in music/.
//
//   npm run music
//
// A browser cannot list a directory, so the game needs a manifest. This writes
// one from the files on disk, which is the whole "just drop mp3s in" story:
// copy files into music/, run this, play.
//
// It MERGES rather than overwrites. Anything you hand-added to an entry --
// most usefully `for`, which pins a track to a scene -- survives a rebuild.
// Only new files are appended and vanished files removed.

import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const DIR = 'music';
const MANIFEST = join(DIR, 'tracks.json');
// Every format a browser might be handed. mp3 is the one that plays everywhere.
const AUDIO = new Set(['.mp3', '.ogg', '.m4a', '.wav', '.flac', '.opus', '.webm']);

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const files = readdirSync(DIR)
  .filter((f) => AUDIO.has(extname(f).toLowerCase()))
  .sort();

let prev = { tracks: [] };
if (existsSync(MANIFEST)) {
  try {
    prev = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    if (!Array.isArray(prev.tracks)) prev.tracks = [];
  } catch (e) {
    console.error(`${MANIFEST} is not valid JSON (${e.message}); refusing to overwrite it.`);
    process.exit(1);
  }
}
const known = new Map(prev.tracks.map((t) => [t.file, t]));

/** "03 - Gear Release.mp3" -> "Gear Release". A guess, and editable. */
function titleFrom(file) {
  return basename(file, extname(file))
    .replace(/^[\s\-_.\d]+/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || basename(file, extname(file));
}

const tracks = files.map((file) => known.get(file) || { file, title: titleFrom(file) });
const added = files.filter((f) => !known.has(f));
const dropped = [...known.keys()].filter((f) => !files.includes(f));

writeFileSync(MANIFEST, JSON.stringify({ tracks }, null, 2) + '\n');

console.log(`${MANIFEST}: ${tracks.length} track(s)`);
for (const f of added) console.log(`  + ${f}`);
for (const f of dropped) console.log(`  - ${f} (file is gone)`);
if (!added.length && !dropped.length) console.log('  (no change)');

if (tracks.length) {
  const pinned = tracks.filter((t) => t.for).length;
  console.log(`\n${pinned} of ${tracks.length} pinned to a scene with "for".`);
  console.log('Unpinned tracks rotate as a playlist. Add "for": "menu" | "boss1".."boss5" |');
  console.log('"results" to an entry to pin it. Values are matched in that order, and a');
  console.log('scene with nothing pinned to it falls back to the rotation.');
}
