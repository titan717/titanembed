# Performance budgets

Budgets are gzip sizes (level 9) of what a viewer downloads. `npm run budget` (scripts/check-budget.mjs) runs in CI after every build and fails the job when any budget is exceeded.

| Bundle | Budget (gzip) | 0.1.0 actual | Loaded when |
| --- | --- | --- | --- |
| Embed entry JS (`/assets/embed-*.js`) | 30 kB | 21.7 kB | Always (core engine, validation, bridge) |
| Embed entry CSS | 6 kB | 0.1 kB | Always |
| Shared chunks JS (`base-*`, `icons-*`) | 14 kB | 4.8 kB | Always |
| TV player chunk JS | 12 kB | 6.0 kB | Player A only |
| Mobile player chunk JS | 12 kB | 7.1 kB | Player B only |
| Player chunk CSS (each) | 8 kB | 3.0–3.1 kB | With its player |
| hls.js chunk | 190 kB | 182.2 kB | Only when the browser lacks native HLS and the source is HLS |
| SDK ESM (`titan-embed` on npm) | 4 kB | 2.7 kB | Host page |
| SDK script tag (`/sdk/titan-embed.min.js`) | 4 kB | 2.3 kB | Host page |

So a viewer on a native-HLS device (Safari, iOS, most smart TVs) downloads about 33 kB of JavaScript before the first frame; Chromium-based browsers add hls.js.

## Why the full hls.js build

`hls.light` is about 40% smaller but drops alternate audio and subtitle renditions, which the Audio & Subtitles panels need (D-003). The chunk is lazy and cached for a year (`/assets/*` is immutable).

## Runtime targets

| Target | Goal | How it is checked |
| --- | --- | --- |
| Input to visible response | ≤ 100 ms | Controls react on keydown/pointerdown; no work waits for network. e2e tests assert state within Playwright's default polling. |
| Motion | 200–240 ms, `prefers-reduced-motion` turns transitions off | Design tokens `--t-dur` / `--t-dur-slow` in `packages/ui-common/src/base.css`. |
| Time updates to the host | ≤ 4 per second; progress ≤ 2 per second | Throttle table in `packages/embed/src/index.ts`. |
| Fonts | One variable Inter file per script subset, `font-display: swap` | Bundled by Vite, served from the embed origin. |
| Layout | No layout reads in the time-update path; progress uses transforms | Code review (docs/CODE_REVIEW.md). |

## Caching

`vercel.json`: `/assets/*` and `/sdk/titan-embed-<version>.min.js` are `immutable` for a year; `/sdk/titan-embed.min.js` (latest) is cached for an hour; test media for a day with `Access-Control-Allow-Origin: *`.
