# Code review

One section per release: what was read, what was found, what was fixed.

## 0.1.0

Read: every file in packages/core, packages/sources, packages/embed, packages/ui-common, packages/ui-tv, packages/ui-mobile, packages/sdk, site/demo.ts, vercel.json and the test fixtures. Searched the code for `eval`, `new Function`, `innerHTML`, `window.open`, `top.location`, `postMessage(…, "*")` and `document.write`: none outside tests and the hostile test fixture.

Found and fixed:

| Bug                                                                                                                              | Fix                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A `t=` start time cancelled autoplay.                                                                                            | Seek to the start after metadata without pausing.                      |
| TV Skip Intro was not focused, so OK did nothing while controls were hidden.                                                     | Skip takes and keeps focus (D-013).                                    |
| Mobile caption track overlapped the controls.                                                                                    | Captions move up while controls are visible.                           |
| Mobile chips had no accessible names; demo controls had wrong roles.                                                             | Names and roles added; axe clean.                                      |
| HLS `DEFAULT=YES` audio was labelled "Original".                                                                                 | Only descriptor `original` marks it (D-023).                           |
| Chip gap and `scrollIntoView` scrolled the host page from inside the iframe.                                                     | Gap token fixed; containers scrolled directly (D-017).                 |
| Mobile sheets could not be dismissed by swiping.                                                                                 | Swipe-to-dismiss on the grip/title bar (D-027).                        |
| `statechange` events carried `prev` while the SDK and docs said `from`.                                                          | Event payload is `{ state, from }`.                                    |
| Demo season/episode fields stayed visible for movies (`hidden` overridden by `display`).                                         | `.field[hidden] { display: none }`.                                    |
| Themed source bar buttons had a transparent background (`.titan button` reset won on specificity), unreadable over bright video. | Selectors scoped as `.titan .t-src-btn` / `.titan .t-src-menu button`. |
| A frozen provider was retried by reloading with backoff, restarting its ads and start screen.                                    | Provider network errors skip backoff and fail over (D-033).            |
| Headless test browser had no popup blocker, so isolation tests passed vacuously.                                                 | Full Chromium channel without `--disable-popup-blocking` (D-034).      |

Residual risks are listed in docs/SECURITY.md ("Residual risk").
