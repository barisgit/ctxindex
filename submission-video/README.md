# ctxindex submission video

A minimal 1920x1080, 30 fps, 2:40 Remotion compositor. It renders branded placeholders until recordings are dropped into `public/`.

## Drop in assets

Use these exact filenames:

| Time | File | Content |
| --- | --- | --- |
| 0:00-0:15 | `public/01-hero.mp4` | Website hero |
| 0:15-0:32 | `public/02-agent-shell.mp4` | Agent shell / core explanation |
| 0:32-1:28 | `public/03-hermes.mp4` | Hermes query, results, citations |
| 1:28-1:42 | `public/04-draft.mp4` | Persisted Draft |
| 1:42-2:00 | `public/05-trust-catalog.mp4` | Trust model and Catalog |
| 2:00-2:27 | `public/06-codex.mp4` | Codex orchestration |
| 2:27-2:40 | `public/07-close.mp4` | Closing website shot |

Optional audio:

- `public/voiceover.wav` (preferred) or `public/voiceover.mp3`, full volume
- `public/music.mp3`, looped at 7.5% volume

Record each clip at least as long as its slot. Clip audio is muted; narration and music come from the optional audio tracks. Replace a file and refresh Studio to pick it up.

## Run

```bash
cd submission-video
bun install
bun run studio
```

Studio prints a local preview URL and does not open a browser automatically.

## Verify and render

```bash
bun run typecheck
bun run still
bun run render
```

Final output: `out/ctxindex-submission.mp4` (H.264, yuv420p, 1920x1080, 30 fps).

If Bun is unavailable in the current shell, the direct npm equivalents are `npm install`, `npm run studio`, and `npm run render`.

If a source clip is longer than its slot, Remotion cuts it at the next scene. If shorter, extend or re-record it before the final render.
