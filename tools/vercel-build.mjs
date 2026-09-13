// Assemble public/ -- the exact tree Vercel serves.
//
//   node tools/vercel-build.mjs
//
// The game needs no compilation: it is plain ES modules, and a static host is
// already the server they require. So this only copies, and the point of it is
// to make the deployed file set explicit and checkable rather than "the
// repository, minus whatever .vercelignore happens to exclude".
//
// Node only, no Python: the build image is guaranteed to have one and not
// necessarily the other.

import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scan } from './music.mjs';

const OUT = 'public';

// Everything the page actually loads, and nothing else.
const FILES = ['index.html', 'styles.css'];
const DIRS = ['src', 'music'];
// music/ carries documentation that has no business on a web server.
const SKIP = new Set(['README.md']);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copied = 0;
const size = (p) => statSync(p).size;
let bytes = 0;

for (const f of FILES) {
  if (!existsSync(f)) throw new Error(`missing ${f} -- the deploy would be broken`);
  cpSync(f, join(OUT, f));
  copied++; bytes += size(f);
}

for (const d of DIRS) {
  if (!existsSync(d)) continue;
  cpSync(d, join(OUT, d), {
    recursive: true,
    filter: (src) => !SKIP.has(src.split('/').pop()),
  });
}

// Generated rather than copied: the checked-in manifest goes stale the moment
// a track is added without running `npm run music` -- which is exactly what
// happens when files are uploaded through the GitHub web UI. Scanning here
// means dropping an mp3 into music/ and pushing is the whole story.
if (existsSync('music')) {
  const manifest = scan('music');
  mkdirSync(join(OUT, 'music'), { recursive: true });
  writeFileSync(join(OUT, 'music', 'tracks.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${OUT}/music/tracks.json: ${manifest.tracks.length} track(s)`);
}

const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else { copied++; bytes += size(p); }
  }
};
for (const d of DIRS) if (existsSync(join(OUT, d))) walk(join(OUT, d));

// A deploy that silently omits the entry point is worse than a failed one.
if (!existsSync(join(OUT, 'index.html'))) throw new Error('public/index.html missing');
if (!existsSync(join(OUT, 'src', 'main.js'))) throw new Error('public/src/main.js missing');

console.log(`${OUT}/: ${copied} files, ${(bytes / 1024).toFixed(0)} KB`);
