#!/usr/bin/env python3
"""Bundle the ES modules into one self-contained dist/index.html.

ES modules cannot be loaded over file://, so the dev tree needs a server.
This produces a single HTML file that runs by double-clicking: the modules
are concatenated in dependency order inside one IIFE, with the `import` lines
dropped and the `export ` keywords stripped.

That is only sound because the source obeys one rule, which the build verifies
rather than assumes: no top-level name is declared in two different modules.
The bundle is also re-checked for surviving `import`/`export` keywords before
it is written, so a stripping miss fails the build instead of shipping an HTML
file that dies on load.

    python3 build.py
"""

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Dependency order. Modules that are read at load time (palettes, boss tables)
# must precede whoever reads them.
MODULES = [
    "src/mathx.js",
    "src/rng.js",
    "src/config.js",
    "src/sprites.js",
    "src/audio.js",
    "src/input.js",
    "src/storage.js",
    "src/music.js",
    "src/particles.js",
    "src/bullets.js",
    "src/lasers.js",
    "src/ships.js",
    "src/player.js",
    "src/autopilot.js",
    "src/attack.js",
    "src/patterns.js",
    "src/bosses/boss1.js",
    "src/bosses/boss2.js",
    "src/bosses/boss3.js",
    "src/bosses/boss4.js",
    "src/bosses/boss5.js",
    "src/bosses/index.js",
    "src/boss.js",
    "src/ui.js",
    "src/game.js",
    "src/main.js",
]

IMPORT_START_RE = re.compile(r"^\s*import[\s{]")
EXPORT_RE = re.compile(r"^export\s+(?=(?:const|let|var|function|class|async))")
# Top-level declarations, used for the collision check.
DECL_RE = re.compile(
    r"^(?:export\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)"
)
LEFTOVER_RE = re.compile(r"^\s*(?:import[\s{(]|export\s)", re.MULTILINE)

# Kept in step with the same list in tools/music.mjs.
AUDIO_SUFFIXES = {".mp3", ".ogg", ".m4a", ".wav", ".flac", ".opus", ".webm"}


def collect(path: Path):
    """Return (stripped source, set of top-level names)."""
    lines = path.read_text().splitlines()
    out, names = [], set()
    in_import = False
    for line in lines:
        # Imports may span several lines, so consume until the `from '...'`.
        if in_import:
            if "from" in line and line.rstrip().endswith(";"):
                in_import = False
            continue
        if IMPORT_START_RE.match(line):
            if not ("from" in line and line.rstrip().endswith(";")):
                in_import = True
            continue

        m = DECL_RE.match(line)
        if m:
            names.add(m.group(1))
        out.append(EXPORT_RE.sub("", line))

    if in_import:
        sys.exit(f"{path}: unterminated import statement")
    return "\n".join(out).strip(), names


def main():
    missing = [m for m in MODULES if not (ROOT / m).exists()]
    if missing:
        sys.exit(f"missing modules: {', '.join(missing)}")

    on_disk = sorted(
        str(p.relative_to(ROOT)) for p in (ROOT / "src").rglob("*.js")
    )
    unlisted = set(on_disk) - set(MODULES)
    if unlisted:
        sys.exit(
            "these modules exist but are not in MODULES (add them in dependency "
            f"order): {', '.join(sorted(unlisted))}"
        )

    chunks, seen = [], {}
    for m in MODULES:
        src, names = collect(ROOT / m)
        for n in names:
            if n in seen:
                sys.exit(
                    f"name collision: '{n}' is declared in both {seen[n]} and {m}. "
                    "Top-level names must be unique for the single-file bundle."
                )
            seen[n] = m
        chunks.append(f"// ==== {m} " + "=" * max(0, 62 - len(m)) + f"\n{src}")

    bundle = "\n\n".join(chunks)

    # A surviving module keyword would only show up as a blank page at runtime,
    # so fail here instead.
    leftovers = [
        bundle[m.start():bundle.find("\n", m.start())].strip()
        for m in LEFTOVER_RE.finditer(bundle)
    ]
    if leftovers:
        sys.exit(
            "module syntax survived bundling:\n  "
            + "\n  ".join(leftovers[:10])
        )

    html = (ROOT / "index.html").read_text()
    css = (ROOT / "styles.css").read_text()

    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f"<style>\n{css}</style>",
    )
    # Inline the music manifest and copy the tracks next to the bundle, so the
    # single file still finds them without a fetch (which file:// blocks).
    manifest = ROOT / "music" / "tracks.json"
    inline = ""
    if manifest.exists():
        data = json.loads(manifest.read_text())
        inline = (
            "<script>window.__BOSSRUSH_MUSIC = "
            + json.dumps(data, separators=(",", ":"))
            + ";</script>\n"
        )

    html = html.replace(
        '<script type="module" src="src/main.js"></script>',
        inline + '<script type="module" src="src/main.js"></script>',
    )

    html = html.replace(
        '<script type="module" src="src/main.js"></script>',
        "<script>\n(function () {\n'use strict';\n\n" + bundle + "\n\n})();\n</script>",
    )

    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    out = dist / "index.html"
    out.write_text(html)

    tracks = 0
    src_music = ROOT / "music"
    if src_music.exists():
        dst_music = dist / "music"
        dst_music.mkdir(exist_ok=True)
        for f in src_music.iterdir():
            if f.is_file() and f.suffix.lower() in AUDIO_SUFFIXES:
                shutil.copy2(f, dst_music / f.name)
                tracks += 1
    kb = out.stat().st_size / 1024
    print(f"wrote {out.relative_to(ROOT)} ({kb:.0f} KB, {len(MODULES)} modules)")
    if tracks:
        print(f"copied {tracks} music file(s) to dist/music/")
    print("open it directly in a browser -- no server needed")


if __name__ == "__main__":
    main()
