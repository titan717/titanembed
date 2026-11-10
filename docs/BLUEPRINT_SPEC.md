# Blueprint spec

Numbered, testable values. `tu` = 1 px at 1920×1080 (`--tu: max(0.5px, min(100vw/1920, 100vh/1080))`), so the TV player scales identically at 1280×720 and 3840×2160. Source: TV PLAYER blueprint page (pN) unless noted. Any drift between this list and the CSS tokens is a bug.

## A. Player A — TV

| # | Item | Value | Source | Token / file |
| --- | --- | --- | --- | --- |
| A1 | Background | `#000` | p1 | `base.css` `.titan` |
| A2 | Overscan safe area | 96 tu horizontal (5 %), 54 tu vertical (5 %) | mission 7.1 | `--pad-x`, `--pad-y` |
| A3 | Title (top left) | 28 tu, weight 700, white | p3 | `.tv-title-main` |
| A4 | Subtitle line | 18 tu, 70 % white | p3 | `.tv-title-sub` |
| A5 | Top-right pills | height 52 tu, 20 tu text weight 600, radius pill, 20 tu side padding, 14 tu gap, icon 24 tu | p3, p7 | `.tv-pill` |
| A6 | Pill value text ("Auto") | weight 500, 86 % white | p7 | `.tv-pill-value` |
| A7 | Focus | 2 tu white border, 18 % white fill, glow 18 tu, scale 1.08, 140 ms | p7, p8, mission | `.is-focus`, `--focus-scale` |
| A8 | Progress track | 4 tu high (6 tu focused), white played, 35 % white rest, knob 16 tu (22 tu focused) | p6 | `.tv-track` |
| A9 | Remaining time | right of the track, 18 tu, tabular, `H:MM:SS` | p6, p19 | `.tv-time` |
| A10 | Bottom bar | 46 tu above the bottom; Watch Next button bottom left | p3 | `.tv-bottom` |
| A11 | Auto-hide | 4.5 s while playing, 200 ms fade; stay while paused | mission, D-015 | `HIDE_MS` |
| A12 | Scrim | top 72 % → 0 at 22 %, bottom 0 at 62 % → 82 % | p3 | `.tv-scrim` |
| A13 | Quality panel | 40 % width, right, blue gradient `#0c2c9e → #081c78 → #040c3a`, 96/80/40 tu padding | p9 | `.tv-panel` |
| A14 | Panel title | 32 tu, 56 tu above, 48 tu below | p9 | `.tv-panel-title` |
| A15 | Panel rows | min 80 tu, 26 tu text, radius 12 tu, 26 tu gap; focused row gradient white 20 % → light blue 50 % | p9 | `.tv-row` |
| A16 | Selected check | `#E07BD8`, left of the label | p9, p10 | `--check` |
| A17 | Quality options | Auto · capped tiers built from the stream's levels, each with an "Up to {p}" note · Data Saver | p9 | `menus.ts`, `engine.ts` |
| A18 | Report an Issue | pinned at the panel bottom under a 1 px 20 % white divider | p9, p10 | `.tv-panel-foot` |
| A19 | Audio & Subtitles panel | 74 % width, two equal columns, 1 px divider | p10 | `.tv-panel.is-audio` |
| A20 | Audio row labels | "English" + "Original" under it; channel badge "5.1" | p10 | `.tv-badge` |
| A21 | Subtitle labels | "Off", "English [CC]" for SDH | p10 | `menus.ts` |
| A22 | Panel slide | 240 ms, transform only | mission | `--dur-panel` |
| A23 | Seek strip | side thumbs 512 tu wide, centre 548 tu with 3 tu white border, radius 8 tu, timestamps `HH:MM:SS` 18 tu bottom centre, 10 s apart | p19, p20 | `.tv-thumb` |
| A24 | Seek bubble | pill, 26 tu delta + 20 tu target time | mission | `.tv-bubble` |
| A25 | Hidden seek steps | 10 → 20 → 30 → 60 s per press within 1 s; commit after 700 ms | mission, D-014 | `seekStep()` |
| A26 | Advisory | "Rated U/A 16+" top left with a 4 tu accent bar, 6 s | p2 | `views.ts` advisory |
| A27 | Language strip | bottom centre, current language in a pill with check, "Original" small, 6 s | p2 | `.tv-langs` |
| A28 | Watch Next row | cards 16:9, 1.04 focus scale, progress bar under thumbnail | p5 | `.tv-card` |
| A29 | Skip button | bottom right, 64 tu high, white fill, black text; hides after 8 s | mission | `views.ts` skip |
| A30 | Next-episode card | 10 s ring, Play now / Cancel | mission | `views.ts` next-up |
| A31 | State screens | title 36 tu, body 24 tu, buttons 64 tu | Panda §20 | `views.ts` |
| A32 | Captions | 44 tu base, 80 tu from bottom; lifted to 210 tu while controls show | p14, mission | `--cap-*` |

## B. Player B — Mobile

| # | Item | Value | Source |
| --- | --- | --- | --- |
| B1 | Touch targets | ≥44 px | mission 7.2 |
| B2 | Accent | `#1f80e0` (blueprint #2 primary) | Mobile p-home |
| B3 | Title / subtitle | 16 px / 12 px | Mobile type scale |
| B4 | Auto-hide | 3.5 s | D-018 |
| B5 | Double-tap seek | ±10 s, ripple 40 % width, counter adds up | mission |
| B6 | Hold | 2× while held | mission |
| B7 | Sheets (portrait) | radius 16 px top, max 86 % height | Mobile sheets |
| B8 | Safe areas | `env(safe-area-inset-*)` on every edge | mission |
| B9 | Motion | 200–240 ms, reduced motion = fades | mission 7.3 |
