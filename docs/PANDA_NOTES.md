# Panda.fun notes

titan717/Panda.fun is read-only for this project: nothing is pushed there. These are findings from reading its source, for its maintainers. Each item names the file it comes from.

| # | Area | Finding | Suggested change |
| --- | --- | --- | --- |
| P-01 | Playback model | Panda plays catalogue titles through third-party provider iframes (`src/lib/player.ts`, `src/lib/shield.ts`). Only CineSrc exposes a command API; Vidy, Vidy Anime and VidLink run in "compatibility mode" without a sandbox (`SANDBOX` in `src/lib/shield.ts`), so their own controls, ads and popups reach the viewer. | For any media Panda can address as a URL (public-domain films, trailers, its own HLS), play it in Titan Embed: one sandboxed iframe, no ads, full remote control. See docs/PANDA_ADOPTION.md (written for 1.0.0). |
| P-02 | Ad shield | The shield exists to contain provider popups. Titan Embed opens no windows and has no ads, so the strict sandbox `allow-scripts allow-same-origin` is enough. | Skip shield counters for Titan sources; keep the strict sandbox. |
| P-03 | Message listener | `src/pages/Player.tsx` re-binds its `message` listener on every render (the effect has no dependency list, by design so handlers see current state). On busy renders (time updates 4×/s) this adds and removes a listener each time. | Keep one listener and read state through refs, or use Titan's SDK, which owns a single listener per player. Low priority. |
| P-04 | Key handling | `src/lib/keys.ts` already centralises back codes (8, 27, 461, 10009, 166). Titan adds media keys (Play 415, Pause 19, Tizen play/pause 10252, Stop 413, FF/RW 417/412, next/previous 425/424, webOS subtitle 460, Tizen caption 10221, Info 457) in `packages/core/src/keys.ts`. | Merge the extra codes if Panda's own player needs them. |
| P-05 | Origin pinning | Panda already posts CineSrc commands to `source.origin` and checks `m.source` on incoming messages. Good practice; Titan does the same and also validates every message against a schema. | None. |
