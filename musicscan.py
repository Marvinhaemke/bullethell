#!/usr/bin/env python3
"""Build the music manifest from whatever is sitting in music/.

A browser cannot list a directory, so the game needs a manifest. Requiring a
command to write it made "just drop mp3s in" false: files uploaded through the
GitHub web UI, or by anyone without a checkout, produced a stale manifest and
silence. So serve.py and build.py generate it instead, and the checked-in
music/tracks.json is only where hand-written `for` pins live.

The same logic lives in tools/music.mjs for the Node side (vercel-build.mjs and
`npm run music`). Two small implementations beats making the dev server depend
on Node, but they must stay in step -- see the shared rules below.
"""

import json
import re
from pathlib import Path

# Every format a browser might be handed. mp3 is the one that plays everywhere.
AUDIO_SUFFIXES = {".mp3", ".ogg", ".m4a", ".wav", ".flac", ".opus", ".webm"}

_LEADING = re.compile(r"^[\s\-_.\d]+")
_SEPS = re.compile(r"[_-]+")


def title_from(name: str) -> str:
    """'03 - Gear Release.mp3' -> 'Gear Release'. A guess, and editable."""
    stem = Path(name).stem
    out = _SEPS.sub(" ", _LEADING.sub("", stem)).strip()
    return out or stem


def scan(music_dir: Path) -> dict:
    """Merge the files on disk with any hand-added metadata already recorded.

    Anything a person wrote into an entry -- most usefully `for`, which pins a
    track to a scene -- survives. Only new files are added and vanished ones
    dropped.
    """
    if not music_dir.is_dir():
        return {"tracks": []}

    files = sorted(
        p.name for p in music_dir.iterdir()
        if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES
    )

    known = {}
    manifest = music_dir / "tracks.json"
    if manifest.exists():
        try:
            prev = json.loads(manifest.read_text())
            for t in prev.get("tracks", []):
                if isinstance(t, dict) and isinstance(t.get("file"), str):
                    known[t["file"]] = t
        except (ValueError, OSError):
            # A hand-edit that broke the JSON should not take the music down.
            known = {}

    return {"tracks": [known.get(f) or {"file": f, "title": title_from(f)} for f in files]}
