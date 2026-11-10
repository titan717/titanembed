# Competitive research

Researched November 2026 from public documentation only. Titan Embed does not use, call, or extract anything from these services; this page only compares embed APIs so ours is at least as easy to adopt.

Sources: [CineSrc docs](https://cinesrc.st/docs), [EmbedMaster docs](https://embedmaster.com/documentation/), [YouTube player parameters](https://developers.google.com/youtube/player_parameters), [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [Bunny Stream embedding](https://bunny.net/docs/stream/embedding).

## What they offer

| Area | CineSrc | EmbedMaster | Titan Embed 0.1.0 |
| --- | --- | --- | --- |
| Content model | Hosted catalogue keyed by TMDB IDs | Hosted catalogue keyed by IMDb/TMDB IDs | Bring your own media (HLS/MP4/WebM URLs or a JSON descriptor); no hosted catalogue |
| Ads / tracking | "Minimal ads" | Ads unless you buy ad-free plays; player statistics | None: no ads, no analytics, no cookies, no third-party requests |
| Accent colour | `color=%23e50914` | Player builder (account) | `accent=` URL param, `setTheme` command, descriptor `theme` (contrast-checked) |
| Skins | One | `skin=aurora` / `onyx` | Two purpose-built players (TV 10-foot, mobile touch) picked automatically or forced with `player=` |
| Start time / resume | `t=`, Continue/Restart prompt (`continueprompt=false` to skip) | — | `t=`; saved-position prompt (`resume=prompt\|auto\|off`) |
| Skip intro | Button when intro data exists, `autoskip=true` | — | Intro / recap / credits markers (`intro=4-14`), Skip button, `setMarkers` |
| Next episode | Auto-next countdown, `autonext=false` | — | Next-up card at credits, episode lists in both players |
| Subtitles | Not documented | `sub_url[]` + `sub_label[]` (CORS required) | `sub=url\|lang\|label` (repeatable), in-manifest HLS subtitles, safe WebVTT/SRT parser, caption style settings |
| Back button | `back=<url>` or `back=close` → `close` event | — | `back=1` shows a back button that emits `exit` |
| Quality | `quality=1080` preference | Not documented | Auto / Data saver / fixed heights; `setQuality` |
| Events | `cinesrc:*` (ready, play, pause, timeupdate, seeking, seeked, ended, volumechange, ratechange, loadedmetadata, nextepisode, skipintro, sourceused, close, error, response) | `play`, `pause` (PlayerJS based) | Versioned `{ns:"titan", v:1}` envelope, 25+ events incl. tracks, quality, markers, PiP, fullscreen, state, error codes |
| Commands | play, pause, seek, setVolume, setMuted, setPlaybackRate, getters | play, pause, seek, mute, unmute, volume, fullscreen | load, play, pause, seek, volume, mute, rate, audio/subtitle/quality tracks, theme, markers, fullscreen, PiP, next/previous, destroy, getters; request ids and typed replies |
| Origin safety | Messages sent with `'*'` in examples | Commands sent with `'*'`; `sandbox` attribute not allowed | `origins=` allowlist, replies only to allowlisted origins, rate limit, schema validation; works inside `sandbox="allow-scripts allow-same-origin"` |
| SDK | None (raw postMessage) | None | `createPlayer()` (ESM + script tag with SRI), React `<TitanEmbed>` |
| TV / remote | Not documented | Not documented | Full D-pad model, platform key codes (webOS, Tizen, Fire TV, Android TV), 10-foot UI |

## Ideas worth adopting

Each is scheduled in docs/ROADMAP.md.

1. `muted=1` start param (CineSrc) → 0.2.0.
2. `autoskip=1` to skip intro/recap automatically (CineSrc) → 0.2.0.
3. `autonext=0` to turn off the up-next countdown (CineSrc) → 0.2.0.
4. `quality=720` preferred starting quality (CineSrc) → 0.2.0.
5. `seek=` step override for double-tap and arrow seeks (CineSrc) → 0.2.0.
6. `back=close` style exit event already exists (`back=1` → `exit`); document it side by side → done in docs/api.
7. A `skip` event carrying the marker type already exists; keep it.

## Where we deliberately differ

- No hosted catalogue and no provider lookup: we never resolve third-party streams. Adapters only accept URLs and documented embeds (mission rule).
- No `'*'` target origins anywhere, and the player keeps working when the host sandboxes the iframe.
- No accounts, statistics or ad-free upsell; everything is in the open-source build.
