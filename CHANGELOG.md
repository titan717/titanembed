# Changelog

All notable changes. Versions follow semver; each release is deployed to production and published as a GitHub Release.

## 0.1.0 — 2026-11-10

### Added

- TV player (Player A) built to the TV PLAYER blueprint: top bar with title and pills, D-pad focus model, hidden Left/Right seek strip with accelerating steps, Skip Intro/Recap, next-up card, start-of-playback language strip, settings panels (audio, subtitles, quality, speed, caption style).
- Mobile player (Player B): touch-first controls, double-tap seek, brightness and volume swipes, lock, bottom sheets with swipe-to-dismiss, portrait and landscape layouts.
- Shared core: state machine, HLS (hls.js, lazy), MP4 and WebM, subtitle parser and renderer, resume prompt, preferences, device detector with host override (`player=tv|mobile`).
- Source layer (`packages/sources`): adapter interface, registry ranked by static rank and live per-viewer health, automatic fallback on error, stall or first-frame timeout that keeps the playback position; adapters `direct` (media URLs), `embedmaster` (TMDB/IMDb ids, driven by Titan's UI) and `mock` (tests, loopback only).
- Provider isolation: per-adapter sandbox profiles, inert full-bleed iframes under Titan's overlay, exact-origin message checks, focus return, CSP `frame-src` limited to provider origins; themed mode with Back, Source and Report an Issue for providers without commands.
- Source row in TV and mobile settings to switch source at the same position.
- Embed page with postMessage API (commands, events, origin allowlist, rate limit, JSON schema) including `loadSource`, `setSource`, `getSources` and `sources`/`sourcechange`/`sourcefail` events.
- SDK (`titan-embed`): `createPlayer`, React wrapper, `source`, `preferredSource`, `sources` options; IIFE build with SRI.
- Demo site with a TMDB form (movie or episode), deep links (`?tmdb=&type=&s=&e=`), live code samples, and documentation site including a Sources guide.

### Quality

- Unit tests (vitest), browser tests (Playwright) at TV, desktop, tablet and phone sizes, axe accessibility checks, hostile popup/navigation tests that fail the build, performance budgets, `npm audit` and license checks in CI.

### Fixed before release

- See docs/CODE_REVIEW.md, section 0.1.0.
