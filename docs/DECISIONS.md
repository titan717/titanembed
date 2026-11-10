# Decisions

Each entry: the choice, why, and what would change it. Newest last.

| ID | Decision | Reason |
| --- | --- | --- |
| D-001 | One npm workspace root with path aliases (`@titan/core`, `@titan/ui-common`, `@titan/ui-tv`, `@titan/ui-mobile`, `@titan/embed`, `@titan/sdk`) and a single Vite build, instead of per-package builds. | Fast builds, one lockfile, one CI job. Only the SDK is published, so internal packages don't need their own dist. |
| D-002 | UIs are plain DOM + TypeScript (no framework). | The embed must start fast on low-end TVs; the whole TV UI is ≈20 kB min. React is only a peer dependency of the SDK wrapper. |
| D-003 | hls.js 1.7.4, bundled and lazy-loaded only when the browser lacks native HLS. | No third-party CDN (CSP `script-src 'self'`), full build kept for alternate audio and subtitles. |
| D-004 | Vite root is `site/`: `/` demo, `/embed/` player, `/docs/` generated from `apps/docs/*.md`. | One deploy serves all three. |
| D-005 | SDK built as ES modules + an IIFE (`window.TitanEmbed`) served at `/sdk/` with an SRI hash. | npm and script-tag users. |
| D-006 | Allowed media URLs: `https:`, `blob:` and same-origin paths (so `http:` works only for same-origin local development). | Mission security rules; same-origin needed for bundled test media. |
| D-007 | Default accent: white on TV (blueprint focus is white), `#1f80e0` on mobile; custom accents need 3:1 contrast on black. | WCAG 2.2 non-text contrast. |
| D-008 | Device rule: forced class → TV user agents → coarse pointer = mobile → desktop frames ≥960×540 landscape = TV, else mobile. | Desktop browsers have keyboards, which the TV player serves best at large sizes. |
| D-009 | Without `origins`, commands are ignored and events go only to the embedding origin. | Never accept control from unknown pages. |
| D-010 | Quality tiers on HLS cap `autoLevelCapping` ("Auto", "Data saver", fixed heights). | Matches blueprint p9 Quality panel. |
| D-011 | Where blueprints show minimal chrome (no play/pause buttons on the TV top bar), the blueprint wins over the mission's generic size floor: TV title 28 tu, pills 20 tu, time 18 tu. State screens keep 36/24 tu and 64 tu buttons. | "TV PLAYER blueprint always wins for Player A". Logged as gap G-05. |
| D-012 | Resume defaults to a prompt ("Resume from 23:14" / "Start over"). | Mission 7.1. |
| D-013 | The Skip button keeps focus while controls are hidden, so OK skips. | Remote users can't reach a hidden control otherwise. |
| D-014 | Hidden Left/Right seeking doesn't show the top bar; steps 10→20→30→60 s inside a 1 s burst window, commit after 700 ms. | Mission 7.1, blueprint p19 seek strip. |
| D-015 | Controls stay visible while paused. | Blueprint paused screen. |
| D-016 | Focus scale 1.08 on pills and buttons, 1.04 on cards, rows are not scaled (they highlight). | Mission range 1.08–1.12; scaled list rows would clip in panels. |
| D-017 | Navigation never calls `scrollIntoView` (it scrolls the host page from inside an iframe); `[data-scroll]` containers are scrolled directly. | Bug found in testing. |
| D-018 | Mobile brightness is a black overlay inside the player; auto-hide 3.5 s on mobile, 4.5 s on TV. Double-tap centre toggles fit/fill. | No web API for screen brightness. |
| D-019 | npm publishing runs from GitHub Actions with provenance when the `NPM_TOKEN` secret is present; until then releases ship the tarball as a release asset. | No npm credentials in this environment; never commit secrets. |
| D-020 | Test media: generated in-repo by `scripts/gen-media.sh` (ffmpeg patterns, two audio languages, captions, thumbnails) + Blender films from public test streams. | Only legally usable media (docs/ASSETS.md). |
| D-021 | `frame-ancestors *` on `/embed/` (the product is an embed); the rest of the site is `frame-ancestors 'self'`. Self-hosters narrow it in `vercel.json`. | Static hosting can't vary CSP per customer; `origins=` adds a runtime check (`E_NOT_ALLOWED_HERE`). |
| D-022 | Start-of-playback language strip on TV (audio languages, current one checked) shows for 6 s when there are 2+ audio tracks. | Blueprint TV PLAYER start screen. |
| D-023 | HLS `DEFAULT=YES` is not treated as "Original" audio; only `audio[].original` in the descriptor marks it. | Showing "Original" for a default track was a false label (bug fixed before 0.1.0). |
| D-024 | Vercel production deploys run from this environment with the CLI; when the token lost team scope, the connector was reauthorized instead of switching hosts. | Mission requires a Vercel production deploy per release; GitHub Pages stays the documented fallback. |
| D-025 | E2E host-page tests serve `tests/e2e/fixtures/host.html` from a second local server (port 4174) instead of `page.route` fulfilment. | Route-fulfilled pages hit Chrome's Local Network Access block when framing localhost; a real cross-origin server also tests origin checks honestly. |
| D-026 | Budget for the lazy hls.js chunk is 190 kB gzip (full build). | The light build drops alternate audio and subtitles, which the blueprints require. Loaded only where native HLS is missing. |
| D-027 | Mobile sheets dismiss by dragging the grip/title bar (down in portrait, right in landscape) past 30% or with a quick flick; the list body keeps native scrolling. | Native sheet behaviour users expect; restricting the handle avoids fighting list scroll. |
