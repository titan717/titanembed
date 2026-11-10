---
title: Players
---
# Players

## How the player is chosen

The embed page checks, in order:

1. `player=tv` or `player=mobile` in the URL (or the SDK `player` option) — always wins.
2. Known TV platforms in the user agent (Android TV, Google TV, Fire TV/AFT, Tizen, webOS, BRAVIA, Chromecast, HbbTV, Roku/VIDAA/Vizio browsers) → TV.
3. A coarse pointer with touch (phones, tablets) → mobile.
4. Desktop browsers: a frame at least 960×540 and landscape → TV, otherwise mobile.

The embed sends a `playerclass` event with the result, and re-checks when an auto-detected frame is resized across the threshold.

## Player A — TV

| Key | Controls hidden | Controls visible |
| --- | --- | --- |
| OK / Enter | Shows controls (first press only wakes) | Activates the focused control |
| Left / Right | Seeks without the controls: steps add up 10 → 20 → 30 → 60 s, with a bubble | Moves focus; on the progress bar seeks |
| Up / Down | Shows controls | Moves focus between rows |
| Back | Sends `exit` to the host | Closes a panel, then hides the controls |
| Play, Pause, Play/Pause, FF, RW, Next, Previous, Stop | Act immediately | Act immediately |
| CC / Subtitle | Opens Audio & Subtitles | Opens Audio & Subtitles |

Controls hide after 4.5 s of no input while playing (200 ms fade) and stay up while paused. Panels slide in over 240 ms and keep focus inside until Back.

Skip Intro, Skip Recap and Skip Credits appear bottom right while a marker is active, hold focus even when the controls are hidden (so OK skips) and hide after 8 s. With **Auto-skip** on (Settings), markers are skipped by themselves. When the media has a `next` episode, a card with a 10 s ring counts down during the credits with Play now and Cancel.

## Player B — Mobile

| Gesture | Action |
| --- | --- |
| Tap | Show or hide controls |
| Double-tap left / right | −10 s / +10 s with a ripple; more taps add up |
| Double-tap centre | Toggle fit / fill |
| Horizontal swipe | Seek with a preview |
| Vertical swipe, left half | Brightness (inside the player) |
| Vertical swipe, right half | Volume |
| Press and hold | 2× speed while held |
| Pinch | Fill / fit |

The lock button disables every gesture until it is tapped again. Fullscreen locks landscape where the browser allows it. Portrait uses bottom sheets for Quality, Audio & Subtitles, Speed and Settings. Captions move up when the controls are visible. Haptics use `navigator.vibrate` where available.

## Shared

Both players share the state views: loading, buffering (shown after 400 ms), error with Retry and Try another source, resume prompt ("Resume from 23:14" / "Start over"), offline, unmute prompt for muted autoplay, ended and the next-episode card. Reduced motion turns slides and scale into short fades.
