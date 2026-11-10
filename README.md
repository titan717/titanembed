# Titan Embed

An embeddable, ad-free video player with two players behind one URL:

- **Player A — TV**: a 10-foot player for remotes and D-pads (Android TV, Google TV, Fire TV, Tizen, webOS, desktop keyboards).
- **Player B — Mobile**: a touch-first player with double-tap seek, swipe gestures, a lock button and bottom sheets.

The embed picks the right one for the screen it lands on; hosts can force either.

**Live demo:** https://titanembed.vercel.app · **Docs:** https://titanembed.vercel.app/docs/

```html
<iframe src="https://titanembed.vercel.app/embed/?src=https%3A%2F%2Ftest-streams.mux.dev%2Fx36xhzz%2Fx36xhzz.m3u8&title=Big%20Buck%20Bunny"
  sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen; picture-in-picture; screen-wake-lock"
  allowfullscreen style="width:100%;aspect-ratio:16/9;border:0" title="Big Buck Bunny"></iframe>
```

```js
import { createPlayer } from "titan-embed";
const player = createPlayer("#player", { media: { title: "Clip", sources: [{ url: "https://example.com/master.m3u8" }] } });
player.on("ended", () => player.next());
```

## Features

HLS (native or hls.js, loaded only when needed), MP4 and WebM · automatic and manual quality · audio tracks · WebVTT and SRT with Titan's own caption renderer and caption styles · resume prompt · intro, recap and credits skipping with optional auto-skip · next-episode countdown · speed and sleep timer · stall recovery with backoff · Media Session · wake lock · fullscreen, orientation lock and picture-in-picture · muted autoplay with an unmute prompt · a typed, versioned postMessage API with an origin allowlist · themeable accent, logo, radius and font · no ads, trackers, cookies or third-party scripts.

## Repository

| Path | What |
| --- | --- |
| `packages/core` | State machine, engine, descriptor validation, subtitles, protocol, device detection, theme |
| `packages/ui-common` | DOM helpers, icons, i18n, captions, state views, menus |
| `packages/ui-tv` | Player A |
| `packages/ui-mobile` | Player B |
| `packages/embed` | Embed page logic and the postMessage bridge |
| `packages/sdk` | `titan-embed` on npm: `createPlayer`, React wrapper, script-tag build |
| `site/` | Demo, embed page and generated docs |
| `apps/docs` | Documentation sources |
| `tests/` | Vitest unit tests and Playwright end-to-end tests |
| `docs/` | Audit, decisions, roadmap, blueprints, security, performance and release records |

```sh
npm ci
npm run dev        # http://localhost:5173
npm run check      # lint, types, unit tests, schema
npm run build      # site + SDK
npm run e2e        # Playwright
```

MIT licensed. Test media credits: [docs/ASSETS.md](docs/ASSETS.md).
