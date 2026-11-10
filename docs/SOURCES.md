# Sources

How Titan Embed finds something to play for a request (a TMDB/IMDb id or a media URL), which sources exist, how each
one was researched and measured, and how to add a new one. Code: `packages/sources`. Public guide: apps/docs/sources.md
(published at /docs/sources.html). Re-check every entry in this file at every release (docs/skills/release-routine.md).

## Adapter interface

A source is one object implementing `SourceAdapter` (packages/sources/src/types.ts):

| Field           | Meaning                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `name`    | Stable id used in `source=`, `sources=`, the SDK and this file; display name in the Source menu.                                                                               |
| `kind`          | `media` (Titan plays the stream in its own `<video>`) or `provider` (a documented embed page in an iframe).                                                                    |
| `capabilities`  | `media`, `commands`, `events`, `controlsOff`, `rate`, `subtitles`, `theme`, `tmdb`, `imdb`, `url`, `tv`.                                                                       |
| `rank`          | Static rank from measured behaviour, lower is better. Live health is added on top.                                                                                             |
| `docs`          | The provider documentation the adapter is built from. Required for providers.                                                                                                  |
| `origins`       | Exact origins the iframe and its `postMessage` events may come from. Used for `event.origin` checks and the CSP `frame-src`.                                                   |
| `sandbox`       | `SandboxProfile`: `sandbox` attribute (default `allow-scripts allow-same-origin`), `allow`, `referrerPolicy`, and a `reason` with a docs link.                                 |
| `timeout`       | Seconds to the first frame before the registry falls back (default 25).                                                                                                        |
| `supports(req)` | Whether this source can serve the request.                                                                                                                                     |
| `resolve(req)`  | Returns `{kind:"media", media}` or `{kind:"provider", url}`.                                                                                                                   |
| `driver(post)`  | For providers with `commands`/`events`: translates Titan commands to provider messages and provider messages to `ProviderEvent`s. `playerJsDriver` covers PlayerJS-style APIs. |

### Adding a source

1. Read the provider's documentation. Record the URL scheme, the message API, the sandbox and `allow` requirements, any
   controls-off or theming parameters, ads and redirects in a new section below. Never build an adapter from scraped or
   reverse-engineered pages: a source without a documented embed is not adapted.
2. Write `packages/sources/src/adapters/<id>.ts` and add it to `createRegistry` in packages/embed/src/index.ts.
3. Add the origin to the `/embed/` `frame-src` in vercel.json (a unit test fails the build if an origin is missing).
4. Run tests/e2e/sources.spec.ts against a fixture that imitates the provider's API (see
   tests/e2e/fixtures/mock-provider.html) and add unit tests for `supports`, `resolve` and the driver.

## Registry

`SourceRegistry` (packages/sources/src/registry.ts) builds an ordered candidate list for a request:

1. Filter: `supports(req)`, `only` (`sources=`) and required capabilities (`need`).
2. Score each candidate, lower first:
   `score = rank + 10 × failRate + medianTTFF_seconds / 5 + 5 × popups + 2 × redirects + (20 if it failed in the last 10 minutes)`
3. The preferred source (`source=` or `preferredSource`) goes first, unless it has no support for the request.

Health is measured in each viewer's browser and stored only in `localStorage` key `titan.sources.v1` on the embed
origin (attempts, failures, last 10 first-frame times, blocked popup/navigation attempts, extra document loads). Nothing
is sent anywhere.

Fallback: on an error, a stall (frozen for 8 s after the 6.5 s watchdog), or no first frame within `timeout`, the
session marks the failure and starts the next candidate at the last known position. Hosts see `sourcefail` then
`sourcechange`. When every candidate fails, the player shows its error screen with Retry.

## Driven and themed

- Driven (`commands` + `events`): Titan's own TV or mobile player UI runs on top. The provider iframe is full-bleed
  under the overlay with `pointer-events: none`, `tabindex="-1"` and `inert`; Titan owns every key and touch and sends
  commands by `postMessage`. Focus is returned to the overlay after every load. Host subtitles are rendered by Titan.
- Themed (no commands): the provider's own controls are visible and receive input. Titan passes its accent where the
  provider accepts one and keeps a slim overlay with Back, Source and Report an Issue only. Themed providers must accept
  the strict sandbox.

## Isolation

- Every message is accepted only when `event.source` is the provider iframe's window and `event.origin` is in the
  adapter's `origins`; commands are posted with an explicit target origin, never `'*'`.
- Sandbox profile per adapter, strictest first: `allow-scripts allow-same-origin`, no `allow-popups`,
  `allow-top-navigation`, `allow-modals` or `allow-forms`. A provider that refuses any sandbox is accepted only as a
  driven source, so its iframe never receives a user activation (which is what browsers require before a popup,
  external-app link or top navigation from a cross-origin frame).
- The embed CSP lists exact provider origins in `frame-src` and nothing else.
- tests/e2e/sources.spec.ts fails the build if a click, tap or key press on the player opens a popup or new page,
  navigates outside the provider origin, raises a dialog, or reaches the provider frame (sandboxed and unsandboxed
  mocks, TV and mobile).

## Sources

### direct (reference adapter)

Plain HTTPS media URLs and descriptors (HLS, MP4, WebM), played in Titan's own `<video>`. Rank 0. No iframe, so no
popups or redirects are possible. Measured on the bundled test clip: first frame in under 1 s locally (see docs/PERF.md).

### embedmaster

- Docs: https://embedmaster.com/documentation/ (read 2026-11-10).
- URLs: `https://embedmaster.link/movie/{id}` and `https://embedmaster.link/tv/{id}/{season}/{episode}`; id is a TMDB id
  or an IMDb `tt` id. Parameters used: `autoplay=on`, `welcome_page=off`, `skin=onyx`. Also documented: `skin=aurora`,
  `sub_url[]`/`sub_label[]`.
- Messages: commands `{source:"embedmaster_player_command", command, value}` with play, pause, seek, mute, unmute,
  volume (percent), fullscreen; events `{source:"embedmaster_player", event, info}` with PlayerJS event names
  (https://playerjs.com/docs/en=api).
- Constraints: "Sandbox attribute on our iframe is not allowed"; recommended
  `allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"`. The service mentions ads. There is no
  documented controls-off option.
- Adapter: driven, no sandbox (D-028), inert iframe hides its controls from input (D-029), host subtitles rendered by
  Titan (D-032), rank 2, timeout 30 s.
- Measured behaviour: from this build environment `embedmaster.link` answers with a Cloudflare challenge
  (HTTP 403, "Just a moment"), as it does for most datacenter addresses, so time to first frame, popup and redirect
  attempts could not be measured live here. Real viewers' numbers are measured in their browsers by the health store
  and change the ranking automatically. Next re-check: every release.

### mock (tests only)

`packages/sources/src/adapters/mock.ts` with tests/e2e/fixtures/mock-provider.html: a PlayerJS-style provider with modes
`ok`, `fail`, `stall`, `silent` and `hostile` (window.open, top/parent navigation, `target=_blank`, focus theft,
`alert`, `intent://` links). Enabled only when the embed runs on a loopback host (D-031).

### Requested but not adapted

fmovies, Movies4U and Yesmovies were named as examples. None publishes a documented embed or player API (checked
2026-11-10); they are aggregator sites, so there is nothing to build a clean adapter from without scraping, which this
project does not do. Re-checked every release; if one publishes embed documentation it gets an adapter.
