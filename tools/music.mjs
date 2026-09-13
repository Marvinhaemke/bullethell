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
import { pathToFileURL } from 'node:url';

// Every format a browser might be handed. mp3 is the one that plays everywhere.
export const AUDIO = new Set(['.mp3', '.ogg', '.m4a', '.wav', '.flac', '.opus', '.webm']);

/** "03 - Gear Release.mp3" -> "Gear Release". A guess, and editable. */
export function titleFrom(file) {
  return basename(file, extname(file))
    .replace(/^[\s\-_.\d]+/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || basename(file, extname(file));
}

/**
 * Merge the files on disk with any hand-added metadata already recorded.
 * Mirrors musicscan.py, which serve.py and build.py use; keep them in step.
 */
export function scan(dir = 'music') {
  if (!existsSync(dir)) return { tracks: [], files: [], known: new Map() };

  const files = readdirSync(dir)
    .filter((f) => AUDIO.has(extname(f).toLowerCase()))
    .sort();

  let prev = { tracks: [] };
  const manifest = join(dir, 'tracks.json');
  if (existsSync(manifest)) {
    try {
      prev = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!Array.isArray(prev.tracks)) prev.tracks = [];
    } catch (e) {
      // A hand-edit that broke the JSON should not silently drop the pins.
      throw new Error(`${manifest} is not valid JSON (${e.message})`);
    }
  }
  const known = new Map(prev.tracks.map((t) => [t.file, t]));
  return {
    tracks: files.map((file) => known.get(file) || { file, title: titleFrom(file) }),
    files,
    known,
  };
}

// --- CLI ------------------------------------------------------------------
// Guarded so importing scan() does not write anything: vercel-build.mjs pulls
// this in. Writing the file is for recording `for` pins, not a required step --
// serve.py, build.py and vercel-build.mjs all scan on their own.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const DIR = 'music';
  const MANIFEST = join(DIR, 'tracks.json');

  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

  let scanned;
  try {
    scanned = scan(DIR);
  } catch (e) {
    console.error(`${e.message}; refusing to overwrite it.`);
    process.exit(1);
  }
  const { tracks, files, known } = scanned;
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
}
