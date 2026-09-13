# music/

Drop audio files in here. That is the whole step — nothing to run.

A browser cannot list a directory, so the game reads a manifest, `tracks.json`.
It is **generated**, not maintained by hand: `serve.py` builds it per request,
and `build.py` and the Vercel build write it at build time. Adding a track
through the GitHub web UI works exactly as well as adding one locally.

`npm run music` writes the file to disk. You only need it if you want to pin
tracks to scenes, below, since that is where the pins are stored.

`.mp3` plays everywhere; `.ogg`, `.m4a`, `.opus`, `.wav` and `.flac` are also
picked up, with browser support varying.

## Pinning a track to a scene

By default every track joins one rotation, advancing on each scene change. To
pin one, run `npm run music` to write the file, then add a `for` field to the
entry — every generator preserves anything you add:

```json
{
  "tracks": [
    { "file": "opening.mp3", "title": "Opening", "for": "menu" },
    { "file": "sentinel.mp3", "title": "Sentinel", "for": "boss1" },
    { "file": "drift.mp3", "title": "Drift" }
  ]
}
```

Valid `for` values: `menu`, `boss1` … `boss5`, `results`. A scene with nothing
pinned to it falls back to the rotation, so pinning some and not others works
fine. Add `"loop": false` to an entry to play it once instead of looping.

## Notes

- No files here is the normal, shipping state. The game is silent and the MUSIC
  menu option says so.
- Tracks stream from an `<audio>` element, so a long file starts immediately
  rather than downloading in full.
- `python3 build.py` inlines this manifest into `dist/index.html` and copies the
  audio to `dist/music/`.
- Audio files here **are** committed by default. A Vercel deploy builds from the
  repository, so anything left uncommitted would not reach the deployed site. If
  you would rather keep audio out of git, uncomment the `music/*.mp3` line in
  `.gitignore` and deploy with `vercel deploy` from your working copy instead.
